# TeacherPro

TeacherPro is a modern, sleek, local-first desktop application built specifically for educators. It provides a dedicated workspace to plan lessons, manage teaching materials, and create brainstorm mindmaps—all stored securely on your local file system, without subscription fees or bloated features.

## Features

- **Local Vault:** Your data stays on your machine. Choose any folder to act as your TeacherPro Vault.
- **Lesson Plan Editor (Coming Soon):** A block-based rich text editor featuring customizable lesson plan tables (Time, Phase, Activity).
- **Resource Linking (Coming Soon):** Seamlessly link PDFs, documents, and images from your Vault directly into your lesson plans.
- **Mindmapping (Coming Soon):** Visual brainstorming boards built right into your workspace.
- **PDF Export (Coming Soon):** One-click export of your lesson plans to professional PDFs.

## Technology Stack

- **Tauri v2** (Rust Backend / Desktop Shell)
- **React 19** + **TypeScript** (Frontend)
- **Vite** (Bundler)
- **Tailwind CSS v4** (Styling)
- **Zustand** (State Management)

## Development

### Prerequisites
- Node.js (v20+)
- Rust (for Tauri backend)
- System dependencies for Tauri (see [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/))

### Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development server and open the desktop app:
   ```bash
   npm run tauri dev
   ```

## Architecture
See `PROJECT_PLAN.md` for a detailed technical breakdown and implementation phases.
