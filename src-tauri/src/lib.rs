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
        Command::new("powershell")
            .args(["-Command", &format!("Start-Process -FilePath \"{}\" -Verb Print", path)])
            .spawn()
            .map_err(|error| format!("Failed to open print dialog: {error}"))?;
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
