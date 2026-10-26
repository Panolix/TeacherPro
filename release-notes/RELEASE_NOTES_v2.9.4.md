# TeacherPro v2.9.4

A calendar, sidebar and vault-recovery patch. Lesson plans can now be ordered
by hand, drag-and-drop no longer renames files behind your back, and the Trash
keeps enough context to put things back where they belonged.

## Highlights

- **Order lessons your way** - drag a card up or down within a day, or into
  another day. A thin insertion line shows exactly where it will land. The
  order is stored with the lesson and survives restarts instead of falling
  back to filename sorting.

- **Reorder the sidebar too** - lessons and mindmaps can be dragged up or down
  within a folder or at the root level. A thin insertion line marks the drop
  position, and the order is saved in `.teacherpro/sidebar-order.json`.
  Dropping directly onto a folder still uses the folder highlight and moves
  the item into that folder; no insertion line is shown for that gesture.

- **Stable lesson names** - new lessons use `Lesson.json` or `Stunde.json`
  instead of a random date/timestamp name, and new mindmaps use
  `Mindmap.json`. Moving a lesson to another day no longer renames the file.
  Files keep their names until you rename them with the pencil button in the
  weekly calendar.

- **A Trash you can recover from** - trashed lessons, mindmaps and materials
  now remember their original folder. Restoring puts them back in the same
  place, retention uses the actual trash timestamp, and trashed items can be
  previewed and found in search.

- **Search across the vault** - lesson and mindmap names, folders and content,
  materials, and trash are searchable from one place. Results include paths
  and content snippets, and open the same preview used by the explorer.

- **Faster mindmap connections** - nodes now have top, right, bottom and left
  connection handles, while existing top/bottom edges continue to work.

- **Materials that open** - unsupported previews such as `.docx` now offer
  "Open in default app"; material and trash previews share the same dialog.

- **Cleaner controls** - the sidebar new-item buttons use the short labels
  Lesson, Mindmap and Folder, stay horizontal, and no longer clip their text.

## Fixed

- Dragging a lesson to another day no longer turns it into a date-stamped
  random filename or resets its title to a date label.
- Hover highlights no longer flash on lesson cards, sidebar files or unrelated
  folders while dragging. The insertion line, and the folder drop highlight
  when targeting a folder, are the only drag feedback.
- The material count no longer renders a replacement/question-mark glyph.
- Search result subtitles no longer show a replacement glyph.
- The calendar insertion marker is now a thin accent line without a glow or
  start dot.
- Restoring trash items respects the folder they came from instead of placing
  everything at the section root.

## Notes

- No vault migration is required. Existing lessons, mindmaps, materials,
  settings and downloaded models are preserved. Older auto-named files keep
  their current names until renamed.
- This is a patch on top of v2.9.3. Users upgrading from earlier releases also
  receive the v2.9.2 data-safety, calendar, material and security fixes.
- Windows and macOS installers are still unsigned. The macOS
  `xattr -cr /Applications/TeacherPro.app` workaround still applies.
- Deferred major upgrades remain: Vite 8, TypeScript 7,
  `@vitejs/plugin-react` 6 and lucide-react 1.61.
