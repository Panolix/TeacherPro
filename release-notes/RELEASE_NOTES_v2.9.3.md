# TeacherPro v2.9.3

A maintenance patch on top of v2.9.2: dependency updates, an ESLint baseline,
CI maintenance and sidebar selection fixes.

## Highlights

- **One sidebar selection at a time** - a folder and a file/mindmap can no
  longer both show the blue highlight. Selecting a folder clears the file
  highlight; selecting a file clears the folder highlight; clicking empty
  space in the folder tree clears both. The open document stays open.

- **Nested file highlights work on Windows** - the active lesson/mindmap is
  matched by its root and normalized path, so nested files highlight
  correctly instead of only root-level files.

- **Dependency refresh** - React and React DOM 19.3.1, React types 19.3,
  Tailwind CSS and the Vite plugin 4.3.3, `@xyflow/react` 12.12.0, date-fns
  4.4.0, Zustand 5.0.16, Tauri CLI 2.12.4, autoprefixer 10.6.1 and PostCSS
  8.5.31.

- **ESLint baseline** - the frontend now has a warnings-only ESLint setup with
  TypeScript, React hooks and React refresh rules. CI runs it in addition to
  TypeScript, Rust tests, frontend tests and the capability check. The current
  baseline is 80 warnings and 0 errors.

- **CI maintenance** - GitHub Actions majors are updated (checkout v7,
  setup-node v7, cache v6, upload-artifact v7, tauri-action v1), and
  Dependabot now tracks GitHub Actions, npm minor/patch and Cargo
  minor/patch updates.

- **Release workflow fix** - the draft release created on a version tag is now
  explicitly associated with that tag, so a published release is no longer
  left as an untagged draft.

## Fixed

- Selecting a folder and a file/mindmap at the same time left two blue
  highlights visible.
- Clicking empty space in the folder tree now clears the selection instead of
  leaving it active.
- Nested lessons failed to highlight on Windows because native backslashes did
  not match the tree's forward-slash paths.
- The `useModel` helper was renamed to `activateModel` so the React hooks lint
  rule no longer treats an ordinary async function as a custom hook.
- Removed an unused `eslint-disable` directive.
- Creating a subfolder from the context menu now clears the file highlight
  before the folder becomes the active target.

## Notes

- No vault migration is required. Lessons, mindmaps, materials, settings and
  downloaded models are preserved.
- This release includes the v2.9.2 data-safety, calendar, material and security
  fixes. Users upgrading from v2.9.1 or earlier get both releases at once.
- Windows and macOS builds are still unsigned. The macOS
  `xattr -cr /Applications/TeacherPro.app` workaround still applies.
- Deferred major upgrades: Vite 8, TypeScript 7, `@vitejs/plugin-react` 6 and
  lucide-react 1.61.
