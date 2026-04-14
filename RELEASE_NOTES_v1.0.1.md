# Release Notes - TeacherPro v1.0.1

### Version 1.0.1 (April 14, 2026)

**UI & Experience Enhancements:**
- **Maximized Startup:** The application now launches in fullscreen (`maximized: true`) by default, offering a much more immersive and stable desktop experience. Default background window dimensions have also been increased to 1100x800.
- **Editable Teacher Field:** Removed the hardcoded teacher name ("Panagiotis Smponias") from lesson plans. The "Teacher:" field in the PDF export modal is now a customizable text input that naturally defaults to empty.

**Bug Fixes & Polish:**
- **PDF Export Consistency:** Fixed an issue where the spacing and column widths in the Lesson Plan PDF export did not match the in-app editor. Long material filenames inside table cells will now correctly truncate with an ellipsis (`...`) instead of stretching the columns and throwing off the layout during printing and exporting.
- **Table Constraints:** Ensured universal constraints on the TipTap table layout (`table-layout: fixed` and `width: 100%`) so it spans predictably across both the native window rendering and exported documents.

**Under the Hood:**
- Updated internal versions across `package.json`, `tauri.conf.json`, and Native Rust modules to `1.0.1`.