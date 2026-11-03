//! Engine + model catalog (docs/AI_V3_PLAN.md §3.4).
//! Verified via HF API on 2026-10-17 (sizes + LFS sha256). Re-verify at pin bumps.

use std::path::{Path, PathBuf};

use super::hardware::HardwareInfo;
use super::AiState;
use serde::Serialize;
use tauri::Manager;

pub const ENGINE_PIN: &str = "b11960";

pub struct EngineVariant {
    pub dir: &'static str,
    pub entry: &'static str,
}

/// Variant for the platform this binary was compiled for.
pub fn current_variant() -> Option<EngineVariant> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return Some(EngineVariant {
            dir: "windows-x64-vulkan",
            entry: "llama-server.exe",
        });
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return Some(EngineVariant {
            dir: "macos-arm64-metal",
            entry: "llama-server",
        });
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return Some(EngineVariant {
            dir: "macos-x64-cpu",
            entry: "llama-server",
        });
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return Some(EngineVariant {
            dir: "linux-x64-vulkan",
            entry: "llama-server",
        });
    }
    #[allow(unreachable_code)]
    {
        None
    }
}

/// Resolve the engine directory, falling back to the repo tree in dev builds
/// (`tauri dev` does not populate the resource dir).
pub fn engine_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let variant =
        current_variant().ok_or_else(|| "No engine variant for this platform".to_string())?;
    let packaged = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join("engines")
        .join(variant.dir);
    if entry_exists(&packaged, variant.entry) {
        return Ok(packaged);
    }
    let repo_tree = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("engines")
        .join(variant.dir);
    if entry_exists(&repo_tree, variant.entry) {
        return Ok(repo_tree);
    }
    Err(format!(
        "Engine not installed. Run `npm run fetch:engines` (looked in {} and {}).",
        packaged.display(),
        repo_tree.display()
    ))
}

fn entry_exists(dir: &Path, entry: &str) -> bool {
    dir.join(entry).is_file()
}

pub struct ModelEntry {
    pub id: &'static str,
    pub name: &'static str,
    /// lite | balanced | pro | xl | workstation | eu | smoke
    pub tier: &'static str,
    /// eu | us | cn
    pub origin: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size_bytes: u64,
    pub min_ram_gb: u32,
    /// Conservative VRAM estimate for the default context, including KV cache
    /// and compute overhead. Used for the "GPU-fit" badge and Auto selection.
    pub min_vram_gb: u32,
    pub num_ctx: u32,
    pub supports_thinking: bool,
    /// chat_template_kwargs | reasoning_effort
    pub thinking_control: &'static str,
    pub recommended: bool,
    pub mtp_file: Option<&'static str>,
    /// Full URL for the draft head. It may live in a different repo/subfolder
    /// than the main GGUF (e.g. Qwen's `MTP/` directory).
    pub mtp_url: Option<&'static str>,
    pub mtp_sha256: Option<&'static str>,
    pub mtp_size: Option<u64>,
    /// Backends where MTP is known to be a win (cuda | metal | vulkan).
    pub mtp_backends: &'static [&'static str],
    pub mtp_draft_max: u32,
    /// Old filenames superseded by this entry; used for cleanup UI only.
    pub legacy_filenames: &'static [&'static str],
}

