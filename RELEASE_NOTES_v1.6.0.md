# Release Notes - TeacherPro v1.6.0

### Version 1.6.0 (April 17, 2026)

This release delivers the full Method Bank editor workflow, tighter side-dock consistency, and stronger reliability during high-volume calendar delete operations.

## Highlights

**Method Bank rollout in the lesson editor**
- Added Method Bank as a first-class third left-side dock (alongside AI Chat and Notes).
- Added local seed loading from `public/method-bank.json`.
- Added compact searchable method cards with detail preview and tags.
- Added deterministic double-click insertion behavior mapped to lesson-table columns.
- Added strict table-body-row guardrails so insertion only applies in valid lesson-table contexts.

**Interaction and UI consistency improvements**
- Simplified Method Bank type filters to `Phase`, `Social`, and `Method` with no selected chip representing the unfiltered state.
- Refined side-dock typography and spacing to improve visual hierarchy and readability.
- Reworked AI Chat header to a compact single-row structure with a model badge for cleaner alignment.
- Constrained metadata Subject dropdown/input width so the control no longer appears oversized in the lesson header.

**Calendar mass-delete reliability**
- Added bulk-delete re-entry guards in Weekly Planner to prevent overlapping delete operations.
- Disabled delete actions while a batch move-to-trash operation is running and surfaced in-progress button state.
- Hardened trash move logic to treat already-moved/missing files as non-fatal during rapid batch deletes.

## Fixes

- Fixed method/material insertion creating unintended blank spacer lines in lesson-table cells.
- Fixed noisy rename errors during rapid calendar mass delete when files were already moved to Trash.

## Quality

- Added `npm run qa:method-bank` preflight script to support focused Method Bank regression checks.
- Release build validations pass successfully for this version (`npm run build`).
