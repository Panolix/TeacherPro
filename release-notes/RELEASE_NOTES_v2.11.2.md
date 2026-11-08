# TeacherPro v2.11.2

A bug-fix and data-safety update. The visual design and intended workflows stay the same.

## Fixed

- **Safer saving:** newer notes, metadata and in-progress text survive older save
  completions. Failed atomic replacement retains the original and a temporary
  recovery copy instead of directly overwriting the document.
- **Safer navigation:** switching vaults or opening the weekly view waits for
  pending saves. A failed save requires explicit confirmation before discarding
  edits. Old vault document/database state is cleared on a switch.
- **Independent duplicates:** copied lessons have their own identity, undo history
  and chat session, and include the latest saved edits.
- **Knowledge-base safety:** nested junction/symlink escapes and unsafe SQLite
  sidecars are rejected; PDF import sources must be authorized.
- **Reliable rescans:** modified PDFs refresh their index, externally deleted PDFs
  are removed from search, and unchanged PDFs are skipped. Subject-level files
  are no longer moved as a side effect of scanning.
- **Responsive AI Stop:** cancellation interrupts stalled HTTP reads and cleans up
  request/listener state, including when the editor closes.
- **Close confirmation:** the watchdog no longer closes the app while you are
  deciding whether to discard unsaved work.
- **Uppercase files:** `.JSON` lessons and mindmaps now open normally.
- **macOS print targeting:** printing selects the exact newly generated spool PDF,
  not an older TeacherPro print left open in Preview.

## Compatibility and testing

- Existing lesson files remain supported. A stable document ID is retained when
  a lesson is saved; no manual vault migration is required.
- The next knowledge-base scan computes missing fingerprints and may re-index
  existing PDFs. Original PDFs are not rewritten.
- Added **39 regression tests**: **80 tests pass on Windows**.
- A dedicated macOS preflight checks native Rust tests/Clippy, AppleScript
  compilation and print-target selection. Interactive native printing and actual
  model inference are not covered by these automated checks.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`

> Release builds remain unsigned. See the README for macOS Gatekeeper guidance;
> Windows SmartScreen may also ask for confirmation.
