# TeacherPro v2.5.1

A small interface cleanup patch following v2.5.0. It removes two status bar
elements that caused more confusion than they solved. No other changes —
everything from v2.5.0 (Apple Silicon MLX model variants, full translation
coverage) is unchanged.

## Removed

- **Lesson plan / mindmap counts in the status bar** — the bottom bar no
  longer shows item counts. They previously switched meaning depending on
  the active view ("2 lesson plans" vs "2 mindmaps") and counted leftover
  empty folders, which was more confusing than helpful. The bar now shows
  only the vault status, the save time and the zoom controls.
- **"Editing" indicator in the status bar** — the "Bearbeite"/"Editing"
  label shown while a lesson plan or mindmap was open is gone as well.

## For updaters

If you are coming from v2.4.0 or earlier, this version also includes
everything from v2.5.0 — see the v2.5.0 release notes for the full list
(Apple Silicon MLX model variants, complete German/English translation
coverage, status bar count fixes).
