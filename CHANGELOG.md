# Changelog

## [2.9.5] - 2026-10-26

### Fixed
- **Stale lesson text after switching views** - the unmount/switch flush now
  writes the saved snapshot back to the active document. Returning to a lesson
  no longer shows older text that can overwrite the freshly saved content.
- **Trash retention setting ignored at startup** - `trashAutoClearDays` is now
  loaded with the other UI settings. Choosing "Never" no longer falls back to
  the 30-day default and permanently deletes old trash entries on launch.
- **AI rewrite/translate after a model switch** - the AI client re-reads the
  engine port and per-spawn API key after switching models instead of reusing
  the dead connection.
- **Windows Subject DB path escape** - names containing `:` are rejected on
  Windows, so drive-relative components like `C:` or `C:foo` can no longer make
  `PathBuf::join` escape the vault.
- **Sidebar collapse/reopen** - the sidebar now uses the persisted store state,
  so the TopBar expand button works and the state survives restarts. Opening
  Notes, AI Chat or the Method Bank no longer force-opens the explorer.
- **Folder drag/drop** - material folder drags now carry `isDirectory` and both
  drop parsers accept `itemType`, so folders insert as folders in lessons and
  mindmaps.
- **Clear notes button** - uses the native dialog plugin instead of
  `window.confirm`, which is blocked in the Tauri webview.
- **Clear formatting scope** - the eraser now only clears the current selection
  instead of selecting the whole document first.
- **AI chat double-send** - Enter is ignored while a response is streaming, and
  a synchronous guard prevents a second request from replacing the active
  stream.
- **Chat context bar reset** - clearing the chat or switching lessons clears the
  stale token budget display.
- **Subject DB add controls** - adding a grade/topic from a collapsed row now
  expands the parent and shows the inline input.
- **Indigo/Violet accent presets** - both now map to real colors instead of
  falling back to blue.
- **Mindmap preview colors** - preview reads the saved node `style`, with a
  legacy `data.style` fallback.
- **Calendar order after editing** - opening a lesson preserves
  `metadata.calendarOrder`, so the first save no longer erases manual ordering.
- **Reschedule races** - rescheduling reads and writes inside the document write
  queue and only updates the active editor when that lesson is still open.
- **Recursive material import** - importing the vault, Materials, or an ancestor
  folder into itself is blocked instead of copying until the path limit.
- **Uppercase `.PDF` imports** - scanning and listing now treat the extension
  case-insensitively.
- **Grade-level PDF deletion** - deleting a loose PDF now removes only its
  synthetic topic index rows, not same-named PDFs in real topic folders.
- **macOS print targeting** - printing finds the spooled TeacherPro PDF by name
  instead of printing whichever Preview document is frontmost.
- **CUDA pack removal on Windows** - the engine is stopped before deleting the
  pack, avoiding locked file failures.
- **Window startup permissions** - `window.show()` and `setFocus()` now have
  the required Tauri permissions.

### Changed
- Method Bank QA preflight now expects the enabled drag/drop path.
- Sidebar panel state is persisted through the existing UI settings instead of
  local component state.

### Security
- Hardened Subject DB folder validation on Windows against drive-relative path
  components.

### Tests
- Added a Windows-only Rust test for drive-relative Subject DB names.

## [2.9.4] - 2026-10-26

### Added
- **Manual calendar ordering** - drag lesson cards up or down within a day, or
  into another day, with a thin insertion line. The order is stored in lesson
  metadata and survives restarts.
- **Sidebar reordering** - drag lessons and mindmaps up or down within folders
  or at the root. The order is saved in `.teacherpro/sidebar-order.json`;
  folder drops still use the folder target highlight.
- **Recoverable Trash** - a `.teacherpro/trash.json` manifest records the
  original folder; restore returns items to that folder, and trash items can be
  previewed and searched.
- **Unified vault search** - recursive lesson/mindmap names, folders and
  content, live materials, and trash entries with paths and snippets.
- **Mindmap connection handles** - top, right, bottom and left handles while
  preserving existing top/bottom edges.
- **Material fallback opening** - unsupported previews can be opened in the
  default app, including materials opened from Trash.
