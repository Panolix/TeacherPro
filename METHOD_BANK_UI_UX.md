# Method Bank UI/UX Implementation Guide

This document outlines the specific UI/UX implementation strategy for the **TeacherPro Method Bank**, designed to maximize functionality while strictly protecting the application's clean, desktop-first aesthetic and preserving editor screen real estate.

## 🎯 Core UX Philosophy
The Method Bank must balance two conflicting user needs:
1.  **Discovery & Inspiration:** Teachers need detailed, multi-sentence descriptions to understand how to execute new pedagogical methods.
2.  **Workspace Protection:** The app's sidebars must remain thin and the central TipTap editor canvas must remain unobstructed during the "flow state" of lesson planning.

To solve this, the implementation relies heavily on **Progressive Disclosure** (showing complex information only when explicitly requested) and **Contextual Tooling** (slash commands that know where the user's cursor is).

---

## 💻 1. The Primary UI: The Left Sidebar

The Method Bank will live as a new, collapsible section within the existing **Left Sidebar** (beneath or alongside "Lesson Plans," "Mindmaps," and "Materials").

### The "Skinny" Default View
To keep the sidebar narrow, Method items will NOT display their full descriptions or wrapping text. They will render as highly compact, draggable rows (similar to file tree items).

**Visual Structure of a Sidebar Item:**
*   **Drag Handle:** `⋮⋮` (Indicates the item can be pulled into the editor).
*   **Icon:** An emoji or Lucide icon representing the type (e.g., ⏱️ for Phase, 👥 for Social Form, 🧠 for Method).
*   **Title:** Truncated text (e.g., "Socratic Seminar...").
*   **Duration:** Right-aligned badge (e.g., `[ 45m ]`).

**Categorization (Accordions):**
Instead of a flat list of 80+ items, the methods must be grouped into collapsible accordion folders based on their `tags` or `type` to make scanning efficient in a narrow space.
*   `> 🗣️ Discussion Protocols (12)`
*   `> 📝 Formative Assessment (8)`
*   `> 🏃 Kinesthetic / Movement (5)`

---

## 🔍 2. Progressive Disclosure (Hover & Click States)

Teachers need to read the `summary` and `description` from the JSON database without cluttering the sidebar permanently.

### Level 1: The Hover State (The Quick Hint)
When a user hovers their mouse over a compact sidebar item for ~500ms, a standard, dark-themed tooltip appears containing *only* the 1-sentence `summary` field from the JSON data.
*   *Example Tooltip on Hover:* "Quick end-of-lesson assessment of learning and confusion."

### Level 2: The Click State (The Deep Dive Popover)
When a user explicitly **clicks** a sidebar item, a Popover (a floating, absolute-positioned panel) anchors to the right side of the sidebar, slightly overlapping the edge of the editor canvas.

**Popover Contents:**
*   **Title & Duration:** Prominently displayed at the top.
*   **Tags:** Rendered as small, colored chips (e.g., `<Badge>Formative Assessment</Badge>`).
*   **Detailed Description:** The full, multi-sentence instruction block on how to execute the method in the classroom.

**Interaction:**
*   The Popover must close immediately if the user clicks anywhere outside of it or presses the `Escape` key.
*   If the user likes the method they just read about, they can close the Popover and simply drag the skinny sidebar item directly into their TipTap lesson table.

---

## ⌨️ 3. The Power User UI: Contextual Slash Commands (`/`)

For veteran teachers who know what methods they want, browsing the sidebar is too slow. They need to stay on the keyboard.

### The Trigger
Typing `/` inside the TipTap editor triggers a floating autocomplete menu querying the `method-bank.json` database.

### Context-Aware Filtering (Crucial for UI Scale)
A menu showing 80 items would cover the entire lesson plan. The slash command menu MUST be context-aware based on the user's cursor position within the `insertLessonTable` structure:
*   If the cursor is in the **"Phase" column**, typing `/` only shows items where `type === "phase"`.
*   If the cursor is in the **"Social Form" column**, typing `/` only shows items where `type === "socialForm"`.
*   If the cursor is in the **"LTA" (Activity) column**, typing `/` only shows items where `type === "method"`.

### Combating Menu Bloat
Even filtered, a list of 40 teaching methods is too large for a floating dropdown.
1.  **Hard Limits:** The floating menu should have a strict `max-height` (e.g., `250px`) with a slim scrollbar, displaying a maximum of 5–7 items at once.
2.  **Instant Type-to-Search:** As the user continues typing after the slash, the list instantly filters.
    *   Typing `/` shows the default/top methods.
    *   Typing `/jig` instantly filters the list down to only "Jigsaw Method".
3.  **Auto-Fill Behavior:** Pressing `Enter` on a selected item instantly populates the table cell with the Method's `title` (and optionally inserts the `duration` into the adjacent Time column if the cursor context allows).

---

## 🛠️ Developer Implementation Checklist (Tauri/React/TipTap)

1.  **State Management (`src/store.ts`):** 
    *   Implement logic to load `method-bank.json` into the global Zustand store on app startup (similar to how materials or settings are loaded).
2.  **Sidebar Component (`src/components/Sidebar.tsx`):**
    *   Add a new collapsible section for the Method Bank.
    *   Build the grouped accordion logic and the compact drag-handle list items.
    *   Implement the Radix UI (or similar) Popover component triggered by `onClick` for the deep-dive descriptions.
3.  **Editor Integration (`src/components/Editor.tsx`):**
    *   Update the TipTap configuration to include a Slash Command extension (e.g., `@tiptap/suggestion`).
    *   Write the filtering logic to detect which table column the cursor is currently inside to contextually filter the suggestion list.
    *   Implement the `onDrop` handler in the Editor to parse the payload when a Method is dragged from the sidebar and insert the formatted text into the ProseMirror document.