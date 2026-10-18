//! Resumable GGUF downloader with SHA-256 verification
//! (docs/AI_V3_PLAN.md §3.4 / P0.5). Progress is polled via
//! `ai_download_model_progress`; cancellation via `ai_download_model_cancel`.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::AppHandle;

use super::catalog::{self, ModelEntry};
use super::{lock_unpoisoned, AiState};

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
    let p = lock_unpoisoned(&job.progress);
    DownloadProgress {
        model_id: p.model_id.clone(),
        state: p.status.clone(),
        received: p.received,
        total: p.total,
        error: p.error.clone(),
    }
}

fn set_status(job: &DownloadJob, status: &str) {
    lock_unpoisoned(&job.progress).status = status.to_string();
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
        let mut guard = lock_unpoisoned(&state.downloads);
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
            DownloadJob::new(
                model.id.to_string(),
                model.size_bytes + model.mtp_size.unwrap_or(0),
            ),
        );
    }

    let job = {
        let guard = lock_unpoisoned(&state.downloads);
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
    let guard = lock_unpoisoned(&state.downloads);
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
    let guard = lock_unpoisoned(&state.downloads);
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
    if let Err(e) = download_verified(
        model.url,
        model.size_bytes,
        &part,
        &dest,
        model.sha256,
        &job,
        0,
    ) {
        fail(&job, e);
        return;
    }

    // Optional MTP draft head (Gemma workstation models) — same HF repo,
    // sibling file. Downloaded as part of the same job (aggregate progress).
    if let (Some(mtp_file), Some(mtp_sha), Some(mtp_size)) =
        (model.mtp_file, model.mtp_sha256, model.mtp_size)
    {
        if job.cancel.load(Ordering::Relaxed) {
            fail(&job, "cancelled".into());
            return;
        }
        if let Some(mtp_url) = catalog::mtp_download_url(model) {
            let mtp_dest = dest.with_file_name(mtp_file);
            let mut mtp_part_name = mtp_dest.as_os_str().to_os_string();
            mtp_part_name.push(".part");
            let mtp_part = PathBuf::from(mtp_part_name);
            if !mtp_dest.is_file() {
                if let Err(e) = download_verified(
                    &mtp_url,
                    mtp_size,
                    &mtp_part,
                    &mtp_dest,
                    mtp_sha,
                    &job,
                    model.size_bytes,
                ) {
                    fail(&job, format!("MTP draft download failed: {e}"));
                    return;
                }
            }
        }
    }

    let mut p = lock_unpoisoned(&job.progress);
    p.status = DL_COMPLETED.to_string();
    p.received = p.total;
}

/// Download one file (resumable), verify SHA-256, then atomically rename.
/// `base` is the aggregate byte offset already completed in this job (for
/// multi-file jobs like model + MTP head or engine + cudart pack).
fn download_verified(
    url: &str,
    size_hint: u64,
    part: &PathBuf,
    dest: &PathBuf,
    sha: &str,
    job: &DownloadJob,
    base: u64,
) -> Result<(), String> {
    perform_download(url, size_hint, part, job, base)?;
    set_status(job, DL_VERIFYING);
    match verify_sha256(part, sha) {
        Ok(()) => std::fs::rename(part, dest)
            .map_err(|e| format!("Failed to finalize {}: {e}", dest.display())),
        Err(e) => {
            let _ = std::fs::remove_file(part);
            Err(format!("SHA-256 mismatch: {e}"))
        }
    }
}

