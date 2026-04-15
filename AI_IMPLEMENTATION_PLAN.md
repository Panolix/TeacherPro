# AI Implementation Plan (TeacherPro)

Last updated: 2026-04-15

## Goals

- Keep TeacherPro local-first and privacy-first.
- Add AI features without breaking current editor/calendar/mindmap workflows.
- Keep UI coherent with existing dark design and interaction patterns.

## Decisions

- Runtime: stay on Tauri.
- Local model source: Ollama registry.
- Initial model family: Gemma (1B, 4B, 12B catalog tiers).
- Primary UX: hybrid (context actions + optional chat panel).
- Storage: keep vault clean; AI runtime artifacts outside vault.

## MVP Features

- Rewrite selected text (clarity, brevity, tone).
- Generate lesson draft.
- Contextual lesson chat.
- Translate/localize selected text.

## Implementation Milestones

1. Add AI settings/state contracts in `src/store.ts`.
2. Add AI Settings tab with model catalog in `src/components/Sidebar.tsx`.
3. Add Tauri commands for runtime/model management in `src-tauri/src/lib.rs`.
4. Add editor AI entry points and selection actions in `src/components/Editor.tsx`.
5. Add optional bottom chat dock in app layout.
6. Harden error/retry/cancel flows.

## Current Status

- Completed: AI settings/state contracts in store.
- Completed: AI Settings tab with curated Gemma 4 catalog and local model lifecycle actions.
- Completed: Tauri runtime/model management commands and generic generation command.
- Completed: one-click runtime bootstrap path so model install can auto-install Ollama when missing.
- Completed: install jobs now run in background with progress tracking and cancel controls from Settings > AI.
- Completed: first editor AI actions (rewrite + translate for selected text).
- Completed: initial contextual lesson chat dock in editor.
- In progress: richer task coverage (lesson draft quality routing) and direct non-Ollama runtime integration.

## Context Menu Coherence Requirement

All current and new right-click menus must:

- Share the same shell style and item interaction behavior.
- Use viewport clamping so menus are never cut off near screen edges.
- Support max-height scrolling when menu content exceeds visible space.

Implementation helper: `src/utils/contextMenu.ts`

## Model Download Source and Paths

- Downloads initiated by TeacherPro should call local Ollama commands.
- First model install should attempt automatic Ollama runtime setup so users do not need a manual pre-install step.
- Ollama model storage (default):
  - macOS: `~/.ollama/models`
  - Windows: `%USERPROFILE%/.ollama/models`
  - Linux: `~/.ollama/models`
- TeacherPro AI metadata (jobs/chats/logs) should live in app data paths.

## Next Work

- Add lesson-draft and contextual-chat task routing to the inference command layer.
- Add direct non-Ollama runtime provider (Hugging Face GGUF + local engine) with one-click setup.
- Add optional privacy toggle to disable chat persistence.
