use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_fs::FsExt;


mod ai;
mod subject_db;


pub(crate) fn command_for<S: AsRef<OsStr>>(program: S) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(program);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command
}

/// Spawn a process without waiting for it, but reap it on a background thread
/// so it does not stay around as a zombie.
fn spawn_detached(command: &mut Command) -> Result<(), String> {
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to launch process: {error}"))?;

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

/// Validate a path that is about to be opened with the OS default handler.
/// The path is used as a process argument only (never interpolated into a
/// shell string), so this is defense in depth.
fn validated_existing_path(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if !candidate.exists() {
        return Err("Path not found.".to_string());
    }
    Ok(candidate)
}

/// Canonicalized vault root registered by the frontend (`register_vault_root`).
/// Paths the webview asks to open, reveal or print are verified to stay inside
/// this root (or the OS temp directory, for print spool files) — lesson
/// documents can carry material paths of unknown origin, so containment is
/// enforced on the Rust side rather than trusting frontend-supplied paths.
static VAULT_ROOT: LazyLock<Mutex<Option<PathBuf>>> = LazyLock::new(|| Mutex::new(None));

#[tauri::command]
fn register_vault_root(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }
    let canonical = std::fs::canonicalize(&candidate).unwrap_or(candidate);
    if let Ok(mut guard) = VAULT_ROOT.lock() {
        *guard = Some(canonical);
    }
    Ok(())
}

/// Check that `path` (which must exist) resolves inside the registered vault
/// root or the OS temp directory. Canonicalization happens before the
/// comparison, so `..` segments, symlinks and Windows case differences are
/// judged against the real on-disk location.
fn is_allowed_path(path: &Path) -> bool {
    let resolved = match std::fs::canonicalize(path) {
        Ok(canonical) => canonical,
        Err(_) => return false,
    };

    let temp_dir = std::env::temp_dir();
    if resolved.starts_with(&temp_dir) {
        return true;
    }
    if let Ok(canonical_temp) = std::fs::canonicalize(&temp_dir) {
        if resolved.starts_with(canonical_temp) {
            return true;
        }
    }

    if let Ok(guard) = VAULT_ROOT.lock() {
        if let Some(root) = guard.as_ref() {
            return resolved.starts_with(root);
        }
    }
    false
}

/// Validate a path that is about to be sent to the OS print pipeline.
/// Must exist and have a `.pdf` extension.
fn validated_pdf_path(path: &str) -> Result<PathBuf, String> {
    let candidate = validated_existing_path(path)?;
    if !candidate.is_file() {
        return Err("Path is not a file.".to_string());
    }

    let is_pdf = candidate
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("pdf"))
        .unwrap_or(false);

    if !is_pdf {
        return Err("Only PDF files can be printed.".to_string());
    }

    Ok(candidate)
}

/// Normalized string form of a path for tolerant prefix checks when
/// canonicalization is not available (exotic mounts, subst drives, network
/// paths): separators unified, case-folded, trailing separators trimmed.
#[cfg(windows)]
fn normalized_path_string(path: &Path) -> String {
    path.to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase()
}

#[cfg(not(windows))]
fn normalized_path_string(path: &Path) -> String {
    path.to_string_lossy()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

/// Whether `child` (any form) denotes a path at or below `parent` (any form).
/// Used as the fallback when `fs::canonicalize` fails for either side.
fn path_string_below(child: &Path, parent: &Path) -> bool {
    let child_str = normalized_path_string(child);
    let parent_str = normalized_path_string(parent);
    if parent_str.is_empty() {
        return false;
    }
    child_str == parent_str
        || child_str.starts_with(&format!("{parent_str}\\"))
        || child_str.starts_with(&format!("{parent_str}/"))
}

/// Verify that a frontend-supplied vault directory points at the vault that
/// was registered via `register_vault_root`. Used by the subject_db commands,
/// whose target root comes straight from the webview — without this check a
/// commanded `subject_db_delete` could run `remove_dir_all` under any path
/// the webview can name.
pub(crate) fn validated_vault_path(vault_path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(vault_path.trim());
    if !candidate.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }

    let roots: Vec<PathBuf> = match VAULT_ROOT.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(root) => vec![
                root.clone(),
                std::fs::canonicalize(root).unwrap_or_else(|_| root.clone()),
            ],
            None => return Err("No vault is registered yet.".to_string()),
        },
        Err(_) => return Err("Vault registry is not accessible.".to_string()),
    };

    // Preferred: judge against the canonicalized on-disk location (defeats
    // `..` segments and symlinks). Fallback: normalized string prefixes, so
    // setups where canonicalize fails keep working.
    let resolved = std::fs::canonicalize(&candidate).ok();
    let contained = roots.iter().any(|root| match &resolved {
        Some(resolved) => resolved.starts_with(root),
        None => path_string_below(&candidate, root),
    });
    if !contained {
        return Err("Vault path is outside the registered vault.".to_string());
    }
    Ok(resolved.unwrap_or(candidate))
}

