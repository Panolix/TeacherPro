# Release Notes - TeacherPro v1.0.1

### Version 1.0.1 (April 14, 2026)

**UI & Experience Enhancements:**
- **App Window Size:** The desktop app now opens in a comfortable "medium" size (1100x800) by default, instead of launching as a small window (800x600). Minimum dimensions have been strictly enforced to ensure a good desktop experience.

**Bug Fixes & Polish:**
- **PDF Export Consistency:** Fixed an issue where the spacing and column widths in the Lesson Plan PDF export did not match the in-app editor. Long material filenames inside table cells will now correctly truncate with an ellipsis (`...`) instead of stretching the columns and throwing off the layout during printing and exporting.
- **Table Constraints:** Ensured universal constraints on the TipTap table layout (`table-layout: fixed` and `width: 100%`) so it spans predictably across both the native window rendering and exported documents.

**Under the Hood:**
- Updated internal versions across `package.json`, `tauri.conf.json`, and Native Rust modules to `1.0.1`.