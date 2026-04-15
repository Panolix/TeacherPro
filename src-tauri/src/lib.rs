use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;

#[derive(Serialize)]
struct AiRuntimeStatus {
    provider: &'static str,
    available: bool,
    version: Option<String>,
    detail: Option<String>,
}

#[derive(Clone)]
struct AiInstallStateInternal {
    status: String,
    progress: f32,
    detail: Option<String>,
}

#[derive(Serialize, Clone)]
struct AiModelInstallProgress {
    model_id: String,
    status: String,
    progress: f32,
    detail: Option<String>,
}

static AI_INSTALL_STATES: LazyLock<Mutex<HashMap<String, AiInstallStateInternal>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static AI_INSTALL_CHILDREN: LazyLock<Mutex<HashMap<String, Arc<Mutex<Child>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Tracks the Ollama server child process we spawned, so we can kill it on exit.
static OLLAMA_SERVER_CHILD: LazyLock<Mutex<Option<Child>>> =
    LazyLock::new(|| Mutex::new(None));
/// Set to true only when WE spawned Ollama (not when it was already running).
static OLLAMA_WE_STARTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Check if the Ollama HTTP server is already accepting connections.
fn is_ollama_server_running() -> bool {
    let base_url = std::env::var("OLLAMA_HOST")
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    let base_url = base_url.trim_end_matches('/');
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(2))
        .build();
    agent.get(&format!("{base_url}/api/version")).call().is_ok()
}

/// Start `ollama serve` as a background process if not already running.
/// Stores the child process so we can kill it when the app exits.
fn ensure_ollama_server_started() {
    if is_ollama_server_running() {
        return;
    }
    let binary = resolve_ollama_binary();
    match Command::new(&binary)
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            if let Ok(mut guard) = OLLAMA_SERVER_CHILD.lock() {
                *guard = Some(child);
            }
            OLLAMA_WE_STARTED.store(true, std::sync::atomic::Ordering::SeqCst);
        }
        Err(_) => return,
    }

    // Wait for the server to be ready (up to 5 seconds).
    for _ in 0..20 {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if is_ollama_server_running() {
            break;
        }
    }
}

/// Kill the Ollama server if we started it.
fn stop_ollama_server() {
    if !OLLAMA_WE_STARTED.load(std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    // Try killing via the Child handle first (works when serve runs in-process).
    if let Ok(mut guard) = OLLAMA_SERVER_CHILD.lock() {
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
            // Don't wait — just fire-and-forget so we don't block the exit handler.
        }
        *guard = None;
    }
    // Fallback: ollama serve sometimes forks a subprocess that outlives the
    // tracked child handle. Kill all ollama processes by name.
    #[cfg(target_os = "macos")]
    {
        // The official Ollama.app runs as "Ollama" (capital O) in the menu bar.
        // The Homebrew/CLI install runs as "ollama" (lowercase).
        // Quit the app bundle gracefully first, then force-kill any remnant.
        let _ = Command::new("osascript")
            .args(["-e", "tell application \"Ollama\" to quit"])
            .output();
        let _ = Command::new("pkill").args(["-ix", "ollama"]).output();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill").args(["-x", "ollama"]).output();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "ollama.exe"])
            .output();
    }
}

fn is_safe_model_id(model_id: &str) -> bool {
    !model_id.trim().is_empty()
        && model_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
}

