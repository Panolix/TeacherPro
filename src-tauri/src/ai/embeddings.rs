//! In-process embeddings via fastembed/ONNX (CPU-only, docs/AI_V3_PLAN.md §3.5).
//!
//! Model: bge-m3 quantized ONNX (Xenova/bge-m3, 1024-dim, multilingual, 8192 ctx).
//! Weights auto-download on first RAG index into app_data_dir/emb-models/ —
//! never bundled, never a separate process, never touches the GPU.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use fastembed::{InitOptionsUserDefined, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use serde::Serialize;
use tauri::Emitter;
use tauri::Manager;

/// (url, sha256) — verified 2026-10-17 via HF API / linked etags.
const ONNX_URL: &str =
    "https://huggingface.co/Xenova/bge-m3/resolve/main/onnx/model_quantized.onnx";
const ONNX_SHA: &str = "0826f8c1ab9edf1801db86c61919d4d108e8bfc0b809ec823ad366882ff0b77d";
const TOKENIZER_URL: &str = "https://huggingface.co/Xenova/bge-m3/resolve/main/tokenizer.json";
const TOKENIZER_SHA: &str = "6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790";
const TOKENIZER_CONFIG_URL: &str =
    "https://huggingface.co/Xenova/bge-m3/resolve/main/tokenizer_config.json";
// SHA-256 of the file content (the HF API `oid` for these two non-LFS files is
// a git blob SHA-1 — do not copy it here; verified by hashing the download).
const TOKENIZER_CONFIG_SHA: &str =
    "7e4c1cc848840aeccdd763458c18dd525eb0f795c992e00ebe9c28554e7db2d4";
const SPECIAL_TOKENS_URL: &str =
    "https://huggingface.co/Xenova/bge-m3/resolve/main/special_tokens_map.json";
const SPECIAL_TOKENS_SHA: &str = "8c785abebea9ae3257b61681b4e6fd8365ceafde980c21970d001e834cf10835";
const CONFIG_URL: &str = "https://huggingface.co/Xenova/bge-m3/resolve/main/config.json";
const CONFIG_SHA: &str = "734a79bf12d388c1467a4e3ab625f45de7f6906cffcfb93a1eca1787504bed95";

#[allow(dead_code)]
pub const EMBED_DIM: usize = 1024;
/// Cap per-input length; bge-m3 supports up to 8192 but our chunks are 256-512 tokens.
const MAX_LENGTH: usize = 512;

pub fn emb_models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("emb-models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Progress payload for the `embed-model-download` event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmbedModelDownloadEvent {
    file: String,
    state: String, // downloading | verifying | completed | failed
    received: u64,
    total: u64,
    error: Option<String>,
}

fn emit_progress(app: &tauri::AppHandle, file: &str, state: &str, received: u64, total: u64) {
    let _ = app.emit(
        "embed-model-download",
        EmbedModelDownloadEvent {
            file: file.to_string(),
            state: state.to_string(),
            received,
            total,
            error: None,
        },
    );
}

fn emit_failed(app: &tauri::AppHandle, file: &str, error: &str) {
    let _ = app.emit(
        "embed-model-download",
        EmbedModelDownloadEvent {
            file: file.to_string(),
            state: "failed".to_string(),
            received: 0,
            total: 0,
            error: Some(error.to_string()),
        },
    );
}

const EMB_DL_MAX_ATTEMPTS: u32 = 8;
const EMB_DL_CHUNK: usize = 256 * 1024;
const EMB_DL_EMIT_EVERY: u64 = 5 * 1024 * 1024; // throttle progress events to ~5 MB steps

fn sha256_file(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut fh = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut fh, &mut hasher).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", hasher.finalize()))
}