- **Calendar rename button** - lessons can be renamed inline from the weekly
  calendar without opening the editor.

### Changed
- New lessons use clean default names (`Lesson.json`/`Stunde.json`) and new
  mindmaps use `Mindmap.json`; moving a lesson between days no longer renames
  it. Only legacy `Untitled-Lesson` drafts are still auto-renamed.
- Calendar rows are sorted by saved order, then by filename for unlisted
  lessons. Sidebar folders stay first; files use saved order with an
  alphabetical fallback.
- The sidebar new-item controls use the shorter Lesson/Mindmap/Folder labels
  and a horizontal layout.
- Drag feedback is limited to the thin insertion line and the folder drop
  highlight; card and file hover highlights are suppressed while dragging.

### Fixed
- Dragging a lesson to another day no longer resets its title or creates a
  random date-stamped filename.
- The material count and search-result subtitle no longer render replacement
  glyphs.
- Calendar insertion markers are thin accent lines without a glow or start
  dot.
- Trash restoration now respects the original folder instead of placing every
  item at the section root.

### Tests
- Added Vitest coverage for trash manifest parsing, display-name cleanup,
  original-folder restoration and retention checks.

## [2.9.3] - 2026-10-26

### Fixed
- **Single sidebar selection** - folder and file/mindmap highlights are now
  mutually exclusive. Empty-space clicks clear both; the open document stays
  open.
- **Nested file highlighting on Windows** - active files are matched by root
  and normalized path, instead of relying on native separators.
- **Subfolder creation** - opening "New Subfolder" now clears the file
  highlight before the folder becomes the target.
- **Release draft tagging** - version-tag drafts now explicitly use the pushed
  tag instead of being left untagged.

### Changed
- Minor dependency updates: React/React DOM 19.3.1, React types 19.3,
  Tailwind 4.3.3, `@xyflow/react` 12.12.0, date-fns 4.4.0, Zustand 5.0.16,
  Tauri CLI 2.12.4, autoprefixer 10.6.1, PostCSS 8.5.31.
- Added a warnings-only ESLint baseline with TypeScript, React hooks and React
  refresh rules, and a CI lint step. Current baseline: 80 warnings, 0 errors.
- Updated GitHub Actions majors and added Dependabot for GitHub Actions, npm
  minor/patch and Cargo minor/patch updates.

## [2.9.2] - 2026-10-26

### Fixed
- **Renamed lessons disappear from the week** - the calendar now reads
  `metadata.plannedFor` instead of relying on the filename date. Renamed and
  duplicated lessons stay on their planned day.
- **Duplicates from Calendar** - duplicating no longer pulls you into the
  editor, so the copy is visible immediately. Duplicates in subfolders open
  with the correct relative path.
- **Save races** - lesson/mindmap writes, flushes, renames and deletes use a
  serialized write queue. A save that finishes late can no longer overwrite a
  newer one, and edits typed during a save stay dirty.
- **Cross-lesson undo** - each lesson gets a fresh editor history, so Ctrl+Z
  cannot restore another lesson's text into the current file.
- **Close/save failures** - the status bar shows Saving/Unsaved/Save failed;
  closing with a failed save asks before discarding. The force-close grace
  period is 30 s and cancellable.
- **Rename window closing** - Delete, Backspace, Ctrl+A and selection drags no
  longer close the rename dialog. Folder renames preflight every root and name
  the conflicting root.
- **Active-document path bugs** - folder rename/move/delete and Calendar
  deletion no longer leave a stale active file or resurrect a deleted lesson.
- **Settings startup race** - startup no longer overwrites the vault settings
  backup with defaults.
- **Trash retention** - auto-clear uses the trash-entry timestamp instead of
  the original file mtime. Existing items older than the retention period may
  be removed on the next refresh.
- **Materials** - copy-file permission restores import/duplicate; image/HTML
  previews use blob URLs; double-click inserts outside tables and into
  mindmaps; drag-and-drop handlers are enabled with a WebView2 fallback;
  material chips and mindmap nodes are compact.
- **Security** - fixed a `..` path-containment bypass, added an open-file
  allowlist, hardened ZIP extraction, added SQLite `busy_timeout`, rejected
  SubjectDB roots outside the vault, added single-instance protection, and
  escaped retrieved PDF text.
