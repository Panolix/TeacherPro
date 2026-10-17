//! OpenAI-compatible client for the llama-server sidecar
//! (docs/AI_V3_PLAN.md §3.3): streaming chat relay, one-shot generation,
//! reasoning_content routing, ureq v2 timeout semantics, cancellation.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::{AppHandle, Manager};

use super::catalog;
use super::engine::{self, STATUS_READY};
use super::AiState;

const FLUSH_INTERVAL_MS: u128 = 50;
#[derive(Deserialize, Serialize, Clone)]
pub struct ChatMsg {
    pub role: String,
    pub content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamEvent {
    pub kind: String,
    pub text: Option<String>,
    pub usage: Option<Usage>,
    pub finish: Option<String>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

fn emit_event(app: &AppHandle, request_id: &str, event: StreamEvent) {
    let _ = app.emit(&format!("ai-stream-{request_id}"), event);
}

struct StreamAggregator {
    last_flush: Instant,
    pending: String,
    pending_thinking: String,
    usage: Option<Usage>,
    finish: Option<String>,
    cancelled: bool,
}

impl StreamAggregator {
    fn new() -> Self {
        Self {
            last_flush: Instant::now(),
            pending: String::new(),
            pending_thinking: String::new(),
            usage: None,
            finish: None,
            cancelled: false,
        }
    }

    fn flush(&mut self, app: &AppHandle, request_id: &str, force: bool) {
        let elapsed = self.last_flush.elapsed().as_millis();
        if !force && elapsed < FLUSH_INTERVAL_MS {
            return;
        }
        if !self.pending.is_empty() {
            emit_event(
                app,
                request_id,
                StreamEvent {
                    kind: "chunk".into(),
                    text: Some(std::mem::take(&mut self.pending)),
                    usage: None,
                    finish: None,
                    error: None,
                },
            );
        }
        if !self.pending_thinking.is_empty() {
            emit_event(
                app,
                request_id,
                StreamEvent {
                    kind: "thinking".into(),
                    text: Some(std::mem::take(&mut self.pending_thinking)),
                    usage: None,
                    finish: None,
                    error: None,
                },
            );
        }
        self.last_flush = Instant::now();
    }
}

#[derive(Deserialize)]
struct SseChunk {
    #[allow(dead_code)]
    #[serde(default)]
    choices: Vec<SseChoice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Deserialize, Default)]
struct SseDelta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
}

