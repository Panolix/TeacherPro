# TeacherPro AI v3 — Architecture & Step-by-Step Implementation Plan

Last updated: 2026-10-17
Status: Approved design — supersedes `AI_IMPLEMENTATION_PLAN.md` (Ollama era)
Scope: Full AI-stack revamp. Clean slate, no backward-compatibility shims. Existing Ollama installs and previously indexed `chunks.json` vaults are NOT migrated.
Reviewer note: for product context read §2 + Appendix F before judging; judgment targets are in F.8. For implementation context read Appendices A-C.

---

## 1. Why (audit summary of the current stack)

What exists today (v2.7.1, all references verified against code):

- ~700 lines of Ollama lifecycle management in `src-tauri/src/lib.rs`: binary resolution (:524), auto-install via winget/brew/curl (:813), server start/poll (:357), stop with `osascript`/`pkill` hacks (:419), hardware probe via `nvidia-smi`/`rocm-smi` (:226), CPU-mode "realign" server restarts (:462).
- `App.tsx:62-67` fires `ai_ensure_runtime` 3 s after launch → can silently install Ollama on the user's machine. Worst-in-class dependency for a school app.
- All generation is `stream: false` with 300 s timeouts (lib.rs:1765, 1906) → frozen-spinner UX.
- Embeddings (`bge-m3`, 1024-dim) share the same Ollama daemon as the chat model (`subject_db/embed.rs:34`) → indexing a PDF swaps the chat model out of VRAM.
- Vector store is per-topic `chunks.json` with brute-force cosine (`subject_db/store.rs`).
- RAG context budget is a chars÷4 token guess (`Editor.tsx:1312`).
- `AiProvider: "ollama" | "direct-download"` in `store.ts:80` — `direct-download` is dead code.

Problems this revamp eliminates: external runtime install, daemon lifecycle, port conflicts, model-swap thrash, no streaming, opaque model management, hardware-probe complexity.

## 2. Goals / Non-goals

**Goals**
1. Zero external installs. Nothing is winget'd/brew'd/curl'd onto the user's machine. Teacher downloads TeacherPro, clicks one button, AI works.
2. Exactly one app-owned process (llama-server sidecar), lazy-started, killed on exit, zero processes when AI is unused.
3. Streaming everywhere (chat token-by-token; rewrite/translate at least spinner-with-progress).
4. Embeddings + reranking in-process (ONNX, CPU) — never compete with the chat model for GPU memory.
5. Better retrieval: SQLite + FTS5 + vectors, hybrid search, optional reranker, exact token budgets via `/tokenize`, citations.
6. Structured output via JSON-schema grammar enforcement for lesson plans / mindmaps / method-bank matching.
7. CUDA accel pack as an optional on-demand download for NVIDIA dGPU users; Vulkan baseline for everyone.

**Non-goals**
- Migrating users' existing Ollama models or `chunks.json` vectors.
- Model training, cloud providers, telemetry.
- Supporting every llama.cpp backend (CUDA/ROCm/SYCL/OpenVINO matrices) — baseline + CUDA only.

## 3. Target architecture

```
┌──────────────────────────── frontend (React) ────────────────────────────┐
│  useAiEngine hook · SettingsModal AI tab · AiChatPanel (streaming)       │
│  invoke(...) once-per-action  ·  listen("ai-stream-*") for token events  │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ IPC (invoke + events)
┌───────────────────────────────▼───────────────────────────────────────────┐
│ src-tauri/src/ai/                                                        │
│  engine.rs      lifecycle state machine, spawn/kill, /health polling     │
│  downloader.rs  resumable ranged GET + SHA-256 + free-disk checks        │
│  client.rs      OpenAI-compatible client: chat, stream relay, /props,    │
│                 /tokenize, json_schema, chat_template_kwargs             │
│  catalog.rs     model + engine-variant registry (Rust mirror of TS)      │
│  embeddings.rs  fastembed (ONNX, CPU): embed + optional rerank           │
│  store.rs       SQLite (FTS5 + vector blobs) per vault                   │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ HTTP on 127.0.0.1:<ephemeral>          ┌───────────────┐
                └───────────────────────────────────────►│ llama-server  │
        bundled: Vulkan (win/linux) · Metal (mac-arm)    │ (sidecar,     │
        optional download: CUDA pack (NVIDIA dGPUs)      │  pinned tag)  │
                                                         └───────────────┘
```

### 3.1 Engine layer

- **Engine binary is data.** Pinned llama.cpp release tag in one place (`catalog.rs` + `scripts/engine-config.json`). Each app release bumps the pin deliberately.
- **Bundled baseline** (ships in installer, ~35-60 MB total):
  | Variant | Source artifact | Backend |
  |---|---|---|
  | Windows x64 | official `llama-*-bin-win-vulkan-x64.zip` (~33 MB) + shipped backend DLLs | Vulkan → CPU fallback |
  | Linux x64 | official `llama-*-bin-ubuntu-vulkan-x64.tar.gz` | Vulkan → CPU fallback |
  | macOS arm64 | official `llama-*-bin-macos-arm64.tar.gz` (Metal embedded) | Metal |
  | macOS x64 | official `llama-*-bin-macos-x64.tar.gz` | CPU (Accelerate/AVX2) |
- **CUDA accel pack** (Windows first, on demand): official `llama-*-bin-win-cuda-12.4-x64.zip` + `cudart-*.zip` (~250-400 MB) downloaded into `app_data_dir/engines/cuda/` with the same resumable downloader used for models. Selected automatically when an NVIDIA dGPU is present (`nvml-wrapper` detection + VRAM size for tier advice). Any failure (missing, corrupt, old driver) → silently falls back to Vulkan + repair job.
- **No ROCm/SYCL/OpenVINO variants.** Vulkan is the correct AMD/iGPU backend in llama.cpp; the others add hundreds of MB for negligible audience gain.

### 3.2 Packaging (verified mechanics — read carefully)

- **Do NOT use `externalBin`.** Tauri `externalBin` places the exe next to the app executable while `resources` land in a different `$RESOURCE/` dir — Windows DLL search would fail for the DLL-carrying engine builds, and the `-target-triple` suffix dance breaks for macOS universal binaries.
- **Use `bundle.resources` only**: bundle the entire engine directory (binary + DLLs/shaders) as `resources/engines/<variant>/`. Resolve at runtime via `app.path().resource_dir()?.join("engines")` and spawn with plain `std::process::Command` (reuse the existing `command_for()` helper, lib.rs:81-94, which already handles `CREATE_NO_WINDOW`). No `tauri-plugin-shell`, no `shell:*` capabilities needed (Rust-side spawn bypasses the ACL).
- **Unix exec bit**: resources can lose `+x` — set `PermissionsExt` on first spawn.
- **macOS**: embedded engine binary must be re-signed (hardened runtime) and the app notarized, or Gatekeeper blocks teachers. Add a CI codesign step; if no Apple Developer ID is available, document the `xattr -d com.apple.quarantine` workaround in release notes and expect Mac friction.
- **Windows AV**: unsigned `llama-server.exe` can trip Defender heuristics on locked-down school machines. Recommend code signing (e.g., Azure Trusted Signing) before wide distribution.

### 3.3 Process & connection layer

**State machine** (Rust `engine.rs`, managed in Tauri state):

```
Idle → Starting → LoadingModel (health 503) → Ready
                     │                          │
                     ▼                          ▼
                  Failed(exit code) ──► auto-fallback to Lite tier
Any state → Stopped (user action or app exit → RunEvent::Exit → kill)
```

- **Port**: bind `TcpListener` on `127.0.0.1:0`, take the assigned port, pass `--port`. No fixed ports, no collision with a teacher's own Ollama (which we never touch).
- **Readiness**: poll `GET /health` every 250 ms; 503 `{"message":"Loading model"}` is the real loading signal; 200 = Ready. Timeout (120 s) → kill + Failed.
- **Flags** (pin-aware, verified): `--jinja -m <path> -c <ctx> -np 1 -fa on -ctk q8_0 -ctv q8_0 --host 127.0.0.1 --port <p> --api-key <uuid-v4>`; MTP per §3.4 gating (`--model-draft <file> --spec-type draft-mtp ...` only when catalog carries a draft file *and* backend allows); `--spec-type ngram-simple` fallback otherwise.
- **Memory fitting — never pass `-ngl`** (Gemini review, verified upstream): llama.cpp's `--fit` (default **on** since b7410, #16653) auto-places layers to respect a per-device free-memory margin (`--fit-target`, default 1024 MiB), shrinking *unset* ctx first (floor `--fit-ctx 4096`), then moving layers to RAM. **Passing any `-ngl` disables fit** → hard OOM on small GPUs. We pass explicit `-c` for deterministic ctx (fit respects it) and leave `-ngl` at its `auto` default. Optional low-RAM mode (Settings toggle, default off): `-lzm on` (`--lazy-mode`) streams per-layer-embedding tensors from disk for Gemma 4 E-series — measured cost ~8-11% t/s for ~1.2-1.9 GB RAM savings; `auto` only applies to tensors >4 GiB (i.e., not E-series PLE, so default stays eager/fast).
- **Context truth**: after Ready, `GET /props` returns the model's real limits — clamp all frontend ctx sliders to `n_ctx_train`-derived values from there, never trust catalog numbers (`-c` above model limit = server error).
- **Model switch** = kill + respawn with new model path (seconds on Mac; tolerate on Windows).
- **Crash handling**: read exit status on child exit → map to friendly error; if exit during a request, surface it in the stream channel; offer auto-restart on the Lite tier.
- **Streaming relay** (Rust `client.rs`): `POST /v1/chat/completions` with `"stream": true`, read SSE lines on a dedicated blocking thread. Route `choices[0].delta.reasoning_content` -> `StreamEvent{kind:"thinking"}` (llama-server `--jinja` + `--reasoning-format auto` extracts both <think>...</think> and `<|thought|>...<|/thought|>` into that field automatically); keep a defensive fallback tag-stripper on `delta.content` for both tag styles. **Batch-flush events every ~50 ms** via `app.emit("ai-stream-{requestId}", ChunkEvent)`; final event carries usage + finish reason.
- **ureq v2 timeout semantics** (review r2): SSE agent uses `.timeout_connect(10 s)` + `.timeout_read(120 s)` and **NO overall `.timeout()`** — the overall timeout spans send-until-stream-ends and kills long thinking streams mid-sentence.
- **Cancellation:** `Arc<AtomicBool>` checked per line/50 ms tick; command `ai_chat_cancel({requestId})` — dropping the ureq response body closes the TCP stream and aborts server-side slot generation (Stop button in AiChatPanel).