pub const MODEL_CATALOG: &[ModelEntry] = &[
    ModelEntry {
        id: "qwen3.5-4b",
        name: "Qwen3.5 4B (Balanced)",
        tier: "balanced",
        origin: "cn",
        filename: "Qwen3.5-4B-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf",
        sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
        size_bytes: 2_740_937_888,
        min_ram_gb: 8,
        min_vram_gb: 5,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: true,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "qwen3.5-2b",
        name: "Qwen3.5 2B (Lite)",
        tier: "lite",
        origin: "cn",
        filename: "Qwen3.5-2B-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf",
        sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
        size_bytes: 1_280_835_840,
        min_ram_gb: 4,
        min_vram_gb: 4,
        num_ctx: 16384,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "gemma4-e2b",
        name: "Gemma 4 E2B QAT (Lite)",
        tier: "lite",
        origin: "us",
        filename: "gemma-4-E2B_q4_0-it.gguf",
        url: "https://huggingface.co/google/gemma-4-E2B-it-qat-q4_0-gguf/resolve/main/gemma-4-E2B_q4_0-it.gguf",
        sha256: "fa401b55b07ee70a54c6dae3903c783a6e65064312529ea57175cb5f8dec6634",
        size_bytes: 3_349_516_256,
        min_ram_gb: 6,
        min_vram_gb: 5,
        num_ctx: 8192,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-gemma-4-E2B-it-Q8_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/gemma-4-E2B-it-qat-GGUF/resolve/main/MTP/mtp-gemma-4-E2B-it-Q8_0.gguf"),
        mtp_sha256: Some("6d1d359ac7a5411a046236a1a687f207ebad50475d484235b95946ef329360cc"),
        mtp_size: Some(97_836_352),
        mtp_backends: &["cuda", "metal"],
        mtp_draft_max: 2,
        legacy_filenames: &["gemma-4-E2B-it-Q4_K_M.gguf"],
    },
    ModelEntry {
        id: "gemma4-e4b",
        name: "Gemma 4 E4B QAT (Balanced)",
        tier: "balanced",
        origin: "us",
        filename: "gemma-4-E4B_q4_0-it.gguf",
        url: "https://huggingface.co/google/gemma-4-E4B-it-qat-q4_0-gguf/resolve/main/gemma-4-E4B_q4_0-it.gguf",
        sha256: "676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee",
        size_bytes: 5_154_941_280,
        min_ram_gb: 8,
        min_vram_gb: 7,
        num_ctx: 16384,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-gemma-4-E4B-it-Q8_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/gemma-4-E4B-it-qat-GGUF/resolve/main/MTP/mtp-gemma-4-E4B-it-Q8_0.gguf"),
        mtp_sha256: Some("c566f6885963c83a0d868f9656287ed5d4f12a2b8f0c86a20524f89a96169ed2"),
        mtp_size: Some(98_671_936),
        mtp_backends: &["cuda", "metal"],
        mtp_draft_max: 2,
        legacy_filenames: &["gemma-4-E4B-it-Q4_K_M.gguf"],
    },
    ModelEntry {
        id: "qwen3.5-9b",
        name: "Qwen3.5 9B (Pro)",
        tier: "pro",
        origin: "cn",
        filename: "Qwen3.5-9B-Q4_K_M.gguf",
        url: "https://huggingface.co/lmstudio-community/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf",
        sha256: "cd76ec205963b3b33350093e6904d9de16c4e666fd104e1f632d25c7f15f2a13",
        size_bytes: 5_627_044_256,
        min_ram_gb: 12,
        min_vram_gb: 8,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "gemma4-12b",
        name: "Gemma 4 12B QAT (Pro)",
        tier: "pro",
        origin: "us",
        filename: "gemma-4-12b-it-qat-q4_0.gguf",
        url: "https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf/resolve/main/gemma-4-12b-it-qat-q4_0.gguf",
        sha256: "93567e57a8fe10b23569b9d9ec38cd005deedf71e29477c421a4b83f418a538b",
        size_bytes: 6_975_879_296,
        min_ram_gb: 16,
        min_vram_gb: 11,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-gemma-4-12B-it-Q8_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/gemma-4-12B-it-qat-GGUF/resolve/main/MTP/mtp-gemma-4-12B-it-Q8_0.gguf"),
        mtp_sha256: Some("f58dff98ecf17079c364b1205954ba85763a00ad076c5595040db0a828eaec1b"),
        mtp_size: Some(465_127_936),
        mtp_backends: &["cuda", "metal"],
        mtp_draft_max: 2,
        legacy_filenames: &["gemma-4-12b-it-Q4_K_M.gguf"],
    },
    ModelEntry {
        id: "qwen3.8-27b",
        name: "Qwen3.8 27B (Workstation)",
        tier: "workstation",
        origin: "cn",
        filename: "Qwen3.8-27B-UD-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/resolve/main/Qwen3.8-27B-UD-Q4_K_M.gguf",
        sha256: "322e194ff79741c7baa497c240f677f54b201b0efab44ca8e50f122b39123482",
        size_bytes: 16_464_440_224,
        min_ram_gb: 24,
        min_vram_gb: 22,
        num_ctx: 65536,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-Qwen3.8-27B-Q4_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/resolve/main/MTP/mtp-Qwen3.8-27B-Q4_0.gguf"),
        mtp_sha256: Some("50d9ce5a6da381bbcfb31061cf73df94a90e6faf8efdee379a9cb8f1501c6e"),
        mtp_size: Some(1_369_590_656),
        mtp_backends: &["cuda"],
        mtp_draft_max: 3,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "gemma4-26b-a4b",
        name: "Gemma 4 26B A4B QAT (Workstation)",
        tier: "workstation",
        origin: "us",
        filename: "gemma-4-26B_q4_0-it.gguf",
        url: "https://huggingface.co/google/gemma-4-26B-A4B-it-qat-q4_0-gguf/resolve/main/gemma-4-26B_q4_0-it.gguf",
        sha256: "3eca3b8f6d7baf218a7dd6bba5fb59a56ee25fe2d567b6f5f589b4f697eca51d",
        size_bytes: 14_439_363_584,
        min_ram_gb: 24,
        min_vram_gb: 18,
        num_ctx: 65536,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-gemma-4-26B-A4B-it-Q8_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/main/MTP/mtp-gemma-4-26B-A4B-it-Q8_0.gguf"),
        mtp_sha256: Some("75f58e20c32281d1adc086c0569d53f147e8d81a7b8493cf4a73a028415f67af"),
        mtp_size: Some(461_785_600),
        mtp_backends: &["cuda", "metal"],
        mtp_draft_max: 2,
        legacy_filenames: &[
            "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
            "mtp-gemma-4-26B-A4B-it.gguf",
        ],
    },
    ModelEntry {
        id: "gemma4-31b",
        name: "Gemma 4 31B QAT (Workstation)",
        tier: "workstation",
        origin: "us",
        filename: "gemma-4-31B_q4_0-it.gguf",
        url: "https://huggingface.co/google/gemma-4-31B-it-qat-q4_0-gguf/resolve/main/gemma-4-31B_q4_0-it.gguf",
        sha256: "179cfb99212709597eae5929112cfca677e1bbf566178b479ae1da0c4772874b",
        size_bytes: 17_651_001_568,
        min_ram_gb: 24,
        min_vram_gb: 24,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("MTP/mtp-gemma-4-31B-it-Q8_0.gguf"),
        mtp_url: Some("https://huggingface.co/unsloth/gemma-4-31B-it-qat-GGUF/resolve/main/MTP/mtp-gemma-4-31B-it-Q8_0.gguf"),
        mtp_sha256: Some("e6e88dea4fcf79a0a71cd7732e61632355126dbbda9b72a08d6301fa06fbaf22"),
        mtp_size: Some(514_705_920),
        mtp_backends: &["cuda", "metal"],
        mtp_draft_max: 2,
        legacy_filenames: &[
            "gemma-4-31B-it-Q4_K_M.gguf",
            "mtp-gemma-4-31B-it.gguf",
        ],
    },
    ModelEntry {
        id: "qwen3.6-35b-a3b",
        name: "Qwen3.6 35B A3B (XL)",
        tier: "xl",
        origin: "cn",
        filename: "Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
        sha256: "ac0e2c1189e055faa36eff361580e79c5bd6f8e76bffb4ce547f167d53e31a61",
        size_bytes: 22_134_528_992,
        min_ram_gb: 24,
        min_vram_gb: 26,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "ministral3-3b",
        name: "Ministral 3 3B (EU)",
        tier: "eu",
        origin: "eu",
        filename: "Ministral-3-3B-Instruct-2512-Q4_K_M.gguf",
        url: "https://huggingface.co/mistralai/Ministral-3-3B-Instruct-2512-GGUF/resolve/main/Ministral-3-3B-Instruct-2512-Q4_K_M.gguf",
        sha256: "9ed150d4367e68df0ac8e1540f6ddc65b42d0ee26378329d1ecbca60f93fc5f8",
        size_bytes: 2_147_023_008,
        min_ram_gb: 6,
        min_vram_gb: 4,
        num_ctx: 8192,
        supports_thinking: false,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "ministral3-8b",
        name: "Ministral 3 8B (EU)",
        tier: "eu",
        origin: "eu",
        filename: "Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
        url: "https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512-GGUF/resolve/main/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
        sha256: "33e7a72cf5e6e2cfc2f2847075acc013d68bba023e35310cef86b5cf8fdca761",
        size_bytes: 5_198_911_904,
        min_ram_gb: 12,
        min_vram_gb: 8,
        num_ctx: 32768,
        supports_thinking: false,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "ministral3-14b",
        name: "Ministral 3 14B (EU)",
        tier: "eu",
        origin: "eu",
        filename: "Ministral-3-14B-Instruct-2512-Q4_K_M.gguf",
        url: "https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-GGUF/resolve/main/Ministral-3-14B-Instruct-2512-Q4_K_M.gguf",
        sha256: "824e0f3373e69b84f2cae46fdcb9bd1ebc6ab3bfc7acc125d818b7b8178cc613",
        size_bytes: 8_239_593_024,
        min_ram_gb: 16,
        min_vram_gb: 12,
        num_ctx: 32768,
        supports_thinking: false,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
    ModelEntry {
        id: "gpt-oss-20b",
        name: "GPT-OSS 20B (XL)",
        tier: "xl",
        origin: "us",
        filename: "gpt-oss-20b-MXFP4.gguf",
        url: "https://huggingface.co/ggml-org/gpt-oss-20b-GGUF/resolve/main/gpt-oss-20b-MXFP4.gguf",
        sha256: "27cd6c432c7672cb812a92f611cf3ba7bbc35928262bb1e1253ff4ee6ae35901",
        size_bytes: 12_109_566_624,
        min_ram_gb: 16,
        min_vram_gb: 15,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "reasoning_effort",
        recommended: false,
        mtp_file: None,
        mtp_url: None,
        mtp_sha256: None,
        mtp_size: None,
        mtp_backends: &[],
        mtp_draft_max: 2,
        legacy_filenames: &[],
    },
];

/// Tiny smoke model used by the P0 gate and CI-ish checks.
pub const SMOKE_MODEL: &ModelEntry = &ModelEntry {
    id: "smollm2-135m-instruct",
    name: "Smoke test model",
    tier: "smoke",
    origin: "us",
    filename: "SmolLM2-135M-Instruct-Q8_0.gguf",
    url: "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf",
    sha256: "5a1395716f7913741cc51d98581b9b1228d80987a9f7d3664106742eb06bba83",
    size_bytes: 144_811_360,
    min_ram_gb: 2,
    min_vram_gb: 2,
    num_ctx: 4096,
    supports_thinking: false,
    thinking_control: "chat_template_kwargs",
    recommended: false,
    mtp_file: None,
    mtp_url: None,
    mtp_sha256: None,
    mtp_size: None,
    mtp_backends: &[],
    mtp_draft_max: 2,
    legacy_filenames: &[],
};

pub fn all_models() -> impl Iterator<Item = &'static ModelEntry> {
    MODEL_CATALOG.iter().chain(std::iter::once(SMOKE_MODEL))
}

