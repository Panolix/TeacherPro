# Feature Specification: The "Method Bank" (Pedagogy Library)

## 🎯 Overview
The **Method Bank** (or Pedagogy Library) is a core feature for **TeacherPro**, a local-first, privacy-focused desktop lesson planning application built with Tauri, React, and TipTap. 

While generic text editors focus only on *what* a teacher is writing, TeacherPro's Method Bank actively assists in the *craft of teaching* by focusing on *how* to teach. It acts as an interactive, built-in "cheat sheet" of proven pedagogical techniques, lesson phases, and classroom social forms. 

## 🚀 The Goal
The primary goal is to **reduce cognitive load during lesson preparation** and **elevate instructional quality**. 
Teachers (especially new ones) often stare at a blank lesson plan table wondering how to effectively teach a concept. Instead of opening a browser to Google "good closing activities," the Method Bank provides a curated, searchable, and draggable library of high-yield strategies right next to their active editor.

## 🗂️ Data Structure & Content
The Method Bank is powered by a local JSON file (`method-bank.json`) stored in the user's Vault. It is seeded with 80+ research-backed concepts categorized into three distinct pillars:

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

## 💻 Proposed UI/UX Integration

### 1. The Slide-Out Panel (Primary Interface)
*   **Trigger:** A new action button (e.g., a 💡 lightbulb or 📚 book icon) located in the top-right editor action row, living alongside the "AI Chat" and "Private Notes" toggles.
*   **Behavior:** Clicking it opens a slide-out panel on the side of the editor.
*   **Components:**
    *   A search bar to quickly find methods by name or keyword.
    *   Filter chips/dropdowns based on `type` (Phase, Social Form, Method) and `tags` (e.g., filtering by "Formative Assessment" or a specific "Subject" matching the lesson's metadata).
    *   A scrollable list of "Method Cards" showing the `title`, `duration`, and `summary`.
*   **Interaction (Drag & Drop):** The defining interaction. A teacher can grab a Method Card from the sidebar and **drag and drop it directly into a cell in the TipTap Lesson Table** (specifically targeting the "Phase", "Social Form", or "LTA/Activity" columns). Dropping the card instantly populates the cell with the method's formatted text.

### 2. The Slash Command (Power User Interface)
*   For fast typists, typing `/` inside the TipTap editor (specifically within table cells) triggers a floating autocomplete menu querying the `method-bank.json` database. 
*   Typing `/jig` highlights "Jigsaw Method", and hitting `Enter` auto-fills the cell.

### 3. Extensibility (Future Scope)
*   **Custom Methods:** Because the app is local-first, the UI must include an "Add New Method" button allowing teachers to save their own personal techniques to their local JSON vault.
*   **Import/Export:** The ability to share specific "Method Packs" (e.g., a "Math Teacher Strategy Pack") with colleagues via simple JSON imports.

## 🤖 Notes for Future AI Agents
When tasked with building this out in React/Tauri:
1. Review `src/store.ts` to see how the Vault loads JSON data. You will need to add logic to load `method-bank.json` into the global state.
2. Review `src/components/Editor.tsx` and the existing slide-out dock logic used for "AI Chat" and "Notes" to implement the third Method Bank panel.
3. Review the drag-and-drop logic currently used for dropping Materials into the TipTap editor; a similar approach will be needed to drop Method objects into the Prosemirror table nodes.
4. Ensure the UI matches TeacherPro's dark, compact, and highly readable desktop aesthetic.