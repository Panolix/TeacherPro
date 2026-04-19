# Changelog

## [Unreleased]

## [2.0.1] - 2026-04-19
### Fixed
- Renaming a lesson (via the subject field) no longer moves it out of its subfolder. The save path now preserves the relative folder prefix (e.g. `History/`) when building the new filename.

## [2.0.0] - 2026-04-19
### Changed — UI Overhaul
- **Complete interface redesign.** The entire shell — sidebar, top bar, status bar, and context menus — has been rebuilt from scratch with a cleaner, more focused aesthetic.
- **New minimal icon sidebar** (`SidebarMinimal`). A 56 px icon rail with a slide-out explorer panel replaces the old wide sidebar. The explorer shows a unified lesson + mindmap file tree with nested folder support, drag-to-folder, and a trash section — all in one scrollable view.
- **New top bar** (`TopBar`). Slimmer single-row bar with view tabs, vault breadcrumb, and quick-action buttons. Removes the old double-row chrome.
- **New status bar** (`StatusBar`). Persistent bottom strip showing vault path, active file, word count, and app version.
- **New context menu system** (`ContextMenu`). Fully custom floating context menus with submenus, keyboard-navigable, and correctly viewport-anchored.
- **Mouse-based drag & drop** throughout. HTML5 DnD was replaced entirely with `mousedown/mousemove/mouseup` tracking — the only approach that works reliably in Tauri's WKWebView on macOS. Applies to calendar lesson rescheduling and sidebar file-to-folder moves.
- **Calendar lesson cards redesigned.** Larger two-row cards with a colored left-border accent per subject, always-visible grip/select/delete controls, and a clean separator between title and action rows.
- **Vault item preview modal** (`VaultItemPreviewModal`). Inline read-only preview of lessons and mindmaps without opening the full editor.
- **Material preview modal** (`MaterialPreviewModal`). Dedicated preview for vault material files.
- **Settings modal** (`SettingsModal`). Moved app settings into a focused modal rather than an inline panel.

### Fixed
- Lesson cards in calendar no longer show the subject name twice when the title matches the subject (e.g. "English / English") — falls back to a date label.
- Subject color accent on lesson cards is now preserved after moving a lesson into a subfolder. Root cause: the subject index was keyed by bare filename; it now walks the full `MaterialEntry` tree and keys by `relativePath`.
- Folder drag-and-drop: items can now be dragged back to vault root by dropping anywhere in the explorer panel outside a folder row.
- Context menu submenu positioning no longer breaks when near the viewport edge.
- CSS drop-target highlight changed from dashed to solid outline, consistent with calendar day hover.
- Trash icon on individual calendar lesson cards now turns red on hover/press.

## [1.6.0] - 2026-04-17
### Added
- Method Bank is now fully integrated as a third left-side dock in the lesson editor, with local JSON seed loading from `public/method-bank.json`.
- Method Bank supports searchable entries, compact cards, contextual detail preview, and table-aware insertion flows aligned with lesson-plan columns.
- New Method Bank QA preflight script and npm command (`npm run qa:method-bank`) to validate interaction and regression checkpoints.

### Changed
- Method Bank filtering now uses `Phase`, `Social`, and `Method` chips where no active chip means an unfiltered list.
- Sidebar/dock readability and density were refined across AI Chat, Notes, and Method Bank (header hierarchy, compact spacing, and width alignment).
- Lesson metadata Subject control no longer stretches across the row; dropdown/input width now stays compact and consistent with surrounding controls.
- Weekly calendar bulk-delete controls now guard against overlapping operations and show explicit in-progress state while moving items to Trash.

### Fixed
- Method and material double-click insertion now targets inline end-of-cell content, preventing unintended blank line insertion in lesson-table cells.
- Lesson deletion is now idempotent during rapid mass-delete flows; missing/already-moved files are treated as non-fatal instead of surfacing noisy rename errors.
- AI Chat top bar structure was rebalanced to a cleaner compact row (title + model badge) for better visual consistency with other side docks.