/// Whether a path about to be granted to the webview fs scope stays inside
/// the registered vault root or the OS temp directory. Handles paths that do
/// not exist yet (about to be created): canonicalizes the deepest existing
/// ancestor and requires every remaining component to be a plain name —
/// never `..`, never one containing a path separator.
fn grant_path_contained(path: &Path) -> bool {
    let mut base = path.to_path_buf();
    loop {
        if base.exists() {
            break;
        }
        match (base.parent(), base.file_name()) {
            (Some(parent), Some(name)) => {
                let name_lossy = name.to_string_lossy();
                if name_lossy == ".." || name_lossy.contains('/') || name_lossy.contains('\\') {
                    return false;
                }
                base = parent.to_path_buf();
            }
            _ => return false,
        }
    }

    let temp_dir = std::env::temp_dir();
    if path_below_root(&base, &temp_dir) {
        return true;
    }

    if let Ok(guard) = VAULT_ROOT.lock() {
        if let Some(root) = guard.as_ref() {
            if path_below_root(&base, root) {
                return true;
            }
        }
    }
    false
}

/// Containment check for an existing base path against a root: prefer the
/// canonicalized comparison, fall back to normalized string prefixes.
fn path_below_root(base: &Path, root: &Path) -> bool {
    if let (Ok(resolved), Ok(root_canonical)) =
        (std::fs::canonicalize(base), std::fs::canonicalize(root))
    {
        if resolved.starts_with(&root_canonical) {
            return true;
        }
    }
    if let Ok(resolved) = std::fs::canonicalize(base) {
        if resolved.starts_with(root) {
            return true;
        }
    }
    // Fallback for setups where canonicalize fails on either side.
    path_string_below(base, root)
        || std::fs::canonicalize(base)
            .map(|resolved| resolved.starts_with(root) || path_string_below(&resolved, root))
            .unwrap_or(false)
}


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn allow_fs_scopes(window: tauri::Window, paths: Vec<String>) -> Result<(), String> {
    let scope = window.fs_scope();

    // Always grant the OS temp directory (used to spool print PDFs). Both the
    // raw and canonical forms are needed because Tauri canonicalizes existing
    // paths but not ones about to be created (macOS: /var -> /private/var).
    let temp_dir = std::env::temp_dir();
    let _ = scope.allow_directory(&temp_dir, true);
    if let Ok(canonical_temp) = std::fs::canonicalize(&temp_dir) {
        let _ = scope.allow_directory(canonical_temp, true);
    }

    for raw_path in paths {
        let trimmed = raw_path.trim();
        if trimmed.is_empty() {
            continue;
        }

        let raw = PathBuf::from(trimmed);

        // Containment: the webview may only grant itself paths inside the
        // registered vault (or temp). Arbitrary locations the user picked in
        // a native dialog (PDF export destination, material import source)
        // are recorded in the fs scope automatically by the dialog plugin,
        // so this command no longer needs to grant outside the vault — and
        // therefore no longer can.
        let canonical = std::fs::canonicalize(&raw).unwrap_or_else(|_| raw.clone());
        if !grant_path_contained(&canonical) && !grant_path_contained(&raw) {
            return Err("Path is outside the registered vault.".to_string());
        }

        // Tauri canonicalizes checked paths when they exist but not when they
        // are about to be created, and scope patterns are never canonicalized.
        // Grant both forms so existing and new files work, including paths that
        // contain symlinked components.
        let grant = |path: &Path| -> Result<(), String> {
            let result = if path.is_dir() {
                scope.allow_directory(path, true)
            } else {
                scope.allow_file(path)
            };
            result.map_err(|error| format!("Failed to grant file access: {error}"))
        };

        grant(&raw)?;
        if canonical != raw {
            grant(&canonical)?;
        }
    }

    Ok(())
}

#[tauri::command]
fn open_file_in_default_app(path: String) -> Result<(), String> {
    let target = validated_existing_path(&path)?;
    if !is_allowed_path(&target) {
        return Err("Path is outside the vault.".to_string());
    }
    let target = target.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        spawn_detached(command_for("open").arg(&target))?;
    }

    #[cfg(target_os = "windows")]
    {
        spawn_detached(
            command_for("powershell")
                .env("TP_OPEN_PATH", &target)
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    "Start-Process -FilePath $env:TP_OPEN_PATH",
                ]),
        )?;
    }

    #[cfg(target_os = "linux")]
    {
        spawn_detached(command_for("xdg-open").arg(&target))?;
    }

    Ok(())
}

