use std::process::Command;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, open_file_in_default_app, print_pdf_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
