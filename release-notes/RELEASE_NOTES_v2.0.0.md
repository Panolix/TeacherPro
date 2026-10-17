# TeacherPro v2.0.0 — UI Overhaul

This is a major release that rebuilds the entire application shell with a cleaner, more focused interface.

## What's new

### Redesigned interface
The sidebar, top bar, status bar, and context menus have all been rebuilt from scratch. The old wide sidebar is replaced by a slim 56 px icon rail with a slide-out explorer panel that shows your lesson plans and mindmaps in a unified nested file tree. A new top bar strips away chrome, and a persistent status bar shows vault path, active file, and word count at a glance.

### Mouse-based drag & drop
HTML5 drag and drop was replaced entirely with a custom `mousedown/mousemove/mouseup` system — the only approach that works reliably in Tauri's WKWebView on macOS. You can now drag lessons to reschedule them in the calendar, drag files into folders in the sidebar, and drag files back out to root by dropping anywhere in the explorer panel outside a folder row.

### Better calendar lesson cards
Lesson cards are larger with a colored left-border accent per subject, always-visible controls, and a clean separator between the title and action rows.

### New modals
- **Vault item preview** — read-only preview of any lesson or mindmap without opening the full editor
- **Material preview** — dedicated preview for vault material files
- **Settings** — app settings moved into a focused modal

## Bug fixes
- Lesson titles no longer show the subject name twice (e.g. "English / English")
- Subject color accent is preserved after moving a lesson into a subfolder
- Context menu submenus are correctly positioned near viewport edges
- Drop-target highlight is now a solid outline instead of dashed
- Trash icon on calendar lesson cards turns red on hover
