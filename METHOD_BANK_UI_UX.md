# Method Bank UI/UX Implementation Guide

This document outlines the specific UI/UX implementation strategy for the **TeacherPro Method Bank**, designed to maximize functionality while strictly protecting the application's clean, desktop-first aesthetic and preserving editor screen real estate.

## 🎯 Core UX Philosophy
The Method Bank must balance two conflicting user needs:
1.  **Discovery & Inspiration:** Teachers need detailed, multi-sentence descriptions to understand how to execute new pedagogical methods.
2.  **Workspace Protection:** The app's sidebars must remain thin and the central TipTap editor canvas must remain unobstructed during the "flow state" of lesson planning.

To solve this, the implementation relies heavily on **Progressive Disclosure** (showing complex information only when explicitly requested) and **Contextual Tooling** (slash commands that know where the user's cursor is).

---

## 💻 1. The Primary UI: Editor-Triggered Left Dock

The Method Bank lives in the same **left slide-out dock region** used by AI Chat and Notes, but is toggled from the lesson editor action-button row.

**Dock control contract (fixed):**
* `AI Chat` button remains leftmost.
* `Notes` button remains second.
* `Method Bank` button is third.
* Only one of these three docks is open at a time.

### The "Skinny" Default View
To protect lesson-canvas width, Method Bank items render as compact rows in the dock list (title, summary snippet, duration, type label).

**Visual Structure of a Dock List Item:**
*   **Icon/Label Row:** Compact title with type badge for fast scanning.
*   **Title:** Truncated text (e.g., "Socratic Seminar...").
*   **Duration:** Right-aligned badge (e.g., `[ 45m ]`).

**Categorization (Filters):**
The initial implementation uses fast filter chips rather than nested accordions:
* `Phase`
* `Social`
* `Method`

When no chip is selected, the list shows all method types.

This keeps scan speed high and prevents deep nesting in an already narrow dock.

---

## 🔍 2. Progressive Disclosure (List + Detail Pane)

Teachers need both quick scanning and deep detail. The dock uses a split disclosure model:
* **Top:** dense list for fast scanning.
* **Bottom:** detail pane for full description and tags of the selected method.

### Selection State
Clicking a list item updates the detail pane with:
* `title`
* `type`
* `description`
* `tags`

Double-clicking a list row inserts the method title into the active lesson-table body row and mapped lesson-table column.
If the cursor is outside a lesson-table body row, insertion is ignored.

---

## ⌨️ 3. The Power User UI: Contextual Slash Commands (`/`)

For veteran teachers who know what methods they want, browsing the dock list is too slow. They need to stay on the keyboard.

### The Trigger
Typing `/` inside the TipTap lesson table triggers a floating autocomplete menu querying the Method Bank data.
The trigger is intentionally scoped to **table body cells** (not header cells).

### Context-Aware Filtering (Crucial for UI Scale)
A menu showing 80 items would cover the entire lesson plan. The slash command menu MUST be context-aware based on the user's cursor position within the `insertLessonTable` structure:
*   If the cursor is in the **"Phase" column**, typing `/` only shows items where `type === "phase"`.
*   If the cursor is in the **"Social Form" column**, typing `/` only shows items where `type === "socialForm"`.
*   If the cursor is in the **"LTA" (Activity) column**, typing `/` only shows items where `type === "method"`.

### Combating Menu Bloat
Even filtered lists can become noisy, so the slash menu enforces strict height and keyboard-first control.
1.  **Hard Limits:** The floating menu should have a strict `max-height` (e.g., `250px`) with a slim scrollbar, displaying a maximum of 5–7 items at once.
2.  **Instant Type-to-Search:** As the user continues typing after the slash, the list instantly filters.
    *   Typing `/` shows the default/top methods.
    *   Typing `/jig` instantly filters the list down to only "Jigsaw Method".
3.  **Auto-Fill Behavior:** Pressing `Enter` or `Tab` inserts the selected method `title` as plain text.

### Insertion Policy
Lesson editor insertion is currently double-click-first for both materials and Method Bank methods.
Drag/drop insertion in the lesson editor is intentionally disabled for this workflow.

---

## 🛠️ Developer Implementation Checklist (Tauri/React/TipTap)

1.  **Data seed (`public/method-bank.json`):**
    *   Keep the runtime-accessible seed in `public/` so the editor can fetch it directly.
2.  **Editor integration (`src/components/Editor.tsx`):**
    *   Add Method Bank as a third left dock panel sharing Notes/AI Chat dock behavior.
    *   Preserve action-button order: AI Chat, Notes, Method Bank.
    *   Add method double-click insertion (plain-text title in v1).
    *   Add contextual slash menu filtered by lesson-table column.
3.  **Insertion behavior (v1):**
    *   Use plain-text method-title insertion for double-click and slash selection.
    *   Keep structured token/node insertion as future scope.