### 3.4 Model layer (researched picks, Oct 2026 — full rationale in Appendix E)

- Direct GGUF from Hugging Face, one `.part` → `sha256` verify → atomic rename.
- **Chat catalog (GGUF, official vendor or ggml-org repos, Apache 2.0):**

| Tier | Model | Weights | Min RAM | Thinking | Why this pick |
|---|---|---|---|---|---|
  | Lite | **Gemma 4 E2B it, Q4_K_M** + `mtp-*.gguf` draft | ~2.9 GB (5.1B total incl. PLE) | 4 GB | yes (`enable_thinking`) | 60-90 t/s even on old iGPUs, sub-second TTFT; thinking-capable micro model; **ctx cap 128K (E-series)**; optional `-lzm on` for tight RAM |
| Lite alt | Qwen3.5-2B, Q4_K_M | ~2.3 GB | 4 GB | yes | Stronger German than E2B; ~70 t/s |
| Balanced (default) | **Qwen3.5-4B, Q4_K_M** | ~2.7 GB | 8 GB | yes | Hybrid DeltaNet arch, 262K context; best small-file long-doc comprehension; ~32 t/s on GTX 1650-class |
| Balanced alt | Gemma 4 E4B it, Q4_K_M | ~4.5 GB (8B total incl. PLE) | 8 GB | yes | 128K ctx cap; ~90K ctx headroom, ~57 t/s on M-class, multimodal-capable family |
| Pro | **Qwen3.5-9B, Q4_K_M** | ~5.6 GB | 12 GB | yes | Best quality-per-8GB-VRAM pick of Oct 2026 (~46K ctx alongside); vision encoder included |
| Pro alt | Gemma 4 12B, Q4_K_M | ~7.4 GB | 16 GB | yes | 256K context (reads whole lesson-plan units in one shot), image+audio capable (separate `mmproj` file, optional) |
| XL (opt-in) | gpt-oss-20b, MXFP4 native | ~12.1 GB | 16 GB **VRAM** | `reasoning_effort` knob | NVIDIA dGPU machines; adjustable reasoning effort, strong structured output |
| XL opt 2 | Gemma 4 26B-A4B MoE, Q4_0 | ~14.6 GB | 24 GB | yes | 97.9% local accuracy ≈ GPT-5.4, MoE-fast (~60 t/s on M5), full 256K window |
| XL opt 3 | **Qwen3.8-27B dense, UD-Q4_K_XL/IQ4_XS + `mtp-*.gguf`** | ~14-19 GB | 16-24 GB VRAM | yes | The CUDA-MTP champion: 40-84 t/s on 16 GB cards, 130-170 t/s on 24 GB+ (see §3.4 MTP rules); Q6_K = quality option |
| XL opt 4 | Qwen3.6-35B-A3B MoE, Q4_K_M | ~20.4 GB | 32 GB VRAM / 24 GB Mac | yes | Workstation tier; ~126 t/s measured on M5 Max |