pub fn find_model(id: &str) -> Option<&'static ModelEntry> {
    all_models().find(|m| m.id == id)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum HardwareClass {
    Cpu,
    Low,
    Mid,
    High,
    Xl,
    Workstation,
}

/// Coarse hardware buckets used for model selection. The mapping intentionally
/// follows docs/AI_V3_PLAN.md §Appendix F (VRAM class -> model tier), with a
/// conservative fallback for machines whose GPU cannot be probed.
fn hardware_class(hw: &HardwareInfo) -> HardwareClass {
    if let Some(gpu) = &hw.gpu {
        if gpu.unified_memory {
            // Apple Silicon has a large unified pool and Metal acceleration.
            if gpu.vendor == "apple" {
                return match hw.total_ram_gb {
                    r if r >= 32 => HardwareClass::Workstation,
                    r if r >= 24 => HardwareClass::Xl,
                    r if r >= 16 => HardwareClass::High,
                    _ => HardwareClass::Mid,
                };
            }
            // Intel/AMD integrated GPUs share RAM with the OS; stay conservative.
            return match hw.total_ram_gb {
                r if r >= 32 => HardwareClass::Mid,
                r if r >= 16 => HardwareClass::Low,
                _ => HardwareClass::Cpu,
            };
        }

        let vram_gb = gpu.vram_mb / 1024;
        return match vram_gb {
            v if v >= 20 => HardwareClass::Workstation,
            v if v >= 14 => HardwareClass::Xl,
            v if v >= 10 => HardwareClass::High,
            v if v >= 7 => HardwareClass::Mid,
            v if v >= 5 => HardwareClass::Low,
            _ => HardwareClass::Cpu,
        };
    }
    // No GPU was detected: be conservative.
    match hw.total_ram_gb {
        r if r >= 32 => HardwareClass::Mid,
        r if r >= 16 => HardwareClass::Low,
        _ => HardwareClass::Cpu,
    }
}