fn perform_download(
    url: &str,
    size_hint: u64,
    part: &PathBuf,
    job: &DownloadJob,
    base: u64,
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

        let request = agent.get(url).set("User-Agent", "teacherpro-fetch");
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
            .unwrap_or(size_hint);

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(resumed)
            .write(true)
            .truncate(!resumed)
            .open(part)
            .map_err(|e| format!("Failed to open part file: {e}"))?;

        let received = if resumed { existing } else { 0 };
        {
            let mut p = lock_unpoisoned(&job.progress);
            p.total = base + total;
            p.received = base + received;
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
            lock_unpoisoned(&job.progress).received = base + received;
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
    let mut p = lock_unpoisoned(&job.progress);
    if message == "cancelled" {
        p.status = DL_CANCELLED.to_string();
        p.error = None;
    } else {
        p.status = DL_FAILED.to_string();
        p.error = Some(message);
    }
}

// ── CUDA acceleration pack (P4) ──────────────────────────────────────────

const ENGINE_PACK_KEY: &str = "engine-cuda";

fn pack_progress(app: &tauri::AppHandle, state: &tauri::State<'_, AiState>) -> DownloadProgress {
    let installed = catalog::cuda_pack_installed(app);
    if installed {
        if let Some(job) = lock_unpoisoned(&state.downloads).get(ENGINE_PACK_KEY) {
            let snap = snapshot(job);
            if snap.state != DL_CANCELLED {
                return snap;
            }
        }
        return DownloadProgress {
            model_id: ENGINE_PACK_KEY.to_string(),
            state: DL_COMPLETED.to_string(),
            received: 0,
            total: 0,
            error: None,
        };
    }
    match lock_unpoisoned(&state.downloads).get(ENGINE_PACK_KEY) {
        Some(job) => snapshot(job),
        None => DownloadProgress {
            model_id: ENGINE_PACK_KEY.to_string(),
            state: "not-installed".to_string(),
            received: 0,
            total: 0,
            error: None,
        },
    }
}

#[tauri::command]
pub fn ai_engine_pack_status(app: AppHandle, state: tauri::State<'_, AiState>) -> DownloadProgress {
    pack_progress(&app, &state)
}

#[tauri::command]
pub fn ai_engine_pack_start(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
) -> Result<DownloadProgress, String> {
    let pack = catalog::CUDA_PACK
        .as_ref()
        .ok_or("No engine pack available for this platform.")?;
    if catalog::cuda_pack_installed(&app) {
        return Ok(pack_progress(&app, &state));
    }
    {
        let mut guard = lock_unpoisoned(&state.downloads);
        if let Some(job) = guard.get(ENGINE_PACK_KEY) {
            let snap = snapshot(job);
            if matches!(
                snap.state.as_str(),
                DL_QUEUED | DL_DOWNLOADING | DL_VERIFYING
            ) {
                return Ok(snap);
            }
        }
        guard.insert(
            ENGINE_PACK_KEY.to_string(),
            DownloadJob::new(
                ENGINE_PACK_KEY.to_string(),
                pack.main_size + pack.cudart_size,
            ),
        );
    }
    let job = {
        lock_unpoisoned(&state.downloads)
            .get(ENGINE_PACK_KEY)
            .unwrap()
            .clone()
    };
    let job_for_thread = job.clone();
    let dest_dir = catalog::engine_pack_dir(&app)?;
    std::thread::spawn(move || {
        run_engine_pack(dest_dir, pack, job_for_thread);
    });
    Ok(snapshot(&job))
}

#[tauri::command]
pub fn ai_engine_pack_cancel(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
) -> Result<DownloadProgress, String> {
    if let Some(job) = lock_unpoisoned(&state.downloads).get(ENGINE_PACK_KEY) {
        job.cancel.store(true, Ordering::Relaxed);
    }
    Ok(pack_progress(&app, &state))
}

#[tauri::command]
pub fn ai_engine_pack_remove(app: AppHandle) -> Result<(), String> {
    let dir = catalog::engine_pack_dir(&app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to remove pack: {e}"))?;
    }
    // Keep the (now empty) directory for a clean reinstall path.
    let _ = std::fs::create_dir_all(&dir);
    Ok(())
}

fn run_engine_pack(dest_dir: PathBuf, pack: &'static catalog::EnginePack, job: DownloadJob) {
    if let Err(e) = perform_engine_pack(&dest_dir, pack, &job) {
        fail(&job, e);
        return;
    }
    let mut p = lock_unpoisoned(&job.progress);
    p.status = DL_COMPLETED.to_string();
    p.received = p.total;
}

fn perform_engine_pack(
    dest_dir: &Path,
    pack: &'static catalog::EnginePack,
    job: &DownloadJob,
) -> Result<(), String> {
    set_status(job, DL_DOWNLOADING);
    let dl_dir = dest_dir.join("_download");
    std::fs::create_dir_all(&dl_dir).map_err(|e| e.to_string())?;

    let files: [(&str, &str, u64, &str); 2] = [
        (
            pack.main_url,
            pack.main_sha256,
            pack.main_size,
            "engine.zip",
        ),
        (
            pack.cudart_url,
            pack.cudart_sha256,
            pack.cudart_size,
            "cudart.zip",
        ),
    ];
    let mut base = 0u64;
    let mut zips: Vec<PathBuf> = Vec::new();
    for (url, sha, size, name) in files {
        if job.cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        let dest = dl_dir.join(name);
        let mut part_name = dest.as_os_str().to_os_string();
        part_name.push(".part");
        let part = PathBuf::from(part_name);
        download_verified(url, size, &part, &dest, sha, job, base)?;
        zips.push(dest);
        base += size;
    }

    set_status(job, DL_VERIFYING);
    for zip_path in &zips {
        extract_zip_flat(zip_path, dest_dir)?;
    }
    if !dest_dir.join(pack.entry).is_file() {
        return Err("CUDA pack extracted but the engine binary is missing.".into());
    }
    let _ = std::fs::remove_dir_all(&dl_dir);
    Ok(())
}

/// Extract every file in the archive into `dest`, flattened by basename
/// (llama.cpp Windows zips keep all binaries at the archive root anyway).
fn extract_zip_flat(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid zip {}: {e}", zip_path.display()))?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let Some(name) = entry.name().rsplit('/').next().map(str::to_string) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        let out_path = dest.join(&name);
        let mut out =
            std::fs::File::create(&out_path).map_err(|e| format!("extract {name}: {e}"))?;
        std::io::copy(&mut entry, &mut out).map_err(|e| format!("extract {name}: {e}"))?;
    }
    Ok(())
}
