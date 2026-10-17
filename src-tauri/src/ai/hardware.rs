//! Lightweight hardware probe for P4 (docs/AI_V3_PLAN.md §3.1 / §8 P4).
//!
//! GPU detection shells out to `nvidia-smi` (ships with the NVIDIA driver —
//! no extra dependency). RAM comes from the OS directly.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_mb: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub gpu: Option<GpuInfo>,
    pub total_ram_gb: u32,
}

pub fn probe() -> HardwareInfo {
    HardwareInfo {
        gpu: detect_nvidia_gpu(),
        total_ram_gb: total_ram_gb(),
    }
}

/// Query nvidia-smi. Returns None when no NVIDIA driver/tool is present.
fn detect_nvidia_gpu() -> Option<GpuInfo> {
    if !(cfg!(windows) || cfg!(target_os = "linux")) {
        return None;
    }
    let candidates: Vec<&str> = if cfg!(windows) {
        vec![
            "nvidia-smi",
            r"C:\Windows\System32\nvidia-smi.exe",
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ]
    } else {
        vec![
            "nvidia-smi",
            "/usr/bin/nvidia-smi",
            "/usr/local/bin/nvidia-smi",
        ]
    };
    for candidate in candidates {
        let mut cmd = crate::command_for(candidate);
        cmd.args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ]);
        let Ok(output) = cmd.output() else { continue };
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let Some(line) = text.lines().next() else {
            continue;
        };
        let mut parts = line.splitn(2, ',');
        let name = parts.next().unwrap_or("").trim().to_string();
        let vram_mb = parts
            .next()
            .and_then(|v| v.trim().parse::<u64>().ok())
            .unwrap_or(0);
        if !name.is_empty() {
            return Some(GpuInfo { name, vram_mb });
        }
    }
    None
}

fn total_ram_gb() -> u32 {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut status) } != 0 {
            return (status.ullTotalPhys / (1024 * 1024 * 1024)) as u32;
        }
        0
    }
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sysctl")
            .args(["-n", "hw.memsize"])
            .output();
        match output {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
                .trim()
                .parse::<u64>()
                .map(|bytes| (bytes / (1024 * 1024 * 1024)) as u32)
                .unwrap_or(0),
            _ => 0,
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let text = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
        for line in text.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                let kb = rest
                    .trim()
                    .trim_end_matches("kB")
                    .trim()
                    .parse::<u64>()
                    .unwrap_or(0);
                return (kb / (1024 * 1024)) as u32;
            }
        }
        0
    }
}

#[tauri::command]
pub fn ai_hardware_info() -> HardwareInfo {
    probe()
}