## [1.5.1] - 2026-04-16
### Changed
- AI model catalog context windows now reflect each model's actual architecture rather than hardware-specific assumptions: thinking models (Gemma 4 E4B, 26B, 31B, Qwen 3, DeepSeek R1) use 32K default context; edge/rewrite-focused models retain 16K.
- `gemma4:31b` default context raised to match `gemma4:26b` (32768); `gemma4:e4b` raised to 32768 as the recommended default chat model.
- `recommendedContext` display strings now state model maximum token counts only, without GPU-specific assumptions.
- Lesson chat context injection ceiling raised from 10K to up to 20K characters, scaling with the selected model's context window.
- Rewrite and translate tasks now use a capped 8K context window (sufficient for any selection-based task, avoids unnecessary KV cache allocation).
- Rewrite and translate temperature fixed at 0.35 for deterministic, consistent output independent of the chat temperature setting.
- "Set Default" AI button now sets both the chat model and rewrite/translate model slots simultaneously.

## [1.5.0] - 2026-04-16
### Added
- New `ai_runtime_diagnostics` backend command and AI Settings diagnostics panel fields for server source, active model processor usage, and backend policy text.
- Vault-backed settings durability backup at `.teacherpro/ui-settings.backup.json`, with automatic fallback restore when app-local settings are missing.
- AI model cards now include neutral capability chips (`reasoning`, `multilingual`, `low-latency`, `long-context`, `english-focused`) for lightweight guidance.
- Unified, collapsible sidebar search block with one global query applied across lesson plans, mindmaps, materials, and trash.
- Model-aware thinking support map in chat; unsupported models now disable the thinking toggle and never send thinking requests.

### Changed
- AI model catalog is modernized around current practical Ollama families/tags including Gemma 4, Qwen 3, Llama 3.2, DeepSeek R1 8B, Mistral Small 3.1, and Phi 4.
- AI generation now accepts model-aware runtime defaults (`num_ctx`, `num_predict`) and raises the prompt guardrail to 30,000 characters for richer lesson-context chat prompts.
- AI settings now expose separate routing selectors: one model for lesson chat and one shared model for rewrite + translation.
- Gemma 4 guidance now uses practical RAM/VRAM estimates and labels memory guidance consistently as `RAM/VRAM`.
- Runtime diagnostics now describe hybrid GPU behavior explicitly (CUDA backend targets NVIDIA GPU when available).
- Sidebar section actions were visually simplified to cleaner icon-ghost controls, and Materials now uses one `+` action with a compact add-files/add-folder menu.
- Material image previews now use blob URLs with extension-to-MIME mapping for broader cross-file compatibility.
- Settings modal size and tab/card typography were increased for better readability on high-resolution displays.

