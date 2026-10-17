//! Engine + model catalog (docs/AI_V3_PLAN.md §3.4).
//! Verified via HF API on 2026-10-17 (sizes + LFS sha256). Re-verify at pin bumps.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

pub const ENGINE_PIN: &str = "b11669";

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
    /// lite | balanced | pro | xl | eu | smoke
    pub tier: &'static str,
    /// eu | us | cn
    pub origin: &'static str,
    pub filename: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
    pub size_bytes: u64,
    pub min_ram_gb: u32,
    pub num_ctx: u32,
    pub supports_thinking: bool,
    /// chat_template_kwargs | reasoning_effort
    pub thinking_control: &'static str,
    pub recommended: bool,
    pub mtp_file: Option<&'static str>,
    pub mtp_sha256: Option<&'static str>,
    pub mtp_size: Option<u64>,
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
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: true,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
        num_ctx: 16384,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
    },
    ModelEntry {
        id: "gemma4-e2b",
        name: "Gemma 4 E2B (Lite)",
        tier: "lite",
        origin: "us",
        filename: "gemma-4-E2B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf",
        sha256: "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
        size_bytes: 3_106_738_272,
        min_ram_gb: 6,
        num_ctx: 8192,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
    },
    ModelEntry {
        id: "gemma4-e4b",
        name: "Gemma 4 E4B (Balanced)",
        tier: "balanced",
        origin: "us",
        filename: "gemma-4-E4B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf",
        sha256: "85a896a047553e842f25297ee5b031d64ff30147d9c4af17b1e4b394cd1fab87",
        size_bytes: 4_977_171_584,
        min_ram_gb: 8,
        num_ctx: 16384,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
    },
    ModelEntry {
        id: "gemma4-12b",
        name: "Gemma 4 12B (Pro)",
        tier: "pro",
        origin: "us",
        filename: "gemma-4-12b-it-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/gemma-4-12b-it-GGUF/resolve/main/gemma-4-12b-it-Q4_K_M.gguf",
        sha256: "0a270ec9fe6b34f4a0d33992b6135117b484ebc4766ab76b51d4ae8c457e4c42",
        size_bytes: 7_121_861_440,
        min_ram_gb: 16,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
        num_ctx: 65536,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
    },
    ModelEntry {
        id: "gemma4-26b-a4b",
        name: "Gemma 4 26B A4B (Workstation)",
        tier: "workstation",
        origin: "us",
        filename: "gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF/resolve/main/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
        sha256: "f2c28b3dc4776931ac6f879e11f203dec637ea0f14267a86ec8f6165f63f293f",
        size_bytes: 16_947_541_728,
        min_ram_gb: 24,
        num_ctx: 65536,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("mtp-gemma-4-26B-A4B-it.gguf"),
        mtp_sha256: Some("6326fb9f5e487aa8dcdd313a091e3c67724cb2a666ec3b7d2895b5b26d93ed1b"),
        mtp_size: Some(461_766_816),
    },
    ModelEntry {
        id: "gemma4-31b",
        name: "Gemma 4 31B (Workstation)",
        tier: "workstation",
        origin: "us",
        filename: "gemma-4-31B-it-Q4_K_M.gguf",
        url: "https://huggingface.co/unsloth/gemma-4-31B-it-GGUF/resolve/main/gemma-4-31B-it-Q4_K_M.gguf",
        sha256: "38bd64c852c4b460434cc7162fa9bdcf242faf86502581a754cb72956bb17f84",
        size_bytes: 18_323_733_440,
        min_ram_gb: 24,
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: Some("mtp-gemma-4-31B-it.gguf"),
        mtp_sha256: Some("5ae8b0117bed601e8924c6305bd5b0585de361d51f0e77091bcb4252cf1f27de"),
        mtp_size: Some(514_687_104),
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
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
        num_ctx: 8192,
        supports_thinking: false,
        thinking_control: "chat_template_kwargs",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
        num_ctx: 32768,
        supports_thinking: true,
        thinking_control: "reasoning_effort",
        recommended: false,
        mtp_file: None,
        mtp_sha256: None,
        mtp_size: None,
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
    num_ctx: 4096,
    supports_thinking: false,
    thinking_control: "chat_template_kwargs",
    recommended: false,
    mtp_file: None,
    mtp_sha256: None,
    mtp_size: None,
};

