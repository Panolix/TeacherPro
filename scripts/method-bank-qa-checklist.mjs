#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "public/method-bank.json",
  "src/components/Editor.tsx",
  "METHOD_BANK_SPEC.md",
  "METHOD_BANK_UI_UX.md",
  "FEATURE_TRACKER.md",
];

const editorMarkers = [
  "onToggleMethodBank",
  "toggleMethodBankPanel",
  "insertMethodTextAtSelection",
  "handleInsertMethod",
  "refreshSlashMenu",
  "lessonEditorDragDropEnabled = false",
];

let hasFailure = false;

function logCheck(ok, label) {
  const prefix = ok ? "PASS" : "FAIL";
  console.log(`${prefix}  ${label}`);
}

console.log("TeacherPro Method Bank QA Checklist");
console.log("=================================");

for (const relativePath of requiredFiles) {
  const absolutePath = join(root, relativePath);
  const ok = existsSync(absolutePath);
  logCheck(ok, `Required file exists: ${relativePath}`);
  if (!ok) {
    hasFailure = true;
  }
}

const editorPath = join(root, "src/components/Editor.tsx");
if (existsSync(editorPath)) {
  const editorSource = readFileSync(editorPath, "utf8");
  for (const marker of editorMarkers) {
    const ok = editorSource.includes(marker);
    logCheck(ok, `Editor marker present: ${marker}`);
    if (!ok) {
      hasFailure = true;
    }
  }
}

console.log("");
console.log("Manual verification checklist");
console.log("-----------------------------");
console.log("[ ] 1. Button order is AI Chat (leftmost), then Notes, then Method Bank.");
console.log("[ ] 2. Opening Method Bank closes AI Chat and Notes, and vice versa.");
console.log("[ ] 3. With cursor in a lesson-table body row, double-click a Phase row -> inserts in Phase column.");
console.log("[ ] 4. With cursor in a lesson-table body row, double-click a Method row -> inserts in LTA column.");
console.log("[ ] 5. With cursor in a lesson-table body row, double-click a Social Form row -> inserts in Social Form column.");
console.log("[ ] 6. With cursor outside lesson table, Method Bank double-click does nothing.");
console.log("[ ] 7. Lesson editor drag/drop from Method Bank and Materials is disabled (no insertion on drag).");
console.log("[ ] 8. Type '/' in a table header cell -> no Method Bank slash menu should appear.");
console.log("[ ] 9. Type '/' in table body Phase/LTA/Social cells -> filtered slash suggestions appear.");
console.log("[ ] 10. Enter/Tab in slash menu inserts selected title and closes menu.");
console.log("[ ] 11. No Method Bank hover tooltip appears when moving across list rows.");
console.log("[ ] 12. With cursor in lesson-table body row, double-clicking a material inserts into media column; outside table does nothing.");
console.log("[ ] 13. Build passes: npm run build.");

console.log("");
if (hasFailure) {
  console.log("Preflight checks failed. Fix FAIL items before manual QA.");
  process.exitCode = 1;
} else {
  console.log("Preflight checks passed. Continue with manual checklist.");
}