### Fixed
- Mini sidebar calendar date cells now use fixed dimensions and stable border sizing to prevent jumpy day-gap shifts while changing selected dates.
- Theme mode setter now persists the selected mode value instead of forcing a hardcoded dark value.
- Windows AI runtime/model process launches now consistently run with hidden process flags to prevent random command-window flashes.
- App-managed Ollama runtime now self-corrects CPU-only fallback by restarting with the preferred GPU backend when diagnostics detect the selected model running on CPU despite GPU-capable hardware.
- Material preview reliability improved for more image file types (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`, `avif`, `tif`, `tiff`, `ico`).

## [1.4.1] - 2026-04-16
### Added
- New release guard script `npm run verify:scrollbars` to enforce thin dark scrollbar invariants before packaging.
- Both GitHub workflows (`release.yml` and `build-cross-platform.yml`) now run scrollbar invariant verification before building installers.

### Changed
- Component-level scrollbar overrides in main content, Notes, and AI Chat now use explicit dark track + thumb colors instead of transparent tracks.

### Fixed
- Packaged app builds no longer fall back to large white/native scrollbar gutters on macOS WKWebView.
- Global scrollbar fallback CSS in `index.html` and `src/index.css` is now hardened for consistent thin dark rendering across installed app targets.

## [1.4.0] - 2026-04-16
### Added
- Private per-lesson Notes drawer in the editor with autosave persistence and local search indexing support.
- Configurable default lesson-table body row count in Settings > Defaults (range 1-12, default 4).
- Weekly Calendar drag-and-drop lesson rescheduling across day columns.

### Changed
- Notes and AI Chat now share the same left slide-out dock footprint, with mutual exclusivity (only one can be open at a time).
- Notes action button is now in the main editor action row, styled consistently with the other header actions.
- Opening Notes or AI Chat now auto-expands the collapsible sidebar to avoid clipped dock layouts.

### Fixed
- Drag-rescheduling now updates both `metadata.plannedFor` and the lesson filename date token so cards move immediately to the correct day.
- Rescheduling no longer drops selected subject values; subject metadata is preserved with robust fallback handling.
- Notes textarea now explicitly uses the same thin dark scrollbar styling as the rest of the app for consistent WKWebView rendering.

## [1.3.2] - 2026-04-15
### Fixed
- Scrollbar fix from v1.3.1 was never actually committed — the `index.html` stylesheet change was only applied locally. CSS is now properly committed and included in the release.
- Custom thin dark scrollbar styles (`::-webkit-scrollbar`, `scrollbar-color`) are now injected via a `<style>` block directly in `index.html` `<head>`, which is the only method reliably respected by the Tauri WKWebView document model.

### Known Issues
- Automatic shutdown of the Ollama background service when quitting TeacherPro is not yet fully working and is still under investigation.

## [1.3.1] - 2026-04-15
### Fixed
- Scrollbars throughout the app now consistently use the thin dark style. The main editor area and AI chat panel were showing a white OS-native scrollbar in certain cases; all scroll containers now explicitly override `-webkit-scrollbar` styles and `scrollbar-color`.
- Ollama menu bar app (`Ollama.app`) now closes when TeacherPro quits on macOS. Previously only the CLI process (`ollama`) was killed; now a graceful `osascript quit` is sent to the app bundle followed by a case-insensitive `pkill -ix ollama` to catch both the app and any CLI remnants.

## [1.3.0] - 2026-04-15
### Added
- AI rewrite context menu now expands into six tone options: Improve, More Formal, More Casual, Simpler, More Engaging, More Concise.
- AI translate context menu now expands into a language picker with 12 common languages. The configured target language is pinned at the top with a ★ indicator.
- Lesson AI Chat now includes five quick-action chips when the chat is empty: Summarize this lesson, Key themes & topics, Check learning objectives, Suggest improvements, Activity ideas.
- Chat clear button (trash icon) in the chat header resets conversation history and restores quick-action chips.

### Changed
- AI rewrite and translate are now permitted inside table cells and list items, not just plain paragraphs and headings. The guard now only blocks selections that span across multiple textblocks.
- AI rewrite prompt overhauled: dedicated system prompt per mode, explicit instruction that the model must change the wording (not echo back the input), and tone-specific instructions per variant.
- Lesson AI Chat is now purely conversational — the REPLACE:N automatic in-place editing approach has been removed in favor of reliability. The chat reads and discusses the lesson but does not modify it.
- Chat now includes teacher name, subject, and planned date metadata in every message sent to the AI.
- Default chat system prompt now explicitly forbids asking the teacher to paste content, covers summarization, theme identification, and recommendations, and acknowledges empty lessons gracefully.
- `AiMarkdown` renderer rewritten to properly handle headings (`#`/`##`/`###`), bullet lists (`-`/`*`/`+`), numbered lists, bold, italic, and inline code. Raw `*` characters no longer appear in chat responses.

### Fixed
- Ollama server shutdown now fires reliably on app quit (Cmd+Q and all exit paths) using `RunEvent::Exit` via `.build()` + `.run()` instead of the per-window `WindowEvent::Destroyed` which did not fire consistently on macOS.
- Ollama child process is now tracked in a static `OLLAMA_SERVER_CHILD` and killed directly rather than running `ollama stop` as a subprocess.

## [1.2.1] - 2026-04-15
### Changed
- Windows print flow now prioritizes in-app print dialogs for lesson and mindmap PDFs (PDF iframe print first, then webview print fallback) before shell-level fallback behavior.
- White lesson paper behavior on wide Windows monitors now keeps dark out-of-bounds canvas styling while still fixing gray side gutters inside the lesson container.
- GitHub release workflow now attempts to load release body content from a version-matched release-notes file (`RELEASE_NOTES_vX.Y.Z.md`) when a tag is pushed.

### Fixed
- Windows backend PDF print command path handling was hardened to avoid false failures that caused print to fall back to opening the PDF.
- Lesson paper tone regression where out-of-bounds editor areas became white in light paper mode has been corrected.

## [1.2.0] - 2026-04-15
### Added
- Subject defaults with color coding in Settings, including subject dropdown selection in the lesson editor.
- In-app rename dialog for lesson plans, mindmaps, and materials (replaces blocked prompt dialogs in Tauri).
- Centered Settings modal with tabbed sections, ESC close, and backdrop-dismiss behavior.

### Changed
- Default app accent blue is now darker (`#2d86a5`) for improved readability.
- Light mode has been removed from runtime behavior and appearance controls; dark mode is now the only app theme.
- Default mindmap blue node preset and starter node color now match the new accent blue.
- App scrollbars are slimmer and use neutral gray styling; main content scrolling now keeps a stable gutter to prevent layout width jumps.
- Lesson paper container top corners are now square to avoid clipped corner artifacts under the sticky header while scrolling.

### Fixed
- Subject color indicator in lesson metadata now uses configured subject color reliably.
- Lesson PDF preview/export subject metadata spacing and dot rendering are aligned and compact.
- First-open PDF preview no longer closes immediately due to overlay interaction timing.
- Lesson file naming on autosave now remains subject/date-based while avoiding filename collisions.
- Sidebar lesson rename flow is stable again in desktop runtime.
- White paper mode now controls the lesson paper area correctly, including the toolbar-to-paper gap strip.
- Mindmap node context menu now repositions near viewport edges so it no longer gets clipped near window bounds.
- Material-link context menu now uses viewport-safe positioning.
- All major right-click menus (sidebar, editor table, mindmap, material link) now enforce viewport max-size and internal scroll to remain fully accessible.

## [1.1.1] - 2026-04-15
### Added
- Custom accent color picker in Settings, alongside preset accent swatches.
- Independent paper-tone defaults for Lesson Plans and Mindmaps (white/dark writing surface).
- Expanded Settings panel with section tabs: Appearance, Defaults, and Advanced.

### Changed
- Light mode styling overhaul for better readability and consistency across sidebar, menus, settings, previews, and calendar surfaces.
- Sidebar collapsible category spacing and header action controls are now visually consistent across Lesson Plans, Mindmaps, Materials, and Trash.
- Settings panel now uses fixed-height tab content so switching tabs no longer causes layout jumps.

### Fixed
- Ordered list numbering visibility in lesson editor content.

## [1.1.0] - 2026-04-14
### Added
- Content-aware sidebar search for Lesson Plans and Mindmaps using indexed document data (not only file names).
- Dedicated Material and Trash search support, including nested path matching.
- In-app Trash management with restore and permanent delete actions for soft-deleted items.
- Rendered Trash preview modes for deleted lesson and mindmap JSON files to resemble in-app views.
- Optional, section-level search toggles in sidebar headers (magnifier button opens/hides search fields on demand).
- Lesson duplication from context menu for faster recurring class workflows.
- Calendar "Today" quick-jump button for instant return to current week.
- Editor autosave for lesson body and metadata, while keeping manual save available.
- Shared toolbar preference for icon-first action buttons with optional text labels.

### Changed
- Delete flows now use soft-delete semantics by default and move items into Vault Trash.
- Editor and Mindmap top action rows now default to compact icon-first controls.
- Sidebar search UX is now cleaner by hiding search fields until requested.

### Removed
- Recent lessons sidebar block was removed to reduce visual clutter and keep navigation focused.

### Fixed
- Trash context actions no longer expose confusing "Open" behavior for deleted entries.
- Trash file previews now provide useful rendered output instead of raw JSON where applicable.

## [1.0.3] - 2026-04-14
### Added
- **Intelligent Mindmap PDF Scaling**: PDF exports for Mindmaps now dynamically calculate the total bounding box of all nodes and automatically expand the PDF canvas. Your mindmaps will no longer be cropped or distorted by your zoom/pan level, maintaining an infinite, perfectly-sized wrap-around.

### Fixed
- **Clean Mindmap Export UI**: Automatically strips out the visual "React Flow" attribution watermark and floating UI control panels from the exported PDF so that print-outs look clean and professional.


## [1.0.2] - 2026-04-14
### Added
- **Typography Controls**: New Font Size dropdown added to the ProseMirror formatting toolbar (10pt up to 24pt).
- **A4 Layout Standard**: Base editor typography scaled natively to 12pt (matching Microsoft Word) for perfect 1:1 physical printing.
- **Widescreen Support**: Editor max-width container relaxed to `1800px` to naturally handle ultrawide desktop monitors seamlessly without weird gaps.

### Fixed
- **macOS Invisible Startup Issue**: Removed the background-rendering hide feature. App now reliably displays natively maximized without hijacking macOS fullscreen workspaces.
- **PDF Export Aspect Ratio Distortion**: Reverted squashing math scaling bugs inside `jsPDF`. The hidden web renderer now locks perfectly to an A4 pixel-width (`1062px` at 96 DPI) before taking the PDF snapshot, perfectly preserving sizing.
- **Table Formatting Gaps**: Erased excess bottom-spacing underneath table header cells that occurred whenever TipTap dynamically wrapped titles inside standard `<p>` margin tags.
