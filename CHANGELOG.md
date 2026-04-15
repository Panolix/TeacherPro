# Changelog

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
