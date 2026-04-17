# TeacherPro Feature Tracker

Last updated: 2026-04-17 (Method Bank left dock + contextual slash insertion)

## Purpose

This file tracks implemented features, important functions, and UI/UX decisions.
Update this file whenever behavior changes in editor, sidebar, calendar, mindmap, export, or app settings.

## Feature Inventory

### Vault and Data Layer

- Local-first vault selection and persistence.
- Auto-creates core folders: Lesson Plans, Mindmaps, Materials, Exports, Trash.
- Reads/writes lessons and mindmaps as JSON.
- Material tree loading with folder/file ordering.
- UI settings persistence now includes a vault-side backup mirror at `.teacherpro/ui-settings.backup.json` for easier recovery after reinstalls/profile resets.
- On startup, settings now fall back to the vault backup when app-local `uiSettings` are missing, then rehydrate app-local storage automatically.

Primary implementation:

- `src/store.ts`

### Lesson Editor

- TipTap-based editor with headings, lists, formatting, and tables.
- Extended rich-text controls now include underline, text color, underline color, and multicolor highlight.
- Ordered list numbering visibility is explicitly styled to remain visible in the editor.
- Lesson table insertion template with fixed planning columns and configurable default body-row count.
- Right-click table context menu:
  - Insert/delete row or column
  - Merge/split cells
  - Toggle header row/column
- Notes button now sits in the same editor action-button row as AI Chat and uses matching button size/style.
- Notes and AI Chat share the same left-side slide-out dock footprint and are mutually exclusive (only one can be open at a time).
- Method Bank button is now integrated into the same lesson action-button row and uses the same toggle styling/behavior as AI Chat and Notes.
- Action-button order is fixed for dock controls: AI Chat (leftmost), Notes, then Method Bank.
- Method Bank now opens as a third optional left-side slide-out dock panel and remains mutually exclusive with AI Chat and Notes.
- Method Bank panel supports local search, type filtering (Phase/Social/Method with no active chip meaning all), compact rows, detail preview, and double-click insertion.
- Method Bank double-click insertion is now constrained to lesson-table body rows and maps plain-text method titles into table-aware target columns.
- Method and material double-click insertion now targets inline end-of-cell paragraph content to avoid creating an unintended empty line before inserted content.
- Contextual `/` menu inside lesson-table cells now filters Method Bank suggestions by column (Phase, LTA, Social Form) and inserts the selected method title.
- Method Bank `/` suggestions are now limited to lesson-table body cells and intentionally excluded from header cells.
- Method Bank hover summary tooltip has been removed to reduce visual noise in dense list scanning.
- Lesson editor drag/drop insertion for Method Bank and materials is intentionally disabled in favor of deterministic double-click insertion flows.
- Method Bank dock width now matches the Notes dock width.
- Main navigation sidebar and all lesson side docks (AI Chat, Notes, Method Bank) are now slightly wider for improved readability.
- AI Chat header now uses a compact single-row hierarchy (title plus model badge) for clearer alignment with the side-dock top bars while preserving model visibility.
- Outer workspace padding was reduced across editor/calendar/mindmap views to reclaim horizontal space without shrinking the interactive lesson or mindmap surfaces.
- Explanatory helper copy was removed from Notes and Method Bank side panels to keep the side UI denser and less visually noisy.
- Lesson notes are stored per lesson, included in local search indexing, and excluded from print/PDF output by default.
- Metadata row: Teacher, Created, Planned For, Subject.
- Subject dropdown/input width is now constrained to a compact control size instead of stretching across the full metadata row.
- Planned date input supports DD/MM/YYYY with custom calendar popover.
- Material double-click insertion into editor content is constrained to lesson-table body rows and inserts into the row's final media/material cell.
- Double-click material insertion is intentionally limited to active lesson-plan editing and no longer force-switches views.
- Material links render as custom inline nodes with hover actions and context menu.
- Lesson editor typography is slightly reduced (content and table-header scale) to improve readability in smaller windows.
- Weekly calendar mass-delete now guards against duplicate click re-entry and treats already-moved files as non-fatal, preventing noisy rename errors during rapid bulk delete actions.
- Debounced autosave (including metadata fields) with invalid date guard for planned date.
- Lesson action buttons (Preview, Print, Export, Save) are icon-first by default and can optionally show labels via settings.
- Subject field renders as a color-swatch dropdown when subjects are configured in settings; falls back to free-text input when no subjects are defined.
- AI rewrite and translate actions are now available for selected text from both the editor toolbar and the table right-click menu.
- AI chat toggle is now integrated directly into the main lesson action button row (icon-first, matching Save/Preview/Print/Export behavior).
- Lesson AI chat opens as a left-side slide-out dock while active.
- AI chat thinking toggle is now model-aware: unsupported models disable the toggle and skip thinking requests.
- Scrollbars are globally enforced as thin, dark track/thumb styling across app scroll containers with WKWebView-safe root fallbacks.
- Release and cross-platform installer workflows now run a scrollbar invariant check (`npm run verify:scrollbars`) before packaging.