/// Preferred models per hardware class. The first entry that is downloaded and
/// fits RAM/VRAM wins; the rest are ordered fallbacks.
fn preferred_ids(class: HardwareClass) -> &'static [&'static str] {
    match class {
        HardwareClass::Workstation => &[
            "qwen3.8-27b",
            "gemma4-26b-a4b",
            "gemma4-31b",
            "qwen3.6-35b-a3b",
            "gpt-oss-20b",
            "gemma4-12b",
            "qwen3.5-9b",
            "qwen3.5-4b",
            "gemma4-e4b",
            "qwen3.5-2b",
            "gemma4-e2b",
            "ministral3-14b",
            "ministral3-8b",
            "ministral3-3b",
        ],
        HardwareClass::Xl => &[
            "gpt-oss-20b",
            "gemma4-12b",
            "qwen3.5-9b",
            "qwen3.8-27b",
            "qwen3.6-35b-a3b",
            "gemma4-26b-a4b",
            "gemma4-31b",
            "qwen3.5-4b",
            "gemma4-e4b",
            "qwen3.5-2b",
            "gemma4-e2b",
            "ministral3-14b",
            "ministral3-8b",
            "ministral3-3b",
        ],
        HardwareClass::High => &[
            "gemma4-12b",
            "qwen3.5-9b",
            "ministral3-14b",
            "gpt-oss-20b",
            "qwen3.5-4b",
            "gemma4-e4b",
            "qwen3.5-2b",
            "gemma4-e2b",
            "ministral3-8b",
            "ministral3-3b",
            "qwen3.8-27b",
            "qwen3.6-35b-a3b",
            "gemma4-26b-a4b",
            "gemma4-31b",
        ],
        HardwareClass::Mid => &[
            "qwen3.5-9b",
            "gemma4-12b",
            "qwen3.5-4b",
            "gemma4-e4b",
            "ministral3-8b",
            "qwen3.5-2b",
            "gemma4-e2b",
            "ministral3-3b",
            "gpt-oss-20b",
            "qwen3.8-27b",
        ],
        HardwareClass::Low => &[
            "qwen3.5-4b",
            "gemma4-e4b",
            "qwen3.5-2b",
            "gemma4-e2b",
            "ministral3-3b",
            "ministral3-8b",
            "qwen3.5-9b",
            "gemma4-12b",
        ],
        HardwareClass::Cpu => &[
            "qwen3.5-2b",
            "gemma4-e2b",
            "qwen3.5-4b",
            "gemma4-e4b",
            "ministral3-3b",
        ],
    }
}