fn run_ollama_command(args: &[&str]) -> Result<String, String> {
    let binary = resolve_ollama_binary();

    let output = Command::new(&binary)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to execute {binary}: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail = stderr.trim();
        if detail.is_empty() {
            Err("Ollama command failed without details.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

fn resolve_ollama_binary() -> String {
    let mut candidates: Vec<String> = vec!["ollama".to_string()];

    #[cfg(target_os = "macos")]
    {
        candidates.push("/opt/homebrew/bin/ollama".to_string());
        candidates.push("/usr/local/bin/ollama".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push("/usr/local/bin/ollama".to_string());
        candidates.push("/usr/bin/ollama".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            candidates.push(format!(r"{}\Programs\Ollama\ollama.exe", local_app_data));
        }
        candidates.push(r"C:\Program Files\Ollama\ollama.exe".to_string());
    }

    for candidate in candidates {
        if candidate.contains('/') || candidate.contains('\\') {
            if Path::new(&candidate).exists() {
                return candidate;
            }
        } else if Command::new(&candidate).arg("--version").output().is_ok() {
            return candidate;
        }
    }

    "ollama".to_string()
}

fn run_command(binary: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(binary)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to execute {binary}: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if stdout.is_empty() {
                Err(format!("{binary} exited with a non-zero status."))
            } else {
                Err(stdout)
            }
        } else {
            Err(stderr)
        }
    }
}

fn clamp_progress(value: f32) -> f32 {
    value.clamp(0.0, 100.0)
}

fn set_install_state(model_id: &str, status: &str, progress: f32, detail: Option<String>) {
    if let Ok(mut states) = AI_INSTALL_STATES.lock() {
        let entry = states
            .entry(model_id.to_string())
            .or_insert_with(|| AiInstallStateInternal {
                status: "not-started".to_string(),
                progress: 0.0,
                detail: None,
            });

        let next_progress = clamp_progress(progress);
        if !(status == "installing" && next_progress < entry.progress) {
            // Keep progress monotonic while downloading layers.
            entry.progress = next_progress;
        }

        entry.status = status.to_string();
        entry.detail = detail;
    }
}

fn get_install_state(model_id: &str) -> AiModelInstallProgress {
    if let Ok(states) = AI_INSTALL_STATES.lock() {
        if let Some(state) = states.get(model_id) {
            return AiModelInstallProgress {
                model_id: model_id.to_string(),
                status: state.status.clone(),
                progress: clamp_progress(state.progress),
                detail: state.detail.clone(),
            };
        }
    }

    AiModelInstallProgress {
        model_id: model_id.to_string(),
        status: "not-started".to_string(),
        progress: 0.0,
        detail: None,
    }
}

fn is_terminal_install_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "cancelled" | "not-started")
}

fn is_install_cancelled(model_id: &str) -> bool {
    get_install_state(model_id).status == "cancelled"
}

fn strip_ansi_codes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\x1b' {
            match chars.peek() {
                Some('[') => {
                    chars.next();
                    // Consume until a letter (end of CSI sequence)
                    for c in chars.by_ref() {
                        if c.is_ascii_alphabetic() {
                            break;
                        }
                    }
                }
                Some('(') | Some(')') => {
                    chars.next();
                    chars.next(); // designator
                }
                _ => {} // bare ESC, skip
            }
        } else {
            result.push(ch);
        }
    }
    result
}

/// Remove `<think>...</think>` blocks that some reasoning models emit even when
/// chain-of-thought is disabled at the API level (older Ollama versions).
fn strip_think_blocks(s: &str) -> String {
    let mut result = s.to_string();
    while let (Some(start), Some(end_tag)) = (result.find("<think>"), result.find("</think>")) {
        let end = end_tag + "</think>".len();
        if start <= end {
            result.drain(start..end);
        } else {
            break;
        }
    }
    result.trim().to_string()
}

fn parse_percentage_token(token: &str) -> Option<f32> {
    let trimmed = token.trim();
    if !trimmed.ends_with('%') {
        return None;
    }

    let number = trimmed.trim_end_matches('%').trim();
    if number.is_empty() {
        return None;
    }

    number
        .parse::<f32>()
        .ok()
        .filter(|value| *value >= 0.0 && *value <= 100.0)
}

fn extract_percentage_from_line(line: &str) -> Option<f32> {
    for token in line.split_whitespace() {
        if let Some(value) = parse_percentage_token(token) {
            return Some(value);
        }
    }

    None
}