Primary implementation:

- `src/components/Editor.tsx`
- `src/components/extensions/MaterialLink.tsx`

### Sidebar and Material Management

- Sectioned sidebar for lesson plans, mindmaps, materials.
- New lesson and new mindmap actions.
- Unified collapsible sidebar search block applies one query across Lesson Plans, Mindmaps, Materials, and Trash.
- Lesson and mindmap search now includes indexed JSON content (TipTap text + metadata for lessons, node labels/material paths for mindmaps), not only filenames.
- Material search supports both file/folder names and relative paths (including nested entries).
- Section headers for Lesson Plans, Mindmaps, Materials, and Trash now use larger/more readable sidebar typography.
- Appearance settings now include independent paper-tone controls for lesson plans and mindmaps.
- Settings panel now uses section tabs (Appearance, Defaults, Advanced) for clearer grouping and reduced visual clutter.
- Settings now open as a centered modal overlay with stronger spacing, dimmed/blurred backdrop, and Escape/backdrop dismiss.
- Settings modal dimensions and tab/card text sizing were increased for better readability on higher-resolution displays.
- Defaults tab includes a Subjects block: up to 4 named subjects each with a custom color picker. Subjects are persisted to vault settings.
- Defaults tab includes a persisted numeric setting for default inserted lesson-table body rows (range 1-12, default 4).
- Settings now include an AI tab for local-first configuration, including AI enablement, chat persistence, and a curated multi-family model catalog with selectable providers (Ollama runtime or direct-download mode).
- AI catalog cards support install/remove/default actions with local status indicators and manual refresh.
- AI settings now include runtime diagnostics showing server source (TeacherPro-managed vs external), backend policy text, and active model processor usage.
- AI settings now expose model routing controls with separate selections for lesson chat model and shared rewrite+translation model.
- AI settings now use neutral per-model capability chips instead of benchmark recommendation cards.
- Material import: add files and add folders.
- Context menu actions for lessons, mindmaps, and materials.
- Lesson context menu includes duplicate action.
- Trash section in sidebar supports search, restore, preview (files), reveal, and permanent delete actions.
- Trash preview for deleted lesson/mindmap JSON is rendered to resemble in-app document/mindmap views rather than raw JSON text.
- Material preview modal supports PDF, image, and text.
- Material open in system default app and reveal in Finder.
- Material double-click insertion now queues only while the lesson editor is active, preventing accidental inserts from calendar/mindmap views.

Primary implementation:

- `src/components/Sidebar.tsx`
- `src/store.ts`
- `src/components/extensions/MaterialLink.tsx`

### AI Foundations (Experimental)