fn ram_ok(model: &ModelEntry, hw: &HardwareInfo) -> bool {
    hw.total_ram_gb == 0 || hw.total_ram_gb >= model.min_ram_gb
}

fn vram_ok(model: &ModelEntry, hw: &HardwareInfo) -> bool {
    match &hw.gpu {
        Some(gpu) if !gpu.unified_memory => gpu.vram_mb / 1024 >= u64::from(model.min_vram_gb),
        // CPU-only / unified memory: VRAM is not a separate constraint.
        _ => true,
    }
}

/// Context window to use when the user leaves the setting on Auto. The model's
/// `num_ctx` is the ceiling; if the machine does not have enough memory for the
/// weights plus a comfortable KV-cache margin, use a smaller window instead.
pub fn effective_ctx(model: &ModelEntry, hw: &HardwareInfo) -> u32 {
    let (available_gb, reserve_gb) = match &hw.gpu {
        Some(gpu) if !gpu.unified_memory => (gpu.vram_mb as f64 / 1024.0, 0.0),
        // Unified memory is shared with the OS and apps; leave a reserve.
        _ => (f64::from(hw.total_ram_gb), 4.0),
    };
    let weights_gb =
        (model.size_bytes + model.mtp_size.unwrap_or(0)) as f64 / (1024.0 * 1024.0 * 1024.0);
    let headroom_gb = (available_gb - reserve_gb - weights_gb).max(0.0);

    let cap = if headroom_gb >= 4.0 {
        model.num_ctx
    } else if headroom_gb >= 2.0 {
        32_768
    } else if headroom_gb >= 1.0 {
        16_384
    } else {
        8_192
    };

    cap.min(model.num_ctx).max(4_096)
}

/// Best model for this machine, whether or not it is downloaded. Used for the
/// "Recommended for your PC" badge.
/// Translation/rewrite quality based on the model cards' documented language
/// coverage and model size. Kept separate from `tier` so the UI can sort the
/// rewrite/translate selector without changing model recommendations.
pub fn translation_quality(id: &str) -> &'static str {
    match id {
        "qwen3.5-9b" | "gemma4-12b" | "gemma4-26b-a4b" | "gemma4-31b" | "qwen3.8-27b"
        | "qwen3.6-35b-a3b" | "ministral3-14b" => "excellent",
        "qwen3.5-4b" | "gemma4-e4b" | "ministral3-8b" | "ministral3-3b" => "good",
        "qwen3.5-2b" | "gemma4-e2b" => "basic",
        "gpt-oss-20b" => "limited",
        _ => "basic",
    }
}

pub fn recommended_model(hw: &HardwareInfo) -> Option<&'static ModelEntry> {
    preferred_ids(hardware_class(hw))
        .iter()
        .filter_map(|id| find_model(id))
        .find(|model| ram_ok(model, hw) && vram_ok(model, hw))
}

pub fn is_downloaded(app: &tauri::AppHandle, model: &ModelEntry) -> bool {
    model_file_path(app, model)
        .map(|path| path.is_file())
        .unwrap_or(false)
}

