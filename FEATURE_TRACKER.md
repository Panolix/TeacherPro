# TeacherPro Feature Tracker

Last updated: 2026-04-15

## Purpose

This file tracks implemented features, important functions, and UI/UX decisions.
Update this file whenever behavior changes in editor, sidebar, calendar, mindmap, export, or app settings.

## Feature Inventory

### Vault and Data Layer

- Local-first vault selection and persistence.
- Auto-creates core folders: Lesson Plans, Mindmaps, Materials, Exports, Trash.
- Reads/writes lessons and mindmaps as JSON.
- Material tree loading with folder/file ordering.

Primary implementation:

- `src/store.ts`

### Lesson Editor

- TipTap-based editor with headings, lists, formatting, and tables.
- Extended rich-text controls now include underline, text color, underline color, and multicolor highlight.
- Ordered list numbering visibility is explicitly styled to remain visible in the editor.
- Lesson table insertion template with fixed planning columns.
- Right-click table context menu:
  - Insert/delete row or column
  - Merge/split cells
  - Toggle header row/column
- Metadata row: Teacher, Created, Planned For, Subject.
- Planned date input supports DD/MM/YYYY with custom calendar popover.
- Material drag/drop insertion into editor content with table-cell targeting.
- Material drop and double-click insertion prioritize the active table row and insert into the row's final media/material cell.
- Double-click material insertion is intentionally limited to active lesson-plan editing and no longer force-switches views.
- Material links render as custom inline nodes with hover actions and context menu.
- Lesson editor typography is slightly reduced (content and table-header scale) to improve readability in smaller windows.
- Debounced autosave (including metadata fields) with invalid date guard for planned date.
- Lesson action buttons (Preview, Print, Export, Save) are icon-first by default and can optionally show labels via settings.

Primary implementation:

- `src/components/Editor.tsx`
- `src/components/extensions/MaterialLink.tsx`

### Sidebar and Material Management

- Sectioned sidebar for lesson plans, mindmaps, materials.
- New lesson and new mindmap actions.
- Search inputs for lesson plans and mindmaps with live filtering.
- Sidebar search fields are optional/on-demand and opened from section-level magnifier toggles (Lesson Plans, Mindmaps, Materials, Trash).
- Lesson and mindmap search now includes indexed JSON content (TipTap text + metadata for lessons, node labels/material paths for mindmaps), not only filenames.
- Material search supports both file/folder names and relative paths (including nested entries).
- Section headers for Lesson Plans, Mindmaps, Materials, and Trash now use larger/more readable sidebar typography.
- Appearance settings now include independent paper-tone controls for lesson plans and mindmaps.
- Settings panel now uses section tabs (Appearance, Defaults, Advanced) for clearer grouping and reduced visual clutter.
- Material import: add files and add folders.
- Context menu actions for lessons, mindmaps, and materials.
- Lesson context menu includes duplicate action.
- Trash section in sidebar supports search, restore, preview (files), reveal, and permanent delete actions.
- Trash preview for deleted lesson/mindmap JSON is rendered to resemble in-app document/mindmap views rather than raw JSON text.
- Material preview modal supports PDF, image, and text.
- Material open in system default app and reveal in Finder.
- Material double-click insertion now queues only while the lesson editor is active, preventing accidental inserts from calendar/mindmap views.

Primary implementation:

- `src/components/Sidebar.tsx`
- `src/store.ts`
- `src/components/extensions/MaterialLink.tsx`

### Weekly Calendar

- Weekly navigation (Mon-Sun).
- One-click "Today" jump to the current week.
- Day cards with lesson listing by date.
- Create lesson directly for a selected day.
- Select/unselect lessons for bulk move-to-trash.
- Day-level move-all-to-trash action.

Primary implementation:

- `src/components/CalendarView.tsx`

### Mindmaps

- React Flow board with node/edge editing.
- Double-click node label editing.
- Context menu actions for pane/node actions.
- Expanded node color presets plus a custom color picker in the node context menu.
- Custom node color application auto-computes readable text and border contrast for better accessibility.
- Material drag/drop creates linked material nodes in the map.
- Mindmap material drop supports drag-end coordinate fallback for WebView cases where drop events are swallowed.
- Material nodes support preview, open in default app, and reveal in file manager.
- Save and create-new mindmap actions.
- Mindmap action buttons (Preview, Print, Export, Save) follow the shared icon-first toolbar mode with optional labels.
- Mindmap workspace typography is slightly reduced (header/actions/node label scale) for denser layouts on smaller screens.

