# TeacherPro: Technical Design & Implementation Plan

## 1. Objective
To build "TeacherPro," a modern, sleek, local-first cross-platform desktop application (Mac, Windows, Linux) specifically designed for teachers to plan lessons, manage resources, and create mindmaps without the high costs or caveats of generic tools like Notion or Obsidian.

## 2. UX & Design Language
*   **Vibe:** Notion-Style (Minimal). Clean, block-based, ample whitespace, rounded corners.
*   **Theme:** Dark Mode First. High-contrast dark interface as the default.
*   **Interaction:** Block-Based Editor. Everything is a drag-and-droppable block (text, tables, material links).

## 3. Architecture & Tech Stack
*   **Desktop Shell & Backend:** **Tauri** (Rust) - Native OS integration, tiny bundle sizes, high performance.
*   **Frontend Framework:** **React** with **TypeScript** - Complex UI handling and type safety.
*   **Build Tool:** **Vite** - Fast builds and HMR.
*   **Styling:** **Tailwind CSS v4** - Rapid UI development.
*   **State Management:** **Zustand** - Global state for Vault path, sidebar toggle, etc.
*   **Icons:** **Lucide React** - Clean and consistent icons.

## 4. Key Features & Core Libraries
*   **Rich Text & Lesson Plan Editor:** **Tiptap** - Customizable, block-based editable layouts for lesson plan tables. Custom React components inside the editor.
*   **Mindmap Creation:** **React Flow** - Node-based UI for brainstorming.
*   **Calendar / Weekly View:** A weekly overview grid to plan, edit, and launch lesson plans for specific days.
*   **PDF & Word Export:** Client-side generation (e.g., `html2pdf.js`, `docx`) to export lesson plans cleanly.
*   **File System & Vault Management:** **Tauri fs API** - Reading local folders to manage materials securely with a robust folder system.

## 5. Data Model & Storage Strategy (Local-First)
*   **Workspace/Vault:** A user-selected local folder.
*   **Lesson Plans:** Stored as structured JSON (Tiptap document format) in the Vault to support complex blocks.
*   **Mindmaps:** Stored as JSON files containing node/edge data.
*   **Materials:** Standard files (PDFs, images, docx) stored in the Vault folder, organized into folders.
*   **Linking:** Links inside lesson plans use relative paths to reference other files in the Vault. Tauri opens these using OS default apps.

## 6. Implementation Phases
*   [x] **Phase 1: Project Scaffolding & Core UI** (Completed) - Tauri + React setup, Tailwind, Zustand, Sidebar, Vault folder selection.
*   [ ] **Phase 2: The Lesson Plan Editor** - Integrate Tiptap, build custom extensions for Lesson Plan Tables (Columns: Time, Phase, Learning- and teaching arrangement, social form, Media) and visually clear Material Links (with context menus for open, preview, delete). Ensure Block-Based drag-and-drop feel.
*   [ ] **Phase 3: Material Management, Folders & Linking** - Sidebar drag-and-drop into editor, Tauri OS file opening. Establish robust folder structure UI.
*   [ ] **Phase 4: Calendar & Weekly Planning** - Build the interactive weekly calendar view to structure lessons across days.
*   [ ] **Phase 5: Mindmapping** - Integrate React Flow, custom brainstorming nodes linked to specific lesson plans.
*   [ ] **Phase 6: Export & Polish** - PDF + Word export, Dark mode finalization, UI polish.
