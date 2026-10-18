//! llama-server sidecar lifecycle (docs/AI_V3_PLAN.md §3.3).
//!
//! State machine: idle → starting → loading-model → ready → (failed | stopped).
//! Loopback-only, ephemeral port, per-spawn API key, killed on app exit.

use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use super::catalog::{self, ModelEntry};
use super::{lock_unpoisoned, AiState};

pub const STATUS_IDLE: &str = "idle";
pub const STATUS_STARTING: &str = "starting";
pub const STATUS_LOADING: &str = "loading-model";
pub const STATUS_READY: &str = "ready";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_STOPPED: &str = "stopped";

const HEALTH_TIMEOUT: Duration = Duration::from_secs(120);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(300);

pub struct EngineState {
    pub status: String,
    pub model_id: Option<String>,
    pub port: Option<u16>,
    pub ctx: Option<u32>,
    pub api_key: Option<String>,
    pub variant: Option<&'static str>,
    pub error: Option<String>,
    pub child: Option<Child>,
    /// Index into the resolved attempt list (0 = preferred backend).
    pub attempt_index: usize,
    /// Whether the current spawn included MTP speculative decoding.
    pub used_mtp: bool,
}

impl EngineState {
    pub fn new() -> Self {
        Self {
            status: STATUS_IDLE.to_string(),
            model_id: None,
            port: None,
            ctx: None,
            api_key: None,
            variant: None,
            error: None,
            child: None,
            attempt_index: 0,
            used_mtp: false,
        }
    }
}

/// One candidate engine backend in fallback order.
#[derive(Clone)]
struct EngineAttempt {
    dir: PathBuf,
    entry: &'static str,
    label: &'static str, // cuda | metal | vulkan | cpu
    mtp_capable: bool,
}

/// Preferred backend first: an installed & detected CUDA pack, then the
/// bundled variant for this platform. Any failure falls through to the next.
fn engine_attempts(app: &AppHandle) -> Vec<EngineAttempt> {
    let mut attempts = Vec::new();
    if let Some(pack) = catalog::CUDA_PACK.as_ref() {
        if super::hardware::probe().gpu.is_some() {
            if let Ok(dir) = catalog::engine_pack_dir(app) {
                if dir.join(pack.entry).is_file() {
                    attempts.push(EngineAttempt {
                        dir,
                        entry: pack.entry,
                        label: "cuda",
                        mtp_capable: true,
                    });
                }
            }
        }
    }
    if let (Some(variant), Ok(dir)) = (catalog::current_variant(), catalog::engine_dir(app)) {
        let label = if variant.dir.contains("metal") {
            "metal"
        } else if variant.dir.contains("vulkan") {
            "vulkan"
        } else {
            "cpu"
        };
        attempts.push(EngineAttempt {
            dir,
            entry: variant.entry,
            label,
            mtp_capable: label == "metal",
        });
    }
    attempts
}

fn mtp_usable(app: &AppHandle, model: &ModelEntry, attempt: &EngineAttempt) -> bool {
    let Some(mtp_file) = model.mtp_file else {
        return false;
    };
    if !attempt.mtp_capable {
        return false;
    }
    catalog::models_dir(app)
        .map(|dir| dir.join(mtp_file).is_file())
        .unwrap_or(false)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub state: String,
    pub model_id: Option<String>,
    pub port: Option<u16>,
    pub ctx: Option<u32>,
    pub variant: Option<String>,
    pub error: Option<String>,
}

pub fn snapshot(engine: &EngineState) -> EngineStatus {
    EngineStatus {
        state: engine.status.clone(),
        model_id: engine.model_id.clone(),
        port: engine.port,
        ctx: engine.ctx,
        variant: engine.variant.map(|v| v.to_string()),
        error: engine.error.clone(),
    }
}

fn with_state<T>(state: &tauri::State<'_, AiState>, f: impl FnOnce(&mut EngineState) -> T) -> T {
    let mut guard = lock_unpoisoned(&state.engine);
    f(&mut guard)
}

fn with_app_state<T>(app: &AppHandle, f: impl FnOnce(&mut EngineState) -> T) -> T {
    let ai_state = app.state::<AiState>();
    with_state(&ai_state, f)
}

#[tauri::command]
pub fn ai_engine_status(state: tauri::State<'_, AiState>) -> EngineStatus {
    with_state(&state, |e| snapshot(e))
}

