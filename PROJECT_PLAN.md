# TeacherPro: Technical Design & Implementation Plan

## 1. Objective
To build "TeacherPro," a modern, sleek, local-first cross-platform desktop application (Mac, Windows, Linux) specifically designed for teachers to plan lessons, manage resources, and create mindmaps without the high costs or caveats of generic tools like Notion or Obsidian.

## 2. Architecture & Tech Stack
*   **Desktop Shell & Backend:** **Tauri** (Rust) - Native OS integration, tiny bundle sizes, high performance.
*   **Frontend Framework:** **React** with **TypeScript** - Complex UI handling and type safety.
*   **Build Tool:** **Vite** - Fast builds and HMR.
*   **Styling:** **Tailwind CSS v4** - Rapid UI development.
*   **State Management:** **Zustand** - Global state for Vault path, sidebar toggle, etc.
*   **Icons:** **Lucide React** - Clean and consistent icons.

## 3. Key Features & Core Libraries
*   **Rich Text & Lesson Plan Editor:** **Tiptap** - Customizable, block-based editable layouts for lesson plan tables. Custom React components inside the editor.
*   **Mindmap Creation:** **React Flow** - Node-based UI for brainstorming.
*   **PDF Export:** **html2pdf.js** (or similar) - Exporting rendered lesson plans to PDF.
*   **File System & Vault Management:** **Tauri fs API** - Reading local folders to manage materials securely.

## 4. Data Model & Storage Strategy (Local-First)
*   **Workspace/Vault:** A user-selected local folder.
*   **Lesson Plans:** Stored as structured JSON (Tiptap document format) or Markdown `.md` in the Vault.
*   **Mindmaps:** Stored as JSON files containing node/edge data.
*   **Materials:** Standard files (PDFs, images, docx) stored in the Vault folder.
*   **Linking:** Links inside lesson plans use relative paths to reference other files in the Vault. Tauri opens these using OS default apps.

## 5. Implementation Phases
*   [x] **Phase 1: Project Scaffolding & Core UI** (Completed) - Tauri + React setup, Tailwind, Zustand, Sidebar, Vault folder selection.
*   [ ] **Phase 2: The Lesson Plan Editor** - Integrate Tiptap, build custom extensions for Lesson Plan Tables (Columns: Time, Phase, Learning- and teaching arrangement, social form, Media) and visually clear Material Links (with context menus for open, preview, delete).
*   [ ] **Phase 3: Material Management & Linking** - Sidebar drag-and-drop into editor, Tauri OS file opening.
*   [ ] **Phase 4: Mindmapping** - Integrate React Flow, custom brainstorming nodes.
*   [ ] **Phase 5: Export & Polish** - PDF export, Dark/Light mode, UI polish.