- Local AI configuration state is now persisted in app settings (enabled flag, provider, default model, chat persistence).
- Model catalog now includes current practical local options across families (Gemma 4, Qwen 3, Llama 3.2, DeepSeek R1 8B, Mistral Small 3.1, Phi 4) with per-model disk, RAM/VRAM guidance, recommended context, and runtime defaults.
- Catalog now carries neutral capability metadata for lightweight UI guidance (`reasoning`, `multilingual`, `low-latency`, `long-context`, `english-focused`).
- Tauri backend now exposes AI runtime/model commands for status, list, install, and remove operations through local Ollama.
- Model installation now attempts one-click runtime bootstrap (install Ollama automatically when missing), so users can install from settings without manual pre-setup.
- Model installs now run as tracked background jobs with live progress polling and cancellation controls in the AI catalog cards.
- AI settings now include a direct-download provider mode where Install opens external Gemma 4 download pages without starting Ollama.
- Tauri backend now exposes a generic text generation command (`ai_generate_text`) used by editor rewrite/translate actions.
- `ai_generate_text` now accepts per-request `num_ctx` and `num_predict` runtime options so selected model defaults are actually applied during inference.
- AI rewrite/translate now enforce safe single-textblock selection and apply plain-text insertion. Rewrites are now also permitted inside table cells and list items (guard only blocks cross-textblock selections).
- AI rewrite context menu expands into six tone options: Improve, More Formal, More Casual, Simpler, More Engaging, More Concise.
- AI translate context menu expands into a 12-language picker; the configured target language is pinned at top with a ★ indicator.
- Rewrite prompt uses a dedicated system prompt per mode with explicit instructions to change wording and apply the requested tone.
- AI generation runs on a blocking worker thread to keep UI responsive during longer local model inference.
- AI model catalog now targets parameter-labeled Gemma 4 variants (E2B/E4B/26B/31B) with refreshed local resource guidance and default model selection.
- Runtime diagnostics now include `ai_runtime_diagnostics` data: provider availability, version, server running state, preferred backend, backend policy, detected hardware, and active model processor usage parsed from `ollama ps`.
- Windows runtime/model process calls now use hidden creation flags to avoid random terminal popups during AI runtime setup, model download/import, and related command execution.
- Cross-platform backend strategy is now explicit in-app:
  - Windows prefers CUDA when NVIDIA tooling is detected, else CPU fallback.
  - macOS (Intel/Apple Silicon) prefers Metal.
  - Linux prefers CUDA (NVIDIA) or ROCm (AMD) when tooling is detected, else CPU fallback.
  - Hybrid systems with integrated AMD + dedicated NVIDIA follow CUDA/NVIDIA when backend is CUDA.
- For TeacherPro-managed Ollama runtime, backend alignment now auto-recovers CPU-only fallbacks: if a selected model is detected on CPU while GPU backend is preferred, runtime is restarted with preferred backend before inference.
- AI Settings now auto-detect already-installed models when opening the AI tab and after install/remove operations.
- Lesson AI Chat is a conversational assistant that reads the full lesson (body + teacher/subject/date metadata) and can summarize, discuss themes, identify learning objectives, and suggest improvements.
- Chat quick-action chips (Summarize, Key themes, Check learning objectives, Suggest improvements, Activity ideas) appear when chat is empty for one-click prompts.
- Chat clear button (trash icon) in header resets history and restores quick-action chips.
- `AiMarkdown` component renders headings, bullet lists, numbered lists, bold, italic, and inline code from AI responses.
- Default chat system prompt covers summarization, themes, recommendations, and pedagogy; never asks teacher to paste content.
- Ollama server process is tracked in `OLLAMA_SERVER_CHILD` static and killed on `RunEvent::Exit` (app-level, fires on all quit paths including macOS Cmd+Q).
- Repo-level implementation handoff is documented in `AI_IMPLEMENTATION_PLAN.md` for continuity across agents.

Primary implementation:

- `src/ai/modelCatalog.ts`
- `src/store.ts`
- `src/components/Sidebar.tsx`
- `src-tauri/src/lib.rs`
- `AI_IMPLEMENTATION_PLAN.md`

### Weekly Calendar

- Weekly navigation (Mon-Sun).
- One-click "Today" jump to the current week.
- Day cards with lesson listing by date.
- Lesson cards show a colored left-border reflecting the subject color configured in settings (via `lessonSubjectIndex`).
- Lesson cards are draggable between days in the current week.
- Dropping a lesson on another day updates both `metadata.plannedFor` and the lesson filename date token so it appears under the new day immediately.
- Create lesson directly for a selected day.
- Select/unselect lessons for bulk move-to-trash.
- Day-level move-all-to-trash action.
- Mini sidebar calendar day-cell layout is stabilized with fixed-size date cells to prevent gap jitter while changing selected date.

