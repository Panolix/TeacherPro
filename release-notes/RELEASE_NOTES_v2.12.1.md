# TeacherPro v2.12.1

A one-line fix for the v2.12.0 installer build.

## Fixed

- The class chip on weekly calendar lesson cards now respects the app's 11px
  minimum font size. Nothing else changed: the chip still sits next to the
  subject, truncated when space is tight.

## Notes

- Functionally identical to v2.12.0, which brought lesson **class**, **period**,
  **room** and **topic** metadata, the plain `Thema:` / `Topic:` line in the
  document, and the class chip in the weekly planner.
- If you already installed v2.12.0, updating is optional. See the v2.12.0 notes
  below for the feature summary:

  - **Lesson metadata:** class, period, room and topic are stored in the lesson
    file, included in local search, shown in the vault preview and passed to the
    AI lesson context.
  - **Editable topic:** the lesson title is a plain `Thema:` / `Topic:` line
    where the static heading used to be. An empty topic is omitted from print
    and PDF.
  - **Weekly planner:** a compact class chip appears next to the subject when a
    class is set.
  - **Removed:** teacher and created fields from the header, Settings, vault
    preview and PDF export.

## Compatibility

- Older lesson files keep working without migration. The deprecated teacher
  field is still accepted on read but no longer shown or edited.

## Testing

- Typography gate, TypeScript build, i18n verification (699 keys) and the full
  test suite (31 tests) pass.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`

> Release builds remain unsigned. See the README for macOS Gatekeeper guidance;
> Windows SmartScreen may also ask for confirmation.