- **AI streaming** - truncated streams become errors; usage fields deserialize
  correctly and are requested from llama-server.
- **PDF/OCR limits** - 250 MB PDF cap and 300-page OCR cap.
- **Accessibility/i18n** - dialog roles, inert closed panels, aria-live,
  labels, contrast fixes, `html lang`, notes-clear confirmation, and Settings
  Close/Done semantics.

### Changed
- Undo history is per lesson; content is saved, but switching away and back
  starts a fresh undo stack.
- Executable/script/HTML materials cannot be opened from material links; use
  Reveal in folder instead.
- One app instance per vault; a second launch focuses the existing window.

### Added
- Vitest tests for the write queue, close flush and trash retention.
- Rust tests for path-component and executable-material rejection.
- `verify:capabilities` and CI steps for frontend tests, Rust tests and the
  capability check.

## [2.9.1] - 2026-10-19

### Fixed
- **Models can be removed from disk** — Settings → AI Features now has a
  delete action for downloaded models. It confirms first, unloads the engine if
  that model is running, clears the active selection, and removes the GGUF,
  partial download and optional MTP draft files.
- **"Use" routes both AI tasks** — activating a model now sets both the chat
  model and the rewrite/translate model instead of leaving the latter on
  "Automatic".
- **Knowledge-base scope no longer leaks between lessons** — opening a new or
  different lesson clears the previous DB selection; save-driven renames of the
  same lesson keep it. The draft generator resets too.
- **Citation chips are visible** — they used an undefined `--tp-text-secondary`
  variable and rendered dark-on-dark until selected. The variable is fixed, and
  source chips now only list excerpts actually sent to the model.
- **OCR page order** — scanned PDF pages are sorted numerically, so page 10 no
  longer comes before page 2 and later citations point at the correct page.
- **Top-bar label toggle** — "Aktionsbutton-Beschriftungen anzeigen" now
  actually hides/shows the editor action labels.
- **Target-model context budget** — chat now resolves the real context window
  of the model that will serve the request, reserves output tokens and trims
  history to fit. The previous hardcoded 32k cap and fake context-growth logic
  are gone.

### Improved
- **Unified teacher-assistant prompt** — lesson questions, general questions
  and source-grounded research are handled by one prompt; replies follow the
  user's language instead of forcing German.
- **Retrieval contract** — the model receives a language-neutral
  `<knowledge_base>` block with explicit `found`, `no_matches` or
  `search_failed` state and a consistent `[file, p.N]` citation format.
- **Context bar** — now includes the question segment and uses the real total
  context for segment widths.

## [2.9.0] - 2026-10-18

### Fixed
- **UI no longer freezes during AI** — AI chat, rewrites, drafts and token
  counting ran as synchronous commands on the main thread and blocked the
  whole window for their duration (up to the 120 s engine-start wait or the
  600 s generation timeout). All four commands now run on the blocking pool.
- **Closing the window can no longer lose edits** — the last autosave window
  (up to 1.8 s of typing) was discarded on close. The window now stays open
  while pending saves flush, then closes; a safety timer force-closes a hung
  webview after 6 s.
- **A crashed panel no longer white-screens the app** — React error bounds
  now wrap the sidebar, the content area and the app root; a crashed panel
  shows a "Try again / Reload" card instead of a blank window.
- **Cancelling AI while the engine was still starting** left the chat waiting
  forever; the cancel is now honoured and the chat resolves immediately.

### Added
- **Mindmap autosave** — mindmaps save automatically 1.8 s after the last
  change, mirroring the lesson editor. The save button still works; the
  flush also runs when switching views, switching mindmaps and on app close.
- **Mindmap undo/redo** — Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) for add, delete,
  connect, colour and rename operations (50 steps). Text inputs keep their
  native undo.
- **Rolling document backups** — before every in-place lesson or mindmap
  write, the previous version is copied to
  `<vault>/.teacherpro/document-backups/` (`<name>.bak-1`, `.bak-2`).
  Accidental select-all + delete + autosave is now recoverable.

