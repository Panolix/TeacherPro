//! Lightweight hardware probe for model selection.
//!
//! - Windows: NVIDIA via `nvidia-smi`, AMD/Intel via the display-class registry
//!   (64-bit VRAM where the driver exposes it).
//! - Linux: NVIDIA via `nvidia-smi`, AMD/Intel via DRM sysfs.
//! - macOS: `system_profiler` for the GPU name/VRAM; Apple Silicon is treated
//!   as unified memory backed by the system RAM.
//!
//! RAM comes from the OS directly. The result is cached for the session.

use std::path::Path;
use std::sync::OnceLock;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_mb: u64,
    /// nvidia | amd | intel | apple | unknown
    pub vendor: &'static str,
    /// True for Apple Silicon, Intel iGPUs and AMD APUs, where VRAM is shared
    /// with system RAM. Model fitting then uses RAM instead of VRAM.
    pub unified_memory: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub gpu: Option<GpuInfo>,
    pub total_ram_gb: u32,
}

pub fn probe() -> HardwareInfo {
    let total_ram_gb = total_ram_gb();
    HardwareInfo {
        gpu: detect_gpu(total_ram_gb),
        total_ram_gb,
    }
}

/// Hardware does not change during a session, and the probe shells out to OS
/// tools. Cache it so model selection and catalog refreshes are cheap.
pub fn cached() -> &'static HardwareInfo {
    static CELL: OnceLock<HardwareInfo> = OnceLock::new();
    CELL.get_or_init(probe)
}

/// Pick the best available GPU: a dedicated GPU first (NVIDIA/AMD dGPU), then
/// unified-memory GPUs (Apple Silicon / iGPU) with the largest shared pool.
fn detect_gpu(total_ram_gb: u32) -> Option<GpuInfo> {
    let mut candidates = detect_nvidia_gpu();

    #[cfg(windows)]
    candidates.extend(detect_windows_gpus(total_ram_gb));

    #[cfg(target_os = "linux")]
    candidates.extend(detect_linux_gpus(total_ram_gb));

    #[cfg(target_os = "macos")]
    candidates.extend(detect_macos_gpus(total_ram_gb));

    candidates
        .into_iter()
        .max_by_key(|gpu| (u8::from(!gpu.unified_memory), gpu.vram_mb))
}

/// Query nvidia-smi. Returns one entry per NVIDIA GPU it reports.
fn detect_nvidia_gpu() -> Vec<GpuInfo> {
    if !(cfg!(windows) || cfg!(target_os = "linux")) {
        return Vec::new();
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
        let gpus: Vec<GpuInfo> = text
            .lines()
            .filter_map(|line| {
                let mut parts = line.splitn(2, ',');
                let name = parts.next().unwrap_or("").trim().to_string();
                if name.is_empty() {
                    return None;
                }
                let vram_mb = parts
                    .next()
                    .and_then(|v| v.trim().parse::<u64>().ok())
                    .unwrap_or(0);
                Some(GpuInfo {
                    name,
                    vram_mb,
                    vendor: "nvidia",
                    unified_memory: false,
                })
            })
            .collect();
        if !gpus.is_empty() {
            return gpus;
        }
    }
    Vec::new()
}

// ── Windows: display-class registry ──────────────────────────────────────

#[cfg(windows)]
fn detect_windows_gpus(total_ram_gb: u32) -> Vec<GpuInfo> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const DISPLAY_CLASS: &str =
        r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Ok(class_key) = hklm.open_subkey_with_flags(DISPLAY_CLASS, KEY_READ) else {
        return Vec::new();
    };

    let mut gpus = Vec::new();
    for subkey_name in class_key.enum_keys().flatten() {
        let Ok(subkey) = class_key.open_subkey_with_flags(&subkey_name, KEY_READ) else {
            continue;
        };
        let name: String = subkey.get_value("DriverDesc").unwrap_or_default();
        let name = name.trim().to_string();
        if name.is_empty() || is_virtual_gpu(&name) {
            continue;
        }

        let vendor = vendor_from_name(&name);
        if vendor == "unknown" {
            continue;
        }

        let vram_mb = read_windows_vram_mb(&subkey);
        let integrated_guess = match vendor {
            "intel" => !name.to_ascii_lowercase().contains("arc"),
            "amd" => is_integrated_amd(&name, vram_mb),
            "apple" => true,
            _ => false,
        };
        // A dedicated GPU with an unknown VRAM value would otherwise mask a
        // usable iGPU; nvidia-smi is the accurate source for NVIDIA anyway.
        if vram_mb == 0 && !integrated_guess {
            continue;
        }

        let unified_memory = integrated_guess;
        let display_vram_mb = if unified_memory {
            u64::from(total_ram_gb) * 1024
        } else {
            vram_mb
        };

        gpus.push(GpuInfo {
            name,
            vram_mb: display_vram_mb,
            vendor,
            unified_memory,
        });
    }
    gpus
}

