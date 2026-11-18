# TeacherPro v2.13.2

A small planner fix: the weekly view is now a Monday–Friday school week, so the
day columns stay readable on smaller displays instead of getting squished.

## Changed

- **Five-day school week:** the weekly planner shows Monday through Friday only.
  Each column gets about 40% more width, and the grid's minimum width drops from
  812px to 596px, so lesson cards stay comfortable for much longer before the
  view starts scrolling sideways.
- **Week label:** the header now ends on Friday, for example
  "W47 · Nov 16 – Nov 20, 2026".
- **New lesson on weekends:** if you click "New lesson" on a Saturday or Sunday,
  the lesson is created on the Friday of that week instead of landing in a
  column that is no longer visible.

## Notes

- Lessons that are already planned for a Saturday or Sunday are untouched: they
  remain in the vault and can be opened from the Explorer, but the weekly grid
  no longer shows weekend columns. Open a lesson and change its planned date to
  a weekday if you want it back in the planner.

## Testing

- TypeScript build, ESLint, i18n verification (699 keys) and the full test suite
  (52 tests) pass.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`
