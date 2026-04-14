# TeacherPro

TeacherPro is a local-first desktop app for lesson planning. It combines a rich lesson editor, weekly calendar planning, material management, and mindmapping inside one Tauri app.

## Current Product Status

Implemented and actively used:

- Local vault setup and persistence.
- Lesson plan editor with rich text, lesson table tools, and metadata fields.
- Drag and drop material links from sidebar into lesson content.
- Sidebar material actions: preview, open in default app, reveal in Finder, rename, delete.
- Weekly calendar planner with per-day lesson creation and bulk delete actions.
- Mindmap editor with node creation, linking, context menus, and color presets.
- Lesson and mindmap PDF preview, print/save, and export.
- Theme and accent customization plus debug console mode.

## Living Feature and Design Documentation

Use [FEATURE_TRACKER.md](FEATURE_TRACKER.md) as the single source of truth for:

- Feature inventory and status
- Key function map by file
- UI and UX design decisions
- Recent change notes and known gaps

When a major feature, workflow, or UI behavior changes, update `FEATURE_TRACKER.md` in the same PR/commit.

## Tech Stack

- Tauri v2 (Rust backend and desktop shell)
- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Zustand
- TipTap (lesson editor)
- React Flow (mindmaps)

## Development

### Prerequisites

- Node.js v20+
- Rust toolchain
- Tauri system prerequisites: https://v2.tauri.app/start/prerequisites/

### Commands

```bash
npm install
npm run tauri dev
```

Build check:

```bash
npm run build
```

## Project Docs

- [FEATURE_TRACKER.md](FEATURE_TRACKER.md): current features, function map, and UI decisions
- [PROJECT_PLAN.md](PROJECT_PLAN.md): initial architecture and phased plan