### Improved
- **Hardened sandbox** — the webview can no longer grant itself filesystem
  access outside the vault (or temp). Native file dialogs still work
  everywhere because picked paths are recorded automatically by the dialog
  plugin; all knowledge-base commands now additionally verify the vault root
  against the registered vault on the Rust side.
- **Panic-proof AI subsystem** — a panic while an AI lock was held no longer
  permanently bricks engine/downloads/embeddings for the session; locks
  recover instead of cascading.
- **Recent list** — the "Verlauf löschen" text button is now the same trash
  icon used in the trash header.

### Internal
- Version drift fix: release automation now syncs versions from the tag, and
  this release is the first tagged with repo and release in agreement.

## [2.7.1] - 2026-10-17

### Fixed
- **Weekly planner dialogs** — "delete all for this day" showed a raw key
  (`calendar.confirm.moveAllForDate`); key names from code and dictionaries
  now match. Single-lesson delete no longer prompts; only bulk deletes ask.
- **Localized dialog buttons** — native confirmations show Ja/Nein in German
  and Yes/No in English (weekly planner, trash, subject DB).
- **Missing translation** — `mindmap.emptyFile` added in both languages.

### Improved
- **Readability pass** — 11px minimum UI text size enforced app-wide,
  secondary text 12px → 12.5px, brighter muted colors (WCAG AA ~5.2:1),
  larger/brighter status bar.
- **Inter UI font** — app chrome uses bundled Inter; paper and mindmaps keep
  their previous system font stack for unchanged exports.
- **CI guards** — typography minimum and i18n key parity checks added.

### Internal
- Planning docs moved to `docs/`, release notes to `release-notes/`, stale
  duplicate assets removed from the repo root.

## [2.7.0] - 2026-10-17

### Fixed
- **Underline colour rendering** — underline colour was stored but never
  painted (underlines always used the text colour). Now renders correctly in
  the editor, preview and printed output, independent of the text colour.
- **Text-style attributes overwriting each other** — changing text colour,
  underline colour, font size or font family wiped the other attributes on
  the shared text-style mark; all changes now merge.
- **Preview/print/export failing on lessons with material links** — snapshot
  failures caused by dead image references are now benign; the pipeline skips
  them and tolerates broken images.
- **Material preview scaling with canvas zoom** — the preview modal is now
  rendered outside the zoomed canvas at a consistent size.

### Added / Improved
- **One-click rail colours + palette** — click A/U/H to apply the last-used
  colour; right-click opens a compact 15-colour palette.
- **Formatting bar inside table selections** — right-clicking selected text in
  a table shows the mini formatting toolbar.
- **Table context menu trimmed** — merge/split cells and header toggles
  removed; menu ends at Delete Table.

### Internal
- Editor split into focused modules (rail, context menu, AI chat, notes,
  method bank, PDF pipeline). No functional change intended.

## [2.6.1] - 2026-10-16

### Fixed
- **Context menu "Select All Text" alignment** — the row now carries a
  leading icon like its siblings, so it aligns flush-left instead of
  appearing shifted toward the middle of the menu.

## [2.6.0] - 2026-10-16

### Added
- **Twelve bundled fonts** — Inter, Lato, Nunito, Lexend, Atkinson Hyperlegible,
  Merriweather, Lora, Playfair Display, EB Garamond, Caveat, Patrick Hand and
  Shadows Into Light, grouped by category in a new font picker. Shipped inside
  the app (SIL OFL, see `src/assets/fonts/LICENSE.txt`) so documents render
  identically on every machine and in every export.
- **Editor features** — text alignment, checklists, subscript/superscript,
  blockquote and web links (with insert/edit/remove popover and safe browser
  opening).
- **Word-style shortcuts** — Ctrl/Cmd+E/L/R/J alignment, Ctrl/Cmd+K link,
  Ctrl/Cmd+P print, Ctrl/Cmd+Shift+V paste-as-plain-text; tooltips display the
  correct modifier key per platform.
- **Clipboard in context menus** — Cut/Copy/Paste backed by the native OS
  clipboard (Tauri clipboard-manager plugin). Copy writes formatted HTML for
  pasting into Word/Docs; menu Paste inserts clean plain text and only shows
  when the clipboard has content.
