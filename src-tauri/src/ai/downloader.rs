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
use super::{engine, lock_unpoisoned, AiState};

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

    let mtp_missing = model
        .mtp_file
        .map(|file| !models_dir.join(file).is_file())
        .unwrap_or(false);
    if dest.is_file() && !(mtp_missing && model.mtp_size.is_some()) {
        let existing = std::fs::metadata(&dest).map_err(|e| e.to_string())?.len();
        return Ok(DownloadProgress {
            model_id: model.id.to_string(),
            state: DL_COMPLETED.to_string(),
            received: existing,
            total: existing,
            error: None,
        });
    }

    let total = if dest.is_file() {
        // Main GGUF already present: only the MTP draft head is missing.
        model.mtp_size.unwrap_or(0)
    } else {
        model.size_bytes + model.mtp_size.unwrap_or(0)
    };

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
            DownloadJob::new(model.id.to_string(), total),
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

/// Delete a downloaded model (GGUF + optional MTP draft head + partial files)
/// from disk. Stops the engine if it has the model loaded and clears the
/// session selection so auto-start does not try to load a missing file.
#[tauri::command]
pub fn ai_delete_model(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
    model_id: String,
) -> Result<(), String> {
    let model =
        catalog::find_model(&model_id).ok_or_else(|| format!("Unknown model: {model_id}"))?;
    let models_dir = catalog::models_dir(&app)?;
    let dest = models_dir.join(model.filename);

    // Stop and forget any in-flight download for this model.
    {
        let mut guard = lock_unpoisoned(&state.downloads);
        if let Some(job) = guard.remove(model.id) {
            job.cancel.store(true, Ordering::Relaxed);
        }
    }

    // Unload the model before its file disappears.
    let loaded = lock_unpoisoned(&state.engine).model_id.as_deref() == Some(model.id);
    if loaded {
        engine::shutdown(&app);
    }
    if state.selected().as_deref() == Some(model.id) {
        state.set_selected(None);
    }

    remove_file_if_present(&dest)?;

    let mut part_name = dest.into_os_string();
    part_name.push(".part");
    remove_file_if_present(&PathBuf::from(part_name))?;

    if let Some(mtp_file) = model.mtp_file {
        let mtp_dest = models_dir.join(mtp_file);
        remove_file_if_present(&mtp_dest)?;
        let mut mtp_part_name = mtp_dest.into_os_string();
        mtp_part_name.push(".part");
        remove_file_if_present(&PathBuf::from(mtp_part_name))?;
    }

    for legacy in model.legacy_filenames {
        remove_file_if_present(&models_dir.join(legacy))?;
        let mut part_name = models_dir.join(legacy).into_os_string();
        part_name.push(".part");
        remove_file_if_present(&PathBuf::from(part_name))?;
    }

    Ok(())
}

/// Remove only superseded model files (e.g. the pre-QAT Gemma downloads), so
/// users can reclaim disk space without deleting the current model.
#[tauri::command]
pub fn ai_delete_legacy_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let model =
        catalog::find_model(&model_id).ok_or_else(|| format!("Unknown model: {model_id}"))?;
    let models_dir = catalog::models_dir(&app)?;
    for legacy in model.legacy_filenames {
        let path = models_dir.join(legacy);
        remove_file_if_present(&path)?;
        let mut part_name = path.into_os_string();
        part_name.push(".part");
        remove_file_if_present(&PathBuf::from(part_name))?;
    }
    Ok(())
}

fn remove_file_if_present(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    std::fs::remove_file(path).map_err(|e| format!("Failed to delete {}: {e}", path.display()))
}

