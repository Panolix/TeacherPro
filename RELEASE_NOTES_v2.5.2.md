# TeacherPro v2.5.2

A small window-and-layout polish patch. The app already kept its panels and
bars at fixed sizes and only flexed the content area — this patch makes the
edges of that system behave properly on small and very wide windows. No
editor, vault or AI changes — everything from v2.5.1 is unchanged.

## Improved

- **Smarter minimum window size** — the window can no longer be resized
  below 960 × 540 (previously 800 × 600). The old minimum was too small for
  the lesson paper to fit at Fit zoom once the sidebar was open, which
  forced horizontal scrolling. The new minimum guarantees the paper fits,
  and it still matches Windows half-screen snapping on Full HD displays.
- **Top bar buttons collapse gracefully on narrow windows** — when the top
  bar runs out of room (small window or the vault sidebar open), the labeled
  action buttons automatically shrink to icon-only; tooltips keep the names.
  As soon as there is space again, the labels return. This also fixes the
  buttons previously overflowing the bar on small windows.
- **Lesson paper fills very wide screens** — the Fit zoom ceiling was raised
  from 150 % to 200 %, so on large/ultrawide monitors the lesson paper now
  grows to use the available width instead of leaving large empty margins
  on both sides.

## Removed

- **Unused layout CSS variables** — three leftover design tokens
  (`--tp-sidebar-w`, `--tp-sidebar-cw`, `--tp-panel-w`) that were defined
  but never referenced anywhere. Purely internal cleanup, no visual change.

## For updaters

If you are coming from v2.5.0 or earlier, this version also includes
everything from v2.5.1 — see the v2.5.1 release notes for the full list
(status bar cleanup). No settings, vault or lesson files are touched by
this update.
