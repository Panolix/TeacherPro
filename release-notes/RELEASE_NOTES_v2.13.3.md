# TeacherPro v2.13.3

A toolbar polish release: the right-rail color tools are more compact, behave
as independent toggles, and underline color no longer turns underline on.

## Changed

- **Independent color toggles:** left-click A / U / H to apply or remove that
  color; right-click opens the color picker.
- **Underline color is separate from underline:** picking an underline color
  only stores the color. Underline remains a separate formatting toggle, and
  an underline without a chosen color uses the current text color.
- **Persistent color chips:** A / U / H keep the last chosen color as their
  fill even when the color is not applied. An accent ring shows which color
  feature is active.
- **Compact palette:** the picker is narrower, uses 18px swatches and a 12px
  Reset row, and opens with a clear gap beside the rail instead of covering
  the color buttons.
- **Consistent rail sizing:** the font-size/font-family buttons and dropdown
  rows now match the rest of the right rail.

## Fixed

- Right-clicking a toolbar button no longer selects its label and shows the
  native blue selection highlight.
- The mindmap node color palette now shows which color is active.
- The palette Reset row is a plain action again; only the applied color
  swatch gets a checkmark.

## Testing

- TypeScript build, ESLint, i18n verification, typography gate and the full
  test suite (52 tests) pass.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`