Primary implementation:

- `src/components/MindmapView.tsx`

### PDF, Preview, and Print

- Lesson and mindmap export to PDF bytes (A4, landscape option, multi-page support).
- Mindmap PDF preview/export now preserves node color styling instead of normalizing nodes to white.
- Preview modals for generated PDF blobs.
- Print/Save flow prints generated PDF blobs via hidden iframe, keeping output consistent with preview/export.
- Export-specific CSS hides editing controls from lesson exports.

Primary implementation:

- `src/utils/pdfExport.ts`
- `src/components/Editor.tsx`
- `src/components/MindmapView.tsx`
- `src/index.css`

### Debug and Diagnostics

- Optional debug mode with rolling event console.
- Debug events for drag/drop and material operations.
- Copy and clear debug logs in-app.

Primary implementation:

- `src/store.ts`
- `src/components/Sidebar.tsx`
- `src/components/Editor.tsx`

## Key Function Map

### App Store (`src/store.ts`)

- `initVault()` loads persisted vault/settings.
- `openVault()` chooses and persists vault path.
- `refreshVault()` syncs folders and file trees.
- `createNewLesson(plannedDate?)`, `duplicateLesson(fileName)`, `openLesson(fileName)`, `saveActiveLesson(content, metadata?)`.
- `createNewMindmap()`, `openMindmap(fileName)`, `saveActiveMindmap(nodes, edges)`.
- Search indexing runs during vault refresh to keep lesson/mindmap content queries local and fast.
- `addMaterialFiles()`, `addMaterialDirectory()`, `renameMaterialEntry(...)`, `deleteMaterialEntry(...)`.
- `setThemeMode(mode)`, `setAccentColor(color)`, `setDebugMode(enabled)`, `setShowActionButtonLabels(enabled)`.
- `logDebug(source, action, detail?)` and `clearDebugEvents()`.

### Lesson Editor (`src/components/Editor.tsx`)

- `insertLessonTable()` inserts lesson planning table scaffold.
- `insertMaterialLinkAtSelection(payload, clientX?, clientY?)` inserts dropped material links.
- `insertDroppedMaterial(dataTransfer, clientX?, clientY?)` resolves payload and executes insertion.
- `handleMaterialDrop(...)` and native/window drop handlers coordinate drag/drop flow.
- Row-targeted material insertion computes the current table row and uses the final media/material cell when available.
- Autosave runs in the background while manual save remains available from the toolbar.
- Toolbar now includes underline toggle, text-color picker/reset, underline-color picker/reset, and highlight-color picker/reset.
- `createLessonPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### Material Link Extension (`src/components/extensions/MaterialLink.tsx`)

- `handlePreview()` loads preview content by file type.
- `handleOpen()` calls native backend open command.
- `handleReveal()` reveals file in Finder.
- `closePreview()` handles blob URL cleanup.

### Sidebar (`src/components/Sidebar.tsx`)

- `handleDragStart(...)` and `handleDragEnd(...)` emit drag payload and fallback drop info.
- `handleDuplicateFromMenu()` duplicates lesson plans from context menu.
- `handlePreviewFromMenu()`, `handleOpenFromMenu()`, `handleRevealFromMenu()`.
- `renderMaterialEntries(...)` renders recursive tree.
- `renderTrashEntries(...)` renders trash tree with restore/permanent-delete operations.

### Mindmap (`src/components/MindmapView.tsx`)

- `addNodeAt(...)` and context-menu add helpers.
- `handleMaterialDrop(...)` creates material-linked nodes from sidebar drags.
- Material node actions: preview/open/reveal via double-click and context menu.
- `handleApplyNodeColor(...)` applies selected node color preset.
- `handleApplyCustomNodeColor()` applies custom node color with auto-contrast text/border styling.
- `createMindmapPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### PDF Utilities (`src/utils/pdfExport.ts`)

- `renderElementToPdfBytes(element, options)`.
- `savePdfToVault(...)`.
- `createPdfBlobUrl(...)` and `revokePdfBlobUrl(...)`.
- `printCurrentWindow(additionalBodyClassNames?)`.

## UI and UX Design Decisions

