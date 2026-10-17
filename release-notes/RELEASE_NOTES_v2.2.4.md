# TeacherPro v2.2.4 – Security & UI Update

## Added

### 🎨 Unified hover and press feedback for all buttons
Every button in the app — editor side rail, sidebar, top bar, calendar, dialogs
and AI chat — now uses the same subtle interaction: a slight lift on hover and a
soft press squash on click. Primary buttons brighten on hover, destructive
buttons stay red.

### ↔️ Drag table column borders with the mouse
Hovering a column border in the lesson table editor now shows the familiar
left-right resize cursor. While dragging, an accent line marks the active column
boundary.

## Fixed

### 🔒 Security hardening
- Print and open commands validate paths and no longer pass them as part of a
  shell/AppleScript string
- Subject DB commands validate subject/grade/topic/filename and block path
  traversal
- App filesystem access is limited to the vault and the temp directory
  (runtime grants including canonical paths)
- Content Security Policy for the production app (with a separate dev CSP)
- Sanitized preview rendering (highlight colours, headings)
- GGUF import uses secure temp files instead of a predictable path

### 🐛 Fixed dead hover effects
Font size picker, planned-date calendar, AI chat database selector, week
navigation, the Today button, and the add/delete buttons in the calendar had
invisible hover states; they now respond like the rest of the app.

## Files Changed
- `src-tauri/src/lib.rs`, `src-tauri/src/subject_db/mod.rs` – security hardening
- `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` – scopes, CSP
- `src/components/*` – unified hover/press feedback, table resize cursor
- `src/index.css` – shared interaction rules
