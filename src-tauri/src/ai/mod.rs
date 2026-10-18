//! AI v3 stack: bundled llama-server sidecar engine, GGUF downloader.
//!
//! Design doc: docs/AI_V3_PLAN.md (engine lifecycle §3.3, phases §8).

pub mod catalog;
pub mod client;
pub mod downloader;
pub mod embeddings;
pub mod engine;
pub mod hardware;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use downloader::DownloadJob;
use engine::EngineState;

/// Tauri-managed state for the whole AI stack.
pub struct AiState {
    pub engine: Mutex<EngineState>,
    pub downloads: Mutex<HashMap<String, DownloadJob>>,
    pub stream_cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
    /// User-chosen default model ("Use" in settings); session-scoped until P2 persists it.
    pub selected_model: Mutex<Option<String>>,
}

impl AiState {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(EngineState::new()),
            downloads: Mutex::new(HashMap::new()),
            stream_cancels: Mutex::new(HashMap::new()),
            selected_model: Mutex::new(None),
        }
    }

    pub fn selected(&self) -> Option<String> {
        let guard = lock_unpoisoned(&self.selected_model);
        guard.clone()
    }

    pub fn set_selected(&self, id: Option<String>) {
        let mut guard = lock_unpoisoned(&self.selected_model);
        *guard = id;
    }
}

/// Lock a `Mutex` without poisoning semantics: if a panic happened in some
/// other thread while the lock was held, recover the (possibly inconsistent)
/// data instead of panicking in every subsequent caller. A poisoned AI lock
/// would otherwise permanently brick the engine/downloader/embedder subsystem
/// for the rest of the session — the data behind these mutexes is always
/// rebuildable state, so recovery is strictly better than a cascade panic.
pub(crate) fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}
