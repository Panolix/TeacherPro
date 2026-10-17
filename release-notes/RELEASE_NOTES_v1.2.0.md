# Release Notes - TeacherPro v1.2.0

### Version 1.2.0 (April 15, 2026)

This release focuses on workflow stability and readability improvements across lesson editing, PDF preview/export, and mindmap defaults.

## Highlights

- Subject system improvements:
  - Subject defaults with custom color coding are available in Settings.
  - Lesson editor metadata now supports subject dropdown selection from configured defaults.
  - Subject color indicator rendering is now reliable in the editor and PDF preview/export.
- Save and naming stability:
  - Subject/date-based lesson naming is preserved.
  - Filename collisions are handled safely so lessons no longer overwrite/disappear when subjects repeat.
  - Sidebar renaming uses an in-app dialog (compatible with Tauri) instead of blocked browser prompts.
- PDF preview robustness:
  - Fixed first-open preview auto-close behavior.
  - Subject row spacing and dot/name alignment in preview/export are now consistent.
- Theme and readability updates:
  - Default accent blue is now darker (`#2d86a5`) for stronger contrast.
  - Light mode has been removed; app now runs in dark mode only.
  - White lesson paper mode now correctly scopes to the paper region, including the intentional header-to-paper gap strip.
  - Scrollbars are now slimmer with neutral-gray styling and stable gutter behavior to prevent content-width jumps while scrolling.
  - Lesson paper top corners were normalized to avoid clipped rounded-corner artifacts under the sticky top section.
- Mindmap consistency:
  - Default blue node preset and initial node color now use the same darker accent blue.
- Context menu reliability:
  - Mindmap node/pane right-click menus now auto-reposition to stay fully visible near window edges.
  - Sidebar, editor table, and material-link context menus now enforce viewport-safe dimensions with overflow scroll when required.
- Settings UX overhaul:
  - Settings now open in a centered modal with improved spacing and section clarity.
  - Modal can be dismissed elegantly via close button, backdrop click, or Escape key.

## Versioning

- App version updated to `1.2.0` across:
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`

## GitHub Release Workflow

- Release workflows trigger on tags matching `v*`.
- Use tag `v1.2.0` to start GitHub Actions release/build pipelines.