- Desktop-first dark UI with optional light mode.
- Light theme has dedicated panel/menu/overlay styling so settings, context menus, and preview surfaces stay readable and consistent.
- Accent color system with four choices (blue, emerald, rose, amber).
- Accent settings now include a custom color picker in addition to preset swatches.
- Lesson paper tone (white/dark) and mindmap paper tone (white/dark) are configurable independently from app theme mode.
- Default teacher and default paper tones are grouped under a dedicated Defaults section in Settings.
- Action toolbar text labels are optional; icon-only mode is the default for denser layouts.
- Mindmap node styling uses a hybrid color UX: instant presets for speed and a custom picker for precision.
- Sidebar sections are collapsible and preserve state.
- Deletion UX is now soft-delete semantics; lessons, mindmaps, and materials are moved to `Trash` rather than permanently removed.
- Trash recovery is available in-app via sidebar context menu (Restore), with optional permanent deletion for cleanup.
- Editor uses explicit table structure for lesson planning consistency.
- Material links are visual chips inside lesson content to reduce plain-path clutter.
- Preview modals use centered overlays with explicit close controls.
- Escape key closes preview/context overlays across sidebar, editor, and mindmap previews.
- PDF export mode uses temporary body class (`tp-exporting`) to hide interactive controls.

## Backend and Permissions Notes

- Native open command: `open_file_in_default_app(path)` in Rust backend.
- Tauri capabilities include opener, dialog, fs, os, and store permissions with broad fs scope.
- Runtime app branding uses `TeacherPro` (window/product title), while the Tauri identifier remains `com.pano.temp-app` for profile/store compatibility with existing local data.

Primary implementation:

- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`

## Known Gaps and Verification Items

- Verify drag/drop placement in all target contexts after latest table-cell targeting patch.
- Verify native print dialog behavior consistently across environments.
- Verify PDF preview/export output for underline color and highlight combinations in complex table-heavy lesson plans.

## Update Checklist

When adding or changing behavior:

1. Update the relevant section in this file.
2. Add or revise function names in "Key Function Map".
3. Record any new UI/UX decision.
4. Add a note under "Known Gaps" if behavior is pending verification.

### Recent Fixes
- Fixed lesson plan layout by removing `overflow: hidden` from `.ProseMirror table` and enforcing `word-break: break-word`, resolving the issue where tables were completely clipped on the right edge.
- Replaced iframe-based PDF print dialog (which fails natively on macOS WKWebView) with `printCurrentWindow` calling native `window.print()` combined with `@media print` CSS for reliable PDF/printer generation.
- Recreated Tauri App icons to use native transparency instead of forcing a solid square bounding box background with ImageMagick floodfill, fixing the "non texture" dock issues.

### UI/Icon Hotfixes
- Overrode lesson plan table cells with strict `overflow: hidden` and refactored the embedded `MaterialLink` Flexbox layout using `.flex-1.min-w-0.truncate` to aggressively truncate long file names, stopping them from widening `.ProseMirror` tables offscreen.
- Executed aggressive high-fuzz ImageMagick floodfill passing on the source `Icon.png` to truly delete the residual textured square padding, generating pure-transparency Tauri macOS app icons.
- Fixed PDF export table sizing bug where `min-width: max-content` forced columns to stretch to untruncated filename widths. Enforced `table-layout: fixed !important` and `width: 100% !important` for consistent spacing between app and PDF.
- Set default window dimensions to 1100x800, enforce minimum 800x600 size, and default to `maximized: true` so the app always opens maximizing screen space.
- Re-added the `Teacher: ` UI into the PDF export modal as an editable text input instead of purely removing it, allowing manual personalization.

### Window Management & OS Integration
- Startup defaults to natively maximized and centered window using Tauri `tauri.conf.json`. 
- Removed `visible: false` background-rendering logic to solve macOS desktop workspace hijacking when jumping into full-screen.

### Typography & Export Integrity
- Base Editor typographic scale standardized specifically to 12pt (matching Microsoft Word defaults) for strict 1-to-1 physical A4 realism.
- Editor wrapper expanded to `1800px` to naturally handle widescreen macOS monitors.
- Table headers natively collapse internal `<p>` tag margins to remove ugly whitespace on PDF generation.
- PDF generation engine natively forces an `1062px` width DOM-lock before taking `html2canvas` snapshots, perfectly scaling to 297mm A4 without squashing or stretching.

### Intelligent Mindmap Auto-Scaling
- Mindmap PDF generation triggers `autoFormat: true` deep into `jsPDF` using `@xyflow/react`'s `getNodesBounds` to dynamically scale the output canvas perfectly around all nodes, cleanly sidestepping current user viewport zoom or panning restrictions.
