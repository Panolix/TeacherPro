# TeacherPro v2.11.0

A focused UX and visual-consistency release. It does not change the vault
format or remove any features; it makes the app feel like one coherent product:
one control scale, one action bar, clearer states, and a calmer weekly planner.

## Highlights

- **One visual system** — buttons, inputs, icon controls, dialogs and toolbar
  actions now share a 24 / 28 / 32–34px scale, consistent radii, hover and press
  states, and accent-aware tints. The top bar, editor rail, calendar, sidebar
  and settings no longer drift apart.

- **Calmer weekly planner** — the week is contained to a 1600px canvas, with
  denser headers and cards, hover/focus card actions, quieter day footers, and a
  subtle accent dot instead of the large “TODAY” pill. From 960px upward the
  week scrolls horizontally instead of clipping.

- **Editor rail, simplified** — named Text / Color / Blocks / Insert / History
  groups, centered font size and font family selectors, color reset inside the
  palette, and cleaner alignment and subscript groups. The lesson meta strip now
  reads like a document header rather than a form.

- **One top bar** — mindmap Save, Preview, Print and Export now live in the
  shared top bar instead of a second floating toolbar. PDF actions show a
  “Rendering PDF…” state, and icon-only actions are sized to match the labeled
  ones.

- **Consistent navigation** — one row style for explorer, search, recents,
  materials and trash; search snippets get their own line; active rows get an
  accent bar; and the open/close panel controls use the same icon and size.

- **Better modal behavior** — a shared dialog primitive with focus trap,
  Escape/backdrop close and focus restoration. Settings now has one Done button
  and an autosave hint instead of two exit controls.

- **Keyboard and accessibility pass** — focus rings on inputs, selects and
  textareas; context menus with roles and arrow-key, Home/End and Enter
  navigation; aria labels on icon-only controls; and a non-flashing launch
  skeleton.

- **Window and status polish** — dynamic window title with a dirty marker, a
  folder-based vault label, a real save spinner, and zoom controls only where
  they apply.

## Changed

- Standard chrome controls are 28px; inputs and font selectors are 32–34px;
  small icon actions are 24px; navigation and modal headers stay 44–48px.
- Weekly planner is capped at 1600px and centered, with denser typography,
  spacing and day footers. The oversized “TODAY” pill was replaced by an accent
  date and a small dot.
- Calendar lesson actions reveal on hover or keyboard focus; dragged cards dim.
- Editor font selectors are 40×32px with centered labels; rail buttons are 28px.
- Sidebar action buttons are 28px and every tree surface uses the same row
  language.
- Mindmaps get a proper empty state and use the shared top-bar actions.
- Settings inputs, number steppers and buttons were brought onto the same scale.
- Removed the duplicate “Editing” label from the status bar.

## Fixed

- The save-failure close prompt now uses the native dialog plugin instead of
  `window.confirm`, which always returns `false` in the Tauri webview.
- The welcome screen no longer flashes before the vault finishes loading.
- The window title reflects the open document and its dirty state.
- The weekly planner no longer clips at the 960px minimum window width.
- The lesson meta strip no longer gets opaque grey input backgrounds that broke
  the document-header look.
- Inputs and selects now show a visible keyboard focus ring.

## Compatibility

- No vault or file-format changes. Existing vaults open exactly as before.
- English and German UI both updated.

## Downloads

- **macOS**: `.dmg` (universal)
- **Windows**: `.msi` or `.exe` installer
- **Linux**: `.deb`, `.rpm` or `.AppImage`

> Release builds are unsigned. On macOS, right-click the app and choose **Open**
> the first time you launch it; on Windows, SmartScreen may ask you to confirm.
