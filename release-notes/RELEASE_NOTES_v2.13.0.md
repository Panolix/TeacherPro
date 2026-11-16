# TeacherPro v2.13.0

A naming and weekly-planner release: lessons are now called by their topic, AI
drafts fill that topic in, and the weekly cards show class, period and room at a
glance. Dragging lessons is smoother too.

## Added

- **Topic is the lesson name:** the top bar, sidebar, recent list and search
  results show the lesson topic, with the filename as the fallback.
- **Files follow the topic once:** placeholder files (`Stunde`, `Lesson-2`,
  legacy untitled drafts) adopt their first real topic as the filename. Later
  topic edits do not rename the file; manual rename remains available.
- **AI draft titles:** inserting an AI lesson draft sets the lesson topic when it
  is still empty, using the title from the draft or the topic you typed in the
  dialog. A topic the lesson already had is never overwritten.
- **Weekly planner tags:** class, period and room appear as compact icon tags in
  a wrapping row under the subject. Long values truncate with a full tooltip.
- **Duplicates and PDFs:** duplicated lessons get a `(Copy)` topic suffix, and
  exported PDFs use the lesson topic in their filename.

## Improved

- **Smoother drag-and-drop:** the weekly planner measures drop targets once per
  drag (refreshed on scroll/resize), moves the drag ghost on a composited
  transform, and only updates the drop indicator when the target changes.

## Fixed

- Calendar cards use the lesson topic as their title (two-line clamp with a full
  hover tooltip), so named lessons no longer appear as "Stunde 2".
- The class tag tooltip shows the class itself instead of the field label.
- Class, period, room and topic are trimmed and whitespace-normalized on read
  and save, so the incremental index and a full vault refresh agree.
- The legacy "Neue Stunde" / "New Lesson Plan" heading is also removed when an
  older lesson has empty paragraphs above it.
- The topic, class, period and room inputs cap input length (120 / 40
  characters), and printed topics wrap instead of overflowing the page.
- Recent entries follow lesson renames, placeholder auto-renames and lesson
  folder renames instead of pointing at the old path.

## Compatibility

- No vault migration is required. Lesson files keep the same format, and older
  files without the new fields open unchanged.
- The deprecated teacher field is still accepted on read but no longer shown or
  edited, as in v2.12.0.

## Testing

- TypeScript build, i18n verification (699 keys), typography/scrollbar/
  capability gates, ESLint and the full test suite (52 tests) pass.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`

> Release builds remain unsigned. See the README for macOS Gatekeeper guidance;
> Windows SmartScreen may also ask for confirmation.