fn legacy_paths(dir: &Path, model: &ModelEntry) -> Vec<PathBuf> {
    model
        .legacy_filenames
        .iter()
        .map(|filename| dir.join(filename))
        .filter(|path| path.is_file())
        .collect()
}

/// Resolve Auto to a downloaded model that is appropriate for this machine.
/// Unlike the old tier-only order, this includes workstation/XL models as a
/// last resort so a machine with only a large model installed can still work.
pub fn first_downloaded_auto(app: &tauri::AppHandle) -> Option<&'static ModelEntry> {
    let hw = super::hardware::cached();
    let class = hardware_class(hw);

    for id in preferred_ids(class) {
        if let Some(model) = find_model(id) {
            if is_downloaded(app, model) && ram_ok(model, hw) && vram_ok(model, hw) {
                return Some(model);
            }
        }
    }

    // Fallback: any downloaded model, preferring ones that fit and then the
    // smallest download. This prevents "No model downloaded" when the only
    // installed model is an XL/workstation tier.
    let mut candidates: Vec<&'static ModelEntry> = MODEL_CATALOG
        .iter()
        .filter(|model| is_downloaded(app, model))
        .collect();
    candidates.sort_by_key(|model| (!ram_ok(model, hw), !vram_ok(model, hw), model.size_bytes));
    candidates.into_iter().next()
}

/// Models live in app_data_dir/models (device-local, never inside the vault).
pub fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[allow(dead_code)]
pub fn downloaded_models(app: &tauri::AppHandle) -> Result<Vec<&'static ModelEntry>, String> {
    let dir = models_dir(app)?;
    Ok(all_models()
        .filter(|m| dir.join(m.filename).is_file())
        .collect())
}

