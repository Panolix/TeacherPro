# Release Notes - TeacherPro v1.2.1

### Version 1.2.1 (April 15, 2026)

This patch release focuses on Windows printing reliability and paper-tone rendering consistency in large-window lesson editing.

## Highlights

- Windows print reliability improvements:
  - Print for Lesson Plans and Mindmaps now prioritizes in-app print dialog flows on Windows.
  - The app first attempts PDF iframe print, then falls back to webview print dialog if needed.
  - Backend Windows print command path handling was hardened to reduce false failures.
- Lesson paper tone consistency:
  - Fixed a regression where light lesson paper styling made out-of-bounds editor canvas areas white.
  - Wide-monitor behavior is now balanced: side gutter rendering inside the lesson container is corrected without changing dark outer canvas parity.
- Release automation improvements:
  - GitHub tag-based release workflow now loads release body text from `RELEASE_NOTES_vX.Y.Z.md` automatically when the file exists.

## Versioning

- App version updated to `1.2.1` across:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`

## GitHub Release Workflow

- Release workflow triggers on tags matching `v*`.
- Use tag `v1.2.1` to start the release/build pipeline.
- If `RELEASE_NOTES_v1.2.1.md` exists at tag time, its content is used as the draft release body.