#[tauri::command]
fn print_pdf_file(path: String) -> Result<(), String> {
    let target = validated_pdf_path(&path)?;
    if !is_allowed_path(&target) {
        return Err("Path is outside the vault and the temporary directory.".to_string());
    }
    let target = target.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        // Preview is sandboxed and cannot read print spool files handed to
        // it through a raw print AppleEvent: the handler fails with error
        // -10000 and Preview reports "couldn't be opened because you don't
        // have permission to view it". Opening the file through
        // LaunchServices (`open -a`) instead hands Preview a sandbox
        // extension for it, after which printing the document works.
        // Spool a copy into /private/tmp first so the path given to Preview
        // is always a stable file; the copy is left in place because
        // Preview reads it while the print dialog is open (macOS cleans up
        // /private/tmp on its own).
        let spool_path = PathBuf::from("/private/tmp").join(format!(
            "teacherpro-print-{}.pdf",
            uuid::Uuid::new_v4()
        ));
        std::fs::copy(&target, &spool_path)
            .map_err(|error| format!("Failed to spool print file: {error}"))?;
        let spool_target = spool_path.to_string_lossy().to_string();

        command_for("open")
            .args(["-a", "Preview"])
            .arg(&spool_target)
            .status()
            .map_err(|error| format!("Failed to open print preview: {error}"))?;

        // Print the spooled document once Preview has it frontmost. The
        // script waits up to ~10 s for the document to appear. The only
        // string in the AppleScript source is the fixed spool file name
        // prefix, so there is nothing to inject.
        let script = "tell application \"Preview\"\n\
             activate\n\
             repeat 40 times\n\
             if (count of documents) > 0 then\n\
             if (name of front document) contains \"teacherpro-print-\" then exit repeat\n\
             end if\n\
             delay 0.25\n\
             end repeat\n\
             print front document with print dialog\n\
             end tell";

        spawn_detached(command_for("osascript").arg("-e").arg(script))?;
    }

    #[cfg(target_os = "windows")]
    {
        // Some Windows PDF handlers do not expose a "Print" shell verb.
        // When that happens, open the file so the user can print manually.
        // The path travels through an environment variable, so PowerShell
        // never parses it as code.
        let print_script = "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:TP_PRINT_PATH -Verb Print -ErrorAction Stop";

        let print_attempt = command_for("powershell")
            .env("TP_PRINT_PATH", &target)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                print_script,
            ])
            .output()
            .map_err(|error| format!("Failed to run print command: {error}"))?;

        if !print_attempt.status.success() {
            let open_attempt = command_for("powershell")
                .env("TP_PRINT_PATH", &target)
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    "Start-Process -FilePath $env:TP_PRINT_PATH",
                ])
                .status()
                .map_err(|error| format!("Failed to print or open file: {error}"))?;

            if !open_attempt.success() {
                let stderr = String::from_utf8_lossy(&print_attempt.stderr);
                let detail = stderr.trim();
                if detail.is_empty() {
                    return Err("Failed to print PDF on Windows.".to_string());
                }
                return Err(format!("Failed to print PDF on Windows: {detail}"));
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        spawn_detached(command_for("lpr").arg(&target))?;
    }

    Ok(())
}

#[tauri::command]
fn reveal_item_in_file_manager(path: String) -> Result<(), String> {
    let target = validated_existing_path(&path)?;
    if !is_allowed_path(&target) {
        return Err("Path is outside the vault.".to_string());
    }
    tauri_plugin_opener::reveal_item_in_dir(&target).map_err(|error| error.to_string())
}

/// One-time migration for the app identifier change (`com.pano.temp-app` ->
/// `com.pano.teacherpro`). Earlier releases stored the settings file in a
/// sibling app-data directory, so copy it into the new location on the first
/// launch after the rename. Never overwrites an existing file, which makes it
/// safe to run on every start.
fn migrate_legacy_app_data(app: &tauri::App) {
    const LEGACY_IDENTIFIER: &str = "com.pano.temp-app";
    const SETTINGS_FILE: &str = "teacherpro-settings.json";

    let Ok(new_dir) = app.path().app_data_dir() else {
        return;
    };
    let Some(parent) = new_dir.parent() else {
        return;
    };
    let legacy_dir = parent.join(LEGACY_IDENTIFIER);
    if legacy_dir == new_dir {
        return;
    }

    let legacy_settings = legacy_dir.join(SETTINGS_FILE);
    let new_settings = new_dir.join(SETTINGS_FILE);

    if !legacy_settings.is_file() || new_settings.exists() {
        return;
    }

    if std::fs::create_dir_all(&new_dir).is_ok() {
        let _ = std::fs::copy(&legacy_settings, &new_settings);
    }
}

