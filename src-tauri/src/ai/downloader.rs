//! Resumable GGUF downloader with SHA-256 verification
//! (docs/AI_V3_PLAN.md §3.4 / P0.5). Progress is polled via
//! `ai_download_model_progress`; cancellation via `ai_download_model_cancel`.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use super::catalog::{self, ModelEntry};
use super::AiState;

pub const DL_QUEUED: &str = "queued";
pub const DL_DOWNLOADING: &str = "downloading";
pub const DL_VERIFYING: &str = "verifying";
pub const DL_COMPLETED: &str = "completed";
pub const DL_FAILED: &str = "failed";
pub const DL_CANCELLED: &str = "cancelled";

const CHUNK_SIZE: usize = 256 * 1024;
const MAX_ATTEMPTS: u32 = 8;

pub struct JobProgress {
    pub model_id: String,
    pub status: String,
    pub received: u64,
    pub total: u64,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct DownloadJob {
    pub progress: Arc<Mutex<JobProgress>>,
    pub cancel: Arc<AtomicBool>,
}

impl DownloadJob {
    pub fn new(model_id: String, total: u64) -> Self {
        Self {
            progress: Arc::new(Mutex::new(JobProgress {
                model_id,
                status: DL_QUEUED.to_string(),
                received: 0,
                total,
                error: None,
            })),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub model_id: String,
    pub state: String,
    pub received: u64,
    pub total: u64,
    pub error: Option<String>,
}

fn snapshot(job: &DownloadJob) -> DownloadProgress {
    let p = job.progress.lock().unwrap();
    DownloadProgress {
        model_id: p.model_id.clone(),
        state: p.status.clone(),
        received: p.received,
        total: p.total,
        error: p.error.clone(),
    }
}

fn set_status(job: &DownloadJob, status: &str) {
    job.progress.lock().unwrap().status = status.to_string();
}

#[tauri::command]
pub fn ai_download_model_start(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
    model_id: String,
) -> Result<DownloadProgress, String> {
    let model: &'static ModelEntry =
        catalog::find_model(&model_id).ok_or_else(|| format!("Unknown model: {model_id}"))?;

    let models_dir = catalog::models_dir(&app)?;
    let dest = models_dir.join(model.filename);
    let mut part_name = dest.clone().into_os_string();
    part_name.push(".part");
    let part = PathBuf::from(part_name);

    if dest.is_file() {
        let existing = std::fs::metadata(&dest).map_err(|e| e.to_string())?.len();
        return Ok(DownloadProgress {
            model_id: model.id.to_string(),
            state: DL_COMPLETED.to_string(),
            received: existing,
            total: existing,
            error: None,
        });
    }

    {
        let mut guard = state.downloads.lock().unwrap();
        if let Some(job) = guard.get(model.id) {
            let snap = snapshot(job);
            if matches!(
                snap.state.as_str(),
                DL_QUEUED | DL_DOWNLOADING | DL_VERIFYING
            ) {
                return Ok(snap);
            }
        }
        guard.insert(
            model.id.to_string(),
            DownloadJob::new(model.id.to_string(), model.size_bytes),
        );
    }

    let job = {
        let guard = state.downloads.lock().unwrap();
        guard.get(model.id).unwrap().clone()
    };

    let job_for_thread = job.clone();
    let model_id = model.id.to_string();
    std::thread::spawn(move || {
        run_download(model_id, model, dest, part, job_for_thread);
    });

    Ok(snapshot(&job))
}

#[tauri::command]
pub fn ai_download_model_progress(
    state: tauri::State<'_, AiState>,
    model_id: String,
) -> Result<DownloadProgress, String> {
    let guard = state.downloads.lock().unwrap();
    let job = guard
        .get(&model_id)
        .ok_or_else(|| format!("No download job for: {model_id}"))?;
    Ok(snapshot(job))
}

#[tauri::command]
pub fn ai_download_model_cancel(
    state: tauri::State<'_, AiState>,
    model_id: String,
) -> Result<DownloadProgress, String> {
    let guard = state.downloads.lock().unwrap();
    let job = guard
        .get(&model_id)
        .ok_or_else(|| format!("No download job for: {model_id}"))?;
    job.cancel.store(true, Ordering::Relaxed);
    Ok(snapshot(job))
}

fn run_download(
    _model_id: String,
    model: &'static ModelEntry,
    dest: PathBuf,
    part: PathBuf,
    job: DownloadJob,
) {
    match perform_download(model, &part, &job) {
        Ok(()) => {
            set_status(&job, DL_VERIFYING);
            match verify_sha256(&part, model.sha256) {
                Ok(()) => {
                    if let Err(e) = std::fs::rename(&part, &dest) {
                        fail(&job, format!("Failed to finalize model file: {e}"));
                    } else {
                        let mut p = job.progress.lock().unwrap();
                        p.status = DL_COMPLETED.to_string();
                        p.received = model.size_bytes;
                        p.total = model.size_bytes;
                    }
                }
                Err(e) => {
                    let _ = std::fs::remove_file(&part);
                    fail(&job, format!("SHA-256 mismatch: {e}"));
                }
            }
        }
        Err(e) => fail(&job, e),
    }
}

fn perform_download(
    model: &'static ModelEntry,
    part: &PathBuf,
    job: &DownloadJob,
) -> Result<(), String> {
    set_status(job, DL_DOWNLOADING);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .build();

    let mut attempt: u32 = 0;
    loop {
        attempt += 1;
        if job.cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }

        let existing = if part.is_file() {
            std::fs::metadata(part).map_err(|e| e.to_string())?.len()
        } else {
            0
        };

        let request = agent.get(model.url).set("User-Agent", "teacherpro-fetch");
        let request = if existing > 0 {
            request.set("Range", &format!("bytes={existing}-"))
        } else {
            request
        };

        let response = request
            .call()
            .map_err(|e| format!("Download request failed: {e}"))?;

        let resumed = response.status() == 206;
        if response.status() == 200 {
            let _ = std::fs::remove_file(part);
        } else if !resumed {
            return Err(format!("Unexpected HTTP status: {}", response.status()));
        }

        let total = response
            .header("content-range")
            .and_then(parse_total_from_range)
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
            .unwrap_or(model.size_bytes);

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(resumed)
            .write(true)
            .truncate(!resumed)
            .open(part)
            .map_err(|e| format!("Failed to open part file: {e}"))?;

        let received = if resumed { existing } else { 0 };
        {
            let mut p = job.progress.lock().unwrap();
            p.total = total;
            p.received = received;
        }

        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; CHUNK_SIZE];
        let mut received = received;
        loop {
            if job.cancel.load(Ordering::Relaxed) {
                drop(file);
                return Err("cancelled".into());
            }
            let read = reader
                .read(&mut buffer)
                .map_err(|e| format!("Read failed (will retry with resume): {e}"))?;
            if read == 0 {
                break;
            }
            file.write_all(&buffer[..read])
                .map_err(|e| format!("Write failed: {e}"))?;
            received += read as u64;
            job.progress.lock().unwrap().received = received;
        }
        drop(reader);
        drop(file);

        let current = std::fs::metadata(part).map_err(|e| e.to_string())?.len();
        if total > 0 && current >= total {
            return Ok(());
        }
        if attempt >= MAX_ATTEMPTS {
            return Err(format!(
                "Download incomplete after {attempt} attempts ({current}/{total} bytes)"
            ));
        }
        std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
    }
}

fn parse_total_from_range(header: &str) -> Option<u64> {
    // "bytes 100-999/1000" or "bytes */1000"
    let total = header.rsplit('/').next()?.trim();
    total.parse::<u64>().ok()
}

fn verify_sha256(file: &PathBuf, expected: &str) -> Result<(), String> {
    use sha2::{Digest, Sha256};

    let mut file_handle = std::fs::File::open(file).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file_handle
            .read(&mut buffer)
            .map_err(|e| format!("Hash read failed: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = format!("{:x}", hasher.finalize());
    if actual != expected.to_lowercase() {
        return Err(format!("expected {expected}, got {actual}"));
    }
    Ok(())
}

fn fail(job: &DownloadJob, message: String) {
    let mut p = job.progress.lock().unwrap();
    if message == "cancelled" {
        p.status = DL_CANCELLED.to_string();
        p.error = None;
    } else {
        p.status = DL_FAILED.to_string();
        p.error = Some(message);
    }
}
