# TeacherPro v2.7.1

A readability and polish release. Several dialogs in the weekly planner now
speak proper German/English (one even showed a raw translation key), single
lessons delete without a pointless prompt, and the interface gets a typography
pass: nothing below 11px, larger secondary text, better contrast, and the
bundled Inter font for the app chrome.

## Fixed

- **Weekly planner dialogs** — the "move all lessons for this day" confirmation
  showed a raw translation key (`calendar.confirm.moveAllForDate`); it now shows
  the proper text in English and German. The dialog for deleting selected
  lessons had the same mismatch and is fixed too.

- **Single-lesson delete** — clicking the trash icon on one lesson card now
  moves it to Trash immediately; only the bulk actions ("delete selected",
  "delete all for this day") ask for confirmation.

- **Localized dialog buttons** — native confirmation dialogs now show
  **Ja / Nein** in German and **Yes / No** in English instead of always
  English. Applies to the weekly planner, trash (permanent delete / empty
  trash) and subject-database file deletion.

- **Missing translation** — the mindmap "empty file" preview text was missing
  in both languages; it now exists in English and German.

## Improved

- **Readability pass** — a universal minimum UI font size of **11px** is now
  enforced across the app (several panels used 9–10px before). Secondary text
  moved from 12px to 12.5px, the dimmest text color was brightened to meet
  WCAG AA contrast (~5.2:1), and the status bar uses a larger, brighter font.

- **Inter for the app interface** — the UI chrome now uses the bundled Inter
  font, which renders crisply and identically on Windows, macOS and Linux.
  Lesson paper and mindmaps intentionally keep their previous system font
  stack, so existing documents render and print exactly as before.

- **Regression guards in CI** — typography (no text below 11px) and i18n key
  parity (English/German must match) are now verified automatically on every
  push, alongside the existing checks.

## Internal

- Planning documents moved to `docs/`, release notes to `release-notes/`, and
  stale duplicate assets removed from the repository root.

## For updaters

Your vault, lesson plans, mindmaps, materials and settings are untouched.
Installers for Windows, Linux and macOS (Apple Silicon and Intel) are
attached below.
