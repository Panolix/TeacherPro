# TeacherPro v2.4.0

A reliability and safety release focused on the autosave pipeline, destructive
actions and cross-platform path handling. Several long-broken buttons now work,
dangerous actions ask before they destroy anything, and saving finally gives
visible feedback. No layout or design changes.

## Added

- **"Saved" indicator** — the status bar now shows `Saved HH:MM` after every
  successful save (autosave, Ctrl+S and mindmap saves), so it is always clear
  that your work reached the disk.
- **Confirmation dialogs for destructive actions** — permanent deletes now ask
  before they act:
  - Empty Trash (previously it silently did nothing — see *Fixed* below).
  - "Delete permanently" on individual trash items (context menu and hover icon).
  - Deleting subjects, grades, topics or files in the Knowledge Databases.

## Fixed

- **Autosave could be silently disabled by a mistyped date** — an invalid
  "Planned for" date (e.g. `99/99/2026`) made the app stop saving *everything*
  without any warning. Saving now continues; the file simply keeps its previous
  valid date until a valid one is entered.
- **Failed saves were recorded as saved** — when a save failed (e.g. a locked
  file), the app marked the lesson as saved and never retried. Failed saves are
  now detected and retried by the next autosave.
- **Switching lessons could lose the last keystrokes** — edits made within the
  1.8 s autosave window were lost when opening another lesson, and an in-flight
  save could even swap two lessons' state. Pending edits are now flushed
  immediately when you switch, and a finishing save can no longer overwrite a
  newly opened document.
- **Calendar lesson deletion never worked** — the delete buttons in the calendar
  used a browser dialog that Tauri's webview silently blocks (it always answers
  "no"), so deleting lessons from the calendar did nothing. Deletion now works
  and asks for confirmation first.
- **Empty Trash never worked** — same cause: the confirmation dialog was
  blocked, so the button always aborted. It now shows a native dialog and
  actually empties the trash.
- **Renaming materials silently did nothing** — material rename used
  `window.prompt`, which is likewise blocked in the webview. Renaming now opens
  the same in-app dialog used for lessons and mindmaps.
- **Nested lessons jumped to the root folder on Windows** — saving a lesson that
  lived in a subfolder with a subject set could move it to the top level of
  "Lesson Plans" (a path-separator bug that only affected Windows). Subfolder
  placement is now preserved on all platforms.
- **Mindmap edits could be discarded while saving** — the saved snapshot was
  echoed back into the editor when the write finished, wiping changes made
  during the write. In-flight edits are now kept.

## Changed

- **Security: contained file opening** — lesson documents can carry material
  links of unknown origin. The Rust core now verifies that any path it is asked
  to open, reveal in the file manager, or print resolves inside the vault (or
  the OS temp directory for print spool files) before acting on it, on Windows,
  macOS and Linux. A crafted lesson file can no longer open arbitrary files on
  the disk.
- **Typing is faster** — the editor no longer re-renders the entire component
  tree on every keystroke; toolbar state updates are handled locally.
- **Saving is lighter** — same-name autosaves patch the search index for the
  affected file only, instead of rescanning the whole vault and re-reading
  every document.
- **Closing the app no longer kills your own Ollama** (macOS/Linux) —
  TeacherPro only stops an Ollama server it started itself; an independently
  launched server keeps running.