Primary implementation:

- `src/components/CalendarView.tsx`

### Mindmaps

- React Flow board with node/edge editing.
- Double-click node label editing.
- Context menu actions for pane/node actions.
- Mindmap context menu uses viewport-aware clamping so menu actions remain visible near screen edges.
- Expanded node color presets plus a custom color picker in the node context menu.
- Custom node color application auto-computes readable text and border contrast for better accessibility.
- Material drag/drop creates linked material nodes in the map.
- Mindmap material drop supports drag-end coordinate fallback for WebView cases where drop events are swallowed.
- Material nodes support preview, open in default app, and reveal in file manager.
- Save and create-new mindmap actions.
- Mindmap action buttons (Preview, Print, Export, Save) follow the shared icon-first toolbar mode with optional labels.
- Mindmap workspace typography is slightly reduced (header/actions/node label scale) for denser layouts on smaller screens.

Primary implementation:

- `src/components/MindmapView.tsx`

### PDF, Preview, and Print

- Lesson and mindmap export to PDF bytes (A4, landscape option, multi-page support).
- Mindmap PDF preview/export now preserves node color styling instead of normalizing nodes to white.
- Preview modals for generated PDF blobs.
- Print/Save flow prints generated PDF blobs via hidden iframe, keeping output consistent with preview/export.
- Export-specific CSS hides editing controls from lesson exports.

Primary implementation:

- `src/utils/pdfExport.ts`
- `src/components/Editor.tsx`
- `src/components/MindmapView.tsx`
- `src/index.css`

### Debug and Diagnostics

- Optional debug mode with rolling event console.
- Debug events for drag/drop and material operations.
- Copy and clear debug logs in-app.
- Manual Method Bank pre-release checklist command available via `npm run qa:method-bank`.

Primary implementation:

- `src/store.ts`
- `src/components/Sidebar.tsx`
- `src/components/Editor.tsx`

## Key Function Map

### App Store (`src/store.ts`)

- `initVault()` loads persisted vault/settings including `subjects`.
- `openVault()` chooses and persists vault path.
- `refreshVault()` syncs folders and file trees; rebuilds `lessonSubjectIndex` (filename → subject name) alongside search indexes.
- `setSubjects(subjects)` persists up to 4 `SubjectConfig { name, color }` entries to vault settings.
- `setDefaultLessonTableBodyRows(rows)` persists the default number of body rows for inserted lesson tables.
- `normalizeUiSettings(raw)` normalizes partial/missing settings and enforces stable defaults.
- `writeUiSettingsBackup(vaultPath, uiSettings)` mirrors settings into vault backup storage.
- `readUiSettingsBackup(vaultPath)` restores settings from vault backup when local settings are missing.
- `createNewLesson(plannedDate?)`, `duplicateLesson(fileName)`, `rescheduleLesson(fileName, plannedDate)`, `openLesson(fileName)`, `saveActiveLesson(content, metadata?, notes?)`.
- `createNewMindmap()`, `openMindmap(fileName)`, `saveActiveMindmap(nodes, edges)`.
- Search indexing runs during vault refresh to keep lesson/mindmap content queries local and fast.
- `addMaterialFiles()`, `addMaterialDirectory()`, `renameMaterialEntry(...)`, `deleteMaterialEntry(...)`.
- `setThemeMode(mode)` (dark-only guard), `setAccentColor(color)`, `setDebugMode(enabled)`, `setShowActionButtonLabels(enabled)`.
- `setThemeMode(mode)` now persists the passed mode instead of forcing a hardcoded value.
- AI settings and runtime state methods:
  - `setAiEnabled(enabled)`, `setAiProvider(provider)`, `setAiDefaultModelId(modelId)`, `setAiRewriteTranslateModelId(modelId)`, `setAiPersistChats(enabled)`.
  - `setAiModelInstallState(modelId, state)` for in-app model install status tracking.
