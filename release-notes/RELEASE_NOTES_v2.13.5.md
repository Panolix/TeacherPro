# TeacherPro v2.13.5

Stability, data-safety, AI lifecycle, and lesson header UI polish fixes.

## What's New

- **Cross-platform Subject Picker:** Replaced the lesson header's native `<select>` dropdown with a TeacherPro popover matching the adjacent calendar menu, showing subject color circles both inside the menu and next to the selected subject name.
- **Planned-Date Calendar Polish:** Added hover feedback on the header date trigger and day grid, a subtle today indicator, and an accent highlight for the selected date matching the sidebar mini-calendar.

## Fixed

- **Autosave & AI Chat Reliability:**
  - Fixed a save-state race when a lesson auto-renames on first topic save so cleanup no longer flushes to the old deleted path.
  - Added preflight cancellation and clean error/cancel bubble handling in AI chat so clicking Stop never leaves orphaned spinners or blank assistant bubbles.
- **Vault, Naming, & Sidebar Safety:**
  - Startup still loads saved UI preferences when a stored vault path is missing, and failed vault switches report an error alert.
  - Preserved subfolders and `.json`/`.JSON` extensions when renaming lessons or mindmaps, tightened cross-platform entry-name validation, and fixed sidebar active highlighting for same-named files in different folders.
- **Rust Backend & Downloads:**
  - Serialized engine start/retry/shutdown transitions, fixed download retries on transient HTTP/transport/stream errors and HTTP `416` completed `.part` files, and cancelled/stopped active pack work before removing the CUDA engine pack.
  - Rejected dangling symlinks/Windows junctions in fs scope containment and reused a single SQLite connection across `subject_db_list`.
- **Input & Theme Visual Fixes:**
  - Fixed doubled focus rings on custom text fields (`KI-Chat`, header metadata, topic line), suppressed dark-mode WebView2 autofill tint on the topic line, and fixed dark-on-black `<select>` dropdown contrast.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`
