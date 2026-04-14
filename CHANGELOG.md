# Changelog

## [1.0.2] - 2026-04-14
### Added
- **Typography Controls**: New Font Size dropdown added to the ProseMirror formatting toolbar (10pt up to 24pt).
- **A4 Layout Standard**: Base editor typography scaled natively to 12pt (matching Microsoft Word) for perfect 1:1 physical printing.
- **Widescreen Support**: Editor max-width container relaxed to `1800px` to naturally handle ultrawide desktop monitors seamlessly without weird gaps.

### Fixed
- **macOS Invisible Startup Issue**: Removed the background-rendering hide feature. App now reliably displays natively maximized without hijacking macOS fullscreen workspaces.
- **PDF Export Aspect Ratio Distortion**: Reverted squashing math scaling bugs inside `jsPDF`. The hidden web renderer now locks perfectly to an A4 pixel-width (`1062px` at 96 DPI) before taking the PDF snapshot, perfectly preserving sizing.
- **Table Formatting Gaps**: Erased excess bottom-spacing underneath table header cells that occurred whenever TipTap dynamically wrapped titles inside standard `<p>` margin tags.
