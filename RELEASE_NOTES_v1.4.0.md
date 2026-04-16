# Release Notes — TeacherPro v1.4.0

### Version 1.4.0 (April 16, 2026)

This release focuses on planning workflow speed and stability: richer lesson defaults, private per-lesson notes, and calendar drag rescheduling with reliable metadata retention.

## Highlights

**Private lesson Notes drawer**
- Added a dedicated Notes panel per lesson with autosave persistence.
- Notes are private by default (not part of print/PDF output).
- Notes are now included in local lesson search indexing.

**Configurable lesson-table defaults**
- New Settings > Defaults control for inserted lesson-table body rows.
- Range is 1-12 with a default of 4 rows.

**Weekly Calendar drag-to-reschedule**
- Lesson cards can be moved between days in Weekly Calendar.
- Rescheduling updates both the lesson's planned date and filename date token so placement stays accurate.

## UX Refinements

- Notes button is now in the main editor action row and matches the existing action-button style.
- Notes and AI Chat share the same left dock area and are mutually exclusive (one panel open at a time).
- Opening Notes or AI Chat automatically expands the collapsible sidebar to prevent clipped panel layouts.

## Fixes

- Subject selection is preserved when lessons are rescheduled via drag-and-drop in Weekly Calendar.
- Notes panel textarea now explicitly uses the thin dark scrollbar style for consistent appearance on Tauri WKWebView.