- `logDebug(source, action, detail?)` and `clearDebugEvents()`.

### Lesson Editor (`src/components/Editor.tsx`)

- `insertLessonTable()` inserts lesson planning table scaffold.
- Table insertion body row count now reads from persisted settings (default 4, clamped 1-12).
- `insertMaterialLinkAtSelection(payload, clientX?, clientY?)` inserts dropped material links.
- `insertDroppedMaterial(dataTransfer, clientX?, clientY?)` resolves payload and executes insertion.
- `insertMethodTextAtSelection(payload, clientX?, clientY?)` inserts plain-text Method Bank titles with table-column targeting.
- `insertDroppedMethod(dataTransfer, clientX?, clientY?)` resolves method drag payloads and executes insertion.
- `handleEditorDrop(...)` plus native/window drop handlers coordinate both material and Method Bank drag/drop flows.
- Lesson-editor drag/drop insertion handlers remain in codepath but are currently gated off; active insertion UX is double-click plus slash.
- `refreshSlashMenu()` and slash keyboard handlers drive contextual Method Bank `/` suggestions inside lesson-table cells.
- Row-targeted material insertion computes the current table row and uses the final media/material cell when available.
- Autosave runs in the background while manual save remains available from the toolbar.
- Toolbar now includes underline toggle, text-color picker/reset, underline-color picker/reset, and highlight-color picker/reset.
- `runAiSelectionAction(mode, explicitSelection?, options?)` executes rewrite/translate transforms with optional `tone` and `language` options; applies normalized result via `tr.insertText`.
- `normalizeAiFragmentOutput(rawOutput, originalSelection)` strips think blocks, code fences, and normalizes whitespace/lists to match the input shape.
- `buildLessonContextText()` walks the TipTap doc and emits structured plain text (headings, paragraphs, lists, tables) capped at 10000 chars.
- `handleSubmitChat(overrideText?)` sends lesson metadata + body + conversation history to the AI; accepts an optional override for quick-action chip prompts.
- Lesson notes are edited in a dedicated side drawer and persisted via the same autosave/manual save flow as lesson metadata/content.
- `AiMarkdown` renders block-level markdown (headings, lists) and inline formatting (bold, italic, code) from AI chat responses.
- `createLessonPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### Material Link Extension (`src/components/extensions/MaterialLink.tsx`)

- `handlePreview()` loads preview content by file type.
- `handleOpen()` calls native backend open command.
- `handleReveal()` reveals file in Finder.
- `closePreview()` handles blob URL cleanup.

### Sidebar (`src/components/Sidebar.tsx`)

- `handleDragStart(...)` and `handleDragEnd(...)` emit drag payload and fallback drop info.
- Sidebar material entries currently disable drag gestures for lesson-editor insertion; double-click queue is the active path.
- `handleDuplicateFromMenu()` duplicates lesson plans from context menu.
- `handlePreviewFromMenu()`, `handleOpenFromMenu()`, `handleRevealFromMenu()`.
- AI settings handlers for model lifecycle:
  - `syncInstalledModels()`.
  - `handleInstallModel(modelId)`.
  - `handleRemoveModel(modelId)`.
  - `availableRoutingModels` builds selector options from installed and currently selected models for stable chat/rewrite routing.
- `renderMaterialEntries(...)` renders recursive tree.
- `renderTrashEntries(...)` renders trash tree with restore/permanent-delete operations.

### AI Backend (`src-tauri/src/lib.rs`)

- `ai_runtime_status()` reports local Ollama availability.
- `ai_runtime_diagnostics()` reports runtime health + hardware/backend diagnostics including active model processor usage.
- `ai_list_models()` returns locally installed model IDs.
- `ai_install_model(modelId)` executes local model pull.
- `ai_remove_model(modelId)` removes local models.
- `ai_generate_text(modelId, prompt, num_ctx, num_predict)` generates local model output for editor task flows using model-aware runtime defaults.
- `build_backend_policy_text(preferredBackend)` explains expected processor usage behavior by backend.

### Mindmap (`src/components/MindmapView.tsx`)

- `addNodeAt(...)` and context-menu add helpers.
- `handleMaterialDrop(...)` creates material-linked nodes from sidebar drags.
- Material node actions: preview/open/reveal via double-click and context menu.
- `handleApplyNodeColor(...)` applies selected node color preset.
- `handleApplyCustomNodeColor()` applies custom node color with auto-contrast text/border styling.
- `createMindmapPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### PDF Utilities (`src/utils/pdfExport.ts`)