fn run_download(
    _model_id: String,
    model: &'static ModelEntry,
    dest: PathBuf,
    part: PathBuf,
    job: DownloadJob,
) {
    let main_exists = dest.is_file();
    if !main_exists {
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
    }

    // Optional MTP draft head (Gemma/Qwen models). The head can live in a
    // subfolder of the models dir, so create the parent and keep aggregate
    // progress across both files. When only the head is missing, progress
    // starts at zero instead of pretending the main GGUF is being re-downloaded.
    if let (Some(mtp_file), Some(mtp_url), Some(mtp_sha), Some(mtp_size)) = (
        model.mtp_file,
        model.mtp_url,
        model.mtp_sha256,
        model.mtp_size,
    ) {
        if job.cancel.load(Ordering::Relaxed) {
            fail(&job, "cancelled".into());
            return;
        }
        let Some(models_root) = dest.parent() else {
            fail(&job, "Model destination has no parent directory.".into());
            return;
        };
        let mtp_dest = models_root.join(mtp_file);
        if let Some(parent) = mtp_dest.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                fail(&job, format!("Could not create MTP folder: {e}"));
                return;
            }
        }
        let mut mtp_part_name = mtp_dest.as_os_str().to_os_string();
        mtp_part_name.push(".part");
        let mtp_part = PathBuf::from(mtp_part_name);
        if !mtp_dest.is_file() {
            let mtp_base = if main_exists { 0 } else { model.size_bytes };
            if let Err(e) = download_verified(
                mtp_url, mtp_size, &mtp_part, &mtp_dest, mtp_sha, &job, mtp_base,
            ) {
                fail(&job, format!("MTP draft download failed: {e}"));
                return;
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

        let response = match request.call() {
            Ok(response) => response,
            Err(ureq::Error::Status(416, _)) if existing > 0 => {
                // Server rejected `bytes={existing}-`; either the part file is already
                // complete (let SHA-256 verification decide) or it overshot size_hint.
                if size_hint > 0 && existing > size_hint {
                    let _ = std::fs::remove_file(part);
                    if attempt >= MAX_ATTEMPTS {
                        return Err("Download failed with HTTP 416 (oversized partial file)".into());
                    }
                    std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
                    continue;
                }
                return Ok(());
            }
            Err(ureq::Error::Status(code, _)) => {
                if (code == 408 || code == 429 || code >= 500) && attempt < MAX_ATTEMPTS {
                    std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
                    continue;
                }
                return Err(format!("Unexpected HTTP status: {code}"));
            }
            Err(ureq::Error::Transport(e)) => {
                if attempt < MAX_ATTEMPTS {
                    std::thread::sleep(Duration::from_millis(400 * u64::from(attempt.min(4))));
                    continue;
                }
                return Err(format!("Download request failed after {attempt} attempts: {e}"));
            }
        };

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
        let mut read_error: Option<std::io::Error> = None;
        loop {
            if job.cancel.load(Ordering::Relaxed) {
                drop(file);
                return Err("cancelled".into());
            }
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    file.write_all(&buffer[..read])
                        .map_err(|e| format!("Write failed: {e}"))?;
                    received += read as u64;
                    lock_unpoisoned(&job.progress).received = base + received;
                }
                Err(e) => {
                    read_error = Some(e);
                    break;
                }
            }
        }
        drop(reader);
        drop(file);

        let current = std::fs::metadata(part).map_err(|e| e.to_string())?.len();
        if read_error.is_none() && total > 0 && current >= total {
            return Ok(());
        }
        if attempt >= MAX_ATTEMPTS {
            return match read_error {
                Some(e) => Err(format!(
                    "Download read failed after {attempt} attempts: {e}"
                )),
                None => Err(format!(
                    "Download incomplete after {attempt} attempts ({current}/{total} bytes)"
                )),
            };
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

    let expected = expected.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(format!(
            "pinned SHA-256 is malformed ({} hex chars, expected 64)",
            expected.len()
        ));
    }

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
    if actual != expected {
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
pub fn ai_engine_pack_remove(
    app: AppHandle,
    state: tauri::State<'_, AiState>,
) -> Result<(), String> {
    {
        let mut guard = lock_unpoisoned(&state.downloads);
        if let Some(job) = guard.remove(ENGINE_PACK_KEY) {
            job.cancel.store(true, Ordering::Relaxed);
        }
    }
    engine::shutdown(&app);
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
    std::fs::write(
        dest_dir.join(catalog::PACK_VERSION_FILE),
        catalog::ENGINE_PIN,
    )
    .map_err(|e| format!("Failed to write CUDA pack version marker: {e}"))?;
    let _ = std::fs::remove_dir_all(&dl_dir);
    Ok(())
}

const MAX_ZIP_ENTRIES: usize = 10_000;
const MAX_ZIP_ENTRY_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// Extract every file in the archive into `dest`, flattened by basename
/// (llama.cpp Windows zips keep all binaries at the archive root anyway).
fn extract_zip_flat(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Invalid zip {}: {e}", zip_path.display()))?;
    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(format!(
            "Archive {} has too many entries ({}).",
            zip_path.display(),
            archive.len()
        ));
    }

    let mut total_uncompressed: u64 = 0;
    let mut total_written: u64 = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }

        // enclosed_name rejects `..`, absolute paths and (on Windows) drive /
        // UNC prefixes. Flatten only after that check, then re-validate the
        // basename to be extra strict about backslash tricks.
        let Some(enclosed) = entry.enclosed_name() else {
            return Err(format!("Unsafe archive entry: {}", entry.name()));
        };
        let Some(name) = enclosed.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.is_empty()
            || name == "."
            || name == ".."
            || name.contains('/')
            || name.contains('\\')
            || name.contains(':')
        {
            return Err(format!("Unsafe archive entry: {}", entry.name()));
        }

        let size = entry.size();
        if size > MAX_ZIP_ENTRY_BYTES
            || total_uncompressed.saturating_add(size) > MAX_ZIP_TOTAL_BYTES
        {
            return Err(format!(
                "Archive {} exceeds the extraction size limit.",
                zip_path.display()
            ));
        }
        total_uncompressed = total_uncompressed.saturating_add(size);

        let out_path = dest.join(name);
        let mut out =
            std::fs::File::create(&out_path).map_err(|e| format!("extract {name}: {e}"))?;
        let mut limited = std::io::Read::take(&mut entry, MAX_ZIP_ENTRY_BYTES + 1);
        let written =
            std::io::copy(&mut limited, &mut out).map_err(|e| format!("extract {name}: {e}"))?;
        if written > MAX_ZIP_ENTRY_BYTES {
            let _ = std::fs::remove_file(&out_path);
            return Err(format!("Archive entry {name} exceeds the size limit."));
        }
        total_written = total_written.saturating_add(written);
        if total_written > MAX_ZIP_TOTAL_BYTES {
            let _ = std::fs::remove_file(&out_path);
            return Err(format!(
                "Archive {} exceeds the total extraction size limit.",
                zip_path.display()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::BufRead;
    use std::net::TcpListener;

    #[test]
    fn perform_download_retries_after_500_and_truncated_stream() {
        let payload = b"hello world partial resume payload";
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind listener");
        let port = listener.local_addr().unwrap().port();
        let url = format!("http://127.0.0.1:{port}/model.gguf");

        let server = std::thread::spawn(move || {
            // Request 1: transient 500
            let (mut s1, _) = listener.accept().unwrap();
            let mut r1 = std::io::BufReader::new(&s1);
            let mut line = String::new();
            while r1.read_line(&mut line).unwrap() > 0 && line != "\r\n" {
                line.clear();
            }
            s1.write_all(b"HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .unwrap();
            drop(s1);

            // Request 2: 200 OK with first 11 bytes, then abrupt close before Content-Length
            let (mut s2, _) = listener.accept().unwrap();
            let mut r2 = std::io::BufReader::new(&s2);
            line.clear();
            while r2.read_line(&mut line).unwrap() > 0 && line != "\r\n" {
                line.clear();
            }
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                payload.len()
            );
            s2.write_all(head.as_bytes()).unwrap();
            s2.write_all(&payload[..11]).unwrap();
            drop(s2);

            // Request 3: 206 Partial Content with Range header for remainder
            let (mut s3, _) = listener.accept().unwrap();
            let mut r3 = std::io::BufReader::new(&s3);
            let mut req_headers = String::new();
            loop {
                line.clear();
                if r3.read_line(&mut line).unwrap() == 0 || line == "\r\n" {
                    break;
                }
                req_headers.push_str(&line);
            }
            assert!(
                req_headers.to_ascii_lowercase().contains("range: bytes=11-"),
                "expected Range resume header, got: {req_headers}"
            );
            let rest = &payload[11..];
            let head3 = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes 11-{}/{}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                payload.len() - 1,
                payload.len(),
                rest.len()
            );
            s3.write_all(head3.as_bytes()).unwrap();
            s3.write_all(rest).unwrap();
        });

        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("test.part");
        let job = DownloadJob::new("test".into(), payload.len() as u64);
        perform_download(&url, payload.len() as u64, &part, &job, 0).expect("resumed download");
        assert_eq!(std::fs::read(&part).unwrap(), payload);
        server.join().unwrap();
    }

    #[test]
    fn download_verified_accepts_416_when_part_matches_sha256() {
        let payload = b"already complete part content";
        let expected_sha = format!("{:x}", Sha256::digest(payload));
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind listener");
        let port = listener.local_addr().unwrap().port();
        let url = format!("http://127.0.0.1:{port}/model.gguf");

        let server = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut r = std::io::BufReader::new(&s);
            let mut line = String::new();
            while r.read_line(&mut line).unwrap() > 0 && line != "\r\n" {
                line.clear();
            }
            s.write_all(
                b"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            )
            .unwrap();
        });

        let dir = tempfile::tempdir().unwrap();
        let part = dir.path().join("model.gguf.part");
        let dest = dir.path().join("model.gguf");
        std::fs::write(&part, payload).unwrap();
        let job = DownloadJob::new("test".into(), payload.len() as u64);

        download_verified(&url, payload.len() as u64, &part, &dest, &expected_sha, &job, 0)
            .expect("416 with valid part file verifies and finalizes");
        assert_eq!(std::fs::read(&dest).unwrap(), payload);
        assert!(!part.exists());
        server.join().unwrap();
    }
}
