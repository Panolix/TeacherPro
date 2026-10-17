//! In-process embeddings via fastembed/ONNX (CPU-only, docs/AI_V3_PLAN.md §3.5).
//!
//! Model: bge-m3 quantized ONNX (Xenova/bge-m3, 1024-dim, multilingual, 8192 ctx).
//! Weights auto-download on first RAG index into app_data_dir/emb-models/ —
//! never bundled, never a separate process, never touches the GPU.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use fastembed::{InitOptionsUserDefined, TextEmbedding, TokenizerFiles, UserDefinedEmbeddingModel};
use tauri::Manager;

/// (url, sha256) — verified 2026-10-17 via HF API / linked etags.
const ONNX_URL: &str =
    "https://huggingface.co/Xenova/bge-m3/resolve/main/onnx/model_quantized.onnx";
const ONNX_SHA: &str = "0826f8c1ab9edf1801db86c61919d4d108e8bfc0b809ec823ad366882ff0b77d";
const TOKENIZER_URL: &str = "https://huggingface.co/Xenova/bge-m3/resolve/main/tokenizer.json";
const TOKENIZER_SHA: &str = "6710678b12670bc442b99edc952c4d996ae309a7020c1fa0096dd245c2faf790";
const TOKENIZER_CONFIG_URL: &str =
    "https://huggingface.co/Xenova/bge-m3/resolve/main/tokenizer_config.json";
const TOKENIZER_CONFIG_SHA: &str = "328a00a9a560aadcf2a3064f917517359eb3cc26";
const CONFIG_URL: &str = "https://huggingface.co/Xenova/bge-m3/resolve/main/config.json";
const CONFIG_SHA: &str = "04ba1697b973f10fa9b18169eabdeab59fec6fc5";

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

fn download_if_missing(url: &str, sha: &str, dest: &Path) -> Result<(), String> {
    if dest.is_file() {
        return Ok(());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(15))
        .timeout_read(std::time::Duration::from_secs(120))
        .build();
    let response = agent
        .get(url)
        .set("User-Agent", "teacherpro-fetch")
        .call()
        .map_err(|e| format!("Embedding-model download failed: {e}"))?;
    let mut reader = response.into_reader();
    let mut out = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut out)
        .map_err(|e| format!("Embedding-model write failed: {e}"))?;
    drop(out);
    use sha2::{Digest, Sha256};
    let mut file = std::fs::File::open(dest).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|e| e.to_string())?;
    let actual = format!("{:x}", hasher.finalize());
    if actual != sha {
        let _ = std::fs::remove_file(dest);
        return Err(format!(
            "Embedding-model checksum mismatch for {}: expected {sha}, got {actual}",
            dest.display()
        ));
    }
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

/// Ensure weights exist + model session is built. Cheap after first call.
#[allow(dead_code)] // called from subject_db SQLite store (P3 wiring in progress)
pub fn ensure_embedder(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = emb_models_dir(app)?;
    let ensured_key = dir.to_string_lossy().to_string();

    {
        let ensured = embed_ensured_static().lock().unwrap();
        if ensured.as_deref() == Some(ensured_key.as_str())
            && embed_model_static().lock().unwrap().is_some()
        {
            return Ok(());
        }
    }

    let onnx_path = dir.join("model_quantized.onnx");
    let tokenizer_path = dir.join("tokenizer.json");
    let tokenizer_config_path = dir.join("tokenizer_config.json");
    let config_path = dir.join("config.json");

    download_if_missing(ONNX_URL, ONNX_SHA, &onnx_path)?;
    download_if_missing(TOKENIZER_URL, TOKENIZER_SHA, &tokenizer_path)?;
    download_if_missing(
        TOKENIZER_CONFIG_URL,
        TOKENIZER_CONFIG_SHA,
        &tokenizer_config_path,
    )?;
    download_if_missing(CONFIG_URL, CONFIG_SHA, &config_path)?;

    let tokenizer_files = TokenizerFiles {
        tokenizer_file: std::fs::read(&tokenizer_path).map_err(|e| e.to_string())?,
        config_file: std::fs::read(&config_path).map_err(|e| e.to_string())?,
        special_tokens_map_file: vec![],
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
#[allow(dead_code)]
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