/// Set by `confirm_close_window` once the webview finished its close flush.
static CLOSE_CONFIRMED: AtomicBool = AtomicBool::new(false);
/// Ensures the force-close grace timer runs at most once per close request.
static CLOSE_GRACE_SPAWNED: AtomicBool = AtomicBool::new(false);
/// How long a close request waits for the webview flush before force-closing.
const CLOSE_FLUSH_GRACE: Duration = Duration::from_secs(6);

/// Called by the webview after it flushed pending document saves in response
/// to `app-close-requested`. Destroys the window (destroy does not emit
/// another CloseRequested, so the flush cannot loop).
#[tauri::command]
fn confirm_close_window(app: tauri::AppHandle) -> Result<(), String> {
    CLOSE_CONFIRMED.store(true, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .on_window_event(|window, event| {
            // Close coordination: the webview first gets a chance to flush
            // pending autosaves, then asks back via `confirm_close_window`
            // (which destroys the window). The grace timer force-closes a
            // hung webview so the window can always be closed.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                CLOSE_CONFIRMED.store(false, Ordering::Relaxed);
                let _ = window.emit("app-close-requested", ());
                if !CLOSE_GRACE_SPAWNED.swap(true, Ordering::Relaxed) {
                    let handle = window.app_handle().clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(CLOSE_FLUSH_GRACE);
                        if !CLOSE_CONFIRMED.load(Ordering::Relaxed) {
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.destroy();
                            }
                        }
                        CLOSE_GRACE_SPAWNED.store(false, Ordering::Relaxed);
                    });
                }
                // The engine is on its way out with the window — kill it now
                // (previously the only thing close did).
                ai::engine::kill_on_exit(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            open_file_in_default_app,
            reveal_item_in_file_manager,
            register_vault_root,
            allow_fs_scopes,
            print_pdf_file,
            confirm_close_window,
            subject_db::subject_db_list,
            subject_db::subject_db_scan_import,
            subject_db::subject_db_add_pdfs,
            subject_db::subject_db_delete_file,
            subject_db::subject_db_query,
            subject_db::subject_db_delete,
            ai::catalog::ai_catalog_info,
            ai::engine::ai_engine_status,
            ai::engine::ai_engine_start,
            ai::engine::ai_engine_stop,
            ai::downloader::ai_download_model_start,
            ai::downloader::ai_download_model_progress,
            ai::downloader::ai_download_model_cancel,
            ai::client::ai_chat,
            ai::client::ai_chat_cancel,
            ai::client::ai_generate_text_v2,
            ai::client::ai_generate_ready,
            ai::client::ai_count_tokens,
            ai::client::ai_structured,
            ai::engine::ai_select_model,
            ai::engine::ai_selected_model,
            ai::hardware::ai_hardware_info,
            ai::downloader::ai_engine_pack_status,
            ai::downloader::ai_engine_pack_start,
            ai::downloader::ai_engine_pack_cancel,
            ai::downloader::ai_engine_pack_remove
        ])
        .manage(ai::AiState::new())
        .setup(|app| {
            migrate_legacy_app_data(app);

            // AI v3: register the app handle for subject_db (fastembed embeddings).
            subject_db::init_subject_db(app.handle());

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                ai::engine::kill_on_exit(app);
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{validated_existing_path, validated_pdf_path};
    use std::io::Write;

    #[test]
    fn missing_paths_are_rejected() {
        assert!(validated_existing_path("/definitely/not/here").is_err());
        assert!(validated_pdf_path("/definitely/not/here.pdf").is_err());
    }

    #[test]
    fn pdf_validation_accepts_pdf_files_only() {
        let dir = tempfile::tempdir().expect("temp dir");
        let pdf_path = dir.path().join("lesson.pdf");
        let upper_path = dir.path().join("lesson.PDF");
        let txt_path = dir.path().join("lesson.txt");

        std::fs::File::create(&pdf_path)
            .expect("create pdf")
            .write_all(b"%PDF-1.4")
            .expect("write pdf");
        std::fs::File::create(&upper_path)
            .expect("create upper")
            .write_all(b"%PDF-1.4")
            .expect("write upper");
        std::fs::File::create(&txt_path)
            .expect("create txt")
            .write_all(b"not a pdf")
            .expect("write txt");

        assert!(validated_pdf_path(pdf_path.to_str().unwrap()).is_ok());
        assert!(validated_pdf_path(upper_path.to_str().unwrap()).is_ok());
        assert!(validated_pdf_path(txt_path.to_str().unwrap()).is_err());
        assert!(validated_pdf_path(dir.path().to_str().unwrap()).is_err());
    }
}