#[tauri::command]
pub fn ai_engine_start(
    app: AppHandle,
    model_id: Option<String>,
    num_ctx: Option<u32>,
) -> Result<EngineStatus, String> {
    start_engine(&app, model_id.as_deref(), num_ctx)
}

/// Set the user-chosen default model (settings "Use") and restart the engine
/// on it so chat/rewrite pick it up immediately. Session-scoped; P2 persists it.
#[tauri::command]
pub fn ai_select_model(app: AppHandle, model_id: String) -> Result<EngineStatus, String> {
    let model =
        catalog::find_model(&model_id).ok_or_else(|| format!("Unknown model: {model_id}"))?;
    let models_dir = catalog::models_dir(&app)?;
    if !models_dir.join(model.filename).is_file() {
        return Err("Model not downloaded yet.".into());
    }
    app.state::<AiState>()
        .set_selected(Some(model.id.to_string()));
    start_engine(&app, Some(model.id), None)
}

#[tauri::command]
pub fn ai_selected_model(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app.state::<AiState>().selected())
}

#[tauri::command]
pub fn ai_engine_stop(app: AppHandle) -> EngineStatus {
    shutdown(&app);
    let state = app.state::<AiState>();
    with_state(&state, |e| snapshot(e))
}

/// Start the engine for the given model (None → first downloaded in auto order).
/// Reused by client.rs commands to lazy-start on first AI use.
pub fn start_engine(
    app: &AppHandle,
    model_id: Option<&str>,
    num_ctx: Option<u32>,
) -> Result<EngineStatus, String> {
    let ai = app.state::<AiState>();

    let model: &'static ModelEntry = match model_id {
        Some(id) => catalog::find_model(id).ok_or_else(|| format!("Unknown model: {id}"))?,
        None => {
            let selected = app.state::<AiState>().selected();
            let candidate = selected.as_deref().and_then(catalog::find_model);
            candidate
                .or_else(|| {
                    catalog::auto_start_order().find(|m| {
                        catalog::model_file_path(app, m)
                            .map(|p| p.is_file())
                            .unwrap_or(false)
                    })
                })
                .ok_or_else(|| "No model downloaded yet. Download a model first.".to_string())?
        }
    };

    let (current_status, current_model) =
        with_state(&ai, |e| (e.status.clone(), e.model_id.clone()));
    if matches!(
        current_status.as_str(),
        STATUS_STARTING | STATUS_LOADING | STATUS_READY
    ) && current_model.as_deref() == Some(model.id)
    {
        return Ok(with_state(&ai, |e| snapshot(e)));
    }
    if current_status == STATUS_STARTING || current_status == STATUS_LOADING {
        return Err("Engine is already starting; wait for it to become ready.".into());
    }
    if current_status != STATUS_IDLE
        && current_status != STATUS_STOPPED
        && current_status != STATUS_FAILED
    {
        shutdown(app);
    }

    let attempts = engine_attempts(app);
    if attempts.is_empty() {
        return Err(
            "Engine not installed. Run `npm run fetch:engines` or download the acceleration pack."
                .into(),
        );
    }

    let model_path = catalog::model_file_path(app, model)?;
    if !model_path.is_file() {
        return Err(format!(
            "Model not downloaded yet: {} (download it first)",
            model_path.display()
        ));
    }

    let ctx = num_ctx.unwrap_or(model.num_ctx).clamp(512, 262_144);

    let attempt = &attempts[0];
    let use_mtp = mtp_usable(app, model, attempt);
    let spawned = spawn_engine(app, model, &model_path, ctx, attempt, use_mtp)?;

    with_state(&ai, |e| {
        e.status = STATUS_STARTING.to_string();
        e.error = None;
        e.model_id = Some(model.id.to_string());
        e.port = Some(spawned.port);
        e.ctx = Some(ctx);
        e.api_key = Some(spawned.api_key);
        e.variant = Some(attempt.label);
        e.attempt_index = 0;
        e.used_mtp = use_mtp;
        e.child = Some(spawned.child);
    });

    let app_handle = app.clone();
    let id_for_thread = model.id.to_string();
    std::thread::spawn(move || {
        poll_until_ready(app_handle, &id_for_thread);
    });

    Ok(with_state(&ai, |e| snapshot(e)))
}

struct SpawnedEngine {
    port: u16,
    api_key: String,
    child: Child,
}

