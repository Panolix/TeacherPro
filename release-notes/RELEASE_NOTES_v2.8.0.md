# TeacherPro v2.8.0

The AI overhaul ("AI v3"). TeacherPro no longer needs Ollama or any other
external runtime: local AI now runs on a bundled `llama-server` sidecar that
TeacherPro starts, manages and shuts down itself. Chat streams token by token,
the knowledge-base search is fully rebuilt (vector + keyword hybrid with real
page citations), and the embedding model was replaced with a newer, smaller and
stronger multilingual model.

## Highlights

- **No external AI runtime required** - Ollama is gone. Nothing is installed via
  winget/brew/curl. The app ships its own engines and downloads models as GGUF
  files directly from Hugging Face, with resumable downloads and SHA-256 checks.

- **Streaming AI chat** - responses appear token by token, thinking blocks can
  be collapsed, and a Stop button cancels generation immediately. The
  lesson-draft generator (✦ in the chat header) produces a complete lesson
  table via grammar-enforced JSON.

- **New embedding model: IBM Granite Embedding 311M Multilingual R2**
  (Apache 2.0). Smaller (~313 MB) and faster than before, with better
  German/English retrieval and a 32K context window. Indexing stays CPU-only,
  so it never competes with the chat model for GPU memory.

- **Knowledge-base search v2** - one SQLite index per vault with hybrid
  retrieval (dense vectors + FTS5 keyword search), reciprocal-rank fusion, and
  real PDF page numbers in every citation chip.

- **Unified knowledge-base picker** - the same tree in AI chat and in the
  lesson-draft dialog. Pick a subject, class, topic or an individual PDF as the
  retrieval scope; the chat only cites what you selected.

- **NVIDIA CUDA acceleration pack** - optional on-demand download (Settings →
  KI-Funktionen) that switches the engine to CUDA automatically on RTX
  machines, with a clean Vulkan fallback. Includes MTP speculative decoding for
  the Gemma workstation models (faster generation).

- **Hardware detection** - the settings show your GPU/VRAM and system RAM, and
  models that fit into your GPU's VRAM are marked with a GPU-fit badge.

## Fixed

- Embedder downloads are now verified and resumable; interrupted downloads can
  no longer corrupt the model cache.
- Fixed a runtime panic that could leave duplicate background downloads running.
- Deleting a PDF now removes its chunks from the index at every level (subject,
  class, topic).
- Fixed the language-switcher flag labels (mojibake) and aligned the
  knowledge-base action icons across all tree levels.
- Consistent hover/expand behaviour in every knowledge-base menu; the expand
  arrow is now the single expand control everywhere.
- Trash "empty" is now the same trash icon button used everywhere else.
- Removed leftover developer tools (diagnose button, debug-mode toggle) and
  debug text that was leaking into the AI prompt.
- Chat citations no longer point at "Page 1" for every hit - real per-page
  extraction is used.

## Action required (one-time)

- **Previous AI models are not migrated.** Open Settings → KI-Funktionen and
  download a model in the new catalog (the Balanced tier is a good default).
- **Knowledge bases are re-indexed automatically.** The app detects the new
  embedding model and rebuilds the index on the next "Scan & Import". The old
  bge-m3 model files are cleaned up automatically (~600 MB freed).
- If you previously used Ollama, you can uninstall it - TeacherPro no longer
  uses it.