/// Download `url` into `dest` with resume + retry + SHA-256 verification, then
/// atomic rename. Never leaves a partial file behind that could later be
/// mistaken for a complete download (the `.part` file is verified first).
fn download_if_missing(
    app: &tauri::AppHandle,
    url: &str,
    sha: &str,
    dest: &Path,
) -> Result<(), String> {
    if dest.is_file() {
        return Ok(());
    }
    let mut part_name = dest.as_os_str().to_os_string();
    part_name.push(".part");
    let part = PathBuf::from(part_name);
    let file_label = dest
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "embedding model file".to_string());

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(120))
        .build();

    let mut attempt: u32 = 0;
    loop {
        attempt += 1;
        let existing = if part.is_file() {
            std::fs::metadata(&part).map_err(|e| e.to_string())?.len()
        } else {
            0
        };

        let request = agent.get(url).set("User-Agent", "teacherpro-fetch");
        let request = if existing > 0 {
            request.set("Range", &format!("bytes={existing}-"))
        } else {
            request
        };

        let response = match request.call() {
            Ok(r) => r,
            Err(ureq::Error::Status(416, _)) if existing > 0 => {
                // The .part file is at/over the remote size. If its content is
                // already valid (e.g. small files served without Content-Length
                // that were fully received), finalize it; otherwise drop it and
                // download from scratch on the next attempt.
                if sha256_file(&part).map(|h| h == sha).unwrap_or(false) {
                    std::fs::rename(&part, dest).map_err(|e| {
                        let msg = format!("Failed to finalize {file_label}: {e}");
                        emit_failed(app, &file_label, &msg);
                        msg
                    })?;
                    emit_progress(app, &file_label, "completed", 0, 0);
                    return Ok(());
                }
                let _ = std::fs::remove_file(&part);
                if attempt >= EMB_DL_MAX_ATTEMPTS {
                    let msg = format!(
                        "Embedding-model download failed after {attempt} attempts (HTTP 416)"
                    );
                    emit_failed(app, &file_label, &msg);
                    return Err(msg);
                }
                std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
                continue;
            }
            Err(e) => return Err(format!("Embedding-model download failed: {e}")),
        };

        let resumed = response.status() == 206;
        if response.status() == 200 {
            let _ = std::fs::remove_file(&part);
        } else if !resumed {
            return Err(format!("Unexpected HTTP status: {}", response.status()));
        }

        let total = response
            .header("content-range")
            .and_then(|h| h.rsplit('/').next()?.trim().parse::<u64>().ok())
            .or_else(|| {
                response
                    .header("content-length")
                    .and_then(|l| l.parse::<u64>().ok())
                    .map(|len| {
                        if resumed {
                            len.saturating_add(existing)
                        } else {
                            len
                        }
                    })
            })
            .unwrap_or(0);

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(resumed)
            .write(true)
            .truncate(!resumed)
            .open(&part)
            .map_err(|e| format!("Failed to open part file: {e}"))?;

        let mut received = if resumed { existing } else { 0 };
        let mut last_emit = received.saturating_sub(EMB_DL_EMIT_EVERY);
        emit_progress(app, &file_label, "downloading", received, total);

        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; EMB_DL_CHUNK];
        let mut read_failed: Option<String> = None;
        let mut clean_eof = false;
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    clean_eof = true;
                    break;
                }
                Ok(n) => {
                    if file.write_all(&buffer[..n]).is_err() {
                        read_failed = Some("Embedding-model write failed".to_string());
                        break;
                    }
                    received += n as u64;
                    if received.saturating_sub(last_emit) >= EMB_DL_EMIT_EVERY {
                        last_emit = received;
                        emit_progress(app, &file_label, "downloading", received, total);
                    }
                }
                Err(e) => {
                    // Connection dropped mid-stream: keep the .part file and
                    // retry with an HTTP Range resume (next attempt, same call).
                    read_failed = Some(format!("Embedding-model read failed (will resume): {e}"));
                    break;
                }
            }
        }
        drop(reader);
        drop(file);

        let current = std::fs::metadata(&part).map_err(|e| e.to_string())?.len();
        // A clean EOF means the response body ended normally (Content-Length
        // reached, chunked terminator, or a small file served without a
        // Content-Length header) — the file is complete. Only read errors are
        // worth retrying; a Range resume against a complete file yields HTTP 416.
        if clean_eof {
            break;
        }
        if attempt >= EMB_DL_MAX_ATTEMPTS {
            let msg = read_failed.unwrap_or_else(|| {
                format!(
                    "Embedding-model download incomplete after {attempt} attempts ({current}/{total} bytes)"
                )
            });
            emit_failed(app, &file_label, &msg);
            return Err(msg);
        }
        std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
    }

    emit_progress(app, &file_label, "verifying", 0, 0);
    let actual = sha256_file(&part)?;
    if actual != sha {
        let _ = std::fs::remove_file(&part);
        let msg = format!(
            "Embedding-model checksum mismatch for {file_label}: expected {sha}, got {actual}"
        );
        emit_failed(app, &file_label, &msg);
        return Err(msg);
    }
    std::fs::rename(&part, dest).map_err(|e| {
        let msg = format!("Failed to finalize {file_label}: {e}");
        emit_failed(app, &file_label, &msg);
        msg
    })?;
    emit_progress(app, &file_label, "completed", 0, 0);
    Ok(())
}