fn spawn_engine(
    app: &AppHandle,
    model: &'static ModelEntry,
    model_path: &Path,
    ctx: u32,
    attempt: &EngineAttempt,
    use_mtp: bool,
) -> Result<SpawnedEngine, String> {
    let entry = attempt.dir.join(attempt.entry);
    if !entry.is_file() {
        return Err(format!("Engine binary missing: {}", entry.display()));
    }

    let port = {
        let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
        listener.local_addr().map_err(|e| e.to_string())?.port()
    };
    let api_key = Uuid::new_v4().to_string();

    let mut command = crate::command_for(&entry);
    command
        .arg("--jinja")
        .arg("--no-webui")
        .arg("-m")
        .arg(model_path)
        .arg("-c")
        .arg(ctx.to_string())
        .arg("-np")
        .arg("1")
        .arg("-fa")
        .arg("on")
        .arg("-ctk")
        .arg("q8_0")
        .arg("-ctv")
        .arg("q8_0")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("--api-key")
        .arg(&api_key)
        .stdin(std::process::Stdio::null());

    if use_mtp {
        if let Some(mtp_file) = model.mtp_file {
            let mtp_path = catalog::models_dir(app)?.join(mtp_file);
            if mtp_path.is_file() {
                command
                    .arg("--spec-draft-model")
                    .arg(&mtp_path)
                    .arg("--spec-type")
                    .arg("draft-mtp")
                    .arg("--spec-draft-n-max")
                    .arg("2");
            }
        }
    }

    let child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn engine: {e}"))?;

    Ok(SpawnedEngine {
        port,
        api_key,
        child,
    })
}

fn poll_until_ready(app: AppHandle, model_id: &str) {
    let deadline = Instant::now() + HEALTH_TIMEOUT;

    loop {
        std::thread::sleep(HEALTH_POLL_INTERVAL);

        let (port, key, superseded) = with_app_state(&app, |e| {
            (
                e.port,
                e.api_key.clone(),
                e.model_id.as_deref() != Some(model_id),
            )
        });
        if superseded {
            return;
        }

        // A startup crash (bad DLL, unsupported flag, failed draft load) shows
        // up as the child exiting long before the health timeout.
        let child_exit = with_app_state(&app, |e| {
            e.child.as_mut().and_then(|c| c.try_wait().ok().flatten())
        });
        if let Some(status) = child_exit {
            with_app_state(&app, |e| {
                if e.model_id.as_deref() == Some(model_id) {
                    kill_child(e);
                    e.error = Some(format!("Engine exited during startup ({status})."));
                }
            });
            attempt_retry(&app, model_id);
            return;
        }

        let Some(port) = port else { return };
        let key = key.unwrap_or_default();

        if Instant::now() > deadline {
            with_app_state(&app, |e| {
                if e.model_id.as_deref() == Some(model_id) {
                    kill_child(e);
                    e.error = Some("Engine did not become ready in time.".into());
                }
            });
            attempt_retry(&app, model_id);
            return;
        }

        let url = format!("http://127.0.0.1:{port}/health");
        let result = ureq::get(&url)
            .set("Authorization", &format!("Bearer {key}"))
            .timeout(Duration::from_secs(2))
            .call();

        match result {
            Ok(_) => {
                with_app_state(&app, |e| {
                    if e.model_id.as_deref() == Some(model_id) && e.status != STATUS_STOPPED {
                        e.status = STATUS_READY.to_string();
                        e.error = None;
                    }
                });
                return;
            }
            Err(ureq::Error::Status(code, _)) => {
                if code == 503 {
                    with_app_state(&app, |e| {
                        if e.model_id.as_deref() == Some(model_id) {
                            e.status = STATUS_LOADING.to_string();
                        }
                    });
                }
            }
            Err(_) => {
                with_app_state(&app, |e| {
                    if e.model_id.as_deref() == Some(model_id)
                        && matches!(e.status.as_str(), STATUS_STARTING | STATUS_LOADING)
                    {
                        e.status = STATUS_LOADING.to_string();
                    }
                });
            }
        }
    }
}