- `renderElementToPdfBytes(element, options)`.
- `savePdfToVault(...)`.
- `createPdfBlobUrl(...)` and `revokePdfBlobUrl(...)`.
- `printCurrentWindow(additionalBodyClassNames?)`.

## UI and UX Design Decisions

- Desktop-first dark UI (light mode removed).
- Accent color system with four choices (blue, emerald, rose, amber).
- Accent settings now include a custom color picker in addition to preset swatches.
- Lesson paper tone (white/dark) and mindmap paper tone (white/dark) are configurable independently from the app shell theme.
- Default teacher and default paper tones are grouped under a dedicated Defaults section in Settings.
- Action toolbar text labels are optional; icon-only mode is the default for denser layouts.
- Mindmap node styling uses a hybrid color UX: instant presets for speed and a custom picker for precision.
- Sidebar sections are collapsible and preserve state.
- Deletion UX is now soft-delete semantics; lessons, mindmaps, and materials are moved to `Trash` rather than permanently removed.
- Trash recovery is available in-app via sidebar context menu (Restore), with optional permanent deletion for cleanup.
- Editor uses explicit table structure for lesson planning consistency.
- Default inserted lesson-table body rows are configurable in Settings > Defaults.
- Material links are visual chips inside lesson content to reduce plain-path clutter.
- Lesson notes are intentionally private-by-default and remain outside print/PDF exports.
- Preview modals use centered overlays with explicit close controls.
- Escape key closes preview/context overlays across sidebar, editor, and mindmap previews.
- Right-click menus across sidebar/editor/mindmap/material link enforce viewport clamping and max-height scroll behavior for accessibility near window edges.
- Right-click menu shell and viewport clamping are now centralized through a shared utility (`src/utils/contextMenu.ts`) to keep styling/visibility coherent as new AI actions are added.
- Main content scroll area reserves stable scrollbar gutter to prevent width shifts while scrolling.
- PDF export mode uses temporary body class (`tp-exporting`) to hide interactive controls.

## Backend and Permissions Notes

- Native open command: `open_file_in_default_app(path)` in Rust backend.
- AI runtime commands (Ollama): `ai_runtime_status`, `ai_list_models`, `ai_install_model`, `ai_remove_model`.
- AI diagnostics command: `ai_runtime_diagnostics` (backend/processor visibility).
- Rust process launcher helper `command_for(...)` applies hidden process flags on Windows to suppress terminal flashes for GUI-triggered commands.
- Tauri capabilities include opener, dialog, fs, os, and store permissions with broad fs scope.
- Runtime app branding uses `TeacherPro` (window/product title), while the Tauri identifier remains `com.pano.temp-app` for profile/store compatibility with existing local data.

Primary implementation:

- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`

## Known Gaps and Verification Items

- Verify drag/drop placement in all target contexts after latest table-cell targeting patch.
- Verify native print dialog behavior consistently across environments.
- Verify PDF preview/export output for underline color and highlight combinations in complex table-heavy lesson plans.
- Wire remaining AI tasks (lesson draft generation and contextual chat) from editor actions to backend command routes.
- Add install progress streaming and cancellation semantics for long model pulls.

## Update Checklist

When adding or changing behavior:

1. Update the relevant section in this file.
2. Add or revise function names in "Key Function Map".
3. Record any new UI/UX decision.
4. Add a note under "Known Gaps" if behavior is pending verification.

### Recent Fixes
- Removed light mode from runtime and Settings Appearance controls to enforce a single dark-shell UX and avoid mixed-theme rendering regressions.
- Fixed lesson editor light-mode rendering conflict caused by CSS specificity overlap between theme and paper-tone selectors; lesson surface/background now consistently follows the selected paper tone instead of mixing light container styles with dark metadata/content styles.
- Restored automatic subject/date filename updates during lesson autosave while preserving preview stability by keeping the lesson editor mounted across active file path changes.
- Replaced sidebar rename prompts with an in-app rename dialog (lesson, mindmap, material) because browser prompt dialogs are blocked in Tauri.
- Fixed lesson save naming regressions by enforcing collision-safe unique filenames during subject/date-based renames, so multiple lessons can share the same subject/date without overwriting or disappearing.
- Fixed first-run PDF preview modal instability where the overlay could close immediately after opening; backdrop dismissal now uses backdrop-only mouse-down handling to avoid click-propagation race behavior.
- Restored subject color swatch fidelity in the lesson editor by preventing paper-tone input styling from overriding the swatch color, and tightened PDF preview/export subject metadata spacing by hiding the subject picker scaffold in export mode and rendering a compact subject dot + label.
- Updated right-click menus (mindmap nodes/materials, editor table, sidebar items, and material links) to stay fully visible inside viewport bounds with menu overflow scrolling when needed.
- Redesigned Settings into a centered modal panel with dim/blur backdrop and Escape-to-close behavior for a more professional desktop UX.
- Normalized scrollbar styling to a slimmer neutral-gray appearance and stabilized scroll gutter spacing to stop paper/editor width jumps.
- Fixed lesson plan layout by removing `overflow: hidden` from `.ProseMirror table` and enforcing `word-break: break-word`, resolving the issue where tables were completely clipped on the right edge.
- Replaced iframe-based PDF print dialog (which fails natively on macOS WKWebView) with `printCurrentWindow` calling native `window.print()` combined with `@media print` CSS for reliable PDF/printer generation.
- Recreated Tauri App icons to use native transparency instead of forcing a solid square bounding box background with ImageMagick floodfill, fixing the "non texture" dock issues.

### UI/Icon Hotfixes
- Overrode lesson plan table cells with strict `overflow: hidden` and refactored the embedded `MaterialLink` Flexbox layout using `.flex-1.min-w-0.truncate` to aggressively truncate long file names, stopping them from widening `.ProseMirror` tables offscreen.
- Executed aggressive high-fuzz ImageMagick floodfill passing on the source `Icon.png` to truly delete the residual textured square padding, generating pure-transparency Tauri macOS app icons.
- Fixed PDF export table sizing bug where `min-width: max-content` forced columns to stretch to untruncated filename widths. Enforced `table-layout: fixed !important` and `width: 100% !important` for consistent spacing between app and PDF.
- Set default window dimensions to 1100x800, enforce minimum 800x600 size, and default to `maximized: true` so the app always opens maximizing screen space.
- Re-added the `Teacher: ` UI into the PDF export modal as an editable text input instead of purely removing it, allowing manual personalization.

### Window Management & OS Integration
- Startup defaults to natively maximized and centered window using Tauri `tauri.conf.json`. 
- Removed `visible: false` background-rendering logic to solve macOS desktop workspace hijacking when jumping into full-screen.

### Typography & Export Integrity
- Base Editor typographic scale standardized specifically to 12pt (matching Microsoft Word defaults) for strict 1-to-1 physical A4 realism.
- Editor wrapper expanded to `1800px` to naturally handle widescreen macOS monitors.
- Table headers natively collapse internal `<p>` tag margins to remove ugly whitespace on PDF generation.
- PDF generation engine natively forces an `1062px` width DOM-lock before taking `html2canvas` snapshots, perfectly scaling to 297mm A4 without squashing or stretching.

### Intelligent Mindmap Auto-Scaling
- Mindmap PDF generation triggers `autoFormat: true` deep into `jsPDF` using `@xyflow/react`'s `getNodesBounds` to dynamically scale the output canvas perfectly around all nodes, cleanly sidestepping current user viewport zoom or panning restrictions.