- **Context-aware right-click menus** — format bar + clipboard on selections,
  insert menu on empty space, table operations inside tables, AI entries when
  local AI is enabled; menus appear at the click point on all zoom levels.

### Fixed
- **Windows printing** — closing the print preview no longer leaves the
  toolbar greyed out, and the phantom second print dialog no longer appears
  (WebView2 does not reliably fire `afterprint` for PDF previews).
- **Print quality** — exports now render at ~300 DPI (was ~192), drawn at true
  physical size (no 2% stretch), with 5 mm top/bottom page margins (was 8 mm).
- **Paste position** — single-line pastes land inline exactly where clicked,
  including whitespace above/below content; multi-line content becomes
  paragraphs.
- **Context menu scaling** — menus were scaled/displaced by the page zoom;
  now rendered outside the zoom container at intended size and position.

### Changed
- **Toolbar rail** — consistent control sizing and larger hit areas.
- **Accessibility** — keyboard focus rings, reduced-motion support, toolbar
  semantics.

## [2.5.3] - 2026-10-16

### Fixed
- **macOS printing** — print spool PDFs are now handed to Preview through
  LaunchServices so the sandboxed Preview app can actually read them;
  printing previously failed with "couldn't be opened because you don't have
  permission to view it" (AppleEvent error -10000).

### Security
- **Dependency security refresh** — `npm audit` and `cargo audit` now report
  zero known vulnerabilities: TipTap updated 3.22 → 3.32 (fixes a ProseMirror
  paste XSS and a `mergeAttributes` prototype-pollution advisory), plus
  patched prosemirror-view, markdown-it, nanoid, postcss, vite, esbuild,
  rustls, quick-xml and rustls-webpki.

### Changed
- **App identifier** — Tauri identifier changed from `com.pano.temp-app` to
  `com.pano.teacherpro`. On first launch the settings store is copied from the
  legacy app-data directory, so existing local settings are preserved.

### Removed
- **Unused dependencies** — dropped `docx` and `html2pdf.js`; no code
  referenced them.

## [2.5.2] - 2026-10-11

### Improved
- **Smarter minimum window size** — window can no longer be resized below
  960 × 540 (was 800 × 600); guarantees the lesson paper fits at Fit zoom
  with the sidebar open while still allowing Windows half-screen snapping.
- **Top bar buttons collapse on narrow windows** — labeled actions shrink
  to icon-only when the bar runs out of room and restore their labels when
  space returns; fixes button overflow on small windows.
- **Lesson paper fills very wide screens** — Fit zoom ceiling raised from
  150 % to 200 % so large/ultrawide monitors use the available width.

### Removed
- **Unused layout CSS variables** — dropped the never-referenced
  `--tp-sidebar-w`, `--tp-sidebar-cw` and `--tp-panel-w` tokens.

## [2.5.1] - 2026-10-04

### Removed
- **Status bar item counts** — the lesson plan/mindmap counts no longer
  appear in the bottom bar; it now shows only vault status, save time and
  zoom controls.
- **Status bar "editing" indicator** — the "Bearbeite"/"Editing" label while
  a lesson plan or mindmap is open was removed as well.

## [2.5.0] - 2026-10-04

### Added
- **Apple Silicon (MLX) model variants** — 10 models also available as MLX
  builds (qwen3.5 4B/9B, gemma4 E2B/E4B/12B/26B/31B, qwen3.6 27B/35B,
  qwen3.8 27B) with an "Apple Silicon optimized" badge; standard builds stay
  in the list for Windows/Linux/dedicated GPUs.
- **Full translation coverage** — vault error alerts, AI model management
  errors, AI selection/chat status messages, PDF export error details, chat
  quick-action prompts, Knowledge Databases panel strings, file picker
  titles, date-picker tooltip and mindmap "New Idea" label now follow the
  language selector; AI model descriptions are bilingual.

### Improved
- **Status bar counts** — always shows `N lesson plans · N mindmaps`
  (translated, proper singulars) instead of switching with the active view;
  the "editing" indicator now also appears for open mindmaps.

### Fixed
- **Empty folders counted as lessons/mindmaps** — leftover subject subfolders
  no longer inflate the status bar counts.
