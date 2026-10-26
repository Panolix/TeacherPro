# TeacherPro v2.9.2

A data-safety, calendar and materials patch. The theme: edits should survive
renames and view switches, lesson plans should stay on their planned day, and
materials should behave the same in lessons and mindmaps.

## Highlights

- **Renamed and copied lessons stay in the weekly view** - the calendar now
  reads each lesson's planned date from its metadata instead of guessing from
  the filename. Renaming a lesson no longer makes it disappear, and duplicated
  lessons show up on the same day as the original.

- **Duplicating from the Calendar keeps you in the Calendar** - the new copy
  appears immediately on the same day instead of pulling you into the editor.
  Duplicates of lessons in subfolders also resolve to the correct path.

- **Document writes are serialized** - lesson and mindmap saves, flushes,
  renames and deletes now go through a single write queue. An older autosave
  can no longer finish after a newer one and overwrite it.

- **Autosave revision guard** - edits made while a save is in flight are no
  longer marked as saved. A 15-second maximum interval also forces a save
  during long uninterrupted typing, instead of waiting for a pause.

- **Undo cannot cross documents** - each lesson now gets a fresh editor
  history. Pressing Ctrl+Z after switching lessons can no longer restore the
  previous lesson's content into the new file. Notes and per-lesson AI chat
  remain tied to their own lesson.

- **Close with confidence** - the status bar shows Saving, Unsaved changes and
  Save failed. Closing with a failed save asks whether to discard; cancelling
  keeps the window open. The Rust-side force-close grace period is now 30
  seconds and can be cancelled safely.

- **Materials work outside tables and in mindmaps** - double-clicking a
  material inserts it at the cursor anywhere in a lesson, including normal
  paragraphs. In a mindmap, it creates a material node at the center of the
  canvas. Dragging materials onto the lesson canvas, a table cell, a mindmap
  canvas or a mindmap node is enabled again, with a window-level fallback for
  WebView2.

- **Compact material links and nodes** - lesson material links are now inline
  chips instead of full-width bars, and mindmap material nodes wrap long
  filenames at a readable width.

- **Rename window fixes** - selecting text, pressing Delete/Backspace or
  dragging a selection no longer closes the rename dialog. Folder renames
  preflight every root, skip roots that do not contain the folder, and name the
  root when there is a real name conflict.

- **Security hardening** - fixed a `..` path-containment bypass, restricted
  "Open in default app" to safe document/image/media types, hardened ZIP
  extraction against path traversal and zip bombs, added a SQLite busy
  timeout, rejected SubjectDB paths that resolve outside the vault, added
  single-instance protection, and escaped retrieved PDF text before it is
  sent to the model.

- **AI stream correctness** - truncated or failed streams now surface as
  errors instead of a fake successful answer. Usage fields from llama-server
  deserialize correctly, and usage is requested from the engine.

## Fixed

- Renamed lessons disappearing from the weekly calendar.
- Duplicated lessons not appearing on their planned day.
- Auto-renames and folder renames losing the active document path.
- Deleting the open lesson from Calendar leaving it active in the editor.
- Saving during a rename rewriting the old path or recreating a deleted file.
- Settings being written before the vault finished loading, which could
  overwrite the portable settings backup with defaults.
- New lesson and mindmap filenames colliding when created within the same
  second.
- Trash auto-clear using the original file mtime instead of the deletion time.
- Material import, folder import and duplicate being rejected by the Tauri
  capability set.
- Image/HTML previews failing because the asset protocol was not enabled.
- Method Bank insertion being unreachable by keyboard and silent outside table
  rows.
- Notes being cleared without confirmation.
- Global context-menu suppression blocking native paste and spellcheck in
  text fields.
- Settings "Cancel" not cancelling anything.
- Low-contrast labels and 10px context-menu section labels.
- Modal dialogs missing dialog semantics; closed side panels remaining in the
  tab order.
- The document language being stuck on English when the UI language changed.
- PDF imports being unbounded in size and OCR page count.
- Local model/CUDA/ZIP extraction path and resource-limit issues.

## Changed behavior

- **Trash auto-clear now actually works.** It previously did nothing because
  the required filesystem permission was missing. It now expires items based
  on the timestamp in the trash entry name. Existing trash items older than
  your configured retention may be removed on the next refresh; check the
  Trash once after upgrading if you keep long-term items there.

- **Undo history resets per lesson.** Content is saved, but switching away and
  back starts a fresh undo stack. This is deliberate: it prevents cross-lesson
  undo from corrupting a different lesson.

- **Opening executables, scripts and HTML from material links is blocked.**
  Use Reveal in folder for those types. PDFs, Office files, images, audio and
  video still open in the system default application.

- **Unsupported file types are no longer launched.** The Rust boundary now
  rejects them instead of trusting the extension.

## Under the hood

- Added Vitest tests for the write queue, close-flush contract and trash
  retention logic (6 tests).
- Added 2 Rust tests for path-component rejection and executable-material
  rejection (12 Rust tests total).
- Added `verify:capabilities`, which checks that every fs plugin command used
  by the frontend is granted and that convertFileSrc is not used without the
  asset protocol.
- CI now runs frontend unit tests, Rust tests and the capability check in
  addition to TypeScript, clippy, static checks and builds.
- Updated README and the feature tracker to match implemented behavior.

## Notes

- No vault migration is required. Lessons, mindmaps, materials, settings and
  existing model downloads are preserved.
- Existing knowledge-base indexes are unchanged; no re-import is required.
- macOS and Windows builds are still unsigned. On macOS, the existing
  `xattr -cr /Applications/TeacherPro.app` workaround still applies.
- Known remaining work: engine crash/health monitoring, RAG scan
  reconciliation and per-page OCR for mixed PDFs, full keyboard/focus-trap
  accessibility, content/material/trash search, trash preview/original-folder
  restore, a Rust-native vault picker, and code signing/notarization.
