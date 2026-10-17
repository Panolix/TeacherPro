# AI v3 — Implementation Status & Handoff

> **STATUS (2026-10-17): ALL PHASES P0–P5 COMPLETE.** The sections below are the
> historical handoff from the P0–P3 work and are kept for context; the remaining
> P3/P4/P5 items listed further down have since been implemented and committed:
> - P3 fixes: downloader hardening (`.part`/resume/416/clean-EOF), correct
>   special-token/config SHA-256 pins, `run_blocking` panic fix, serialized
>   embedder init, delete-file index purge, citation chips, embedder progress.
> - P4: CUDA acceleration pack (b11669), MTP speculative decoding for Gemma
>   workstation models, hardware detection (`ai_hardware_info`), GPU-fit badges.
> - P5: Ollama backend fully removed from `lib.rs` (~1,600 lines), `AiProvider`
>   and the old Ollama-era `modelCatalog.ts`/i18n keys deleted, `whatlang`
>   chunk language detection, `fetch:engines` added to both CI workflows.
> - Embedder upgraded: **IBM Granite Embedding 311M Multilingual R2** (int8
>   ONNX, in-process via fastembed, CLS pooling, Apache 2.0) replaces bge-m3.
>   The index is tagged with an `embedder_id` in the SQLite `meta` table; scans
>   reset the index automatically when the embedder changes, and queries against
>   a stale index return a clear re-index error.
> For the authoritative design read `AI_V3_PLAN.md`; for current code grep the
> symbols listed in Appendix A (line numbers are stale).

> **For any AI agent (or human) continuing this work.** Read this together with `docs/AI_V3_PLAN.md` (the full design spec). This file says what is DONE, what is BROKEN/OPEN, and what to do next. Line numbers are anchors only — re-locate by symbol name.
>
> Last updated: 2026-10-17, after commit `b4ded1f` (P0+P1+P2 pushed to GitHub).

## 1. Where the implementation stands

### ✅ DONE and verified working (committed in `b4ded1f`, pushed to `Panolix/TeacherPro` main)

**P0 — Engine skeleton**
- `scripts/engine-config.json` + `scripts/fetch-engines.mjs` (`npm run fetch:engines`): fetches pinned llama.cpp build **b11669** per platform (Windows x64 Vulkan / macOS arm64 Metal / macOS x64 CPU / Linux x64 Vulkan) with SHA-256 pins, extracts to `src-tauri/resources/engines/<variant>/`. Windows engine verified: `--version` → build 11669.
- `src-tauri/src/ai/{mod,catalog,engine,downloader}.rs`:
  - Engine state machine: `idle → starting → loading-model → ready → failed/stopped` in `EngineState` (Mutex-managed via `AiState`).
  - Lazy spawn: binds `127.0.0.1:0` (ephemeral port), spawns bundled `llama-server` with `--jinja --no-webui -m <gguf> -c <ctx> -np 1 -fa on -ctk q8_0 -ctv q8_0 --api-key <uuid-v4>` — **no `-ngl` flag** (llama.cpp `--fit` auto-fitter stays active, verified upstream: passing any `-ngl` disables fit and causes OOM on small GPUs).
  - Readiness: polls `GET /health` (503 = loading → 200 = ready), 120 s timeout.
  - `RunEvent::Exit` → `kill_on_exit()` — **verified**: closing the app kills llama-server.
  - Downloader: resumable ranged GET (206 responses), 8-attempt retry w/ backoff, `.part` file → SHA-256 verify → atomic rename. **Verified by user**: download, cancel mid-download, resume works.
- Old Ollama auto-start removed from `src/App.tsx` (the `ai_ensure_runtime` setTimeout block is gone).
- `tauri.conf.json`: `bundle.resources: ["resources/engines/"]` added; `.gitignore` excludes `src-tauri/resources/engines/`.

