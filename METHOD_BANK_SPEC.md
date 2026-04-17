# Feature Specification: The "Method Bank" (Pedagogy Library)

## 🎯 Overview
The **Method Bank** (or Pedagogy Library) is a core feature for **TeacherPro**, a local-first, privacy-focused desktop lesson planning application built with Tauri, React, and TipTap. 

While generic text editors focus only on *what* a teacher is writing, TeacherPro's Method Bank actively assists in the *craft of teaching* by focusing on *how* to teach. It acts as an interactive, built-in "cheat sheet" of proven pedagogical techniques, lesson phases, and classroom social forms. 

## 🚀 The Goal
The primary goal is to **reduce cognitive load during lesson preparation** and **elevate instructional quality**. 
Teachers (especially new ones) often stare at a blank lesson plan table wondering how to effectively teach a concept. Instead of opening a browser to Google "good closing activities," the Method Bank provides a curated, searchable, and draggable library of high-yield strategies right next to their active editor.

## 🗂️ Data Structure & Content
The Method Bank is powered by a local JSON seed file (`public/method-bank.json`) and is designed to move to user-vault customization in a later phase. It is seeded with 80+ research-backed concepts categorized into three distinct pillars:

1. **Lesson Phases:** The chronological building blocks of a lesson (e.g., *Anticipatory Set/Hook, Guided Practice, 5E Explore Phase*).
2. **Social Forms:** How students are physically and socially grouped (e.g., *Plenum/Whole Class, Turn-and-Talk, Station Work, Jigsaw Groups*).
3. **Teaching Methods & Strategies:** Specific, actionable instructional activities (e.g., *Think-Pair-Share, Socratic Seminar, Exit Tickets, Concept Mapping*).

**Standard Object Schema:**
```json
{
  "id": "method-tps",
  "type": "method", // "phase" | "socialForm" | "method"
  "title": "Think-Pair-Share",
  "summary": "Individual thinking, partner discussion, and whole-class sharing.",
  "description": "Students think silently about a prompt, discuss it with a partner, and then share insights with the whole class. High engagement and low barrier for entry.",
  "duration": "5-10m",
  "tags": ["Discussion", "Active Learning", "Universal"]
}
```

## 💻 Implemented UI/UX Integration (v1)

### 1. The Left Slide-Out Dock (Primary Interface)
*   **Trigger:** A Method Bank button in the lesson editor action row.
*   **Button order (fixed):** `AI Chat` (leftmost), then `Notes`, then `Method Bank`.
*   **Behavior:** Clicking Method Bank opens a **left-side slide-out dock**, reusing the same dock region and transition model as AI Chat and Notes.
*   **Mutual exclusivity:** Only one of these three docks can be open at a time.
*   **Components:**
  *   Search input (title/summary/description/tags).
  *   Type filters (`Phase`, `Social`, `Method`) where no active chip means all methods.
  *   Scrollable compact method list.
  *   Detail pane for selected method with tags.
*   **Interaction (Double-Click Insert):**
  *   Double-clicking a method row inserts the method `title` as plain text (v1 behavior).
*   In lesson-table body-row context, insertion targets the mapped column (`Phase` / `LTA` / `Social Form`) of the active row.
*   Double-click outside lesson-table body rows intentionally does nothing.

### 2. The Slash Command (Power User Interface)
*   Typing `/` inside **lesson-table body cells** triggers a floating Method Bank suggestion menu.
*   Header cells are intentionally excluded from Method Bank slash suggestions.
*   The menu is context-aware by lesson-table column:
  *   **Phase column:** only `type === "phase"`
  *   **LTA column:** only `type === "method"`
  *   **Social Form column:** only `type === "socialForm"`
*   Typing narrows results instantly; `Enter`/`Tab` inserts the selected method `title` as plain text.

### 3. Extensibility (Future Scope)
*   **Custom Methods:** Because the app is local-first, the UI must include an "Add New Method" button allowing teachers to save their own personal techniques to their local JSON vault.
*   **Import/Export:** The ability to share specific "Method Packs" (e.g., a "Math Teacher Strategy Pack") with colleagues via simple JSON imports.

### 4. UX Polish (Current)
*   Method list hover tooltip is intentionally removed to keep the dense list visually clean.
*   Method Bank dock width matches the Notes dock footprint for consistent lesson-canvas space.

## 🤖 Notes for Future AI Agents
When tasked with building this out in React/Tauri:
1. Review `src/components/Editor.tsx` for the current dock model; Method Bank follows the same left-dock architecture as AI Chat/Notes.
2. Keep action-button ordering stable: AI Chat first, Notes second, Method Bank third.
3. Method and material insertion in the lesson editor are currently double-click-first; drag/drop insertion is intentionally disabled for this interaction model.
4. Runtime seed file is loaded from `public/method-bank.json`.
5. Ensure the UI remains dark, compact, and high-readability for dense planning workflows.