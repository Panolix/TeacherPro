# Changelog

## [1.1.1] - 2026-04-15
### Added
- Custom accent color picker in Settings, alongside preset accent swatches.
- Independent paper-tone defaults for Lesson Plans and Mindmaps (white/dark writing surface).
- Expanded Settings panel with section tabs: Appearance, Defaults, and Advanced.

### Changed
- Light mode styling overhaul for better readability and consistency across sidebar, menus, settings, previews, and calendar surfaces.
- Sidebar collapsible category spacing and header action controls are now visually consistent across Lesson Plans, Mindmaps, Materials, and Trash.
- Settings panel now uses fixed-height tab content so switching tabs no longer causes layout jumps.

### Fixed
- Ordered list numbering visibility in lesson editor content.

## [1.1.0] - 2026-04-14
### Added
- Content-aware sidebar search for Lesson Plans and Mindmaps using indexed document data (not only file names).
- Dedicated Material and Trash search support, including nested path matching.
- In-app Trash management with restore and permanent delete actions for soft-deleted items.
- Rendered Trash preview modes for deleted lesson and mindmap JSON files to resemble in-app views.
- Optional, section-level search toggles in sidebar headers (magnifier button opens/hides search fields on demand).
- Lesson duplication from context menu for faster recurring class workflows.
- Calendar "Today" quick-jump button for instant return to current week.
- Editor autosave for lesson body and metadata, while keeping manual save available.
- Shared toolbar preference for icon-first action buttons with optional text labels.

### Changed
- Delete flows now use soft-delete semantics by default and move items into Vault Trash.
- Editor and Mindmap top action rows now default to compact icon-first controls.
- Sidebar search UX is now cleaner by hiding search fields until requested.

### Removed
- Recent lessons sidebar block was removed to reduce visual clutter and keep navigation focused.

### Fixed
- Trash context actions no longer expose confusing "Open" behavior for deleted entries.
- Trash file previews now provide useful rendered output instead of raw JSON where applicable.

## [1.0.3] - 2026-04-14
### Added
- **Intelligent Mindmap PDF Scaling**: PDF exports for Mindmaps now dynamically calculate the total bounding box of all nodes and automatically expand the PDF canvas. Your mindmaps will no longer be cropped or distorted by your zoom/pan level, maintaining an infinite, perfectly-sized wrap-around.

### Fixed
- **Clean Mindmap Export UI**: Automatically strips out the visual "React Flow" attribution watermark and floating UI control panels from the exported PDF so that print-outs look clean and professional.


## [1.0.2] - 2026-04-14
### Added
- **Typography Controls**: New Font Size dropdown added to the ProseMirror formatting toolbar (10pt up to 24pt).
- **A4 Layout Standard**: Base editor typography scaled natively to 12pt (matching Microsoft Word) for perfect 1:1 physical printing.
- **Widescreen Support**: Editor max-width container relaxed to `1800px` to naturally handle ultrawide desktop monitors seamlessly without weird gaps.

### Fixed
- **macOS Invisible Startup Issue**: Removed the background-rendering hide feature. App now reliably displays natively maximized without hijacking macOS fullscreen workspaces.
- **PDF Export Aspect Ratio Distortion**: Reverted squashing math scaling bugs inside `jsPDF`. The hidden web renderer now locks perfectly to an A4 pixel-width (`1062px` at 96 DPI) before taking the PDF snapshot, perfectly preserving sizing.
- **Table Formatting Gaps**: Erased excess bottom-spacing underneath table header cells that occurred whenever TipTap dynamically wrapped titles inside standard `<p>` margin tags.