pub fn model_file_path(app: &tauri::AppHandle, model: &ModelEntry) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(model.filename))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogModelDto {
    pub id: &'static str,
    pub name: &'static str,
    pub tier: &'static str,
    pub origin: &'static str,
    pub size_bytes: u64,
    pub min_ram_gb: u32,
    pub min_vram_gb: u32,
    pub num_ctx: u32,
    pub supports_thinking: bool,
    pub recommended: bool,
    pub recommended_for_hardware: bool,
    pub translation_quality: &'static str,
    pub downloaded: bool,
    pub file_present: bool,
    pub mtp_available: bool,
    pub mtp_downloaded: bool,
    pub mtp_size: u64,
    pub legacy_present: bool,
    pub legacy_size_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogInfo {
    pub engine_pin: &'static str,
    pub engine_variant: Option<&'static str>,
    pub engine_installed: bool,
    pub models_dir: String,
    pub models: Vec<CatalogModelDto>,
    pub recommended_id: Option<String>,
    pub auto_start_id: Option<String>,
    pub cuda_pack_available: bool,
    pub cuda_pack_installed: bool,
    pub cuda_pack_size: u64,
}

/// Optional on-demand CUDA acceleration pack (Windows x64, NVIDIA dGPUs).
/// Pinned to the same llama.cpp tag as the bundled engine (ENGINE_PIN).
pub struct EnginePack {
    pub id: &'static str,
    pub main_url: &'static str,
    pub main_sha256: &'static str,
    pub main_size: u64,
    pub cudart_url: &'static str,
    pub cudart_sha256: &'static str,
    pub cudart_size: u64,
    pub entry: &'static str,
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
pub const CUDA_PACK: Option<EnginePack> = Some(EnginePack {
    id: "cuda-win-x64",
    main_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11960/llama-b11960-bin-win-cuda-12.4-x64.zip",
    main_sha256: "8d9d819261de10cc2f03921b8b79c779c5c458e21edb60c170ee30a7d462d684",
    main_size: 279_763_224,
    cudart_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11960/cudart-llama-bin-win-cuda-12.4-x64.zip",
    cudart_sha256: "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
    cudart_size: 391_443_627,
    entry: "llama-server.exe",
});

#[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
pub const CUDA_PACK: Option<EnginePack> = None;

/// Where an installed engine pack lives: `<app_data>/engines/<pack id>/`.
pub fn engine_pack_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let pack = CUDA_PACK
        .as_ref()
        .ok_or_else(|| "No engine pack available for this platform.".to_string())?;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("engines")
        .join(pack.id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub(crate) const PACK_VERSION_FILE: &str = "engine-version.txt";

pub fn cuda_pack_installed(app: &tauri::AppHandle) -> bool {
    match (CUDA_PACK.as_ref(), engine_pack_dir(app)) {
        (Some(pack), Ok(dir)) => {
            let version_matches = std::fs::read_to_string(dir.join(PACK_VERSION_FILE))
                .map(|version| version.trim() == ENGINE_PIN)
                .unwrap_or(false);
            version_matches && dir.join(pack.entry).is_file()
        }
        _ => false,
    }
}

/// Draft-head (MTP) path. Some heads live in a subfolder of the models dir
/// (e.g. Qwen's `MTP/`), so create the parent directory before returning.
pub fn mtp_file_path(
    app: &tauri::AppHandle,
    model: &ModelEntry,
) -> Result<Option<PathBuf>, String> {
    let Some(mtp_file) = model.mtp_file else {
        return Ok(None);
    };
    let path = models_dir(app)?.join(mtp_file);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    Ok(Some(path))
}

#[tauri::command]
pub fn ai_catalog_info(app: tauri::AppHandle) -> Result<CatalogInfo, String> {
    let variant = current_variant().map(|v| v.dir);
    let engine_installed = engine_dir(&app).is_ok();
    let dir = models_dir(&app)?;
    let hw = super::hardware::cached();
    let recommended_id = recommended_model(hw).map(|m| m.id.to_string());
    let auto_start_id = first_downloaded_auto(&app).map(|m| m.id.to_string());
    let models = all_models()
        // Smoke-test model stays available to scripts (`find_model`), but is
        // not offered in the user-facing catalog list.
        .filter(|m| m.tier != "smoke")
        .map(|m| {
            let legacy = legacy_paths(&dir, m);
            let mtp_downloaded = m
                .mtp_file
                .map(|file| dir.join(file).is_file())
                .unwrap_or(false);
            CatalogModelDto {
                id: m.id,
                name: m.name,
                tier: m.tier,
                origin: m.origin,
                size_bytes: m.size_bytes,
                min_ram_gb: m.min_ram_gb,
                min_vram_gb: m.min_vram_gb,
                num_ctx: m.num_ctx,
                supports_thinking: m.supports_thinking,
                recommended: m.recommended,
                recommended_for_hardware: recommended_id.as_deref() == Some(m.id),
                translation_quality: translation_quality(m.id),
                downloaded: dir.join(m.filename).is_file(),
                file_present: dir.join(m.filename).is_file(),
                mtp_available: m.mtp_file.is_some(),
                mtp_downloaded,
                mtp_size: m.mtp_size.unwrap_or(0),
                legacy_present: !legacy.is_empty(),
                legacy_size_bytes: legacy
                    .iter()
                    .filter_map(|path| std::fs::metadata(path).ok())
                    .map(|meta| meta.len())
                    .sum(),
            }
        })
        .collect();
    Ok(CatalogInfo {
        engine_pin: ENGINE_PIN,
        engine_variant: variant,
        engine_installed,
        models_dir: dir.to_string_lossy().to_string(),
        models,
        recommended_id,
        auto_start_id,
        cuda_pack_available: CUDA_PACK.is_some(),
        cuda_pack_installed: cuda_pack_installed(&app),
        cuda_pack_size: CUDA_PACK
            .as_ref()
            .map(|p| p.main_size + p.cudart_size)
            .unwrap_or(0),
    })
}

/// Resolve the model that a chat request will actually use (explicit >
/// selected > first downloaded in auto order) together with its real context
/// window. The frontend needs this before `ai_chat` switches the engine:
/// `ai_engine_status` may still describe the previously loaded model.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectiveModelInfo {
    pub id: Option<String>,
    pub name: Option<String>,
    pub num_ctx: u32,
    pub supports_thinking: bool,
    pub downloaded: bool,
}

#[tauri::command]
pub fn ai_effective_model(
    app: tauri::AppHandle,
    model_id: Option<String>,
    num_ctx: Option<u32>,
) -> Result<EffectiveModelInfo, String> {
    let selected = app.state::<AiState>().selected();
    let target = model_id
        .as_deref()
        .and_then(find_model)
        .or_else(|| {
            selected
                .as_deref()
                .and_then(find_model)
                .filter(|model| is_downloaded(&app, model))
        })
        .or_else(|| first_downloaded_auto(&app));

    Ok(match target {
        Some(model) => {
            let ctx = num_ctx
                .map(|ctx| ctx.clamp(512, model.num_ctx))
                .unwrap_or_else(|| effective_ctx(model, super::hardware::cached()));
            EffectiveModelInfo {
                id: Some(model.id.to_string()),
                name: Some(model.name.to_string()),
                num_ctx: ctx,
                supports_thinking: model.supports_thinking,
                downloaded: model_file_path(&app, model)
                    .map(|p| p.is_file())
                    .unwrap_or(false),
            }
        }
        None => EffectiveModelInfo {
            id: None,
            name: None,
            // No model is available yet; this only feeds pre-flight budgeting.
            num_ctx: num_ctx.unwrap_or(16384),
            supports_thinking: true,
            downloaded: false,
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::hardware::GpuInfo;

    fn hw_with(
        vram_gb: Option<u64>,
        ram_gb: u32,
        vendor: &'static str,
        unified_memory: bool,
    ) -> HardwareInfo {
        HardwareInfo {
            gpu: vram_gb.map(|vram| GpuInfo {
                name: "Test GPU".into(),
                vram_mb: vram * 1024,
                vendor,
                unified_memory,
            }),
            total_ram_gb: ram_gb,
        }
    }

    fn hw(vram_gb: Option<u64>, ram_gb: u32) -> HardwareInfo {
        hw_with(vram_gb, ram_gb, "nvidia", false)
    }

    fn recommended_id(vram_gb: Option<u64>, ram_gb: u32) -> Option<&'static str> {
        recommended_model(&hw(vram_gb, ram_gb)).map(|m| m.id)
    }

    #[test]
    fn recommends_workstation_model_on_24gb_gpu() {
        assert_eq!(recommended_id(Some(24), 64), Some("qwen3.8-27b"));
    }

    #[test]
    fn recommends_20b_on_16gb_gpu() {
        assert_eq!(recommended_id(Some(16), 32), Some("gpt-oss-20b"));
    }

    #[test]
    fn recommends_12b_on_12gb_gpu() {
        assert_eq!(recommended_id(Some(12), 32), Some("gemma4-12b"));
    }

    #[test]
    fn recommends_9b_on_8gb_gpu() {
        assert_eq!(recommended_id(Some(8), 16), Some("qwen3.5-9b"));
    }

    #[test]
    fn recommends_4b_on_6gb_gpu() {
        assert_eq!(recommended_id(Some(6), 16), Some("qwen3.5-4b"));
    }

    #[test]
    fn recommends_2b_on_cpu_or_4gb_gpu() {
        assert_eq!(recommended_id(Some(4), 8), Some("qwen3.5-2b"));
        assert_eq!(recommended_id(None, 8), Some("qwen3.5-2b"));
    }

    #[test]
    fn respects_ram_limit() {
        // 24 GB VRAM but only 16 GB system RAM: the 27B needs 24 GB RAM.
        assert_eq!(recommended_id(Some(24), 16), Some("gpt-oss-20b"));
    }

    #[test]
    fn recommends_for_amd_dedicated_gpu() {
        let hw = hw_with(Some(12), 32, "amd", false);
        assert_eq!(recommended_model(&hw).map(|m| m.id), Some("gemma4-12b"));
    }

    #[test]
    fn recommends_for_intel_igpu_using_ram() {
        let hw = hw_with(Some(16), 16, "intel", true);
        assert_eq!(recommended_model(&hw).map(|m| m.id), Some("qwen3.5-4b"));
    }

    #[test]
    fn recommends_for_apple_unified_memory() {
        assert_eq!(
            recommended_model(&hw_with(Some(32), 32, "apple", true)).map(|m| m.id),
            Some("qwen3.8-27b")
        );
        assert_eq!(
            recommended_model(&hw_with(Some(16), 16, "apple", true)).map(|m| m.id),
            Some("gemma4-12b")
        );
    }

    #[test]
    fn translation_quality_matches_model_cards() {
        assert_eq!(translation_quality("gemma4-12b"), "excellent");
        assert_eq!(translation_quality("qwen3.5-9b"), "excellent");
        assert_eq!(translation_quality("ministral3-14b"), "excellent");
        assert_eq!(translation_quality("gemma4-e4b"), "good");
        assert_eq!(translation_quality("ministral3-3b"), "good");
        assert_eq!(translation_quality("gemma4-e2b"), "basic");
        assert_eq!(translation_quality("gpt-oss-20b"), "limited");
    }

    #[test]
    fn context_scales_with_available_memory() {
        let model = find_model("qwen3.8-27b").unwrap();
        assert_eq!(effective_ctx(model, &hw(Some(24), 64)), 65_536);
        assert_eq!(effective_ctx(model, &hw(Some(16), 32)), 8_192);

        let small = find_model("qwen3.5-4b").unwrap();
        assert_eq!(effective_ctx(small, &hw(Some(4), 8)), 16_384);

        let mid = find_model("qwen3.5-9b").unwrap();
        assert_eq!(effective_ctx(mid, &hw(Some(8), 16)), 32_768);
    }
}
