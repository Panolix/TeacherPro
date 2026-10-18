# TeacherPro v2.9.0

A stability and data-safety release. The theme: the app should never lose a
keystroke, never freeze, and never leave you staring at a blank window.

## Highlights

- **Mindmap autosave** — mindmaps now save themselves 1.8 s after your last
  change, exactly like lesson plans always have. No more "did I press save?".
  The save button is still there; autosave also runs when you switch views,
  open another mindmap, or close the app.

- **Mindmap undo/redo** — Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) now works on the
  mindmap canvas: add, delete, connect, recolour and rename nodes, 50 steps
  deep. Deleting a node also restores its edges. Typing in the rename field
  keeps its normal text undo.

- **Rolling document backups** — before every save that replaces a lesson or
  mindmap on disk, the previous version is copied to
  `<vault>/.teacherpro/document-backups/` (`.bak-1` = last version, `.bak-2`
  = the one before). A stray select-all + delete + autosave is now a
  restore, not a loss. Backups are best-effort and never block saving.

- **The window no longer freezes during AI** — chat, rewrites, draft
  generation and token counting used to block the entire app for their whole
  duration (up to two minutes waiting for the engine to load, ten minutes on
  a slow generation). They now run off the main thread: the window stays
  responsive, draggable and scrollable while the model thinks.

- **Close with confidence** — clicking X no longer discards the last second
  and a half of typing. The window waits for pending saves to flush, then
  closes itself (with a 6 s safety net if anything hangs).

- **Crash containment** — if a panel ever throws an unexpected error, the
  rest of the app keeps running and the panel shows a "Try again" card with
  the error message instead of a white screen.

## Fixed

- Cancelling AI chat while the engine was still starting left the chat
  spinner running forever; the cancel now takes effect immediately.
- A panic in the AI subsystem could poison its locks and permanently break
  the engine, downloads or embeddings until restart; locks now recover.
- The "Verlauf löschen" (clear recents) text button is now the same trash
  icon button used in the trash header.

## Security

- The webview can no longer grant itself read/write access to arbitrary
  filesystem locations. All file access outside the vault now comes from
  paths you picked in a native dialog (recorded automatically by the dialog
  plugin), and every knowledge-base command verifies its target against the
  registered vault on the Rust side.

## Notes

- Nothing to migrate: your vault, settings and models carry over as-is.
- This is the first release where the repository version and the release tag
  agree (2.9.0 everywhere).