- **AVOID on our engine:** `GLM-5.3-Flash` (needs 128 GB), `Qwen 4` (announced 22 Sep 2026, no weights shipped), `Qwen3.8-Flash-Next` mirrors (no verified official card; its MTP path is still an unmerged llama.cpp PR #27836/#28243 — re-evaluate when mainline merges).
- **Qwen3.8-27B — reinstated (correction):** the Aug 2026 "decode cliff" report was retracted (metric counted prefill as decode); Sept/Oct community matrix (68 rigs, sudoingX/qwen38-mtp) shows the MTP head **ships inside the GGUF** (`blk.*.nextn.*` tensors) and gives +33-145% decode via `--spec-type draft-mtp -md mtp-*.gguf`: 84 t/s on RTX 4070 Ti 16 GB (IQ3_XXS, draft 3), 130-170 t/s on RTX 5090, 46-54 t/s on ROCm R9700. Added to XL tier below.
- **EU alternatives (sub-table — same engine, same catalog mechanics; for schools where vendor origin / EU procurement matters; sources in Appendix E.4).** All Apache 2.0. Catalog entries carry `origin: "eu" | "us" | "cn"` so the UI can group/flag them:

| Role | Model (GGUF source) | Weights | Min RAM | Notes |
|---|---|---|---|---|
| EU Lite | Ministral 3 3B Instruct Q4_K_M (**official** `mistralai/Ministral-3-3B-Instruct-2512-GGUF`) | ~2.0 GB | 6 GB | Vision input; 256K ctx label but GQA KV (104 KiB/token) makes practical ctx modest |
| EU Balanced | Ministral 3 8B Instruct Q4_K_M (**official** GGUF) | ~5.2 GB | 12 GB | Native function calling + JSON in 11 langs; honest tradeoff: GQA KV grows 3-4x faster than Qwen3.5's hybrid attention — ~14K ctx alongside on an 8 GB card vs ~46K for Qwen3.5-9B |
| EU Pro | Ministral 3 14B Instruct Q4_K_M (**official** GGUF) | ~8.2 GB | 16 GB | Mistral rates it ≈ Mistral Small 3.2; 256K ctx label, same KV caveat (~5.4 GB for one 32K session) |
| EU translation specialist | EuroLLM-22B Instruct (2512 rev, community GGUF e.g. bartowski) | ~13-14 GB Q4 | 16 GB VRAM | Best fully-open EU model; translation across all 24 EU languages **matches/beats Gemma-3-27B & Qwen-3-32B** (WMT24++/FLORES); 32K ctx; fits the translate/rewrite role on workstation-tier machines |
| EU/DE sovereignty pick | Teuken-7B Instruct commercial v0.4 (Apache 2.0; Fraunhofer/DFKI/TU Dresden, BMWK-funded) | ~4-5 GB Q4 | 8 GB | Pretrained natively in all 24 EU languages, German/English-centric tuning; measured EU21 avg ≈ Llama-3.1-8B — below Qwen3.5/Gemma 4 quality, but the strongest German-public-procurement story (GGUF: community/QuantFactory) |
| EU flagship (footnote) | Mistral Small 4 119B MoE | NVFP4 70.8 GB / low-bit ≈40 GB | 96 GB+ | Server-class only; included in research for completeness — 89.6% on local bench, `reasoning_effort` per-request, MLA KV is tiny (22.5 KiB/token) |

- Ministral 3 also ships dedicated **Reasoning variants** (3B/8B/14B-Reasoning GGUFs, always-think). v3 standardizes on Instruct + per-request thinking toggles; add a Reasoning variant later only if toggle-based thinking proves insufficient on Pro tiers.

- **Task routing** (reuse the existing separate chat/rewrite selectors in SettingsModal:595-632):

  - Rewrite/translate → Balanced tier, thinking **off** (thinking adds latency, no quality gain for short rewrites)
  - Chat w/ RAG → Balanced or Pro, thinking off by default
  - Lesson-plan analysis / curriculum deep-dive → Pro/XL, thinking **on** (thinking "repairs reasoning failures in small configs" per measured runs; only enable where the model has room to finish within `num_predict`)
- **Thinking control** (all verified against llama-server): Qwen3.5/Gemma 4 via per-request `chat_template_kwargs: {"enable_thinking": bool}`; gpt-oss via `reasoning_effort: "low"|"medium"|"high"`; Granite 4.2 has per-request thinking toggles. Keep the defensive `<think>` stream filter regardless.
- **Speculative decoding (free speed, backend-gated):** Gemma 4 ships separate `mtp-*.gguf` draft heads — `--spec-type draft-mtp --spec-draft-n-max 2` is **lossless and 1.2-2.2x faster, works on Metal too** (measured on M5). Qwen3.8's MTP head ships inside the GGUF but **measured as a regression on Metal (M4 Pro: 12.9→7.6 t/s) and on Vulkan (R9700: prefill collapse)** — enable it **only on the CUDA pack** (also strong on ROCm). Fallback for any model: `--spec-type ngram-simple` (no draft file). Engine rules: catalog entry carries `mtpDraftFile?` + `mtpBackends: ["cuda"] | ["cuda","rocm","vulkan","metal"]`; `engine.rs` appends `--spec-type draft-mtp --spec-draft-n-max {2|3} --spec-draft-p-min 0.75` (plus `--model-draft <file>` **only when** the GGUF family ships MTP as a separate file — some GGUFs embed `blk.*.nextn.*` tensors and need no `-md`; measured usage shows both patterns, incl. `-md` + `draft-mtp` together on unsloth splits — verify exact semantics on the pinned build in the P0 smoke test) only when the resolved backend is in the allow-list, **and retries once with MTP stripped on the same model** before falling back further. Known Qwen3.8 memory math: GDN recurrent-state = slots × (draft+1) × 150 MB — cap `-np 1..2` when MTP is on; `n-max` 2-3 is the measured sweet spot.
- Catalog entries carry: `id, name, filename, downloadUrl, sha256, sizeBytes, minRamGb, defaultCtx, supportsThinking, thinkingControl: "chat_template_kwargs" | "reasoning_effort", mtpDraftFile?, mtpBackends?, mmprojFile?, descriptionEn/De`.
- Free-disk check before every download (`fs4` crate) with a clear error.

### 3.5 Embeddings & retrieval (RAG v2)

- **Default embedder: bge-m3 (in-process fastembed, `Bgem3Embedding` with the Q quantized ONNX, CPU-only).** Rationale (measured, Appendix E): 1024-dim dense **plus sparse and ColBERT vectors in a single forward pass** — it's the only open model doing all three, which makes true hybrid retrieval free; German quality holds within 2-4 points of its English score (the deciding factor vs English-specialist models); MIT license; 8192-token context. Dimensions for the store: **1024 dense** (+ optional sparse side-table).
- **Delivery (not bundled):** the Q-ONNX weights (~550 MB) are **auto-downloaded on first RAG index / first model download** via `downloader.rs` into `app_data_dir/emb-models/` — keeps the installer within the ≤100 MB growth budget (F.5.6). Embedding stays in-process (CPU ONNX) once weights exist; zero extra processes.
- **Packaging caveat (fastembed → ort, from Gemini review):** fastembed depends on `ort`, which links prebuilt `onnxruntime` shared libraries (`onnxruntime.dll` / dylib / so). §6's "no ort" is corrected: **ort arrives transitively**. `engine.rs`-adjacent packaging task in P3: ensure the onnxruntime shared lib ships next to the app binary (bundle config), decide `download-binaries` vs `load-dynamic` per platform, and verify on a clean machine (STATUS_DLL_NOT_FOUND test). This also favors splitting macOS builds per-arch (see §7).
- **Init path (review r2):** initialize fastembed with `TextEmbedding::try_new_from_user_defined(UserDefinedEmbeddingModel::new(onnx_bytes, tokenizer_files))` fed from files fetched by our own `downloader.rs` into `app_data_dir/emb-models/` — do NOT rely on fastembed's internal `hf-hub` downloader (no cancel token, no progress events, no custom dir, and it would bypass R14 proxy handling).
  - Alternatives in the catalog as swappable entries: `Qwen3-Embedding-0.6B` (best measured multilingual MTEB, Apache 2.0, 32k ctx — but **requires** `Instruct:` query prefix + last-token pooling ceremony; GGUF-only via a second `llama-server --embedding --pooling last` instance) and `EmbeddingGemma-300M` Q4 (768-dim, ~200 MB — the ultra-light bundled option if installer size wins over quality).
  - Deprecate the e5-small idea from the first draft — dated vs the above, weaker German.
- **Reranker (optional, on-demand download, off by default):** `bge-reranker-v2-m3` via fastembed `TextRerank` (multilingual, CPU ONNX) or `Qwen3-Reranker-0.6B` GGUF. Do not bundle.
- **Storage**: single SQLite per vault at `<vault>/SubjectDBs/index.db` (`rusqlite` with `bundled` + FTS5):
  - `chunks(chunk_id, doc_id, subject, grade, topic, page, lang, text)`
  - `vecs(chunk_id, vec BLOB)` — brute-force cosine in Rust at teacher scale (≲100k chunks) is fast and dependency-free
  - `fts` FTS5 virtual table over `text`
- **Hybrid retrieval**: bge-m3 sparse ⊕ FTS5 BM25 ∪ dense cosine → reciprocal rank fusion → optional rerank top-50→top-8.
- **Chunking**: 256-512 tokens, paragraph/heading-aware, **detect language per chunk** (fixes the hardcoded `"de"` at chunk.rs:27).
- **Context assembly**: exact budgets via `POST /tokenize` (replaces chars÷4), citation slots `[{chunkId, page}]` returned with every RAG answer.

### 3.6 Structured output

- Lesson plans, mindmap JSON, method-bank matching use `response_format: {type:"json_schema", schema:{...}}` (grammar-enforced by llama-server — invalid JSON impossible). Define TS + Rust schema pairs per tool.

## 4. File-by-file change map

**Create**
| File | Purpose |
|---|---|
| `src-tauri/src/ai/mod.rs` | module root, Tauri state types |
| `src-tauri/src/ai/engine.rs` | lifecycle state machine, spawn/kill, health/props |
| `src-tauri/src/ai/downloader.rs` | resumable downloads + SHA-256 + disk checks |
| `src-tauri/src/ai/client.rs` | OpenAI-compat client, SSE relay, tokenize, schema calls |
| `src-tauri/src/ai/catalog.rs` | engine variants + model tiers (mirror of TS) |
| `src-tauri/src/ai/embeddings.rs` | fastembed embed + optional rerank |
| `src-tauri/src/subject_db/store_sqlite.rs` | SQLite/FTS5 store (replaces store.rs) |
| `scripts/fetch-engines.mjs` | CI helper: fetch pinned engine artifacts + verify |
| `src/hooks/useAiEngine.ts` | engine status + stream event subscription |
| `docs/AI_V3_PLAN.md` | this document |

**Rewrite**
| File | Change |
|---|---|
| `src-tauri/src/lib.rs` | delete all Ollama code (:226-2021 sections listed in audit); register new `ai_*` commands; keep `command_for`, vault/fs commands |
| `src-tauri/src/subject_db/mod.rs` | route 7 commands to SQLite store + fastembed; `/props`-aware ctx |
| `src-tauri/src/subject_db/chunk.rs` | token-based chunking, language detection |
| `src-tauri/src/subject_db/pdf.rs` | **fix found-in-review bugs:** use `pdf_extract::extract_text_by_pages()` (exists in 0.12.1, verified on docs.rs) so digital PDFs get real per-page numbers — current code hardcodes `page_num: 1` for the whole document, which would make every RAG citation chip say "Page 1" (pdf.rs:24-31); replace all 3 raw `std::process::Command::new` calls (:79, :113, :145) with `crate::command_for()` — currently they flash console windows on Windows; add ligature/hyphenation sanitize; degrade gracefully when tesseract absent (R9) |
| `src/components/editor/ChatContextBar.tsx` | (found in review) reads static `modelCatalog.ts` numbers today — make it read live `ctx` from `ai_engine_status` (`/props`) and exact counts from `/tokenize` + `StreamEvent.usage` |
| `src/ai/modelCatalog.ts` | GGUF tier catalog + engine variant metadata (TS mirror of catalog.rs) |
| `src/components/SettingsModal.tsx` | AI tab: engine status card + tiered download UI (reuse 750 ms poll pattern, now over `ai_download_progress`) |
| `src/components/Editor.tsx` | chat via streaming events; RAG context via `/tokenize` budgets + citations; rewrite/translate via client v2 |
| `src/components/editor/AiChatPanel.tsx` | token-streaming render, collapsible thinking, citation chips |
| `src/store.ts` | remove `AiProvider`; add engine/model settings shape |
| `src/i18n/en.ts` + `de.ts` | new keys (verify-i18n enforces parity) |
| `src-tauri/tauri.conf.json` | add `bundle.resources: ["resources/engines/"]` only (embedder weights are on-demand downloads, NOT bundled — see §3.5/§11.1; an empty resources dir breaks `tauri build`) |
| `.github/workflows/build-cross-platform.yml` + `release.yml` | engine fetch step before tauri-action; macOS codesign/notarize |
| `docs/AI_IMPLEMENTATION_PLAN.md` | mark superseded, link here |

**Delete**
- All Ollama functions in `lib.rs` (probe, resolve, install, start/stop, ps parse, realign, import-modelfile, list/install/remove pull commands)
- `src-tauri/src/subject_db/embed.rs` (Ollama HTTP version — replaced by `ai/embeddings.rs`)
- Ollama references in `src/ai/modelCatalog.ts`, `App.tsx` auto-ensure block (:62-67), `ollama` entries in `store.ts`

## 5. New IPC contract

**Commands (invoke)**
```ts
ai_engine_status(): { state, modelId, port, ctx, backend, variant }
ai_engine_start({ modelId }): { ctx, backend }        // idempotent, waits Ready
ai_engine_stop(): void
ai_download_model_start({ modelId }): { downloadId }
ai_download_progress({ downloadId }): Progress        // reuse 750ms poll pattern
ai_download_cancel({ downloadId }): Progress
ai_generate_text({ modelId, prompt, temperature, systemPrompt, maxTokens }): string
ai_chat({ requestId, modelId, messages, temperature, maxTokens, thinking, ragChunks? }): void
                                                      // streams via events
ai_chat_cancel({ requestId }): void                   // sets AtomicBool; dropping the ureq body aborts the slot server-side
ai_import_local_model({ ggufPath, modelId })          // copy + register, no modelfile dance
subject_db_list/scan_import/add_pdfs/delete_file/delete/query/diagnose  // same signatures, new internals
```

**Events (listen)**
```ts
"ai-stream-{requestId}" → { kind: "chunk"|"thinking"|"done"|"error", text?, usage?, finish?, error? }
"ai-download-{downloadId}" → { received, total, state }   // optional push alternative to polling
"subject-db-progress"                                     // unchanged event name
```

## 6. Dependencies (Cargo.toml)

Remove: none required (ureq stays; no Ollama-specific deps exist).
Add: `rusqlite` (features `bundled`, includes FTS5), `fastembed` (brings `ort` + `tokenizers` + `hf-hub` transitively — see §3.5 packaging caveat), `sha2`, `fs4`, `nvml-wrapper`, `whatlang` (chunk language detection, <100 KB), `flume` (or std mpsc) for stream batching, `uuid` (already present — for per-spawn API keys).
Explicitly NOT added: `tauri-plugin-shell`, `reqwest`/`tokio` (tauri::async_runtime suffices; blocking ureq SSE on a dedicated thread + `Arc<AtomicBool>` cancellation), `llama-cpp-2`, `candle`, direct `ort` (transitive only).

## 7. CI/CD changes

1. `scripts/fetch-engines.mjs`: reads `scripts/engine-config.json` (pin tag + per-variant URL + sha256), downloads for the current runner, unpacks into `src-tauri/resources/engines/<variant>/`, verifies checksums, sets exec bits. Cached via `actions/cache` keyed on the pin tag.
2. macOS jobs: **drop `universal-apple-darwin` — build separate `aarch64-apple-darwin` and `x86_64-apple-darwin` artifacts** (Gemini review + ort/fastembed per-arch binaries make universal linking fragile; halves per-user download). `codesign --force --options runtime` the engine binary + notarize when signing creds exist.
3. Linux job: no extra runtime deps beyond standard distro Vulkan loader (document in release notes).
4. `release.yml`: same steps; attach engine manifest with checksums to the release for verification.

## 8. Phased implementation (each phase has a hard gate — do not stack phases)

**P0 — Engine skeleton** *(backend only; re-ordered per Gemini review)*
0. **Delete the `App.tsx:62-67` auto-`ai_ensure_runtime` block immediately** — it must not fire while P0-P4 are in flight.
1. `scripts/engine-config.json` + `scripts/fetch-engines.mjs`; add resources bundling to `tauri.conf.json`.
2. `ai/catalog.rs` (variants only), `ai/engine.rs` (state machine, ephemeral port, spawn with `--fit` semantics per §3.3, `/health` poll, kill on exit), `ai_engine_status/start/stop` commands.
3. **P0.5 — `ai/downloader.rs` + `ai_download_*` commands** (backend only; no UI) — needed before any chat test can load a model; also serves the embedder download in P3.
4. Gate: on all 3 OSes, `ai_engine_start` with a test GGUF reaches Ready; closing the app kills the process (verify in Task Manager / Activity Monitor / ps); smoke test passes with a model path containing `ü`/umlauts and a >200-char path (Windows UTF-16 argv check).

**P1 — Generation & streaming**
5. `ai/client.rs`: non-stream chat completion + `ai_generate_text` v2; wire Editor rewrite/translate.
6. SSE relay + `ai-stream-*` events + `useAiEngine` hook; wire `ai_chat` + `ai_chat_cancel` (Stop button) into `AiChatPanel` (batched flush, `Arc<AtomicBool>` cancellation, ≥120 s read timeout for slow iGPU prefill, thinking filter).
7. SettingsModal download UI (tiers, progress, cancel, SHA-256 verify) on top of the P0.5 downloader.
8. Gate: token-by-token chat on 8 GB iGPU laptop; rewrite path <2 s TTFT on Balanced tier; download survives network drop (resume works); Stop button aborts generation within ~200 ms.

**P2 — Structured output**
8. JSON schemas for lesson plan + mindmap + method-bank match; route those features through `json_schema` calls.
9. Gate: 100/100 schema-valid outputs on Balanced tier; malformed output impossible by construction.

**P3 — RAG v2**
10. `store_sqlite.rs` + re-import flow for PDFs; `chunk.rs` v2 (token chunking + `whatlang` language detect); **pdf.rs fixes from review r2** (`extract_text_by_pages` for real page numbers + `command_for()` instead of raw `Command::new`).
11. `ai/embeddings.rs` (bge-m3 Q-ONNX **auto-downloaded on first RAG index** per §3.5 — not bundled) + onnxruntime shared-lib packaging verification on a clean machine; hybrid retrieval + fusion; `subject_db_query` v2; `/tokenize`-budgeted RAG context; citation chips in chat; `pdf.rs` OCR degradation returns structured `ScannedPdfNeedsOcr` warning when tesseract absent.
12. Gate: index a 100-page DE + EN textbook PDF; hybrid query returns correct topic sections; indexing never loads/stops the chat engine (verify GPU memory untouched via `nvidia-smi`/Activity Monitor).

**P4 — NVIDIA CUDA accel pack**
13. `nvml-wrapper` detection (+ VRAM for tier advice); CUDA pack as a catalog entry in the downloader; variant selection order in `engine.rs`; Vulkan fallback on any failure.
14. Gate: on an RTX dGPU machine, pack auto-offered, downloads, engine uses CUDA (`/props` backend string); pull the pack → falls back to Vulkan cleanly.

**P5 — Deletion & cleanup**
15. Delete every Ollama function/path listed in §4; remove `AiProvider`; delete `embed.rs`; update `docs/AI_IMPLEMENTATION_PLAN.md` (superseded) + release notes.
16. Gate: `rg -i ollama src src-tauri scripts` → 0 hits in app code; `npm run verify:i18n` + `verify` scripts + `cargo clippy -D warnings` green; full manual pass on the 3 OS matrix.

## 9. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | Unsigned engine exe flagged by Defender/SmartScreen on school machines | Code signing (Trusted Signing); document exclusion steps meanwhile |
| R2 | macOS Gatekeeper blocks embedded binary | Re-sign + notarize in CI; release-note workaround if unsigned |
| R3 | Resources lose exec bit on unix | chmod on first spawn |
| R4 | HF outages / rate limits mid-download | resumable ranged GET, retries w/ backoff, SHA-256 pin |
| R5 | Full disk during multi-GB download | pre-download free-space check (`fs4`) |
| R6 | Model OOM / sidecar abort mid-request | exit-code capture → mapped toast + auto-fallback to Lite |
| R7 | `-c` exceeds model's real context | clamp from `/props` post-load; UI sliders bound to it |
| R8 | SSE flood overwhelms webview | 50 ms batched flush |
| R9 | **tesseract/pdftoppm OCR is itself an external dependency** (`pdf.rs:79-121` shells out; silently fails if absent) | Degrade honestly (P3): detect presence on PATH/common install paths; if absent + PDF <50 chars → structured `ScannedPdfNeedsOcr` warning in `subject_db_add_pdfs`/`diagnose`. v3.1 idea: OCR via the sidecar's own vision (Gemma 4/Qwen3.5 `mmproj`) |
| R10 | Engine/model format drift across app releases | single pinned tag, bumped deliberately per release; checksums everywhere |
| R11 | Localhost port abuse by other local processes (shared classroom machines) | `127.0.0.1` bind + ephemeral port + per-spawn random `--api-key` uuid (purely local — see §11.3 explanation; maintainer may veto) |
| R12 | ureq SSE robustness edge cases | dedicated thread + `Arc<AtomicBool>` cancel token checked per line; ≥120 s read timeout (slow iGPU prefill); dropping the body aborts server-side generation; integration test against real llama-server in P1 |
| R13 | Deep Freeze / roaming-profile / mandatory-reset classroom PCs wipe `%LOCALAPPDATA%` (models vanish on reboot) | Settings "Model storage folder" path picker (default `app_data_dir/models`; user/IT can point at a persistent local drive or `.teacherpro/models/` on external media) |
| R14 | School SSL-intercepting proxies (Zscaler/FortiGate/Sophos) break HF downloads | ureq uses the OS trust store (native/platform verifier), NOT bundled webpki-roots only — or downloads fail with InvalidCertificate behind MITM proxies |
| R15 | Fully offline / air-gapped schools | `ai_import_local_model` also accepts pre-downloaded GGUFs and engine/zip packs from a USB stick so IT can distribute models offline |
| R16 | Windows paths: non-ASCII usernames (`C:\Users\Müller\`), long paths | Rust `Command::arg(OsStr)` uses UTF-16 `CreateProcessW`; P0 gate includes a umlaut-path smoke test to verify the engine binary handles it |

## 10. Testing strategy

- **Unit (cargo test)**: downloader (resume at offsets, sha256 mismatch, disk-full), catalog mirror parity with TS (script compares both), chunker (token bounds, language split).
- **Integration (local, not CI)**: `scripts/smoke-engine.mjs` — starts engine with a pinned tiny model, runs `/health`, `/props`, stream + non-stream completion, `json_schema` call; run before each release.
- **CI**: existing `ci.yml` gates (tsc, clippy, i18n parity, verifiers) + a compile-only check that `resources/` paths resolve (fetch-engines dry run).
- **Manual matrix**: 8 GB Win iGPU laptop, 16 GB Win RTX laptop, 16 GB M-series Mac, 8 GB Intel Mac, Ubuntu + AMD iGPU.

## 11. Decisions & remaining open items

**Resolved (2026-10-17, Gemini review round 1 — rationale in the linked sections):**
1. Embedder delivery: **NOT bundled** — bge-m3 Q-ONNX (~550 MB) auto-downloads on first RAG index / model download (§3.5); installer stays within the ≤100 MB growth budget (F.5.6).
2. Reranker: **default-off, on-demand** (dense + sparse RRF + FTS5 is already the big leap).
3. Tesseract/poppler (R9): **degrade honestly** with `ScannedPdfNeedsOcr`; revisit as v3.1 multimodal OCR.
4. macOS packaging: **split per-arch DMGs** (drop universal); codesign + notarize when creds exist (§7).

**Still open (none block P0):**
5. **Loopback `--api-key`** (R11/§11.3): *clarification — this is NOT a cloud/API key.* It is a random UUID generated per spawn, used only between TeacherPro's own client and its own sidecar process on `127.0.0.1`; nothing leaves the machine, no account, no service. It exists because school computers are shared: without it, any other local process/user session could hit the engine port. Recommendation: **on** (5 lines of code, invisible to the teacher). Maintainer may veto — purely a local hygiene toggle, zero local-first implications either way.
6. macOS minimum OS target + whether to keep the Intel `mac-x64` CPU variant at all.
7. Whether v3.1 adds a multimodal path (Gemma 4 12B / Qwen3.5-9B `mmproj` files) for photo-of-worksheet understanding (and offline OCR of scanned PDFs, per R9) — architecture already supports it via the same sidecar.
8. Model storage folder picker UI (R13) — default `app_data_dir/models`; confirm UX before P1 Settings work.

---

# Appendix A — Current code map (v2.7.1, exact names & line numbers)

> Purpose: lets any assistant (or human) work against this plan **without file access**.
> Every name/line below was verified against the repository. Line numbers shift as edits land — treat them as anchors, re-grep by name when applying changes.

## A.1 `src-tauri/src/lib.rs` (crate `teacherpro_lib`, ~2011 lines)

**Infrastructure / helpers (KEEP or adapt):**
- `command_for()` — lib.rs:81-94 — wraps `std::process::Command` with Windows `CREATE_NO_WINDOW` (0x08000000). **v3: reuse for sidecar spawn.**
- `probe_hardware()` — :226-314 — `nvidia-smi` (incl. `C:\Program Files\NVIDIA Corporation\NVSMI\`, `C:\Windows\System32\`), Ollama CUDA dir check, `rocm-smi`/`rocminfo`. **v3: DELETE (replace with `nvml-wrapper` in P4).**
- `apply_preferred_backend_env()` — :320-342 — sets `OLLAMA_LLM_LIBRARY` (non-Windows only). **v3: DELETE.**
- `migrate_legacy_app_data()` — :1939-1964 — one-time copy of `teacherpro-settings.json` from `com.pano.temp-app`. **v3: KEEP untouched.**

**Ollama runtime management (v3: DELETE ALL):**
- `is_ollama_server_running()` — :345-353 — `GET {base}/api/version`, 2 s timeout
- `ensure_ollama_server_started()` — :357-416 — poll every 250 ms × 60 (15 s)
- `stop_ollama_server()` — :419-455 — macOS: `osascript "tell application \"Ollama\" to quit"` + `pkill -ix ollama`; Linux: `pkill -x ollama`; Windows: no-op
- `maybe_realign_managed_runtime_backend()` — :462-494 — restarts server if CPU-only w/ GPU present (called from generate commands :1733, :1863)
- `resolve_ollama_binary()` — :524-565 — PATH, `/opt/homebrew/bin/ollama`, `/usr/local/bin/ollama`, `/usr/bin/ollama`, `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`, `C:\Program Files\Ollama\ollama.exe`
- install-dir resolver — :567-595 — (macOS: `/Applications/Ollama.app/Contents/MacOS`)
- ANSI-strip progress parser — :673-807
- `strip_think_blocks()` — :703-714 — removes `<think>` spans
- `install_ollama_runtime()` — :813-867 — macOS `brew install --cask ollama` / `curl | sh`; Linux curl/wget script; Windows `winget install -e --id Ollama.Ollama` / `choco install ollama -y`
- `ensure_ollama_runtime()` — :869-896
- `parse_ollama_models()` — :898-912 — strips `:latest`
- Globals: `AI_INSTALL_STATES` — :68; `AI_INSTALL_CHILDREN` — :70
- `AiModelInstallProgress` — :27-33 — statuses: `not-started | preparing | installing | completed | failed | cancelled`

**Registered Tauri commands (invoke_handler block — :1975-2001):**

| Command | Defined | Signature | Frontend caller |
|---|---|---|---|
| `ai_runtime_status` | :1250-1277 | `async fn() -> AiRuntimeStatus` | **none** (dead) |
| `ai_runtime_diagnostics` | :1279-1348 | `async fn() -> AiRuntimeDiagnostics` | **none** (dead; i18n keys en.ts:586-598 unwired) |
| `ai_ensure_runtime` | :1350-1357 | `async fn() -> Result<String, String>` | App.tsx:64; SettingsModal.tsx:216, :293 |
| `ai_list_models` | :1359-1368 | `async fn() -> Result<Vec<String>, String>` | SettingsModal.tsx:217 |
| `ai_start_model_install` | :1370-1507 | `fn(model_id) -> Result<AiModelInstallProgress, String>` — spawns `ollama pull`, piped stdout/stderr, background thread | SettingsModal.tsx:245 |
| `ai_get_model_install_progress` | :1509-1516 | `fn(model_id) -> Result<AiModelInstallProgress, String>` | SettingsModal.tsx:187 |
| `ai_cancel_model_install` | :1518-1545 | `fn(model_id) -> Result<AiModelInstallProgress, String>` — kills tracked child | SettingsModal.tsx:259 |
| `ai_install_model` | :1547-1561 | `async fn(model_id)` — blocking pull | **none** (dead) |
| `ai_remove_model` | :1563-1573 | `async fn(model_id)` — `ollama rm` | SettingsModal.tsx:274 |
| `ai_import_local_model` | :1575-1698 | `fn(gguf_path, model_id)` — validates `.gguf` (:1585), temp modelfile `teacherpro_modelfile_` (:1631-1634), `ollama create -f` (:1661-1663) | SettingsModal.tsx:324-327 |
| `ai_generate_text` | :1700-1836 | `async fn(model_id, prompt, temperature: Option<f64>, system_prompt: Option<String>, enable_thinking: Option<bool>, num_ctx: Option<u32>, num_predict: Option<i32>) -> Result<String, String>` | Editor.tsx:1186-1194 |
| `ai_generate_chat` | :1846-1932 | `async fn(model_id, messages: Vec<ChatMessage>, temperature, enable_thinking, num_ctx, num_predict) -> Result<String, String>`; `ChatMessage { role, content }` :1840-1844; `developer`→`system` mapping :1889 | Editor.tsx:1456-1463 |

**Generation parameter contract (reproduce in v3 client):**
- temperature default 0.7, clamped 0-2 (:1725-1729); `num_ctx` default 8192, clamp 1024-131072; `num_predict` default 896, clamp 128-4096; prompt hard cap 30,000 chars (:1719)
- HTTP: synchronous `ureq` (feature `json`) inside `tauri::async_runtime::spawn_blocking`; base = `OLLAMA_HOST` env or `http://127.0.0.1:11434` (:346-347, :1735-1736, :1865-1866)
- `POST /api/chat` `stream:false` + `think` flag → :1765-1766, :1906-1908; fallback `POST /api/generate` → :1809-1823; thinking wrapped in tags when enabled → :1827-1832

**Lifecycle hooks (v3: replace bodies):**
- `setup` hook spawns thread → sleeps 1500 ms → `ensure_ollama_server_started()` — :2002-2011
- `RunEvent::Exit` / `CloseRequested` → `stop_ollama_server()` — :2014-2021
- Builder plugins: store :1969, os :1970, fs :1971, dialog :1972, opener :1973, clipboard :1974

**Non-AI commands (KEEP, don't touch):** `register_vault_root` :128, `greet` :1048 (dead), `allow_fs_scopes` :1053, `open_file_in_default_app` :1098, `print_pdf_file` :1135, `reveal_item_in_file_manager` :1241

## A.2 `src-tauri/src/subject_db/`

| File | Key items (line anchors) |
|---|---|
| `mod.rs` (772 ln) | `Chunk { id, text, source_file, page, subject, grade, topic, language }` :13-23; `ChunkWithEmbedding` :25-29; `ScoredChunk` :31-41; `const EMBEDDING_MODEL: &str = "bge-m3"` :87; base URL from `OLLAMA_HOST` :89-94; `subject_db_dir()` → `<vault>/SubjectDBs/<subject>[/<grade>[/<topic>]]/chunks.json` :96-98; `validate_segment()` blocks `..`,`/`,`\`,NUL on Windows :106-118 |
| mod.rs commands | `subject_db_list` :164-218; `subject_db_scan_import` :242-302 (emits `subject-db-progress` :261, :329); `subject_db_add_pdfs` :458-500; `subject_db_delete_file` :504-541; `subject_db_query` :545-585 (`top_k` clamp 1-50 :559); `subject_db_delete` :589-620; `subject_db_diagnose` :635-696 (`POST /api/show {"model":"bge-m3"}` :646-653) |
| `pdf.rs` (150 ln) | `pdf_extract::extract_text` first :24; if <50 chars → `pdftoppm -png -r 300` + `tesseract … -l deu+eng --psm 6` :79-121 (external CLI deps — see R9) |
| `chunk.rs` (171 ln) | `CHUNK_SIZE = 500` chars :5; `CHUNK_OVERLAP = 100` :6; min 20 :16; splits paragraph → newline → sentence → word :77-127; **`language: "de"` hardcoded** :27 (bug: breaks English vaults) |
| `embed.rs` (120 ln) | `embed_texts()` → `POST {base}/api/embed` :29-72; auto-pull `POST /api/pull` on 404 :74-115 (3600 s); model-missing detector :118-120. **v3: file deleted, replaced by `ai/embeddings.rs`** |
| `store.rs` (272 ln) | `StoredChunk` (flattened chunk + `embedding: number[]`) :6-11; brute-force cosine :42-69, :205-215; atomic write (tmp + rename, direct-write fallback) :140-181; corrupt stores quarantined as `*.corrupt-<unix>` :78-113. **v3: replaced by `store_sqlite.rs`** |

## A.3 `src/ai/modelCatalog.ts` (525 ln)

- `AI_MODEL_CATALOG` — :28-468 — 26 entries, all `source: "ollama-registry"`; ids: `granite4.2:3b`, `qwen3.5:4b`, `qwen3.5:4b-mlx`, `granite4.2:8b`, `lfm2.5:8b`, `ministral-3:8b`, `qwen3.5:9b` (**recommended default**), `qwen3.5:9b-mlx`, `gemma4:e2b`, `gemma4:e2b-mlx`, `gemma4:12b`, `gemma4:12b-mlx`, `ministral-3:14b`, `gemma4:e4b`, `gemma4:e4b-mlx`, `gpt-oss:20b`, `qwen3.6:27b`, `qwen3.6:27b-mlx`, `qwen3.8:27b`, `qwen3.8:27b-mlx`, `gemma4:26b`, `gemma4:26b-mlx`, `gemma4:31b`, `gemma4:31b-mlx`, `qwen3.6:35b`, `qwen3.6:35b-mlx`, `bge-m3` (embedding)
- Per-entry fields: id, name, tier (`small|medium|large`), capabilities (`multilingual|reasoning|low-latency|long-context|english-focused|apple-silicon` :2-8), estDiskMb, recommendedRam, `defaultNumCtx`/`maxNumCtx`, `numPredict`, `description`/`descriptionDe`
- `DEFAULT_AI_MODEL_ID = "qwen3.5:9b"` :470; `EMBEDDING_MODEL_ID = "bge-m3"` :471; `DEFAULT_MODEL_RUNTIME_DEFAULTS { defaultNumCtx: 6144, defaultNumPredict: 896 }` :473-476; thinking-ID set :478-500; `doesAiModelSupportThinking` :502; `getAiModelCatalogItem` :506; `getAiModelRuntimeDefaults` :510

## A.4 Frontend call sites (every `invoke` the frontend makes)

| Component / file | Line | Invoke | Args |
|---|---|---|---|
| `App.tsx` | 64 | `ai_ensure_runtime` | — (3 s after launch; **v3: delete block**) |
| `SettingsModal.tsx` | 216 | `ai_ensure_runtime` | — |
| `SettingsModal.tsx` | 217 | `ai_list_models` | — |
| `SettingsModal.tsx` | 187 | `ai_get_model_install_progress` | `{ modelId }` |
| `SettingsModal.tsx` | 245 | `ai_start_model_install` | `{ modelId }` |
| `SettingsModal.tsx` | 259 | `ai_cancel_model_install` | `{ modelId }` |
| `SettingsModal.tsx` | 274 | `ai_remove_model` | `{ modelId }` |
| `SettingsModal.tsx` | 288-300 | `handleEnsureRuntime` → `ai_ensure_runtime` | — ("Set Up Runtime Automatically") |
| `SettingsModal.tsx` | 324-327 | `ai_import_local_model` | `{ ggufPath, modelId }` |
| `Editor.tsx` | 1186-1194 | `ai_generate_text` | `{ modelId, prompt, temperature: 0.35, systemPrompt, enableThinking: false, numCtx: min(defaultNumCtx, 8192), numPredict }` |
| `Editor.tsx` | 1456-1463 | `ai_generate_chat` | `{ modelId, messages, temperature: aiTemperature, enableThinking: thinkMode, numCtx, numPredict }` |
| `Editor.tsx` | 1368-1375 | `subject_db_query` | `{ vaultPath, subject, grade, topic, query, topK }` |
| `Editor.tsx` | 1499 | `subject_db_list` | `{ vaultPath }` |
| `SubjectDbManager.tsx` | 58 / 91 | `subject_db_list` / `subject_db_scan_import` | `{ vaultPath }` |
| `SubjectDbManager.tsx` | 113 / 124 / 137 | `subject_db_add_pdfs` | `{ vaultPath, subject, grade, topic, filePaths }` |
| `SubjectDbManager.tsx` | 180 / 189 / 195 / 201 | `subject_db_delete_file` / `subject_db_delete` | `{ vaultPath, subject, grade, topic[, filename] }` |
| `SubjectDbManager.tsx` | 507 | `subject_db_diagnose` | `{ vaultPath }` |
| `SubjectDbManager.tsx` | 70 | `listen("subject-db-progress")` | event payload `{ stage, processed, total, file? }` |
| `store.ts` | 361; 1089; 1343 | `allow_fs_scopes` / `register_vault_root` | `{ paths }` / `{ path }` |
| `utils/pdfExport.ts` | 230 | `allow_fs_scopes` | `{ paths }` |
| `MindmapView.tsx` | 545 / 563 / 1218 | `open_file_in_default_app` / `reveal_item_in_file_manager` / `print_pdf_file` | `{ path }` |
| `SidebarMinimal.tsx` | 710 / 729 | `open_file_in_default_app` / `reveal_item_in_file_manager` | `{ path }` |
| `extensions/MaterialLink.tsx` | 136 / 153 | same as above two | `{ path }` |
| `editor/useLessonPdf.ts` | 241 | `print_pdf_file` | `{ path }` |

**AI state in `store.ts`:** `AiProvider = "ollama" | "direct-download"` :80 (default :465 — `direct-download` never implemented); settings persist via vault backup `.teacherpro/ui-settings.backup.json` (writeUiSettingsBackup :558+).

**Pure-UI AI components (no invoke):** `AiChatPanel.tsx`, `ChatContextBar.tsx`, `AiMarkdown.tsx`.

**Helpers:** `utils/aiText.ts` — `parseThinkingFromResponse` :1-6, `normalizeAiFragmentOutput` :8-36 (strips think blocks/fences/bullets).

**i18n / prompts:** `en.ts:765-768` & `de.ts:765-769` `aiPrompts.{rewriteSystem, translateSystem, chatSystem}` (DE chatSystem forces German); chosen at Editor.tsx:1164-1167, :1403. Method bank: `public/method-bank.json` / `method-bank.de.json`, loaded by language at Editor.tsx:391. CI enforces key parity: `npm run verify:i18n` (ci.yml:47-48). Catalog `descriptionDe` rendered at SettingsModal.tsx:775.

## A.5 Config & build (current state)

- `Cargo.toml` :18-33 — tauri 2, plugins: opener/dialog/fs/os/store/clipboard-manager 2.x, `ureq 2 (json)`, `pdf-extract 0.12`, `uuid 1 (v4)`, `tempfile 3`, serde/serde_json. **No** shell/reqwest/tokio/fastembed.
- `tauri.conf.json` — identifier `com.pano.teacherpro`, v2.7.1; CSP :25 (`connect-src` has no 11434 — all AI HTTP is Rust-side; keep this property in v3); `devCsp` :26; plugins `{ fs: { requireLiteralLeadingDot: false } }` :29-33; bundle :34-44 with 5 icons; **no externalBin, no resources**.
- `capabilities/default.json` :9-36 — window `main`; `core:default`, opener/dialog/fs/os/store/clipboard defaults, scoped `fs:*` reads/writes + `fs:scope $TEMP/**`. **No `shell:` permissions** (none needed — Rust-side spawn).
- Workflows — `ci.yml` (tsc, clippy, verifiers, cargo check); `build-cross-platform.yml` (dispatch; matrix macos-latest/ubuntu-24.04/windows-latest; mac `--target universal-apple-darwin` :93); `release.yml` (tag `v*`, softprops/action-gh-release@v3, same matrix :62-68). Nothing fetches external binaries today.

---

# Appendix B — Connection maps: current → v3

## B.1 Chat flow (the main one)

```
CURRENT:  AiChatPanel UI → Editor.tsx:1456 invoke("ai_generate_chat")
          → lib.rs:1846 spawn_blocking → ureq POST {ollama}:11434/api/chat (stream:false)
          → full text response → strip_think_blocks → return whole string → render

v3:       AiChatPanel → invoke("ai_chat", { requestId, modelId, messages, temperature,
            maxTokens, thinking, ragChunks })
          → engine.rs (ensure Ready) → client.rs POST /v1/chat/completions { stream: true,
            chat_template_kwargs: { enable_thinking } }
          → SSE reader thread → batch every ~50 ms → app.emit("ai-stream-{requestId}",
            { kind: "chunk" | "thinking" | "done" | "error", text, usage, finish })
          → useAiEngine.ts listener → incremental render (thinking collapsible, citations)
```

## B.2 Rewrite / translate flow

```
CURRENT:  Editor selection action → invoke("ai_generate_text") lib.rs:1700 (blocking, whole string)
v3:       same command name & response shape (synchronous string) — internally
          client.rs non-stream completion; TTFT drops from ~10-30 s to seconds.
          NOTE: numCtx/numPredict move from per-request args → launch flags + max_tokens.
```

## B.3 Model install flow

```
CURRENT:  SettingsModal "Install" → invoke("ai_start_model_install") → spawns `ollama pull`
          → parses percentage from stdout → AI_INSTALL_STATES → poll 750 ms (SettingsModal:199)
v3:       SettingsModal "Download" → invoke("ai_download_model_start", { modelId })
          → downloader.rs: HEAD size → ranged GET (8 MB chunks) → sha256 (streaming)
          → free-disk precheck → .part → verify → rename to app_data_dir/models/
          → invoke("ai_download_progress") (same 750 ms poll pattern, new payload)
          → on complete: engine auto-selects tier; "Download CUDA engine pack" card appears
            iff nvml-wrapper detects NVIDIA dGPU.
```

## B.4 RAG flow

```
CURRENT:  PDF → subject_db_add_pdfs → pdf.rs extract/OCR → chunk.rs (500 chars, lang "de")
          → embed.rs POST /api/embed (bge-m3 via shared Ollama daemon) → store.rs chunks.json
          Chat: Editor.tsx:1368 subject_db_query → cosine → Editor builds context (chars÷4)
v3:       PDF → same add_pdfs command → pdf.rs (+sanitize, graceful no-tesseract)
          → chunk.rs v2 (256-512 tokens, detected lang) → embeddings.rs (fastembed bge-m3 Q-ONNX,
            in-process CPU) → store_sqlite.rs (index.db: chunks + vecs + FTS5)
          Chat: subject_db_query → FTS5 BM25 ∪ cosine → RRF fusion → [rerank top-50→8, opt]
          → client.rs POST /tokenize for exact budget → context + citations[{chunkId,page}]
          → ai_chat stream with citations rendered as chips in AiChatPanel
```

## B.5 Engine lifecycle

```
CURRENT:  App launch → setup hook → ensure_ollama_server_started (or install Ollama!)
          → daemon on 11434 → exit: osascript/pkill hacks
v3:       launch → NOTHING runs (Idle)
          first invoke needing engine → bind 127.0.0.1:0 → spawn resource_dir()/engines/
          <variant>/llama-server { --jinja -m <gguf> -c <ctx> -np 1 -fa on
          -ctk q8_0 -ctv q8_0 --host 127.0.0.1 --port <p> --api-key <uuid> }
          → poll /health (503 LoadingModel → 200 Ready) → GET /props → clamp/emit ctx
          → RunEvent::Exit → kill child (exit-code captured for crash toasts)
```

---

# Appendix C — Shared contracts (keep TS ↔ Rust in sync)

```ts
// v3 core types (frontend mirror lives in src/ai/engineTypes.ts; Rust in src-tauri/src/ai/mod.rs)
type EngineState = "idle" | "starting" | "loading-model" | "ready" | "failed" | "stopped";

interface EngineStatus {
  state: EngineState;
  modelId: string | null;
  port: number | null;
  ctx: number | null;          // real, from /props
  backend: "vulkan" | "metal" | "cpu" | "cuda" | null;
  variant: "bundled-vulkan" | "bundled-metal" | "bundled-cpu" | "cuda-pack";
}

interface DownloadProgress {          // replaces AiModelInstallProgress
  modelId: string;
  state: "queued" | "downloading" | "verifying" | "completed" | "failed" | "cancelled";
  receivedBytes: number;
  totalBytes: number;
  error?: string;                     // mapped friendly message
}

interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }  // unchanged
// developer→system mapping (lib.rs:1889) moves into client.rs request assembly.

interface StreamEvent {               // event "ai-stream-{requestId}"
  kind: "chunk" | "thinking" | "done" | "error";
  text?: string;
  usage?: { promptTokens: number; predictedTokens: number };
  finish?: string;
  error?: string;
  citations?: { chunkId: string; page: number | null; source: string }[];
}
```

**Schemas in sync (script-checkable):** `modelCatalog.ts` ↔ `ai/catalog.rs` (write `scripts/check-catalog-parity.mjs`, add to `ci.yml` next to `verify:i18n`).

**Invariants to preserve (easy to break during the swap):**
1. `subject_db_*` command signatures & `subject-db-progress` event name — SubjectDbManager.tsx keeps working.
2. Vault layout: `SubjectDBs/**` stays inside the user vault; engine/models/engines data go to `app_data_dir` (`com.pano.teacherpro`), never the vault.
3. CSP stays without engine URLs in `connect-src` (all HTTP remains Rust-side).
4. i18n key parity (`verify:i18n`) — every new UI string lands in **both** en.ts and de.ts.
5. `allow_fs_scopes` / `register_vault_root` / pdfExport / print pipeline untouched.
6. `migrate_legacy_app_data` and the ui-settings backup path untouched.
7. All generation params keep their clamps (§A.1) — only the transport changes.
8. **CI style guards apply to all new v3 UI**: `verify:typography` (no `text-[Npx]` below 11px — script-verified, MIN_PX=11) and `verify:scrollbars` (no `scrollbar-color: … transparent` in .tsx) — citation chips, thinking badges, and download cards must obey both.
9. **Settings split stays intact** (release-notes v2.2.3 rule): portable settings (teacher name, subjects, language, UI state) live in the vault's `.teacherpro/ui-settings.backup.json`; **AI/engine settings (model choices, model-storage path per R13, engine prefs) stay device-local** in `teacherpro-settings.json` — never written into the vault backup, so a vault opened on a second PC doesn't reference hardware it doesn't have.

---

# Appendix D — Prompt for a file-less assistant

When asking another AI (Gemini etc.) to implement a phase from this plan, paste: this document (§2-§9 + Appendices A-F) and state: *"Implement phase P{n} exactly as specified; line numbers refer to the anchors in Appendix A — re-locate by symbol name, not by line, since the file may have shifted. Preserve the invariants in Appendix C; respect the fixed constraints in F.3."* For a *review/opinion* request instead of implementation, ask it to answer the F.8 checklist against the doc. That gives full symbol- and product-level context without file access.

---

# Appendix E — Model research summary (October 2026)

> Sources: LLMCheck "State of Open-Source Local LLMs — Oct 2026"; vdf.ai "Best Local LLM by VRAM (checked 6 Oct 2026, per-vendor HF/GGUF verified)"; SharpAI HomeSec-Bench (M5, llama.cpp vs MLX vs cloud); wiltodelta/small-llm-testing (measured 26 Aug 2026, M5, llama.cpp — incl. thinking-mode and MTP A/Bs); Qwen/Qwen3-Embedding GGUF model cards; bge-m3 vs Qwen3-Embedding comparisons (faun.dev, gpuos.si); Contra Collective "Local Embeddings on Apple Silicon" (Jun 2026, measured DE/EN/JA/ES). Figures below are from those measurements — re-verify before each catalog bump.

## E.1 Chat model landscape

- **Gemma 4 family** (Google, Apache 2.0): E2B / E4B ("effective" elastic dense), 12B dense, 26B-A4B MoE, 31B dense. Text+image+audio capable (mmproj for GGUF multimodal); 256K native context on 12B/26B; **has a per-request thinking toggle** (`enable_thinking` — new vs Gemma 3); publishes **MTP draft heads** (`mtp-*.gguf`) → lossless 1.2-2.2x decode speedup via `--spec-type draft-mtp`. Gemma 4 26B-A4B hit 97.9% on HomeSec-Bench = tied GPT-5.4 locally at 59.9 t/s / 414 ms TTFT (M5 Pro, llama.cpp b8638).
- **Qwen3.5** (Alibaba, Apache 2.0): 2B / 4B (4.7B dense, hybrid Gated DeltaNet + full attention, 262K ctx) / 9B (9.7B dense, vision encoder, 262K ctx) / 27B / 122B-A10B / 35B-A3B MoE. Qwen3.5-9B Q4_K_M (5.6 GB) is the **best 8 GB VRAM pick** (≈46K tokens of context left alongside); Qwen3.5-4B Q4_K_M (2.7 GB) is the best small-file long-doc pick (~135K ctx on a 4 GB card, ~32 t/s on GTX 1650).
- **Qwen3.6-35B-A3B** MoE (3B active): #2 overall local index score, 126 t/s on M5 Max, 256K window — the workstation tier.
- **gpt-oss-20b** (OpenAI, Apache 2.0 + usage policy): native MXFP4 12.1 GB, adjustable `reasoning_effort`, strong function calling/structured output — 16 GB VRAM tier.
- **Ministral 3 8B/14B** (Mistral, Apache 2.0): native function calling + JSON in 11 languages; Ministral 3 14B Q4_K_M 8.2 GB ≈ Mistral Small 3.2.
- **Granite 4.2 8B** (IBM, Apache 2.0): per-request switchable thinking modes, tool calling in 12 languages — niche fit for structured workflows.
- **LFM2.5** (Liquid): fast small assistants (8B-A1B, 2.6B), text-only; dominated by Gemma 4 E2B in measured A/Bs.
- **Avoid list (llama.cpp):** GLM-5.3-Flash — 128 GB RAM; Qwen 4 — announced (Apsara, 22 Sep 2026) but no weights; Qwen3.8-Flash-Next — no verified official card, MTP still an unmerged llama.cpp PR (#27836/#28243).
- **Qwen3.8-27B correction (supersedes the August "llama.cpp-slow" claim):** the decode-cliff issue #27623 was retracted by its own author — the metric was prefill-inclusive; server-side eval timings are healthy (32-36 t/s decode @ 91K position). The community MTP matrix (sudoingX/qwen38-mtp, 68 rigs) shows the draft head ships inside unsloth GGUFs (`blk.*.nextn.*`) and `--spec-type draft-mtp` yields +33-145%: RTX 5090 74→171 t/s, 4070 Ti Super 84 t/s (IQ3_XXS, draft 3), 5060 Ti 30-40 t/s *at full 256K ctx*, R9700 ROCm 27→46 t/s. **Backend gate:** MTP regresses on Metal (M4 Pro 12.9→7.6 t/s) and Vulkan (prefill collapse) → CUDA/ROCm only. Memory: GDN recurrent-state = slots × (draft+1) × 150 MB; `-np 1` when measuring, cap 2 slots with MTP. Known quant trap: IQ3_XXS contains IQ1_M tensors without MMQ kernels → crashes prebuilt CUDA cuBLAS paths (prefer UD-Q4_K_XL / IQ4_XS).
- **Hardware class mapping:** NVIDIA dGPU 8/12/16/24 GB → Qwen3.5-9B / Gemma 4 12B / gpt-oss-20b / Qwen3.6-35B-A3B (CUDA pack). iGPU Vulkan → Gemma 4 E2B/E4B, Qwen3.5-4B. Apple Silicon → same GGUFs via Metal (+ MTP), MLX only faster for embeddings (not used in v3). CPU-only → E2B/Qwen3.5-2B Q4_K_M.

## E.2 Embedding & reranking landscape

- **bge-m3** (BAAI, MIT, ~568M): 1024-dim dense + **sparse + ColBERT in one forward pass**, 8192 ctx, 100+ langs. German nDCG 49.6 vs English 51.8 on the measured multilingual slice — the strongest German-safe mid-tier; sparse vector lifts hybrid retrieval +3-6 nDCG on technical vocab. Community GGUF (gpustack/bge-m3-GGUF Q8_0 ≈ 0.7 GB) or fastembed ONNX (dense+sparse in-process, CPU).
- **Qwen3-Embedding 0.6B/4B/8B** (Alibaba, Apache 2.0): instruction-aware, last-token pooling, 32k ctx, MRL dims; 0.6B Q8_0 ≈ 0.7 GB. Tops open multilingual retrieval boards (C-MTEB 66.3 at 0.6B; German slice 54.8 = best measured). **Ceremony required:** `Instruct: {task}\nQuery: {q}` prefix on queries only, documents unprefixed; `--embedding --pooling last` in llama-server. Skipping it collapses quality.
- **EmbeddingGemma-300M** (Google): 768-dim (MRL), 2048 ctx, Q4 ≈ 200 MB, 100+ langs — the tiny bundled option.
- **nomic-embed-text-v2** (137M, 768-dim MRL, 8192 ctx): fastest ingest tier but **English-specialist** — drops 8-13 points on non-English; wrong fit for TeacherPro.
- **Rerankers:** Qwen3-Reranker 0.6B (instruction-aware, 32k ctx) or bge-reranker-v2-m3 (fastembed `TextRerank`, multilingual). Both CPU-friendly at teacher scale.
- **Dimension incompatibility rule:** bge-m3 (1024) and Qwen3-Embedding (1024) are NOT interchangeable despite matching dims — switching embedders always means re-indexing the vault (§2 non-goal acknowledged: v3 picks once, v3.1+ may expose the swap as a re-index action).

## E.3 Thinking-mode handling (per family)

| Family | Control (verified vs llama-server) | Default in TeacherPro |
|---|---|---|
| Qwen3.5 / Qwen3.6 | `chat_template_kwargs: {"enable_thinking": bool}` | off (chat/rewrite), on (analysis) |
| Gemma 4 | same `enable_thinking` toggle | off (chat/rewrite), on (analysis) |
| gpt-oss-20b | `reasoning_effort: "low"/"medium"/"high"` | low |
| Granite 4.2 | per-request thinking toggle | off |

Measured caveat (wiltodelta): thinking repairs reasoning failures only when the model can finish inside `num_predict` — budget +1-2k tokens when enabling; otherwise enable-and-timeout ties plain answers at far higher latency. Streaming makes thinking visible (collapsible UI) so latency stays acceptable either way.

## E.4 EU models (Oct 2026) — sources & detail

- **Mistral AI (France).** Open-weight lineup (all Apache 2.0 unless noted; sources: docs.mistral.ai/models, mistral.ai/news/mistral-3 (2 Dec 2025), /mistral-small-4 (16 Mar 2026), /mistral-large-4 (6 Oct 2026), vdf.ai Mistral on-premise guide (6 Oct 2026, license + KV sizing), HF `mistralai` collections):
  - **Ministral 3** — 3B/8B/14B, each Base/Instruct/Reasoning, vision input, 256K ctx label, 40+ native languages. **Mistral publishes official GGUFs** (`Ministral-3-{size}-Instruct-2512-GGUF`: Q4_K_M/Q5_K_M/Q8_0/BF16) — clean provenance, no community-quant risk. Sizes: 3B ≈2.0 GB, 8B 5.2 GB, 14B 8.2 GB (Q4_K_M). KV caution: GQA with 8×128 KV heads every layer → 104-160 KiB/token; vdf sizing puts one 32K session at 4.6-5.4 GB — fine, but 128K sessions need 18-21 GB, so the 256K label is workstation-only in practice (≈14K practical ctx on an 8 GB card).
  - **Ministral 3 Reasoning variants** — dedicated always-think models (official GGUFs exist). v3 uses Instruct + toggles; revisit if needed.
  - **Mistral Small 4** (Mar 2026) — 119B MoE / 6.5B active, 256K ctx, text+image, per-request `reasoning_effort: none|high`, MLA attention → only 22.5 KiB/token KV. Server-class (Mistral: 2×H200 minimum); community low-bit quants run ~90% on M5 Max. Footnote tier only for TeacherPro.
  - **Mistral Large 3** (675B MoE) and **Large 4** (1.05T MoE, weights "end of Oct 2026") — out of scope; signal of EU frontier capability.
  - License watch-out: Medium 3.5 / Devstral 2 = Modified MIT with a US$20M revenue cap — fine for TeacherPro but not "clean Apache"; prefer the Apache-2.0 picks.
- **EuroLLM (EU consortium — IST Lisboa, Unbabel, Edinburgh, Sorbonne…; Horizon Europe/EuroHPC; sources: eurollm.io, arXiv 2602.05879, HF blog 14 Dec 2025).** 1.7B/9B/22B; 22B trained on 4T tokens across 35 languages incl. all 24 official EU languages; 32K ctx; **translation across EU languages matches/beats Gemma-3-27B and Qwen-3-32B** (WMT24++/FLORES) — "best fully open EU-made model". GGUFs community (bartowski `utter-project_EuroLLM-22B-Instruct-2512-GGUF`). Role: translation/rewrite specialist on 16 GB VRAM machines.
- **Teuken-7B (OpenGPT-X — Fraunhofer, Forschungszentrum Jülich, TU Dresden, DFKI; funded by German BMWK; sources: HF openGPT-X cards, arXiv 2410.03730, QuantFactory GGUFs).** v0.4 commercial = Apache 2.0 (research variant for research use), all 24 EU languages, German/English-centric instruction data (translated DE-first datasets). Measured EU21 avg (.531-.543) ≈ Llama-3.1-8B-Instruct, ahead of Occiglot/Salamandra on some subsets — quality is below Qwen3.5/Gemma 4 for general chat, but it is *the* German-public-sector provenance pick (EU-funded, DE/FR institutions, EU-values framing).
- **Honorable mentions (not catalogued):** Salamandra-7B (BSC Barcelona, 35 langs — behind Teuken on most subsets), Apertus-8B/70B (ETH Zurich — Swiss, fully open, EuroLLM's closest fully-open rival), Mellum2/2.1 12B MoE (JetBrains Prague — Apache 2.0, wiltodelta's measured speed/accuracy leader 66/66, but a **coding-agent specialist**, GGUFs v2.1 "coming soon"; only relevant if TeacherPro ever adds code/TeX helpers), Occiglot/Pharia-1 (dated EU21 scores).
- **Sovereignty framing for the UI:** inference is already 100% local (no data leaves the device in any tier), so "EU" matters for vendor independence, license cleanliness (all picks Apache 2.0), and public-procurement preferences — expose it as a filterable `origin` badge (`eu` / `us` / `cn`), not as a privacy claim.

---

# Appendix F — Product & project context for reviewers

> A reviewer (human or AI) judging this plan needs the product around the AI stack. F.8 lists where to attack.

## F.1 What TeacherPro is

- **Local-first desktop teacher planner.** Tauri 2 (Rust backend) + React 19 + TypeScript 5.8 + Zustand 5 + Tiptap 3 (block-based editor) + Tailwind 4 + Vite 7. Dark-mode-first, Notion-style. v2.7.1, shipped and in use; normal-versioned app releases.
- **Single user, single machine, no cloud, no accounts, no telemetry, no backend.** The vault (user-chosen folder) is the database: `Lesson Plans/` (Tiptap JSON docs), `Mindmaps/` (React Flow node/edge JSON), `Materials/` (PDFs/images/docx), `Exports/`, `Trash/`, plus `.teacherpro/ui-settings.backup.json`. Lesson plans link materials by relative path.
- **German education is a first-class domain, not a translation afterthought:** lesson-plan tables use the German planning taxonomy (columns: Time / Phase / Learning-and-Teaching Arrangement / Social Form / Media); **Method Bank** = curated pedagogy methods (EN+DE JSON, `/`-menu + dock + drag-target insertion with table-column awareness); whole UI + AI prompts + model descriptions are EN/DE (i18n parity enforced in CI).
- **AI surface today:** rewrite/translate selection actions, contextual lesson chat dock with optional RAG over `SubjectDBs/`, subject-DB manager (scan/import PDFs), settings tab with model catalog. That's it — no agents, no background jobs, no image input in the product (yet).
- **Scale of code:** Editor.tsx 2,678 ln; store.ts 2,189 ln; lib.rs ~1,800 ln; SettingsModal.tsx 996 ln. Solo maintainer. **No test framework exists** (no vitest/jest) — only `verify:*` script gates (i18n/scrollbar/typography) + tsc + clippy in CI.

## F.2 Load profile (justifies several design choices)

- One user, sequential requests; the only "concurrency" is a chat stream + possibly a UI action. No multi-tenant anything.
- Subject DB scale: tens of PDFs → worst case ~10⁴-10⁵ chunks (textbook + worksheets per subject/topic). Brute-force cosine over that on modern CPUs = milliseconds; SQLite chosen for transactional safety + FTS5, not KNN scale.
- Chat context: lesson text + method-bank entries + RAG chunks ≈ 2-8k tokens typical; per-model max ctx up to 262K only matters for "whole-unit comprehension" asks.

## F.3 Fixed constraints (decided by the maintainer — do not re-litigate)

1. **Full Ollama removal** — clean slate accepted, incl. re-downloading models and re-indexing vaults. (Considered and rejected: keeping Ollama as opt-in provider.)
2. **llama-server sidecar, not in-process FFI** — crash isolation + no C++ toolchain. (Rejected: llama-cpp-2/candle.)
3. **100% local inference.** Only external traffic: model/engine downloads from HF/GitHub. GDPR posture: student names may appear in lesson plans — nothing may leave the device; chat persistence is a user toggle, stored in the vault.
4. **Vulkan baseline + optional on-demand CUDA pack** (user explicitly wants NVIDIA users accelerated).
5. **EU-origin models in the catalog** (user request; `origin` badge).
6. German remains first-class in every tier and prompt.

## F.4 Settled vs open

- **Settled (architecture level):** sidecar process model, resources-based packaging, ephemeral port + `/health` lifecycle, SSE relay via Tauri events, in-process fastembed embeddings, SQLite+FTS5+fusion retrieval, `/tokenize` budgets, schema-enforced JSON, phase order P0→P5, catalog-as-config.
- **Open (§11):** embedder bundle size, reranker default, loopback API key, tesseract bundling, macOS min target/Intel variant, mmproj multimodal.

## F.5 What "better" must measurably mean (challenge these targets if you disagree)

1. Fresh install → first AI response with **zero** external installs or manual steps.
2. TTFT: rewrite/translate < 2 s and chat first token < 1.5 s (warm) on Balanced tier over an iGPU.
3. Indexing a 100-page DE PDF **never** stops/evicts the loaded chat model (verify via GPU memory).
4. Structured-output features: zero malformed JSON in acceptance runs (grammar-enforced).
5. Feature parity: every §A.4 call site keeps working through the swap.
6. Installer size growth ≤ ~100 MB (engine + embedder bundle) — challenge if you think the budget should differ.

## F.6 Honest measurement gaps

- No recorded TTFT/quality baselines from the Ollama era (anecdotal only). Optionally capture before P5 deletion; otherwise the "better" claim rests on the mechanism (streaming + flags + warm model), which is solid but unbenchmarkable post-hoc.
- All model figures in Appendix E are community/vendor benchmarks at cited dates — re-verify at each catalog pin bump.

## F.7 Explicitly out of scope (so reviewers don't suggest them)

Cloud/API providers, team features/sync, mobile, fine-tuning/training, speech (Voxtral exists but out of scope), self-hosted server deployments, LTFS/enterprise MDM packaging beyond standard installers.

## F.8 Where a reviewer should attack (checklist)

> Round 1 answered 2026-10-17 (independent Gemini review, no file access): verdicts — keep brute-force cosine (add L2-normalized blobs + per-topic in-memory cache), keep blocking ureq (add cancel token + 120 s timeout + `ai_chat_cancel`), delete Ollama wholesale confirmed, Balanced-tier picks confirmed (Qwen3.5-4B default; Ministral 3 8B stays 12 GB-min), MTP gate confirmed + strip-MTP-first retry, downloader moved to P0.5, four new risks added (R13-R16). Its Trap 2/4 (verified: `--fit` semantics, `--lazy-mode`) and Trap 1 (fastembed→ort packaging) are incorporated above; **Trap 5 was partially rejected** — measured community usage shows `-md` + `draft-mtp` combined is valid for split-MTP GGUFs, so `mtpDraftFile` stays optional and semantics are P0-smoke-verified on the pinned build.
>
> Round 2 (same reviewer, partial source access via repomix pack): Trap 5 withdrawn — `-md` + `draft-mtp` required for split-MTP files when loading via local `-m` (the `-hf` downloader auto-binds draft files, we don't use `-hf`); Case A/B encoding in §3.4 confirmed. Five source contradictions found and folded in: pdf.rs hardcoded `page_num: 1` (citations bug), pdf.rs raw `Command::new` console flashes, `verify:typography`/`verify:scrollbars` invariants missing from Appendix C (now #8), plan-doc think-tag corruption (`NECTHINKING` → real tag fixed byte-safe), ChatContextBar.tsx added to §4 rewrite map (live ctx instead of static catalog). F.8.2 refinement: ureq v2 overall-`.timeout()` vs `.timeout_read()` distinction folded into §3.3. F.8.7 addition: device-local vs vault-portable settings split (Appendix C #9). F.8.1 confirmed with single-index hierarchical filtering note.
1. Is SQLite + brute-force cosine right at ≤10⁵ chunks, or should a vector index (sqlite-vec/usearch) be planned now?
2. Is the blocking-ureq SSE reader + batched Tauri events design robust (timeouts, backpressure, app quit mid-stream)? Or does this justify finally admitting reqwest/tokio?
3. Deleting Ollama wholesale vs shipping it as an opt-in legacy provider for existing power users — revisit with real argument if you disagree with F.3.1.
4. Are the tier/quant picks right for 8 GB iGPU laptops (the modal teacher machine)? Especially Ministral-3's KV growth vs Qwen3.5 hybrid attention.
5. MTP gating (`mtpBackends`) — is CUDA-only-for-Qwen3.8 / all-backends-for-Gemma the right encoding?
6. Phase gates: any hidden dependency making P1-P4 order wrong (e.g., should downloader land with P0)?
7. §9 risk register: anything missing for school-IT reality (proxy-only networks? offline-only schools? Deep freeze/multi-user classroom profiles where app_data_dir resets?).