fn update_install_from_output_line(model_id: &str, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }

    if let Ok(mut states) = AI_INSTALL_STATES.lock() {
        let entry = states
            .entry(model_id.to_string())
            .or_insert_with(|| AiInstallStateInternal {
                status: "installing".to_string(),
                progress: 0.0,
                detail: None,
            });

        // Never overwrite a terminal state set by the wait thread.
        if matches!(entry.status.as_str(), "cancelled" | "completed" | "failed") {
            return;
        }

        entry.status = "installing".to_string();

        let clean = strip_ansi_codes(trimmed);
        let clean = clean.trim();

        if let Some(next_progress) = extract_percentage_from_line(clean) {
            if next_progress > entry.progress {
                entry.progress = clamp_progress(next_progress);
            }
        } else if entry.progress < 1.0 {
            entry.progress = 1.0;
        }

        if !clean.is_empty() {
            entry.detail = Some(clean.to_string());
        }
    }
}

fn spawn_install_output_reader<R>(model_id: String, stream: R)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut chunk = Vec::new();

        loop {
            chunk.clear();
            match reader.read_until(b'\r', &mut chunk) {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&chunk);
                    for line in text.split('\n') {
                        let normalized = line.trim_matches(|character| character == '\r' || character == '\n');
                        if !normalized.is_empty() {
                            update_install_from_output_line(&model_id, normalized);
                        }
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn command_exists(binary: &str) -> bool {
    Command::new(binary).arg("--version").output().is_ok()
}

fn install_ollama_runtime() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        if command_exists("brew") {
            return run_command("brew", &["install", "--cask", "ollama"])
                .map(|_| "Ollama installed using Homebrew cask.".to_string());
        }

        return run_command("sh", &["-c", "curl -fsSL https://ollama.com/install.sh | sh"])
            .map(|_| "Ollama installed using official installer script.".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        if command_exists("curl") {
            return run_command("sh", &["-c", "curl -fsSL https://ollama.com/install.sh | sh"])
                .map(|_| "Ollama installed using official installer script.".to_string());
        }

        if command_exists("wget") {
            return run_command("sh", &["-c", "wget -qO- https://ollama.com/install.sh | sh"])
                .map(|_| "Ollama installed using official installer script.".to_string());
        }

        return Err("Could not auto-install Ollama: neither curl nor wget is available.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if command_exists("winget") {
            return run_command(
                "winget",
                &[
                    "install",
                    "-e",
                    "--id",
                    "Ollama.Ollama",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                ],
            )
            .map(|_| "Ollama installed using winget.".to_string());
        }

        if command_exists("choco") {
            return run_command("choco", &["install", "ollama", "-y"])
                .map(|_| "Ollama installed using Chocolatey.".to_string());
        }

        return Err("Could not auto-install Ollama: neither winget nor choco is available.".to_string());
    }

    #[allow(unreachable_code)]
    Err("Auto-install is not supported on this platform.".to_string())
}

fn ensure_ollama_runtime() -> Result<String, String> {
    if let Ok(version) = run_ollama_command(&["--version"]) {
        let normalized = version.trim();
        // Binary found — make sure the server is actually running too.
        ensure_ollama_server_started();
        if normalized.is_empty() {
            return Ok("Ollama runtime is available.".to_string());
        }
        return Ok(format!("Ollama runtime is available ({normalized})."));
    }

    let install_message = install_ollama_runtime()?;

    match run_ollama_command(&["--version"]) {
        Ok(version) => {
            ensure_ollama_server_started();
            let normalized = version.trim();
            if normalized.is_empty() {
                Ok(format!("{install_message} Runtime verified."))
            } else {
                Ok(format!("{install_message} Runtime verified ({normalized})."))
            }
        }
        Err(error) => Err(format!(
            "Ollama installation was attempted but runtime verification failed: {error}"
        )),
    }
}

fn parse_ollama_models(raw: &str) -> Vec<String> {
    raw.lines()
        .skip(1)
        .filter_map(|line| line.split_whitespace().next().map(str::trim))
        .filter(|name| !name.is_empty() && *name != "NAME")
        .map(ToOwned::to_owned)
        .collect()
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_file_in_default_app(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("Failed to open path: {error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|error| format!("Failed to open path: {error}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("Failed to open path: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn print_pdf_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "tell application \"Preview\"\n\
             activate\n\
             print (POSIX file \"{}\") with print dialog\n\
             end tell", path
        );
        
        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .spawn()
            .map_err(|error| format!("Failed to open print dialog: {error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        // Some Windows PDF handlers do not expose a "Print" shell verb.
        // When that happens, open the file so the user can print manually.
        let escaped_path = path.replace('\'', "''");
        let print_script = format!(
            "$ErrorActionPreference='Stop'; Start-Process -FilePath '{escaped_path}' -Verb Print -ErrorAction Stop"
        );

        let print_attempt = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &print_script,
            ])
            .output()
            .map_err(|error| format!("Failed to run print command: {error}"))?;

        if !print_attempt.status.success() {
            let open_attempt = Command::new("cmd")
                .args(["/C", "start", "", &path])
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
        Command::new("lpr")
            .arg(&path)
            .spawn()
            .map_err(|error| format!("Failed to print file: {error}"))?;
    }

    Ok(())
}

#[tauri::command]
fn ai_runtime_status() -> AiRuntimeStatus {
    let version_result = run_ollama_command(&["--version"]);
    match version_result {
        Ok(version) => AiRuntimeStatus {
            provider: "ollama",
            available: true,
            version: Some(version.trim().to_string()),
            detail: None,
        },
        Err(error) => AiRuntimeStatus {
            provider: "ollama",
            available: false,
            version: None,
            detail: Some(error),
        },
    }
}

#[tauri::command]
fn ai_ensure_runtime() -> Result<String, String> {
    ensure_ollama_runtime()
}

#[tauri::command]
fn ai_list_models() -> Result<Vec<String>, String> {
    let raw = run_ollama_command(&["list"])?;
    Ok(parse_ollama_models(&raw))
}

#[tauri::command]
fn ai_start_model_install(model_id: String) -> Result<AiModelInstallProgress, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    let current = get_install_state(&model_id);
    if !is_terminal_install_status(&current.status) {
        return Ok(current);
    }

    set_install_state(
        &model_id,
        "preparing",
        0.0,
        Some("Preparing local runtime...".to_string()),
    );

    let task_model_id = model_id.clone();
    thread::spawn(move || {
        if let Err(error) = ensure_ollama_runtime() {
            if !is_install_cancelled(&task_model_id) {
                set_install_state(&task_model_id, "failed", 0.0, Some(error));
            }
            return;
        }

        if is_install_cancelled(&task_model_id) {
            set_install_state(
                &task_model_id,
                "cancelled",
                get_install_state(&task_model_id).progress,
                Some("Install cancelled.".to_string()),
            );
            return;
        }

        set_install_state(
            &task_model_id,
            "installing",
            0.0,
            Some("Downloading model layers...".to_string()),
        );

        let binary = resolve_ollama_binary();
        let mut child = match Command::new(&binary)
            .args(["pull", &task_model_id])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                if !is_install_cancelled(&task_model_id) {
                    set_install_state(
                        &task_model_id,
                        "failed",
                        0.0,
                        Some(format!("Failed to start install: {error}")),
                    );
                }
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child_handle = Arc::new(Mutex::new(child));

        if let Ok(mut children) = AI_INSTALL_CHILDREN.lock() {
            children.insert(task_model_id.clone(), Arc::clone(&child_handle));
        }

        if let Some(stream) = stdout {
            spawn_install_output_reader(task_model_id.clone(), stream);
        }

        if let Some(stream) = stderr {
            spawn_install_output_reader(task_model_id.clone(), stream);
        }

        let wait_result = if let Ok(mut child_guard) = child_handle.lock() {
            child_guard.wait().map_err(|error| error.to_string())
        } else {
            Err("Failed to lock install process handle.".to_string())
        };

        if let Ok(mut children) = AI_INSTALL_CHILDREN.lock() {
            children.remove(&task_model_id);
        }

        match wait_result {
            Ok(status) if status.success() => {
                if is_install_cancelled(&task_model_id) {
                    set_install_state(
                        &task_model_id,
                        "cancelled",
                        get_install_state(&task_model_id).progress,
                        Some("Install cancelled.".to_string()),
                    );
                } else {
                    set_install_state(
                        &task_model_id,
                        "completed",
                        100.0,
                        Some("Model install completed.".to_string()),
                    );
                }
            }
            Ok(status) => {
                if !is_install_cancelled(&task_model_id) {
                    let code = status
                        .code()
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "terminated by signal".to_string());
                    set_install_state(
                        &task_model_id,
                        "failed",
                        get_install_state(&task_model_id).progress,
                        Some(format!("Install failed (exit code: {code}).")),
                    );
                }
            }
            Err(error) => {
                if !is_install_cancelled(&task_model_id) {
                    set_install_state(
                        &task_model_id,
                        "failed",
                        get_install_state(&task_model_id).progress,
                        Some(format!("Install failed: {error}")),
                    );
                }
            }
        }
    });

    Ok(get_install_state(&model_id))
}

#[tauri::command]
fn ai_get_model_install_progress(model_id: String) -> Result<AiModelInstallProgress, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    Ok(get_install_state(&model_id))
}

