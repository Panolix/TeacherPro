# TeacherPro v2.5.0

An internationalization and hardware-fit release. Every remaining hardcoded
UI string now follows the language selector, and the local AI model catalog
gains Apple Silicon (MLX) variants of the models that offer them — with a
clear "Apple Silicon optimized" badge so Mac and Windows users each pick the
build that runs best on their machine.

## Added

- **Apple Silicon (MLX) model variants** — 10 models in the catalog are now
  also available as MLX builds (`qwen3.5` 4B/9B, `gemma4` E2B/E4B/12B/26B/31B,
  `qwen3.6` 27B/35B, `qwen3.8` 27B). MLX is Apple's machine-learning framework
  for Apple Silicon's unified memory; on M-series Macs these builds run
  noticeably faster than the standard builds, which remain in the list for
  Windows, Linux and dedicated-GPU machines. MLX entries carry an
  **"Apple Silicon optimized"** badge and state their unified-memory
  recommendation instead of VRAM.
- **Full translation coverage** — the last hardcoded strings now follow the
  language selector:
  - All ~35 vault operation error dialogs (create/save/rename/delete for
    lessons, mindmaps, materials and trash), previously English-only.
  - All AI model management error messages in Settings, and the .gguf file
    picker title.
  - AI selection/chat status messages and the PDF export/print error details
    in both the lesson editor and the mindmap view.
  - Chat quick-action prompts: buttons were translated, but the prompt text
    sent to the AI (and shown as your chat message) was always English.
  - Knowledge Databases panel: "No vault configured.", OK buttons and the
    diagnostics output — which was hardcoded *German* and appeared in English
    UIs (and vice versa for the English strings).
  - Native file/folder picker titles (vault selection, material import).
  - The "Pick planned date" tooltip and the "New Idea" default mindmap node
    label ("Neue Idee" on German UIs).
- **Bilingual AI model descriptions** — all model descriptions in Settings are
  now available in English and German instead of German only.

## Improved

- **Status bar item counts** — the status bar now always shows both counts
  side by side (`2 lesson plans · 2 mindmaps`, translated, with proper
  singular forms) instead of switching meaning depending on the active view.
- **Status bar "editing" indicator** — now also appears when a mindmap is
  open, not only for lesson plans.

## Fixed

- **Empty folders were counted as lessons/mindmaps** — deleting a lesson or
  mindmap leaves its subject subfolder behind, and the status bar counted
  every folder entry as an item, reporting "2 lessons"/"2 mindmaps" in an
  empty vault. Only actual files are counted now.
- **Model catalog accuracy** — verified every entry against the live Ollama
  registry (all 17 base models are the current versions; sizes and context
  windows match). Corrected the bge-m3 disk estimate (~1.2 GB, not ~2.2 GB).
