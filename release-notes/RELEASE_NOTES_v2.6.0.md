# TeacherPro v2.6.0

The writing & printing release. The editor grows up — bundled fonts, more
formatting tools, links, checklists, a full Word-style right-click experience
and proper keyboard shortcuts — and printing on Windows gets the bug fixes it
needed, plus noticeably sharper output on every platform. Existing lessons,
mindmaps, materials and settings are untouched.

## Added

- **Twelve bundled fonts** — Inter, Lato, Nunito, Lexend and Atkinson
  Hyperlegible (sans), Merriweather, Lora, Playfair Display and EB Garamond
  (serif) and Caveat, Patrick Hand and Shadows Into Light (handwriting).
  They are shipped inside the app (open-source licences, see
  `src/assets/fonts/LICENSE.txt`), so documents look identical on every
  machine and in every export — no more "does the school PC have this font?".
  The font picker is grouped by category; the system fonts are still there.

- **More editor features** — text alignment (left / centre / right / justify),
  checklists, subscript / superscript, blockquote and web links. Links open
  in your browser from the link popover and never hijack the app window;
  pasting a URL auto-links it.

- **Word-style shortcuts** — Ctrl/Cmd+E/L/R/J (alignment), Ctrl/Cmd+K
  (link), Ctrl/Cmd+P (print), Ctrl/Cmd+Shift+V (paste as plain text) join the
  usual Ctrl/Cmd+B/I/U, Ctrl+Shift+7/8/9 (lists) and Ctrl+Shift+B (quote).
  Tooltips show the right modifier key for your platform (⌘ on macOS).

- **Full clipboard in the right-click menu** — Cut / Copy / Paste on every
  editor context menu, backed by the native OS clipboard. Copy also writes
  the formatted HTML flavour, so pasting into Word or Google Docs keeps your
  bold, italics and lists; the menu's Paste inserts clean plain text. Paste
  only appears when there is actually something to paste.

- **Context-aware right-click menus** — right-clicking selected text shows a
  compact format bar plus clipboard actions; right-clicking empty space
  offers insert actions (table, checklist, quote, divider, select all);
  right-clicking inside a table gives row/column, merge/split and header
  operations. AI rewrite/translate entries appear when local AI is enabled
  in Settings. All menus appear exactly at the click point.

## Fixed

- **Windows printing** — closing the print dialog no longer leaves the
  toolbar buttons greyed out, and the phantom second print window that used
  to appear ~30 seconds later is gone. (WebView2 does not reliably report
  when the PDF print preview closes; the print flow no longer depends on it.)

- **Sharper, correctly-scaled prints** — exports render at ~300 DPI (up from
  ~192), are placed at true physical size (no more 2% stretch) and the page
  margin was reduced from 8 mm to 5 mm top/bottom for a tighter layout.

- **Paste position** — pasted text now lands exactly where you clicked,
  including clicks in the whitespace above or below the content, where the
  caret used to resolve "between blocks" and paste opened an extra line.
  Single lines paste inline at the cursor; multi-line content becomes
  paragraphs.

- **Context menu size & position** — menus rendered inside the zoomed page
  canvas were being scaled and displaced by the zoom level; they now render
  at their intended size, at the cursor, on every zoom setting.

## Changed

- **Toolbar rail** — consistent sizing across the rail (font pickers are
  taller, main buttons share one column width, grouped mini controls are
  visually distinct) and a slightly larger touch area throughout.

- **Exports wait for fonts** — exporting or printing right after picking a
  font can no longer rasterize with the fallback font; the render waits for
  pending font loads.

- **Accessibility** — visible keyboard focus rings across the UI, support for
  the OS "reduce motion" preference, and proper toolbar semantics for screen
  readers.

## For updaters

Your vault, lesson plans, mindmaps, materials and settings are untouched.
All new features are additive — older lessons open exactly as before.
Installers for Windows, Linux and macOS (Apple Silicon and Intel) are
attached below.
