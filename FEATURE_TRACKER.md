# TeacherPro Feature Tracker

Last updated: 2026-04-14

## Purpose

This file tracks implemented features, important functions, and UI/UX decisions.
Update this file whenever behavior changes in editor, sidebar, calendar, mindmap, export, or app settings.

## Feature Inventory

### Vault and Data Layer

- Local-first vault selection and persistence.
- Auto-creates core folders: Lesson Plans, Mindmaps, Materials, Exports.
- Reads/writes lessons and mindmaps as JSON.
- Material tree loading with folder/file ordering.

Primary implementation:

- `src/store.ts`

### Lesson Editor

- TipTap-based editor with headings, lists, formatting, and tables.
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

Primary implementation:

- `src/components/Editor.tsx`
- `src/components/extensions/MaterialLink.tsx`

### Sidebar and Material Management

- Sectioned sidebar for lesson plans, mindmaps, materials.
- New lesson and new mindmap actions.
- Material import: add files and add folders.
- Context menu actions for lessons, mindmaps, and materials.
- Material preview modal supports PDF, image, and text.
- Material open in system default app and reveal in Finder.
- Material double-click insertion now queues only while the lesson editor is active, preventing accidental inserts from calendar/mindmap views.

Primary implementation:

- `src/components/Sidebar.tsx`
- `src/store.ts`
- `src/components/extensions/MaterialLink.tsx`

### Weekly Calendar

- Weekly navigation (Mon-Sun).
- Day cards with lesson listing by date.
- Create lesson directly for a selected day.
- Select/unselect lessons for bulk delete.
- Day-level delete-all action.

Primary implementation:

- `src/components/CalendarView.tsx`

### Mindmaps

- React Flow board with node/edge editing.
- Double-click node label editing.
- Context menu actions for pane/node actions.
- Node color presets (Slate, Blue, Emerald, Amber, Rose, Violet, Teal, Light).
- Material drag/drop creates linked material nodes in the map.
- Mindmap material drop supports drag-end coordinate fallback for WebView cases where drop events are swallowed.
- Material nodes support preview, open in default app, and reveal in file manager.
- Save and create-new mindmap actions.
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
- `createNewLesson(plannedDate?)`, `openLesson(fileName)`, `saveActiveLesson(content, metadata?)`.
- `createNewMindmap()`, `openMindmap(fileName)`, `saveActiveMindmap(nodes, edges)`.
- `addMaterialFiles()`, `addMaterialDirectory()`, `renameMaterialEntry(...)`, `deleteMaterialEntry(...)`.
- `setThemeMode(mode)`, `setAccentColor(color)`, `setDebugMode(enabled)`.
- `logDebug(source, action, detail?)` and `clearDebugEvents()`.

### Lesson Editor (`src/components/Editor.tsx`)

- `insertLessonTable()` inserts lesson planning table scaffold.
- `insertMaterialLinkAtSelection(payload, clientX?, clientY?)` inserts dropped material links.
- `insertDroppedMaterial(dataTransfer, clientX?, clientY?)` resolves payload and executes insertion.
- `handleMaterialDrop(...)` and native/window drop handlers coordinate drag/drop flow.
- Row-targeted material insertion computes the current table row and uses the final media/material cell when available.
- `createLessonPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### Material Link Extension (`src/components/extensions/MaterialLink.tsx`)

- `handlePreview()` loads preview content by file type.
- `handleOpen()` calls native backend open command.
- `handleReveal()` reveals file in Finder.
- `closePreview()` handles blob URL cleanup.

### Sidebar (`src/components/Sidebar.tsx`)

- `handleDragStart(...)` and `handleDragEnd(...)` emit drag payload and fallback drop info.
- `handlePreviewFromMenu()`, `handleOpenFromMenu()`, `handleRevealFromMenu()`.
- `renderMaterialEntries(...)` renders recursive tree.

### Mindmap (`src/components/MindmapView.tsx`)

- `addNodeAt(...)` and context-menu add helpers.
- `handleMaterialDrop(...)` creates material-linked nodes from sidebar drags.
- Material node actions: preview/open/reveal via double-click and context menu.
- `applyNodeColor(nodeId, presetStyle)` applies selected node color preset.
- `createMindmapPdf()`, `handlePreviewPDF()`, `handlePrintPDF()`, `handleExportPDF()`.

### PDF Utilities (`src/utils/pdfExport.ts`)

- `renderElementToPdfBytes(element, options)`.
- `savePdfToVault(...)`.
- `createPdfBlobUrl(...)` and `revokePdfBlobUrl(...)`.
- `printCurrentWindow(additionalBodyClassNames?)`.

## UI and UX Design Decisions

- Desktop-first dark UI with optional light mode.
- Accent color system with four choices (blue, emerald, rose, amber).
- Sidebar sections are collapsible and preserve state.
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
- Set default window dimensions to 1100x800 (with minimum 800x600 constraints) to ensure the app doesn't start too small.