- **Model catalog accuracy** — verified against the live Ollama registry;
  corrected the bge-m3 disk estimate.

## [2.4.0] - 2026-10-04

### Added
- **"Saved" indicator** — the status bar shows `Saved HH:MM` after every
  successful save (autosave, manual save and mindmap saves).
- **Confirmation dialogs for destructive actions** — Empty Trash, per-item
  "Delete permanently" in the trash, and subject/grade/topic/file deletes in
  the Knowledge Databases now ask before destroying anything.

### Fixed
- **Autosave silently disabled by an invalid "Planned for" date** — a mistyped
  date stopped all saving without warning; saving now continues and the file
  keeps its previous valid date.
- **Failed saves were marked as saved** — save failures are now detected and
  retried by the next autosave instead of being recorded as saved.
- **Switching lessons lost pending edits** — edits typed within the 1.8 s
  autosave window are now flushed immediately when the lesson changes, and an
  in-flight save can no longer overwrite a newly opened document's state.
- **Calendar lesson deletion never worked** — the delete buttons used
  `window.confirm`, which Tauri's webview silently blocks (always "no");
  deletion now works and asks for confirmation first.
- **Empty Trash never worked** — same blocked-dialog cause; it now shows a
  native confirmation and actually empties the trash.
- **Renaming materials silently did nothing** — `window.prompt` is blocked in
  the webview; renaming now opens the shared in-app rename dialog.
- **Nested lessons jumped to the root on Windows** — saving a subfolder lesson
  with a subject set could move it to "Lesson Plans" root (separator-sensitive
  prefix comparison); folder placement is preserved on all platforms.
- **Mindmap edits discarded while saving** — the save-completion echo no longer
  resets the graph, keeping edits made during the write.

### Changed
- **Security: contained file access** — opening, revealing and printing paths
  are now validated on the Rust side to stay inside the vault (or the OS temp
  directory for print spool files), on all platforms. Crafted lesson documents
  can no longer open arbitrary files.
- **Typing performance** — the editor no longer re-renders the full component
  tree on every keystroke.
- **Save performance** — same-name autosaves update only the affected file's
  search index entries instead of rescanning the entire vault.
- **macOS/Linux: closing the app no longer kills an independently started
  Ollama server** — only a server spawned by TeacherPro is stopped.

## [2.3.1] - 2026-10-03

### Fixed
- **Crash-safe document saving** — lessons, mindmaps and settings backups are
  written atomically (temp file + rename) on Windows, macOS and Linux, so a
  crash or power loss can no longer truncate a document.
- **Embedding stores no longer wiped by corruption** — a partially written
  `chunks.json` is quarantined (`chunks.json.corrupt-<timestamp>`) instead of
  being silently reset to an empty store.
- **UI freezes during AI operations** — runtime status, diagnostics and model
  install/removal commands moved to background threads (`spawn_blocking`).
- **Duplicating binary materials** — PDFs, images and other non-text files can
  now be duplicated from the vault context menu (uses `copyFile` instead of
  text read/write).
- **Wrong document closed on delete/rename** — the `endsWith` filename match is
  replaced with an exact, separator-aware path comparison, so files like
  "My Lesson.json" no longer get confused with "Lesson.json".
- **Settings write races** — settings persistence is serialized, so rapid
  changes can no longer drop a merged value.
- **Swallowed save errors** — chunk-store write failures are now reported in
  the import/delete result messages instead of failing silently.
- **Test fix** — the vector store top-k test used parallel embeddings that made
  all cosine scores identical; embeddings are now strictly ordered.

### Changed
- Dependency hygiene: `zustand` and `lucide-react` moved to `dependencies`;
  unused `clsx` and `tailwind-merge` removed.
- Removed leftover debug `console.log` output (including AI response dumps).
- Removed obsolete files: `patch_main_content.js`, `MindmapView.tsx.bak`,
  `pdfExport.ts.bak2/.bak3`.
- Zero `cargo clippy` warnings across platforms.

## [2.3.0] - 2026-09-21