**P1 — Generation, streaming, catalog, settings overhaul**
- `src-tauri/src/ai/client.rs`: SSE streaming relay — `POST /v1/chat/completions` `stream:true`, routes `choices[0].delta.reasoning_content` → thinking events, batches flushes every ~50 ms, emits Tauri events `ai-stream-{requestId}` with `{kind: chunk|thinking|done|error, text?, usage?, finish?, error?}`.
  - ureq v2 semantics: `timeout_connect(10s)` + `timeout_read(120s)`, NO overall timeout on streams.
  - Cancellation: `Arc<AtomicBool>` per request; `ai_chat_cancel` drops the body → closes TCP → server aborts the slot. Stop button verified in UI.
- Commands: `ai_chat` (streams), `ai_generate_text_v2` (non-stream, rewrite/translate), `ai_structured` (GBNF json_schema enforced), `ai_count_tokens` (`POST /tokenize`), `ai_engine_status/start/stop`, `ai_select_model`/`ai_selected_model`, `ai_download_model_start/progress/cancel`, `ai_catalog_info`.
- Model catalog (`catalog.rs`): 11 verified entries with exact HF sizes + LFS sha256 (verified via HF API 2026-10-17): lite (Qwen3.5-2B, Gemma4-E2B), balanced (Qwen3.5-4B **default**, Gemma4-E4B), pro (Qwen3.5-9B, Gemma4-12B), workstation (Qwen3.8-27B, Gemma4-26B-A4B + MTP draft head, Gemma4-31B + MTP draft head, Qwen3.6-35B-A3B), eu (Ministral-3-3B), smoke (SmolLM2-135M). ctx windows: 16k-64k per model economics. **Note: ctx bumps were applied manually — Qwen3.5-4B=32768, 2B=16384, E2B=8192, E4B=16384, 9B/12B/gpt-oss=32768, workstation=65536/32768. Verify against catalog.rs if in doubt.**
  - MTP fields (`mtp_file/sha/size`) present for the two Gemma workstation entries; **MTP is NOT yet wired into spawn flags** (P4 task).