pub fn all_models() -> impl Iterator<Item = &'static ModelEntry> {
    MODEL_CATALOG.iter().chain(std::iter::once(SMOKE_MODEL))
}

pub fn find_model(id: &str) -> Option<&'static ModelEntry> {
    all_models().find(|m| m.id == id)
}

/// Download preference order for auto-start when no model is specified:
/// recommended default first, then lightest tiers, then smoke model.
pub fn auto_start_order() -> impl Iterator<Item = &'static ModelEntry> {
    let mut ordered: Vec<&ModelEntry> = MODEL_CATALOG
        .iter()
        .filter(|m| !matches!(m.tier, "xl" | "workstation"))
        .collect();
    ordered.sort_by_key(|m| {
        let tier_rank = match m.tier {
            "balanced" => 0,
            "lite" => 1,
            "eu" => 2,
            "pro" => 3,
            _ => 4,
        };
        (tier_rank, !m.recommended, m.size_bytes)
    });
    ordered.push(SMOKE_MODEL);
    ordered.into_iter()
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
    pub num_ctx: u32,
    pub supports_thinking: bool,
    pub recommended: bool,
    pub downloaded: bool,
    pub file_present: bool,
    pub mtp_available: bool,
    #[allow(dead_code)]
    pub mtp_meta: (Option<&'static str>, Option<u64>),
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogInfo {
    pub engine_pin: &'static str,
    pub engine_variant: Option<&'static str>,
    pub engine_installed: bool,
    pub models_dir: String,
    pub models: Vec<CatalogModelDto>,
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
    main_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11669/llama-b11669-bin-win-cuda-12.4-x64.zip",
    main_sha256: "c2da1f73ed176ae093ac5aceb978a7b167a16113f6d74c6789eeaee2135cb8dc",
    main_size: 266_582_698,
    cudart_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11669/cudart-llama-bin-win-cuda-12.4-x64.zip",
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

pub fn cuda_pack_installed(app: &tauri::AppHandle) -> bool {
    match (CUDA_PACK.as_ref(), engine_pack_dir(app)) {
        (Some(pack), Ok(dir)) => dir.join(pack.entry).is_file(),
        _ => false,
    }
}

/// Draft-head (MTP) file URL: same HF repo as the main GGUF, sibling filename.
pub fn mtp_download_url(model: &ModelEntry) -> Option<String> {
    let mtp_file = model.mtp_file?;
    let base = model.url.rsplit_once('/')?.0;
    Some(format!("{base}/{mtp_file}"))
}

#[tauri::command]
pub fn ai_catalog_info(app: tauri::AppHandle) -> Result<CatalogInfo, String> {
    let variant = current_variant().map(|v| v.dir);
    let engine_installed = engine_dir(&app).is_ok();
    let dir = models_dir(&app)?;
    let models = all_models()
        // Smoke-test model stays available to scripts (`find_model`), but is
        // not offered in the user-facing catalog list.
        .filter(|m| m.tier != "smoke")
        .map(|m| CatalogModelDto {
            id: m.id,
            name: m.name,
            tier: m.tier,
            origin: m.origin,
            size_bytes: m.size_bytes,
            min_ram_gb: m.min_ram_gb,
            num_ctx: m.num_ctx,
            supports_thinking: m.supports_thinking,
            recommended: m.recommended,
            downloaded: dir.join(m.filename).is_file(),
            file_present: dir.join(m.filename).is_file(),
            mtp_available: m.mtp_file.is_some(),
            // P4 will use these to fetch the draft head; silenced until then.
            #[allow(dead_code)]
            mtp_meta: (m.mtp_sha256, m.mtp_size),
        })
        .collect();
    Ok(CatalogInfo {
        engine_pin: ENGINE_PIN,
        engine_variant: variant,
        engine_installed,
        models_dir: dir.to_string_lossy().to_string(),
        models,
        cuda_pack_available: CUDA_PACK.is_some(),
        cuda_pack_installed: cuda_pack_installed(&app),
        cuda_pack_size: CUDA_PACK
            .as_ref()
            .map(|p| p.main_size + p.cudart_size)
            .unwrap_or(0),
    })
}
