# TeacherPro v2.9.5

A data-safety and reliability patch. It fixes stale editor content after
switching views, makes trash retention respect the saved setting, repairs
rewrite/translate after switching AI models, and closes several UI and
Subject DB edge cases found in an end-to-end audit.

## Highlights

- **No stale lesson text** - leaving the editor now writes the saved snapshot
  back to the active document. Reopening a lesson can no longer show older
  text that overwrites what was just typed.

- **Trash retention actually applies** - the "Never" setting is loaded at
  startup, so old trash entries are no longer deleted with the 30-day default.

- **Rewrite/translate after a model switch** - the AI client re-reads the new
  engine port and API key instead of sending the request to the old process.

- **Sidebar behavior is consistent** - collapse/reopen now uses the persisted
  setting, the TopBar expand button works, and opening Notes, AI Chat or the
  Method Bank no longer force-opens the explorer.

- **Safer materials** - folder drags insert as folders, importing the vault or
  Materials folder into itself is blocked, and uppercase `.PDF` files are
  scanned correctly.

- **Stable calendar ordering** - opening and saving a lesson preserves its
  manual calendar position; reschedules and reorders are serialized.

## Fixed

- Typing and immediately switching to Weekly View no longer restores stale
  lesson content when the lesson is reopened.
- Choosing "Never" for automatic trash cleanup is respected on startup.
- AI rewrite and translation no longer fail after switching to another model.
- Windows Subject DB names containing `:` (for example `C:`) are rejected, so
  folder operations cannot escape the vault.
- The sidebar collapse state is shared with the TopBar and persists across
  launches.
- Dragging a material folder into a lesson or mindmap creates a folder item
  instead of a file item.
- Clearing lesson notes now uses the native confirmation dialog.
- The clear-formatting button only affects the current selection instead of
  the whole document.
- Pressing Enter repeatedly during an AI response no longer starts a second
  stream.
- The chat context/token bar resets after clearing the chat or switching
  lessons.
- Adding a grade or topic from a collapsed Subject DB row now expands the
  parent and shows the input.
- Indigo and Violet accent presets now apply their actual colors.
- Mindmap previews show the saved node colors.
- Saving a lesson no longer erases its manual calendar order.
- Rescheduling a lesson can no longer race with reordering or overwrite a
  document that was switched in the meantime.
- Deleting a loose grade-level PDF no longer removes index rows for a
  same-named PDF in a topic folder.
- macOS printing now prints the spooled TeacherPro PDF rather than whichever
  Preview document happens to be frontmost.
- Removing a CUDA pack on Windows stops the engine first, avoiding locked
  files.
- Window show/focus calls now have the required Tauri permissions.

## Notes

- No vault migration is required. Lessons, mindmaps, materials, settings and
  downloaded models are preserved.
- This is a patch on top of v2.9.4. Users upgrading from older releases also
  receive the previous data-safety, calendar, material and security fixes.
- Windows and macOS installers are still unsigned. The macOS
  `xattr -cr /Applications/TeacherPro.app` workaround still applies.
- Deferred major upgrades remain: Vite 8, TypeScript 7,
  `@vitejs/plugin-react` 6 and lucide-react 1.61.