#[cfg(windows)]
fn read_windows_vram_mb(subkey: &winreg::RegKey) -> u64 {
    if let Ok(bytes) = subkey.get_value::<u64, _>("HardwareInformation.qwMemorySize") {
        return bytes / (1024 * 1024);
    }
    if let Ok(raw) = subkey.get_raw_value("HardwareInformation.qwMemorySize") {
        let bytes = raw.bytes;
        if bytes.len() >= 8 {
            if let Ok(array) = <[u8; 8]>::try_from(&bytes[..8]) {
                return u64::from_le_bytes(array) / (1024 * 1024);
            }
        }
    }
    if let Ok(bytes) = subkey.get_value::<u32, _>("HardwareInformation.MemorySize") {
        return u64::from(bytes) / (1024 * 1024);
    }
    0
}

// ── Linux: DRM sysfs ─────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn detect_linux_gpus(total_ram_gb: u32) -> Vec<GpuInfo> {
    let Ok(entries) = std::fs::read_dir("/sys/class/drm") else {
        return Vec::new();
    };

    let mut gpus = Vec::new();
    for entry in entries.flatten() {
        let card = entry.file_name().to_string_lossy().to_string();
        // card0, card1, ...; skip connectors such as card0-DP-1 and renderD128.
        if !card.starts_with("card") || card.contains('-') {
            continue;
        }
        let device = entry.path().join("device");
        let vendor_id = read_trim(&device.join("vendor")).unwrap_or_default();
        let vendor = match vendor_id.as_str() {
            "0x10de" => "nvidia",
            "0x1002" => "amd",
            "0x8086" => "intel",
            _ => continue,
        };

        let vram_mb = read_trim(&device.join("mem_info_vram_total"))
            .and_then(|value| value.parse::<u64>().ok())
            .map(|bytes| bytes / (1024 * 1024))
            .unwrap_or(0);

        // nvidia-smi is preferred; a sysfs NVIDIA entry with no VRAM is not
        // useful and would otherwise mask an AMD/Intel dGPU.
        if vendor == "nvidia" && vram_mb == 0 {
            continue;
        }

        let name = read_trim(&device.join("product_name"))
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("{} GPU (Linux)", vendor.to_ascii_uppercase()));
        let unified_memory = match vendor {
            "intel" => true,
            "amd" => vram_mb == 0 || is_integrated_amd(&name, vram_mb),
            _ => false,
        };
        let display_vram_mb = if unified_memory {
            u64::from(total_ram_gb) * 1024
        } else {
            vram_mb
        };

        gpus.push(GpuInfo {
            name,
            vram_mb: display_vram_mb,
            vendor,
            unified_memory,
        });
    }
    gpus
}

// ── macOS: system_profiler / Apple unified memory ────────────────────────

#[cfg(target_os = "macos")]
fn detect_macos_gpus(total_ram_gb: u32) -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    if let Ok(output) = std::process::Command::new("system_profiler")
        .args(["SPDisplaysDataType", "-json"])
        .output()
    {
        if output.status.success() {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                if let Some(items) = json.get("SPDisplaysDataType").and_then(|v| v.as_array()) {
                    for item in items {
                        let name = item
                            .get("_name")
                            .and_then(|v| v.as_str())
                            .or_else(|| {
                                item.get("spdisplays_chipset_model")
                                    .and_then(|v| v.as_str())
                            })
                            .unwrap_or("")
                            .trim()
                            .to_string();
                        if name.is_empty() {
                            continue;
                        }

                        let vendor_text = item
                            .get("spdisplays_vendor")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let vendor = vendor_from_name(&format!("{name} {vendor_text}"));

                        let vram_text = item
                            .get("spdisplays_vram")
                            .and_then(|v| v.as_str())
                            .or_else(|| item.get("spdisplays_vram_shared").and_then(|v| v.as_str()))
                            .unwrap_or("");
                        let vram_mb = parse_memory_mb(vram_text);
                        let unified_memory = vendor == "apple"
                            || name.to_ascii_lowercase().contains("apple")
                            || vram_text.to_ascii_lowercase().contains("unified")
                            // Unknown VRAM on a non-NVIDIA Mac GPU: fall back to
                            // shared system memory rather than treating it as 0.
                            || (vram_mb == 0 && vendor != "nvidia");
                        let display_vram_mb = if unified_memory {
                            u64::from(total_ram_gb) * 1024
                        } else {
                            vram_mb
                        };

                        gpus.push(GpuInfo {
                            name,
                            vram_mb: display_vram_mb,
                            vendor,
                            unified_memory,
                        });
                    }
                }
            }
        }
    }

    // Fallback for Apple Silicon when system_profiler fails or omits the GPU.
    if gpus.is_empty() {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output()
        {
            if output.status.success() {
                let brand = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if brand.to_ascii_lowercase().contains("apple") {
                    gpus.push(GpuInfo {
                        name: brand,
                        vram_mb: u64::from(total_ram_gb) * 1024,
                        vendor: "apple",
                        unified_memory: true,
                    });
                }
            }
        }
    }

    gpus
}

