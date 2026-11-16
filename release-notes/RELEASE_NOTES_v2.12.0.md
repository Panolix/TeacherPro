# TeacherPro v2.12.0

A lesson-headline update. Lesson plans now carry class, period, room and topic
metadata, and the weekly planner shows the class at a glance.

## Added

- **Lesson metadata:** new optional fields for **class**, **period**, **room**
  and **topic**. They are stored in the lesson file, included in local search,
  shown in the vault preview and passed to the AI lesson context.
- **Editable topic:** the lesson's title is now a plain `Thema:` / `Topic:`
  line in the document, where the static "Neue Stunde" / "New Lesson Plan"
  heading used to be. Nothing else in the editor is reformatted.
- **Print and PDF:** class, period, room and topic render in PDF preview, print
  and export. An empty topic is omitted from the exported document.
- **Weekly planner:** lesson cards show a compact class chip next to the
  subject when a class is set, so the week stays readable without extra rows.

## Changed

- The lesson metadata header row now shows **Klasse · Stunde · Raum · Geplant
  für · Fach** at the same size as before.
- **Teacher** and **Created** were removed from the lesson header, Settings,
  vault preview and PDF export.
- The default language for new lessons is unchanged; existing "Neue Stunde" /
  "New Lesson Plan" default headings are dropped when a lesson is opened.

## Compatibility

- Older lesson files keep working. The deprecated teacher field is still
  accepted when reading a file but is no longer shown or edited.
- No vault migration is required.

## Testing

- TypeScript build, i18n verification (699 keys in both languages) and the
  full test suite (31 tests) pass.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`

> Release builds remain unsigned. See the README for macOS Gatekeeper guidance;
> Windows SmartScreen may also ask for confirmation.