fn embed_model_static() -> &'static Mutex<Option<TextEmbedding>> {
    static CELL: OnceLock<Mutex<Option<TextEmbedding>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

fn embed_ensured_static() -> &'static Mutex<Option<String>> {
    static CELL: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(None))
}

/// Serializes concurrent embedder initialization (scan import + chat query can
/// overlap). Without it, two callers download into the same `.part` file and
/// interleave writes — a full-size file with garbage bytes that fails SHA-256.
fn embed_init_lock() -> &'static Mutex<()> {
    static CELL: OnceLock<Mutex<()>> = OnceLock::new();
    CELL.get_or_init(|| Mutex::new(()))
}

fn already_ensured(ensured_key: &str) -> bool {
    let ensured = embed_ensured_static().lock().unwrap();
    ensured.as_deref() == Some(ensured_key) && embed_model_static().lock().unwrap().is_some()
}

/// Ensure weights exist + model session is built. Cheap after first call.
/// Must run on a blocking thread (570 MB download + session init on first use).
pub fn ensure_embedder(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = emb_models_dir(app)?;
    let ensured_key = dir.to_string_lossy().to_string();

    if already_ensured(&ensured_key) {
        return Ok(());
    }

    // First caller downloads + builds the session while holding the init lock;
    // concurrent callers block here, then hit the re-check below and return.
    let _init_guard = embed_init_lock().lock().unwrap();
    if already_ensured(&ensured_key) {
        return Ok(());
    }

    let onnx_path = dir.join("model_quantized.onnx");
    let tokenizer_path = dir.join("tokenizer.json");
    let tokenizer_config_path = dir.join("tokenizer_config.json");
    let special_tokens_path = dir.join("special_tokens_map.json");
    let config_path = dir.join("config.json");

    download_if_missing(app, ONNX_URL, ONNX_SHA, &onnx_path)?;
    download_if_missing(app, TOKENIZER_URL, TOKENIZER_SHA, &tokenizer_path)?;
    download_if_missing(
        app,
        TOKENIZER_CONFIG_URL,
        TOKENIZER_CONFIG_SHA,
        &tokenizer_config_path,
    )?;
    download_if_missing(
        app,
        SPECIAL_TOKENS_URL,
        SPECIAL_TOKENS_SHA,
        &special_tokens_path,
    )?;
    download_if_missing(app, CONFIG_URL, CONFIG_SHA, &config_path)?;

    let tokenizer_files = TokenizerFiles {
        tokenizer_file: std::fs::read(&tokenizer_path).map_err(|e| e.to_string())?,
        config_file: std::fs::read(&config_path).map_err(|e| e.to_string())?,
        special_tokens_map_file: std::fs::read(&special_tokens_path).map_err(|e| e.to_string())?,
        tokenizer_config_file: std::fs::read(&tokenizer_config_path).map_err(|e| e.to_string())?,
    };
    let onnx_bytes = std::fs::read(&onnx_path).map_err(|e| e.to_string())?;

    let model = UserDefinedEmbeddingModel::new(onnx_bytes, tokenizer_files);
    let embedding = TextEmbedding::try_new_from_user_defined(
        model,
        InitOptionsUserDefined::new().with_max_length(MAX_LENGTH),
    )
    .map_err(|e| format!("Failed to initialize embedding model: {e}"))?;

    *embed_model_static().lock().unwrap() = Some(embedding);
    *embed_ensured_static().lock().unwrap() = Some(ensured_key);
    Ok(())
}

/// Embed texts into 1024-dim vectors. Blocks the calling thread (spawn_blocking).
pub fn embed_texts(texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let mut guard = embed_model_static().lock().unwrap();
    let model = guard
        .as_mut()
        .ok_or_else(|| "Embedding model not initialized".to_string())?;
    let owned: Vec<String> = texts.to_vec();
    let vectors = model
        .embed(owned, None)
        .map_err(|e| format!("Embedding failed: {e}"))?;
    Ok(vectors.into_iter().map(|v| v.to_vec()).collect())
}