### Changed
- **AI model catalog refreshed** — outdated locally-runnable models replaced with
  current generations: Granite 4.2, LFM 2.5, Ministral 3, GPT-OSS 20B,
  Qwen 3.6/3.8 and Gemma 4 12B/31B. Removed Llama 3.1/3.2, DeepSeek R1,
  Mistral Nemo and Mistral Small 3.1. All entries now fit hardware from
  8 GB RAM laptops up to a 24 GB VRAM (RTX 4090 class) GPU.

### Removed
- Unused legacy `modelCatalog` translation strings in `src/i18n/de.ts` and `en.ts`.

## [2.2.4] - 2026-09-21

### Added
- **Unified hover/press feedback** — all buttons use the same subtle interaction
  (slight lift, soft press, consistent hover surfaces)
- **Column resize cursor in tables** — the cursor changes to the left-right resize
  icon at column borders, with an accent line marking the active edge

### Fixed
- **Security hardening** — path validation for print/open, subject DB path
  traversal protection, restricted filesystem scope with runtime grants,
  production CSP, secure GGUF temp file, and sanitized preview rendering
- **Dead hover effects** — font size picker, date picker, AI chat selector,
  calendar navigation and other buttons respond visibly again

## [2.2.3] - 2026-06-28

### Added
- **Geräteübergreifende Vault-Portabilität** — Settings wie Lehrername, Fächer,
  Sprache und Sidebar-Zustand werden jetzt beim ersten Öffnen eines Vaults aus
  der `.teacherpro/ui-settings.backup.json` gelesen und nicht mehr mit Defaults
  überschrieben. KI-Modell-Einstellungen bleiben gerätespezifisch.

### Fixed
- **Settings-Overwrite-Bug in `openVault`** — Beim Öffnen eines Vaults auf einem
  neuen Gerät wurde die Backup-Datei im Vault mit leeren Defaults überschrieben,
  sodass alle portablen Einstellungen verloren gingen

## [2.2.2] - 2026-06-27

### Fixed
- **Alle KI-Modelle werden korrekt erkannt** — `parse_ollama_models` entfernt
  nur noch das `:latest`-Suffix statt alle Tags. Modelle mit Doppelpunkt in der
  ID (z. B. `qwen3.5:9b`) werden nicht mehr zerstört

## [2.2.1] - 2026-06-27

### Fixed
- **HTML-Entities im KI-Chat** — `&rightarrow;` und andere HTML-Entities werden
  jetzt korrekt dekodiert und als tatsächliche Zeichen angezeigt
- **Embedding-Modell nicht erkannt** — `bge-m3` wird jetzt auch dann als
  installiert erkannt, wenn Ollama es mit `:latest`-Tag listet; Modellvergleich
  ignoriert Tags
- **„Aktualisieren"-Button flackert nicht mehr** — `syncInstalledModels` ist in
  `useCallback` gewrapped, sodass der Effekt nicht mehr in einer Endlosschleife
  feuert

### Fixed (previous unreleased)
- **Ollama GPU-Erkennung auf Windows** — `OLLAMA_LLM_LIBRARY` wird nicht mehr gesetzt;
  Ollama auto-detect findet jetzt CUDA/cuBLAS korrekt (z. B. RTX 4090, 24 GB VRAM)
- **Ollama-Prozesse werden nicht mehr gekillt** — Der Windows-Dienst/die Tray-App
  bleibt beim App-Start erhalten und wird beim Beenden nicht mehr mit `taskkill`
  beendet; CPU-Fallback bei eigenem Start entfällt
