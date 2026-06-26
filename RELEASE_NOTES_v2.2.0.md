# TeacherPro v2.2.0 – Knowledge Database & RAG

## New Features

### 📚 Wissensdatenbank (Knowledge Database)
- **Subject-based vector database** for teaching materials (PDFs)
- Create subjects, grade levels, and topics directly in the app UI
- Import PDFs via native file dialog → automatic text extraction + chunking
- **Embedding via bge-m3** (multilingual, 100+ languages, 1024-dim vectors)
- Cosine-similarity search across all embedded chunks

### 🤖 AI Chat with RAG
- **Retrieval-Augmented Generation**: AI chat automatically searches the knowledge database when a subject/topic is selected
- Hierarchical database selector in chat panel (collapsible tree)
- Retrieved content is injected as structured context into the AI prompt
- Native Chat Messages API (`ai_generate_chat`) → proper message arrays instead of concatenated strings
- **Token Context Bar**: Visual indicator showing lesson/history/RAG/system token usage
- Dynamic `num_ctx` / `num_predict` adjustment when RAG or thinking mode is active

### 📄 PDF Processing
- Digital PDF text extraction (via `pdf-extract`, pure Rust, cross-platform)
- Scanned PDF OCR fallback (via system `tesseract` + `pdftoppm` if installed)
- Intelligent chunking with UTF-8 safety, paragraph-aware splits, configurable overlap

### 🎨 UI Improvements
- **SubjectDbManager**: Full tree UI for managing database folders and files
- **ChatContextBar**: Token budget visualization with color-coded segments
- **AiMarkdown**: Now renders markdown tables as HTML `<table>` elements
- **Custom dropdown**: Dark-mode-safe database selector replaces native `<select>`
- **Delete individual files**: Remove specific PDFs from the database
- Progress events during import/embedding pipeline

## Technical Improvements
- Refactored Rust backend with `subject_db` module (pdf, chunk, embed, store)
- All database operations async via Tauri commands
- Fully cross-platform: Windows, macOS, Linux
- Ollama embeddings (bge-m3) run on Apple Silicon, NVIDIA CUDA, AMD ROCm
- Auto-pull of embedding model on first use

## Breaking Changes
- Minimum Ollama version: 0.5+ (for `/api/embed` endpoint)
- bge-m3 model (~2.2 GB) required for embedding; auto-pulled on first import

## Files Changed
- 12 modified files, 12 new files (including tests)
- Core Rust: `subject_db/` module (5 files), `lib.rs`
- Core Frontend: `Editor.tsx`, `store.ts`, `ChatContextBar.tsx`, `SubjectDbManager.tsx`, `SettingsModal.tsx`
- i18n: `de.ts`, `en.ts` (full translations)
