# TeacherPro v2.10.0

A major local-AI performance and hardware-awareness release. It makes the
built-in AI stack faster and more predictable on NVIDIA, AMD, Intel and Apple
hardware, adds MTP speculative decoding, gives you control over the context
window, and updates the model catalog to the current QAT and MTP releases.

## Highlights

- **Hardware-aware AI** - the GPU probe now detects NVIDIA, AMD, Intel and
  Apple GPUs on Windows, Linux and macOS. It distinguishes dedicated VRAM from
  shared/unified memory, so model recommendations and Auto selection use the
  right memory pool instead of assuming every machine has an NVIDIA GPU.

- **Faster decoding** - the bundled llama.cpp engine moves to **b11960**
  (v0.8.0), including CUDA/Vulkan performance work and Qwen fixes. MTP
  speculative decoding is now wired for the Gemma 4 family (CUDA/Metal) and
  Qwen3.8-27B (CUDA only). Prompt caching stays enabled by default, and the
  engine warms up in the background after loading.

- **Context window control** - choose **Auto** or a manual window from 4K to
  128K. Auto picks a safe value from your GPU/RAM, and the manual list is
  limited to the selected chat model's maximum. The setting applies to chat,
  rewrite/translate, drafting and token counting.

- **Local benchmark** - Settings now has a **Benchmark chat model** button that
  reports TTFT, decode tokens/sec, context, backend and whether MTP is active.
  It only runs when clicked; nothing is sent anywhere.

- **Current model catalog** - Gemma 4 entries moved to the official **QAT
  q4_0** GGUFs; Ministral 3 8B and 14B were added; Qwen3.8-27B gained its MTP
  draft head. Qwen3.5/3.6, GPT-OSS and the Granite embedder remain current.

- **Clearer model UI** - translation quality is shown with consistent badges:
  **Best translation**, **Good translation**, **Basic translation** and
  **English-first**. Model details are on one line, and the old info hover
  tooltips are gone.

## Added

- AMD, Intel and Apple GPU detection, including unified/shared-memory handling.
- Hardware-aware Auto model selection and a **Recommended** badge.
- Context-window setting with hardware-aware Auto and model-aware options.
- On-demand TTFT/tokens-per-second benchmark in Settings.
- MTP speculative decoding for Gemma 4 E2B/E4B/12B/26B-A4B/31B (CUDA/Metal)
  and Qwen3.8-27B (CUDA).
- **Get MTP head** action for models whose main GGUF is already downloaded.
- Ministral 3 8B and 14B (EU tier).
- Translation quality badges and complete German translations.
- One-time CUDA pack version marker so old engine binaries are not silently
  reused.

## Changed

- Bundled engine and Windows CUDA pack updated from `b11669` to **`b11960`**.
- Auto start now includes workstation/XL models as a fallback instead of
  failing when only a large model is installed.
- The selected chat model is remembered across restarts without starting the
  engine.
- Warmup runs after readiness in the background, so it no longer inflates the
  displayed engine startup time.
- Model download progress can now represent an MTP-head-only download.
- German translations cover the new AI, context, benchmark and badge strings.

## Fixed

- A cold start no longer loads the Auto model and then switches to the
  requested model, causing two model loads.
- Selecting a different context window now reloads the engine only when the
  window actually changes.
- Token counting and draft generation now use the selected model instead of
  silently falling back to Auto.
- Auto no longer fails when the only downloaded model is an XL/workstation
  model.
- Old pre-QAT Gemma files are detected as legacy and can be removed from the
  model row.
- Existing Qwen3.8-27B installs can download the missing MTP head without
  re-downloading the 16.5 GB GGUF.
- CUDA pack detection now verifies the engine version instead of treating any
  existing `llama-server.exe` as current.

## Notes

- No vault migration is required. Lessons, mindmaps, materials, settings and
  downloaded models are preserved.
- **CUDA pack users:** reinstall the CUDA pack once after updating to get the
  `b11960` binaries. Until then the app falls back to the bundled Vulkan engine;
  the old CUDA pack is deliberately not used.
- **Gemma 4 users:** the QAT files use new filenames, so they need to be
  downloaded once. Old non-QAT files are marked as legacy and can be removed
  with the trash button in the model row.
- **Qwen3.8-27B users:** the existing GGUF is reused. Click **Get MTP head** to
  download the ~1.37 GB draft head; MTP is CUDA-only for this model.
- **Linux:** the bundled engine is still Vulkan. Linux CUDA/ROCm packs are not
  part of this release, so MTP remains unavailable there for now.
- **macOS:** Apple Silicon uses Metal with the same GGUF models; Gemma MTP is
  enabled on Metal. Qwen MTP remains CUDA-only. MLX-only models are not
  supported by this engine.
- Windows and macOS installers are still unsigned. On macOS, the
  `xattr -cr /Applications/TeacherPro.app` workaround still applies.
