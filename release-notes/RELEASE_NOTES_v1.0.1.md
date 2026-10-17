# Release Notes - TeacherPro v1.0.1

### Version 1.0.1 (April 14, 2026)

**UI & Experience Enhancements:**
- **Seamless Fullscreen Startup:** The application now spawns seamlessly as a full-screen window right from the beginning using a background loading trick. This completely eradicates the visually jarring animation where the app would previously open as a small window and rapidly grow to take up your screen, giving it a true native feel.
- **Editable Teacher Field:** Removed the hardcoded teacher name ("Panagiotis Smponias") from lesson plans. The "Teacher:" field in the PDF export modal is now a customizable text input that naturally defaults to empty. You can now set a custom default name directly in the Sidebar Settings.

**Bug Fixes & Polish:**
- **PDF Export Consistency:** Fixed an issue where the spacing and column widths in the Lesson Plan PDF export did not match the in-app editor. Long material filenames inside table cells will now correctly truncate with an ellipsis (`...`) instead of stretching the columns and throwing off the layout during printing and exporting.
- **Table Constraints:** Ensured universal constraints on the TipTap table layout (`table-layout: fixed` and `width: 100%`) so it spans predictably across both the native window rendering and exported documents.

**Under the Hood:**
- Updated internal versions across `package.json`, `tauri.conf.json`, and Native Rust modules to `1.0.1`.