// ── Shared helpers ──────────────────────────────────────────────────────

// Called from the Windows registry probe and the macOS system_profiler probe.
// Neither is compiled on Linux, where the function is therefore unused.
#[cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
fn vendor_from_name(name: &str) -> &'static str {
    let name = name.to_ascii_lowercase();
    if name.contains("apple") {
        "apple"
    } else if name.contains("nvidia")
        || name.contains("geforce")
        || name.contains("quadro")
        || name.contains("tesla")
    {
        "nvidia"
    } else if name.contains("amd") || name.contains("radeon") || name.contains("ati ") {
        "amd"
    } else if name.contains("intel")
        || name.contains("arc")
        || name.contains("iris")
        || name.contains("uhd")
    {
        "intel"
    } else {
        "unknown"
    }
}

#[allow(dead_code)] // Windows-only probe helper; also exercised by cross-platform tests.
fn is_virtual_gpu(name: &str) -> bool {
    const VIRTUAL_MARKERS: &[&str] = &[
        "microsoft basic",
        "remote display",
        "virtual",
        "citrix",
        "parsec",
        "spacedesk",
        "displaylink",
        "vmware",
        "virtualbox",
        "hyper-v",
    ];
    let name = name.to_ascii_lowercase();
    VIRTUAL_MARKERS.iter().any(|marker| name.contains(marker))
}

// Only Windows/Linux probes use this helper; keep it available to shared tests.
#[cfg(any(windows, target_os = "linux", test))]
fn is_integrated_amd(name: &str, vram_mb: u64) -> bool {
    let name = name.to_ascii_lowercase();
    const INTEGRATED_MARKERS: &[&str] = &[
        "radeon graphics",
        "radeon(tm) graphics",
        "vega",
        "apu",
        "740m",
        "760m",
        "780m",
        "860m",
        "880m",
        "890m",
    ];
    if name.contains("rx ")
        || name.contains("radeon pro")
        || name.contains("radeon ai")
        || name.contains("radeon vii")
    {
        return false;
    }
    INTEGRATED_MARKERS
        .iter()
        .any(|marker| name.contains(marker))
        || vram_mb < 1024
}

#[allow(dead_code)] // Used by the macOS probe and unit tests; unused on Windows.
fn parse_memory_mb(text: &str) -> u64 {
    let cleaned = text.replace(',', "");
    let mut number = String::new();
    let mut unit = String::new();
    for ch in cleaned.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            if unit.is_empty() {
                number.push(ch);
            }
        } else if ch.is_ascii_alphabetic() {
            unit.push(ch.to_ascii_uppercase());
        }
    }
    let value = number.parse::<f64>().unwrap_or(0.0);
    if unit.starts_with("GB") {
        (value * 1024.0) as u64
    } else {
        value as u64
    }
}

#[allow(dead_code)] // Used by the Linux probe; unused on Windows/macOS.
fn read_trim(path: &Path) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
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
    cached().clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_gpu_memory_strings() {
        assert_eq!(parse_memory_mb("8 GB"), 8192);
        assert_eq!(parse_memory_mb("1,536 MB"), 1536);
        assert_eq!(parse_memory_mb("24 GB"), 24576);
        assert_eq!(parse_memory_mb("unified"), 0);
    }

    #[test]
    fn identifies_gpu_vendors() {
        assert_eq!(vendor_from_name("NVIDIA GeForce RTX 4090"), "nvidia");
        assert_eq!(vendor_from_name("AMD Radeon RX 7900 XTX"), "amd");
        assert_eq!(vendor_from_name("Intel(R) Arc(TM) A770 Graphics"), "intel");
        assert_eq!(vendor_from_name("Apple M3 Pro"), "apple");
    }

    #[test]
    fn distinguishes_amd_integrated_graphics() {
        assert!(is_integrated_amd("AMD Radeon(TM) Graphics", 512));
        assert!(is_integrated_amd("AMD Radeon 780M", 2048));
        assert!(!is_integrated_amd("AMD Radeon RX 7900 XTX", 24576));
    }

    #[test]
    fn filters_virtual_adapters() {
        assert!(is_virtual_gpu("Microsoft Basic Display Adapter"));
        assert!(is_virtual_gpu("Citrix Indirect Display Adapter"));
        assert!(!is_virtual_gpu("NVIDIA GeForce RTX 4090"));
    }

    #[test]
    fn probe_reports_ram_and_does_not_panic() {
        let hw = probe();
        println!("detected hardware: {hw:?}");
        assert!(hw.total_ram_gb > 0);
        if let Some(gpu) = &hw.gpu {
            assert!(!gpu.name.is_empty());
            assert!(gpu.vram_mb > 0);
            assert!(!gpu.vendor.is_empty());
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_registry_probe_does_not_panic() {
        let gpus = detect_windows_gpus(total_ram_gb());
        println!("registry GPUs: {gpus:?}");
        for gpu in gpus {
            assert!(!gpu.name.is_empty());
            assert!(!gpu.vendor.is_empty());
        }
    }
}