- **GPU-Erkennung robuster gemacht** — `query_nvidia_gpu_names` probiert jetzt
  auch Standard-NVIDIA-Pfade (`C:\Program Files\NVIDIA Corporation\NVSMI\`),
  falls `nvidia-smi` nicht im PATH liegt; zusätzlich Fallback auf den
  CUDA-Backend-Ordner (`cuda_v12/`)

### Changed
- **Ollama-Shutdown unter Windows** — Löscht nur den eigenen Child-Prozess;
  der Windows-Dienst wird nicht mehr mit `sc stop` gestoppt

## [2.1.1] - 2026-06-25
### Fixed
- **UI freeze on Refresh** — `ai_list_models` made async so clicking Refresh in AI Settings no longer blocks the UI when Ollama isn't running.
- **Right-click context menu** — Browser default menu (Inspect/Refresh) is now globally suppressed; only app context menus appear.
- **Font readability** — Tertiary/quaternary text colors brightened (`#888→#9a9a9a`, `#555→#777`) for better contrast on dark theme.

### Changed
- **Calendar buttons** — Day footer Add/Delete buttons are now icon-only with equal size (w-7 h-7), centered layout, no text labels.
- **Header delete button** — Icon-only with tooltip, matching the balanced design.

## [2.1.0] - 2026-06-25
### Added
- **German localization (i18n)** — Complete UI translation, language switcher in Settings, persistent language selection
- **German Method Bank** — `method-bank.de.json` with all content translated
- **11 new teaching methods**: Kugellager/Speed Dating, Placemat, Card Query, Traffic Light Self-Assessment, Learning Diary, Portfolio Work, Weekly Plan Work, Tandem Work, Free Work, Learning Circuit, Learning Pace Duet
- **3 new lesson phases**: Homework Review, Consolidation/Written Record, Repetition/Drill Practice
- **Time suggestions via `/`** in lesson table Time column (5-60 min in 5-min steps)
- **New AI models**: Qwen 3.5 4B/9B/27B, Qwen 3.6 27B, TranslateGemma
- **German date formatting** — Weekdays and months now localized via date-fns locale

### Changed
- Default AI model changed to **Qwen 3.5 9B** (256K context, 201 languages, thinking support)
- Slash menu limit increased from 7 to 30 suggestions
- "Social Form" column width increased from 100px to 140px
- Ollama now always terminates on app exit (all platforms)
- Removed 28 exotic/niche method bank entries

### Removed
- Outdated models: Qwen 3 8B/14B, Phi 4 14B, Gemma 4 31B
- Runtime diagnostics section from AI Settings (removed freeze-on-tab-switch)

### Fixed
- "New Lesson Plan" now shows "Neue Stunde" on German setting
- Calendar showing raw key "calendar.defaultlessontitle"
- Language buttons in Settings were illegible (used color-swatch class)
- Method Bank entries were limited to 7 in slash menu

## [2.0.4] - 2026-04-19
### Added
- **Method Bank expansion** — 20 new teaching methods added (103 total): All-Student Response, Peer Teaching Protocol, Self-Regulation Check-in, Purposeful Questioning Sequence, Productive Struggle Support, Sentence Stems for Academic Talk, Frontloading Vocabulary, Graphic Organizer with Word Bank, Comprehensible Input Routine, Tableau (Frozen Scene), Reader's Theatre, Shadow Puppet Narrative, Error Analysis Protocol, Number Talk, Claim-Evidence-Reasoning, Notice & Wonder, Which One Doesn't Belong?, Co-Creating Success Criteria, Two Stars and a Wish, Traffic Light Self-Assessment.
- **Trash auto-clear** — New setting in Settings > Advanced to automatically delete items from trash after a specified period (7, 14, 30, or 90 days). Default is 30 days. Set to "Never" for manual-only deletion.

### Changed
- Trash cleanup now runs automatically on vault refresh when auto-clear is enabled.

## [2.0.3] - 2026-04-19
### Added
- **Lesson canvas zoom controls** — new zoom cluster in status bar (visible when lesson open) with `−` / `%` / `+` buttons, preset menu (Fit to width, 50–200%), and keyboard shortcuts (`Cmd/Ctrl ±0`).
- **Fit-to-width mode** dynamically scales the paper to fill available space (capped at 150%).

### Changed
- Lesson paper now px-locked to PDF export width (1062px) instead of `min(297mm, 100%)`, eliminating silent squish/reflow on narrow viewports.
- Paper dimensions now driven by CSS variables (`--tp-export-content-w`, `--tp-paper-w`, `--tp-paper-h`) as single source of truth.

### Fixed
- Weekly calendar "Today" button now shows hover/click feedback (was blocked by inline styles).

## [2.0.2] - 2026-04-19
### Changed
- Default lesson editor font size reduced from 12pt to 11pt for better readability.
- Table headers and headings adjusted proportionally.

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
