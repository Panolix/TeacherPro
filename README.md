# TeacherPro 🎓

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC_BY--NC_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Build Status](https://github.com/Panolix/TeacherPro/actions/workflows/build-cross-platform.yml/badge.svg)](https://github.com/Panolix/TeacherPro/actions)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)](#)

TeacherPro is a local-first, privacy-focused desktop application designed specifically for educators, tutors, and teachers. It tightly integrates a rich-text lesson plan editor, a weekly calendar for scheduling, material/file management, and interactive mindmapping into one seamless workspace.

Built with performance and cross-platform compatibility in mind using **Tauri**, **React**, **Tailwind CSS**, and **Rust**.

<p align="center">
  <img src="public/icon.png" width="150" alt="TeacherPro Logo">
</p>

*(Add a UI screenshot of your app here!)*

---

## ✨ Key Features

- **Rich Lesson Plan Editor**: Write and structure your lessons using a full-featured markdown/rich-text editor powered by TipTap. Includes specialized features like custom data tables.
- **Weekly Calendar Planner**: Drag, drop, and schedule your lessons directly onto a visual timeline.
- **Interactive Mindmaps**: Brainstorm ideas and visualize curriculums with a drag-and-drop node-based mindmap editor.
- **Material Management**: Link external files (PDFs, docs, images) directly into your lesson plans or mindmap nodes wrapper. Double-click to instantly open them in their native applications.
- **Native PDF Exporting & Printing**: Seamlessly export your lesson plans or mindmaps to beautiful PDFs, or print them directly using your operating system's native Print Configuration Menu.
- **Local-First & Private**: All data is saved inside a "Vault" folder natively on your own hard drive. No trackers, no cloud sync required.
- **Customizable Themes**: Full Light/Dark mode support along with customizable UI accent colors.

## 🚀 Use Cases
- **Teachers**: Plan your entire semester ahead of time, attaching the exact PDF worksheets or slideshows you need right next to the lesson structure. 
- **Tutors**: Generate customized PDF summaries and study mindmaps to export and hand back to your students after a session.
- **Professors**: Keep research and lecture materials tightly organized and visually mapped without relying on messy folder structures.

---

## 📦 Installation

Pre-compiled, ready-to-run installers for **Windows**, **macOS**, and **Linux** are available in the [Releases](https://github.com/Panolix/TeacherPro/releases) tab.

*(Note: Replace the link above with your actual GitHub repository URL once published!)*

---

## 🛠 Building from Source

If you want to build the project yourself or contribute:

### Prerequisites
1. **Node.js**: v20 or higher.
2. **Rust**: Install the latest stable Rust toolchain via [rustup](https://rustup.rs/).
3. **Tauri System Dependencies**: Specifically required if building on Linux. Check the [Tauri Prerequisites guide](https://v2.tauri.app/start/prerequisites/).

### Development Setup

Clone the repository and install the frontend dependencies:
```bash
git clone https://github.com/Panolix/TeacherPro.git
cd TeacherPro
npm install
```

Start the local development server (with hot-reloading):
```bash
npm run tauri dev
```

Build the final native application executable for your current OS:
```bash
npm run tauri build
```
The compiled files will appear under `src-tauri/target/release/bundle/`.

---

## 📜 Documentation & Architecture

TeacherPro uses a live documentation system to track design decisions, remaining gaps, and app features. If you are developing or modifying the codebase, please refer to:
- [FEATURE_TRACKER.md](FEATURE_TRACKER.md) - The single source of truth for the codebase function map, UX decisions, and recently completed tasks.
- [PROJECT_PLAN.md](PROJECT_PLAN.md) - The initial architectural phase planning map.

---

## ⚖️ License

**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**

You are free to **download**, **use**, **modify**, and **share** this software! However, you must adhere to the following conditions:

- **Attribution**: You must give appropriate credit to the original author, provide a link to the license, and indicate if any changes were made.
- **NonCommercial**: You may **not** use the material for commercial purposes (you cannot sell this software or use it within a commercial product without explicit permission or profit-sharing arrangements).

See the [LICENSE](LICENSE) file for the full legal text.