- Settings AI tab overhauled: old Ollama sections deleted (provider dropdown, ensure-runtime button, 26-model catalog); new "KI-Modelle (lokale Engine)" list with Download/Cancel/Verifying/Use/Active states; routing dropdowns (chat + rewrite) listing downloaded v3 models with "Automatisch" default; engine status in store (`aiV3ChatModelId`/`aiV3RewriteModelId` persisted device-local in zustand store).
- Editor: chat streams token-by-token via `ai-stream` events (**verified by user**, thinking blocks render collapsible); rewrite/translate via `ai_generate_text_v2`; status messages moved to StatusBar (bottom, auto-clear 6 s, no model names shown).
- Draft generator (`src/components/editor/DraftGeneratorDialog.tsx`): opt-in Sparkles button in AiChatPanel header → dialog (Thema/Klasse/Dauer/Schwerpunkt) → `ai_structured` with lesson-table schema (title/objectives/phases[5 fields]) → preview → insert as native Tiptap table. Includes: **KB selector** (3 native selects: subject/grade/topic, defaults from chat's DB selection; falls back to old Ollama-side subject_db_query until P3 lands in UI path) and **method bank injection** (always rides along, framed "Referenz, keine Vorgabe"). **Verified working by user.**
- i18n: all new keys in en+de (693-696 keys, `verify:i18n` green). Creativity options key bug fixed (`0.7` → `0_7` — resolver dot-splits keys).

**P2 — structured output** (partially — `ai_structured` + draft generator done; ChatContextBar live-ctx partially done)
- Editor budget block reads live ctx from `ai_engine_status` (engine status `ctx`) and refreshes budget with exact `ai_count_tokens` counts after send. `ChatContextBar.tsx` itself unchanged (reads store's `chatContextBudget` — works).

### ⚠️ IN PROGRESS / JUST LANDED, NOT COMMITTED (working tree as of handoff)

**P3 — RAG v2 backend (all compiles, clippy `-D warnings` green, 9 cargo tests pass)**
- `Cargo.toml`: added `rusqlite 0.32 (bundled)` + `fastembed 4.9` (→ `ort 2.0-rc9` transitive, `hf-hub`, `tokenizers` in lock file).
- `src-tauri/src/ai/embeddings.rs` (NEW): in-process bge-m3 ONNX (Xenova/bge-m3 `model_quantized.onnx`, **569,694,530 bytes, sha256 0826f8c1ab9edf1801db86c61919d4d108e8bfc0b809ec823ad366882ff0b77d**; tokenizer.json sha 6710678b…; tokenizer_config sha 328a00a9…; config sha 04ba1697…). `ensure_embedder()` downloads all 4 files on first use into `app_data_dir/emb-models/` (never bundled), builds session via `try_new_from_user_defined` with `with_max_length(512)`. `embed_texts()` → 1024-dim vectors. Statics: `embed_model_static()` / `embed_ensured_static()`.
- `src-tauri/src/subject_db/store_sqlite.rs` (NEW): single `<vault>/SubjectDBs/index.db` — schema: `chunks` (doc_key=subject/grade/topic/file, hierarchical cols, page, lang, text) + `vecs` (L2-normalized f32 LE blob) + `fts` (FTS5, external content, unicode61, insert/delete triggers) + `delete_document`/`delete_hierarchy`/`replace_document` (transactional) + `dense_search` (dot product, filtered) + `fts_search` (bm25, quoted-prefix terms) + `fuse` (RRF k=60) + `chunk_count_by_hierarchy` + `embedded_sources`.
- `subject_db/mod.rs` REWIRED:
  - `process_and_embed_pdf(path, filename, meta, vault_path)`: pdf → chunk → `ensure_embedder` → `run_blocking(embed_texts)` → L2-normalize → `replace_document`. SQLite write happens in a short non-async scope (Connection must never cross await — rusqlite is !Send).
  - `subject_db_scan_import`: opens index.db once for pre-scan of existing sources, threads `vault_path` down, no Connection across awaits.
  - `subject_db_query`: hybrid — `ensure_embedder` → query embed → `dense_search ∪ fts_search (2×top_k)` → RRF fuse → map to legacy `ScoredChunk` shape (id=chunk_id, source=filename, page). **API shape unchanged — frontend untouched.**
  - `subject_db_delete_file/delete`: also purge SQLite rows.
  - `subject_db_list`: chunk counts + embedded-status from SQLite (GROUP BY query + read-only conn).
  - `subject_db_diagnose`: embedder-ready = ONNX file exists (no Ollama probe).
  - `init_subject_db(app)` called in lib.rs setup (`app.handle()`).
  - `FolderMeta` has NO vault field (it was added then removed — vault threads as `&str` param). Old `embed.rs` + `store.rs` (chunks.json era) **DELETED**. `ChunkWithEmbedding` kept only as `#[allow(dead_code)]` (legacy import in store.rs... **NOTE: store.rs was deleted — if `ChunkWithEmbedding` reference errors appear, remove the struct from mod.rs too**).
- `pdf.rs` FIXED (two found-in-review bugs): `extract_text_by_pages()` — real page numbers (was hardcoded `page_num: 1` for whole doc); `pdftoppm`/`tesseract`/`where` calls now use `crate::command_for()` (no more console-window flashes on Windows).

### ❌ NOT DONE YET (the actual to-do list)

**IMMEDIATE (before anything else):**
1. **The app currently fails to open the UI**: last session ended with the window showing `ERR_CONNECTION_REFUSED` because the exe was launched directly without the Vite dev server, and multiple zombie TeacherPro/node processes were killed. All processes are cleaned (0 TeacherPro procs, port 1420 free). **Do a single clean start**: `cmd.exe /c start /min cmd /c "cd /d C:\Users\panag\Documents\GitHub\TeacherPro && npm run tauri dev > C:\Users\panag\AppData\Local\Temp\opencode\tauri-dev-out.log 2>&1"` (or reuse `C:\Users\panag\AppData\Local\Temp\opencode\run-tauri-dev.cmd` which contains exactly that). Wait ~30-60 s for Vite + cargo, then verify: process `TeacherPro` alive, `http://localhost:1420` responding.
2. **Run `npm run verify:i18n` + `npm run build` + `cargo clippy -- -D warnings` (in src-tauri)** before first commit of P3 state — all were green at last check but re-verify.
3. **Commit P3 backend state** (see message template in §3).

**P3 REMAINING (backend is done; these are the UX/verification bits):**
4. **Embedder first-run UX**: the 570 MB ONNX download has no UI progress (blocking download inside `ensure_embedder` on first scan/query). Add: pre-check in `subject_db_scan_import`/`query` that emits a "downloading embedding model" event, or a settings indicator. Minimum viable: a one-line log + docs note; acceptable interim behavior.
5. **Citation chips in chat**: `ScoredChunk.page` is now real — Editor already renders `[${r.source}, S.${r.page}]` headers in RAG context but the AiChatPanel doesn't show citation chips under answers yet. Optional polish.
6. **P3 GATE (must verify with real files)**: import a 100-page DE + EN textbook PDF via Datenbanken → scan → verify `index.db` exists in `<vault>/SubjectDBs/`, has chunks with correct page numbers, chat with DB selected retrieves the right sections. **Check GPU memory stays untouched during indexing** (fastembed is CPU; chat model must remain loaded).
7. **ONNX runtime packaging check**: run the packaged flow (`npm run tauri build` on Windows) OR at minimum confirm `ort`'s `download-binaries` placed `onnxruntime.dll` next to the debug exe and the app launches + embeds in dev. If the app fails to start with `STATUS_DLL_NOT_FOUND` → set `ort` feature `load-dynamic` + copy DLL via build script, or switch to `static` feature. **This is the #1 known packaging risk of P3.**

**P4 — NVIDIA CUDA pack + hardware tiers** (untouched)
8. `nvml-wrapper` detection (or reuse the existing nvidia-smi probe pattern) → offer CUDA engine pack (official `llama-b11669-bin-win-cuda-12.4-x64.zip` + `cudart-*.zip`, ~250-400 MB) as a downloadable "engine variant" via the existing downloader; `engine.rs` variant selection order (cuda-pack > bundled); Vulkan fallback on any failure.
9. Wire MTP spawn flags for Gemma workstation models (`mtp_file` fields exist in catalog; append `--model-draft <file> --spec-type draft-mtp --spec-draft-n-max 2` — CUDA/Metal only, NOT Vulkan; retry-once-without-MTP on load failure).
10. "Recommended for your PC" badges from detected RAM/VRAM; user has RTX 4090 + wants workstation tiers to be first-class for good-PC owners.

**P5 — Deletion & cleanup** (partially done: App.tsx block + embed.rs + store.rs + old settings UI already gone)
11. Delete remaining Ollama backend in `lib.rs` (~700 lines: `ai_ensure_runtime`, `ai_list_models`, `ai_start_model_install`, `ai_get_model_install_progress`, `ai_cancel_model_install`, `ai_install_model`, `ai_remove_model`, `ai_import_local_model`, `ai_generate_text`, `ai_generate_chat`, all `resolve_ollama_*`/`install_ollama_*`/`ensure_ollama_*`/`stop_ollama_server`/probe/realign functions, `AI_INSTALL_*` statics, `OLLAMA_WE_STARTED`). **Frontend still invokes `ai_ensure_runtime`/`ai_list_models` etc. from SettingsModal legacy handlers — those were partially removed; grep `invoke("ai_` in src/ and delete dead paths. Also `ai_ensure_runtime` invoke may still exist in SettingsModal — remove.**
12. Remove `AiProvider` from store.ts + its dead settings remnants; `rg -i ollama src src-tauri` → 0 hits.
13. Remove the old "Set Up Runtime Automatically"/legacy model handlers in SettingsModal if still present (`handleEnsureRuntime`, `syncInstalledModels`, `TERMINAL_INSTALL_STATUSES`, `AiModelInstallProgress` were deleted in the P1 overhaul — verify).
14. Update `docs/AI_IMPLEMENTATION_PLAN.md` (mark superseded → point to AI_V3_PLAN.md); release notes.
15. CI workflows: add `fetch:engines` step before tauri-action in build-cross-platform.yml + release.yml; macOS codesign/notarize step; `check-catalog-parity` script (catalog.rs ↔ modelCatalog.ts) optional.
16. Legacy `chunk.rs` language detection (hardcoded `"de"` at chunk language field — plan says use `whatlang`; current code still hardcodes German).

## 2. Key facts any continuation must know

- **Dev run**: use `C:\Users\panag\AppData\Local\Temp\opencode\run-tauri-dev.cmd` (via `Start-Process cmd /c`), NEVER bare `target\debug\TeacherPro.exe` (needs Vite on 1420). Logs: `C:\Users\panag\AppData\Local\Temp\opencode\tauri-dev-out.log`.
- **Do not kill node.exe indiscriminately** — filter by command line (vite/tauri).
- **The user is testing interactively** — after each chunk, build + relaunch + give them a test checklist. They found: download/resume works, streaming works, draft generator works. They will find more issues; fix fast, keep gates green.
- **PowerShell quoting traps**: JS/JSX strings with backticks/braces break inline PS — write temp .mjs scripts (in `C:\Users\panag\AppData\Local\Temp\opencode\`) and `node` them for any nontrivial file surgery. This bit us repeatedly.
- **rusqlite::Connection is !Send** — never hold across `.await`. Pattern used: open conn in a block scope, do the work, drop, then await.
- **Engine spawn flags** (do not add `-ngl`!): `--jinja --no-webui -m <model> -c <ctx> -np 1 -fa on -ctk q8_0 -ctv q8_0 --host 127.0.0.1 --port <ephemeral> --api-key <uuid>`.
- **ureq v2**: `.timeout()` = whole-request — never use on streams; use `timeout_connect` + `timeout_read`.
- **Gates**: `npm run build`, `npm run verify:i18n` (+typography+scrollbars), `cargo clippy -- -D warnings` (in src-tauri), `cargo test`. All green at handoff except as noted in §1.
- **Model data**: all HF URLs/sha256 in `catalog.rs`/`embeddings.rs` were API-verified 2026-10-17. If a download 404s later, re-check the repo (unsloth repos move files occasionally).
- **Commit style**: conventional-ish, matches repo (see `git log`). Work in small commits; the user asks for commit+push explicitly.

## 3. Suggested next commits

1. `AI v3 (P3): in-process bge-m3 embeddings + SQLite hybrid RAG store, pdf page-number fixes` — current working tree after gates re-verified.
2. `AI v3 (P3 UX): embedder first-run progress + citation chips` — items 4-5.
3. `AI v3 (P4): NVIDIA CUDA engine pack + MTP wiring + hardware recommendations` — items 8-10.
4. `AI v3 (P5): remove Ollama backend remnants, CI engine fetch, docs` — items 11-16.

## 4. Context docs

- `docs/AI_V3_PLAN.md` — full design (engine/packaging/RAG/model research appendices). Trust §3.3 flags and §3.5 embeddings as updated 2026-10-17; Appendix A line anchors are stale now (code moved) — symbols still valid.
- Review round history (Gemini): round 1 traps verified + incorporated (`--fit` semantics, lazy-mode, ort packaging, fastembed user-defined init); round 2 source contradictions fixed (pdf page numbers, ureq timeouts, typography invariants). Round 3 was declined — diminishing returns.