#[tauri::command]
fn ai_cancel_model_install(model_id: String) -> Result<AiModelInstallProgress, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    let current = get_install_state(&model_id);
    set_install_state(
        &model_id,
        "cancelled",
        current.progress,
        Some("Cancelling install...".to_string()),
    );

    let maybe_child = if let Ok(children) = AI_INSTALL_CHILDREN.lock() {
        children.get(&model_id).cloned()
    } else {
        None
    };

    if let Some(child) = maybe_child {
        if let Ok(mut guard) = child.lock() {
            let _ = guard.kill();
        }
    }

    Ok(get_install_state(&model_id))
}

#[tauri::command]
fn ai_install_model(model_id: String) -> Result<String, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    let _ = ensure_ollama_runtime()?;

    run_ollama_command(&["pull", &model_id])
}

#[tauri::command]
fn ai_remove_model(model_id: String) -> Result<String, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    run_ollama_command(&["rm", &model_id])
}

#[tauri::command]
fn ai_import_local_model(gguf_path: String, model_id: String) -> Result<AiModelInstallProgress, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    let path = Path::new(&gguf_path);
    if !path.exists() {
        return Err("File not found.".to_string());
    }
    if path.extension().and_then(|ext| ext.to_str()).map(str::to_lowercase).as_deref() != Some("gguf") {
        return Err("File must be a .gguf file.".to_string());
    }

    let current = get_install_state(&model_id);
    if !is_terminal_install_status(&current.status) {
        return Ok(current);
    }

    set_install_state(
        &model_id,
        "preparing",
        0.0,
        Some("Preparing runtime for GGUF import...".to_string()),
    );

    let task_model_id = model_id.clone();
    let task_gguf_path = gguf_path.clone();

    thread::spawn(move || {
        if let Err(error) = ensure_ollama_runtime() {
            if !is_install_cancelled(&task_model_id) {
                set_install_state(&task_model_id, "failed", 0.0, Some(error));
            }
            return;
        }

        if is_install_cancelled(&task_model_id) {
            set_install_state(
                &task_model_id,
                "cancelled",
                0.0,
                Some("Import cancelled.".to_string()),
            );
            return;
        }

        set_install_state(
            &task_model_id,
            "installing",
            10.0,
            Some("Importing GGUF model into Ollama...".to_string()),
        );

        let modelfile_content = format!("FROM {}\n", task_gguf_path);
        let safe_name = task_model_id.replace(':', "_").replace(['/', '\\'], "_");
        let modelfile_path = std::env::temp_dir().join(format!("teacherpro_modelfile_{safe_name}.tmp"));

        if let Err(error) = std::fs::write(&modelfile_path, &modelfile_content) {
            set_install_state(
                &task_model_id,
                "failed",
                0.0,
                Some(format!("Failed to create modelfile: {error}")),
            );
            return;
        }

        let binary = resolve_ollama_binary();
        let modelfile_str = modelfile_path.to_string_lossy().to_string();

        let result = Command::new(&binary)
            .args(["create", &task_model_id, "-f", &modelfile_str])
            .output();

        let _ = std::fs::remove_file(&modelfile_path);

        match result {
            Ok(output) if output.status.success() => {
                set_install_state(
                    &task_model_id,
                    "completed",
                    100.0,
                    Some("GGUF import completed.".to_string()),
                );
            }
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let msg = strip_ansi_codes(stderr.trim());
                let msg = if msg.trim().is_empty() {
                    "GGUF import failed.".to_string()
                } else {
                    msg
                };
                set_install_state(&task_model_id, "failed", 0.0, Some(msg));
            }
            Err(error) => {
                set_install_state(
                    &task_model_id,
                    "failed",
                    0.0,
                    Some(format!("Failed to run import: {error}")),
                );
            }
        }
    });

    Ok(get_install_state(&model_id))
}

