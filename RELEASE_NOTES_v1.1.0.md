# Release Notes - TeacherPro v1.1.0

### Version 1.1.0 (April 14, 2026)

This release focuses on workflow speed, safer deletion/recovery, and cleaner UI controls across the editor, mindmap, and sidebar.

## Highlights

- Sidebar search is now stronger and more flexible:
  - Lesson plans and mindmaps support content-aware search via local indexing.
  - Materials and Trash support name and nested-path search.
  - Search fields are now optional/on-demand and opened via section magnifier buttons.
- Deletion flow is now recovery-first:
  - Lessons, mindmaps, and materials are moved to Vault Trash.
  - Trash supports restore and permanent delete.
  - Trash previews are improved so deleted lesson and mindmap JSON files render in a visual in-app style preview instead of raw JSON text.
- Editor and mindmap top actions are cleaner:
  - Save, Preview, Print, and Export are icon-first by default.
  - Optional setting added to show text labels for action buttons.
- Daily planning got faster:
  - Calendar includes a one-click Today button.
  - Lesson plans support quick duplication from context menu.

## Full Additions and Improvements

### Sidebar and Search
- Added local search indexing for lesson/mindmap content to improve discoverability.
- Added material and trash search support including folder path matching.
- Added per-section search toggles so fields only appear when needed.

### Trash and Recovery
- Added in-app Trash section with:
  - Restore
  - Reveal in file manager
  - Permanent delete
- Updated delete behavior for lessons, mindmaps, and materials to move items into Trash first.
- Replaced confusing Trash open behavior with preview-first actions.

### Lesson Editor
- Added autosave for lesson content + metadata updates.
- Kept manual Save available for explicit save actions.
- Added toolbar compact mode with icon-first action buttons.

### Mindmap Workspace
- Applied same compact action toolbar behavior for consistency with editor.
- Added optional action-label toggle compatibility via shared settings.

### Planning and Convenience
- Added calendar Today shortcut.
- Added lesson duplicate action.

### UX Cleanup
- Removed recent-lessons sidebar block to keep navigation cleaner.

## Notes
- This version ships with updated changelog and release tracking docs.
- Build and type checks pass for the 1.1.0 release state.