/// Retry policy: MTP failure → same backend without MTP; then next backend
/// (CUDA pack → bundled Vulkan/Metal/CPU). Exhausted → Failed.
fn attempt_retry(app: &AppHandle, model_id: &str) {
    let ai = app.state::<AiState>();
    let (idx, used_mtp) = with_state(&ai, |e| (e.attempt_index, e.used_mtp));
    let Some(model) = catalog::find_model(model_id) else {
        return;
    };
    let attempts = engine_attempts(app);
    let (next_idx, retry_same_without_mtp) = if used_mtp {
        (idx, true)
    } else {
        (idx + 1, false)
    };
    if next_idx >= attempts.len() {
        with_state(&ai, |e| {
            kill_child(e);
            e.status = STATUS_FAILED.to_string();
            if e.error.is_none() {
                e.error = Some("Engine failed to start (all backends tried).".into());
            }
        });
        return;
    }
    let attempt = &attempts[next_idx];
    let use_mtp = if retry_same_without_mtp {
        false
    } else {
        mtp_usable(app, model, attempt)
    };

    let model_path = match catalog::model_file_path(app, model) {
        Ok(path) => path,
        Err(e) => {
            with_state(&ai, |s| {
                s.status = STATUS_FAILED.to_string();
                s.error = Some(e);
            });
            return;
        }
    };
    let ctx = with_state(&ai, |e| e.ctx.unwrap_or(model.num_ctx));
    with_state(&ai, kill_child);

    match spawn_engine(app, model, &model_path, ctx, attempt, use_mtp) {
        Ok(spawned) => {
            with_state(&ai, |e| {
                e.status = STATUS_STARTING.to_string();
                e.error = None;
                e.port = Some(spawned.port);
                e.api_key = Some(spawned.api_key);
                e.variant = Some(attempt.label);
                e.attempt_index = next_idx;
                e.used_mtp = use_mtp;
                e.child = Some(spawned.child);
            });
            let app_handle = app.clone();
            let id_for_thread = model_id.to_string();
            std::thread::spawn(move || {
                poll_until_ready(app_handle, &id_for_thread);
            });
        }
        Err(e) => {
            // Spawn itself failed — advance to the next candidate. Bounded by
            // the attempt list length because each call advances idx or clears MTP.
            with_state(&ai, |s| {
                s.attempt_index = next_idx;
                s.used_mtp = use_mtp;
                s.error = Some(e);
            });
            attempt_retry(app, model_id);
        }
    }
}

fn kill_child(engine: &mut EngineState) {
    if let Some(mut child) = engine.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Stop the engine (user action or model switch).
pub fn shutdown(app: &AppHandle) {
    with_app_state(app, |e| {
        kill_child(e);
        e.status = STATUS_IDLE.to_string();
        e.error = None;
        e.model_id = None;
        e.port = None;
        e.ctx = None;
        e.api_key = None;
    });
}

/// Called on RunEvent::Exit — kills the sidecar so nothing outlives the app.
pub fn kill_on_exit(app: &AppHandle) {
    with_app_state(app, |e| {
        kill_child(e);
        e.status = STATUS_STOPPED.to_string();
    });
}

/// Connection info for client.rs: (model_entry, port, api_key).
#[allow(dead_code)]
pub fn connection(app: &AppHandle) -> Option<(&'static ModelEntry, u16, String)> {
    let state = app.state::<AiState>();
    let guard = lock_unpoisoned(&state.engine);
    if guard.status != STATUS_READY {
        return None;
    }
    let model_id = guard.model_id.clone()?;
    let model = catalog::find_model(&model_id)?;
    Some((
        model,
        guard.port?,
        guard.api_key.clone().unwrap_or_default(),
    ))
}

/// Ensure the engine is running for generation/chat: lazy-start on idle,
/// wait for readiness on loading. Returns (model_entry, port, api_key).
pub fn ensure_ready_for_request(
    app: &AppHandle,
) -> Result<(&'static ModelEntry, u16, String), String> {
    if let Some((model, port, key)) = connection(app) {
        return Ok((model, port, key));
    }
    let status = with_app_state(app, |e| e.status.clone());
    if matches!(status.as_str(), STATUS_STARTING | STATUS_LOADING) {
        wait_for_ready(app)?;
    } else {
        start_engine(app, None, None)?;
        wait_for_ready(app)?;
    }
    connection(app).ok_or_else(|| "Engine started but connection info is missing.".to_string())
}

pub(crate) fn wait_for_ready(app: &AppHandle) -> Result<(), String> {
    let deadline = Instant::now() + HEALTH_TIMEOUT;
    loop {
        let status = with_app_state(app, |e| e.status.clone());
        match status.as_str() {
            STATUS_READY => return Ok(()),
            STATUS_FAILED | STATUS_STOPPED | STATUS_IDLE => {
                return Err(with_app_state(app, |e| {
                    e.error.clone().unwrap_or_else(|| status.clone())
                }));
            }
            _ => {}
        }
        if Instant::now() > deadline {
            return Err("Timed out waiting for engine readiness.".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