#[tauri::command]
async fn ai_generate_text(model_id: String, prompt: String, temperature: Option<f64>, system_prompt: Option<String>, enable_thinking: Option<bool>) -> Result<String, String> {
    if !is_safe_model_id(&model_id) {
        return Err("Invalid model ID format.".to_string());
    }

    let trimmed_prompt = prompt.trim();
    if trimmed_prompt.is_empty() {
        return Err("Prompt is empty.".to_string());
    }

    if trimmed_prompt.len() > 20_000 {
        return Err("Prompt is too large. Please reduce selection size.".to_string());
    }

    let task_model_id = model_id;
    let task_prompt = trimmed_prompt.to_string();
    let task_temperature = temperature.unwrap_or(0.7).clamp(0.0, 2.0);
    let task_system = system_prompt.unwrap_or_default();
    let task_thinking = enable_thinking.unwrap_or(false);

    tauri::async_runtime::spawn_blocking(move || {
        let _ = ensure_ollama_runtime()?;

        let base_url = std::env::var("OLLAMA_HOST")
            .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
        let base_url = base_url.trim_end_matches('/');

        #[derive(serde::Deserialize)]
        struct OllamaGenerateResponse {
            response: String,
            #[serde(default)]
            thinking: String,
        }

        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(300))
            .build();

        let mut body = serde_json::json!({
            "model": task_model_id,
            "prompt": task_prompt,
            "stream": false,
            "think": task_thinking,
            "options": {
                "temperature": task_temperature,
            }
        });

        if !task_system.is_empty() {
            body["system"] = serde_json::Value::String(task_system);
        }

        let result = agent
            .post(&format!("{base_url}/api/generate"))
            .send_json(body)
            .map_err(|e| format!("Ollama API request failed: {e}"))?
            .into_json::<OllamaGenerateResponse>()
            .map_err(|e| format!("Failed to parse Ollama response: {e}"))?;

        // Strip any residual think blocks in case an older Ollama version ignores think:false.
        let clean = strip_think_blocks(&result.response);
        // If thinking was requested, prepend the thinking block so the frontend can parse it.
        if task_thinking && !result.thinking.is_empty() {
            Ok(format!("<think>{}</think>\n{}", result.thinking.trim(), clean))
        } else {
            Ok(clean)
        }
    })
    .await
    .map_err(|error| format!("AI generation task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_file_in_default_app,
            print_pdf_file,
            ai_runtime_status,
            ai_ensure_runtime,
            ai_list_models,
            ai_start_model_install,
            ai_get_model_install_progress,
            ai_cancel_model_install,
            ai_install_model,
            ai_remove_model,
            ai_import_local_model,
            ai_generate_text
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_ollama_server();
            }
        });
}