#[derive(Deserialize)]
struct SseChoice {
    #[serde(default)]
    delta: SseDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct ErrorResponse {
    error: serde_json::Value,
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn ai_chat(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
    request_id: String,
    messages: Vec<ChatMsg>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    thinking: Option<bool>,
    model_id: Option<String>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state
        .stream_cancels
        .lock()
        .unwrap()
        .insert(request_id.clone(), cancel.clone());

    // Resolve the requested model (explicit > selected > auto-downloaded order),
    // switching the engine if a different model is already loaded.
    let target = match model_id.as_deref() {
        Some(id) => Some(catalog::find_model(id).ok_or_else(|| format!("Unknown model: {id}"))?),
        None => {
            let selected = app.state::<AiState>().selected();
            selected.as_deref().and_then(catalog::find_model)
        }
    };
    let (_, port, key) = {
        let (loaded, port, key) = engine::ensure_ready_for_request(&app)?;
        match target {
            Some(want) if want.id != loaded.id => {
                engine::start_engine(&app, Some(want.id), None)?;
                engine::wait_for_ready(&app)?;
                engine::connection(&app).ok_or("Engine connection missing after switch.")?
            }
            _ => (loaded, port, key),
        }
    };
    let model = target.unwrap_or_else(|| {
        engine::connection(&app)
            .map(|(m, _, _)| m)
            .unwrap_or(catalog::SMOKE_MODEL)
    });

    let body = build_chat_body(
        model.id,
        &messages,
        temperature,
        max_tokens,
        thinking,
        model.supports_thinking,
        model.thinking_control,
        true,
    );

    let app_handle = app.clone();
    let request_id_thread = request_id.clone();
    std::thread::spawn(move || {
        run_stream(app_handle, request_id_thread, port, key, body, cancel);
    });
    Ok(())
}

/// Drop the cancel flag → thread closes the connection → server aborts the slot.
#[tauri::command]
pub fn ai_chat_cancel(state: tauri::State<'_, AiState>, request_id: String) -> Result<(), String> {
    if let Some(cancel) = state.stream_cancels.lock().unwrap().remove(&request_id) {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

fn run_stream(
    app: AppHandle,
    request_id: String,
    port: u16,
    key: String,
    body: String,
    cancel: Arc<AtomicBool>,
) {
    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(120))
        .build();

    let result = agent
        .post(&url)
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", "application/json")
        .send_string(&body);

    let response = match result {
        Ok(r) => r,
        Err(e) => {
            emit_event(
                &app,
                &request_id,
                StreamEvent {
                    kind: "error".into(),
                    text: None,
                    usage: None,
                    finish: None,
                    error: Some(format!("Engine request failed: {e}")),
                },
            );
            cleanup_stream(&app, &request_id, &cancel);
            return;
        }
    };

    let mut agg = StreamAggregator::new();
    let reader = response.into_reader();
    let mut sse_lines = std::io::BufReader::new(reader);
    loop {
        if cancel.load(Ordering::Relaxed) {
            agg.cancelled = true;
            break;
        }
        let mut line = String::new();
        match std::io::BufRead::read_line(&mut sse_lines, &mut line) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        let line = line.trim_end();
        if !line.starts_with("data:") {
            continue;
        }
        let payload = line[5..].trim();
        if payload == "[DONE]" {
            break;
        }
        let Ok(chunk) = serde_json::from_str::<SseChunk>(payload) else {
            continue;
        };
        if let Some(usage) = chunk.usage {
            agg.usage = Some(usage);
        }
        if let Some(choice) = chunk.choices.first() {
            if let Some(text) = &choice.delta.content {
                if !text.is_empty() {
                    agg.pending.push_str(text);
                }
            }
            if let Some(text) = &choice.delta.reasoning_content {
                if !text.is_empty() {
                    agg.pending_thinking.push_str(text);
                }
            }
            if let Some(finish) = &choice.finish_reason {
                agg.finish = Some(finish.clone());
            }
        }
        agg.flush(&app, &request_id, false);
    }

    agg.flush(&app, &request_id, true);
    emit_event(
        &app,
        &request_id,
        StreamEvent {
            kind: "done".into(),
            text: None,
            usage: agg.usage,
            finish: agg.finish,
            error: if agg.cancelled {
                Some("cancelled".into())
            } else {
                None
            },
        },
    );
    cleanup_stream(&app, &request_id, &cancel);
}

fn cleanup_stream(app: &AppHandle, request_id: &str, cancel: &Arc<AtomicBool>) {
    cancel.store(true, Ordering::Relaxed);
    if let Some(ai) = app.try_state::<AiState>() {
        ai.stream_cancels.lock().unwrap().remove(request_id);
    }
}

#[allow(clippy::too_many_arguments)]
fn build_chat_body(
    model_id: &str,
    messages: &[ChatMsg],
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    thinking: Option<bool>,
    supports_thinking: bool,
    thinking_control: &str,
    stream: bool,
) -> String {
    let mut body = serde_json::json!({
        "model": model_id,
        "messages": messages,
        "stream": stream,
    });
    if let Some(t) = temperature {
        body["temperature"] = serde_json::json!(t.clamp(0.0, 2.0));
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = serde_json::json!(mt.clamp(64, 8192));
    }
    if supports_thinking && thinking_control == "reasoning_effort" {
        body["reasoning_effort"] = serde_json::json!(if thinking.unwrap_or(false) {
            "high"
        } else {
            "low"
        });
    } else if supports_thinking {
        body["chat_template_kwargs"] =
            serde_json::json!({ "enable_thinking": thinking.unwrap_or(false) });
    }
    body.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub text: String,
    pub usage: Option<Usage>,
}

#[tauri::command]
pub fn ai_generate_text_v2(
    app: AppHandle,
    model_id: Option<String>,
    prompt: String,
    system_prompt: Option<String>,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
) -> Result<GenerateResult, String> {
    let target_model = match model_id.as_deref() {
        Some(id) => catalog::find_model(id).ok_or_else(|| format!("Unknown model: {id}"))?,
        None => {
            let selected = app.state::<AiState>().selected();
            selected
                .as_deref()
                .and_then(catalog::find_model)
                .or_else(|| {
                    catalog::auto_start_order().find(|m| {
                        catalog::model_file_path(&app, m)
                            .map(|p| p.is_file())
                            .unwrap_or(false)
                    })
                })
                .ok_or_else(|| "No model downloaded yet.".to_string())?
        }
    };

    let (model, port, key) = engine::ensure_ready_for_request(&app)?;
    if model.id != target_model.id {
        engine::start_engine(&app, Some(target_model.id), None)?;
        engine::wait_for_ready(&app)?;
    }

    let mut messages = Vec::new();
    if let Some(sys) = system_prompt.as_deref().filter(|s| !s.is_empty()) {
        messages.push(ChatMsg {
            role: "system".into(),
            content: sys.to_string(),
        });
    }
    messages.push(ChatMsg {
        role: "user".into(),
        content: prompt,
    });

    let body = build_chat_body(
        target_model.id,
        &messages,
        temperature,
        max_tokens,
        Some(false),
        target_model.supports_thinking,
        target_model.thinking_control,
        false,
    );

    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(300))
        .timeout(Duration::from_secs(600))
        .build();
    let response = agent
        .post(&url)
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", "application/json")
        .send_string(&body)
        .map_err(|e| format!("Generation request failed: {e}"))?;

    let parsed: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Invalid JSON response: {e}"))?;

    if parsed["error"].is_object() {
        let msg = parsed["error"]["message"]
            .as_str()
            .unwrap_or("unknown error");
        return Err(format!("Engine error: {msg}"));
    }

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_string();
    if content.is_empty() {
        return Err("Engine returned an empty response.".into());
    }

    let usage = parsed["usage"].as_object().map(|_| Usage {
        prompt_tokens: parsed["usage"]["prompt_tokens"].as_u64().unwrap_or(0),
        completion_tokens: parsed["usage"]["completion_tokens"].as_u64().unwrap_or(0),
    });

    Ok(GenerateResult {
        text: strip_think_fallback(&content),
        usage,
    })
}

/// Defensive cleanup for engines that leak think tags into content.
fn strip_think_fallback(text: &str) -> String {
    const OPEN: &str = "\u{3c}think\u{3e}";
    const CLOSE: &str = "\u{3c}/think\u{3e}";
    let mut cleaned = text.to_string();
    if let Some(start) = cleaned.find(OPEN) {
        if let Some(end_rel) = cleaned[start..].find(CLOSE) {
            cleaned = format!(
                "{}{}",
                &cleaned[..start],
                &cleaned[start + end_rel + CLOSE.len()..]
            );
        }
    }
    cleaned.trim().to_string()
}

/// Status helper for the frontend (preflight before expensive calls).
#[tauri::command]
pub fn ai_generate_ready(app: AppHandle) -> Result<bool, String> {
    let ai = app.state::<AiState>();
    let guard = ai.engine.lock().unwrap();
    Ok(guard.status == STATUS_READY)
}

/// Exact token counts via the engine tokenizer (replaces chars÷4 estimates).
#[tauri::command]
pub fn ai_count_tokens(app: AppHandle, texts: Vec<String>) -> Result<Vec<u64>, String> {
    let (model, port, key) = engine::ensure_ready_for_request(&app)?;
    let url = format!("http://127.0.0.1:{port}/tokenize");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(30))
        .timeout(Duration::from_secs(60))
        .build();

    let mut out = Vec::with_capacity(texts.len());
    for text in &texts {
        let body = serde_json::json!({ "content": text, "add_special": false });
        let response = agent
            .post(&url)
            .set("Authorization", &format!("Bearer {key}"))
            .set("Content-Type", "application/json")
            .send_string(&body.to_string())
            .map_err(|e| format!("Tokenize request failed: {e}"))?;
        let parsed: serde_json::Value = response
            .into_json()
            .map_err(|e| format!("Invalid tokenize response: {e}"))?;
        let n = parsed["tokens"]
            .as_array()
            .map(|a| a.len() as u64)
            .unwrap_or(0);
        out.push(n);
    }
    let _ = model;
    Ok(out)
}

/// Grammar-enforced structured generation: the model cannot produce output
/// that violates `schema` (llama-server compiles it to a GBNF grammar).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
#[allow(unused_variables)]
pub fn ai_structured(
    app: AppHandle,
    _request_id: String,
    messages: Vec<ChatMsg>,
    schema: serde_json::Value,
    temperature: Option<f64>,
    max_tokens: Option<u32>,
    model_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let target = match model_id.as_deref() {
        Some(id) => Some(catalog::find_model(id).ok_or_else(|| format!("Unknown model: {id}"))?),
        None => {
            let selected = app.state::<AiState>().selected();
            selected.as_deref().and_then(catalog::find_model)
        }
    };
    let (model, port, key) = {
        let (loaded, port, key) = engine::ensure_ready_for_request(&app)?;
        match target {
            Some(want) if want.id != loaded.id => {
                engine::start_engine(&app, Some(want.id), None)?;
                engine::wait_for_ready(&app)?;
                engine::connection(&app).ok_or("Engine connection missing after switch.")?
            }
            _ => (loaded, port, key),
        }
    };
    let _ = model;

    let mut body = serde_json::json!({
        "model": model.id,
        "messages": messages,
        "stream": false,
        "response_format": {
            "type": "json_schema",
            "json_schema": { "schema": schema }
        },
    });
    if let Some(t) = temperature {
        body["temperature"] = serde_json::json!(t.clamp(0.0, 2.0));
    }
    if let Some(mt) = max_tokens {
        body["max_tokens"] = serde_json::json!(mt.clamp(64, 8192));
    }

    let url = format!("http://127.0.0.1:{port}/v1/chat/completions");
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(300))
        .timeout(Duration::from_secs(600))
        .build();
    let response = agent
        .post(&url)
        .set("Authorization", &format!("Bearer {key}"))
        .set("Content-Type", "application/json")
        .send_string(&body.to_string())
        .map_err(|e| format!("Structured request failed: {e}"))?;

    let parsed: serde_json::Value = response
        .into_json()
        .map_err(|e| format!("Invalid JSON response: {e}"))?;

    if parsed["error"].is_object() {
        let msg = parsed["error"]["message"]
            .as_str()
            .unwrap_or("unknown error");
        return Err(format!("Engine error: {msg}"));
    }

    let content = parsed["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(content.trim())
        .map_err(|e| format!("Model output was not valid JSON: {e}"))?;
    Ok(value)
}
/// Run a blocking closure on Tauri's blocking pool and await its result.
/// MUST be `.await`ed (never `block_on`'d): callers are async Tauri commands
/// already running inside the tokio runtime — blocking the worker thread there
/// panics with "Cannot start a runtime from within a runtime" and detaches
/// the spawned task (two detached callers would race on shared files).
pub(crate) async fn run_blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(inner) => inner,
        Err(e) => Err(format!("Blocking task failed: {e}")),
    }
}
