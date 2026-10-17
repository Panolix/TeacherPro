# TeacherPro v2.7.0

A polish release focused on the editor. Colours now behave the way you expect,
formatting works inside tables, the table context menu was trimmed to the
essentials, and preview / print / export are fixed for lessons that contain
linked materials. Under the hood the editor was split from one huge file into
focused modules (no behaviour change intended).

## Fixed

- **Underline colour now actually renders** — the underline was always painted
  with the text colour; the underline colour was stored but never visible.
  It now shows correctly on screen, in the PDF preview and in printed output,
  and stays independent from the text colour.

- **Colour settings no longer overwrite each other** — text colour, underline
  colour, font size and font family all live on the same text-style mark, and
  changing any one of them used to silently wipe the others. Every change now
  merges with the existing settings (this also fixes combined font size +
  colour + family usage that was broken for a long time).

- **Preview / print / export with material links** — lessons containing linked
  materials no longer fail with "snapshot resource failed to load
  ([object Event])". The PDF pipeline now skips dead image references and
  tolerates broken images instead of aborting the whole export.

- **Material preview size** — the material preview window no longer scales
  with the lesson canvas zoom; it renders at a consistent size and position at
  any zoom level.

## Added / Improved

- **One-click colours with palettes** — clicking the A / U / H buttons in the
  formatting rail applies the last-used colour instantly. Right-clicking opens
  a compact 15-colour palette instead of the OS colour dialog. The chips show
  the active colour and use readable contrast.

- **Formatting inside tables** — right-clicking selected text inside a table
  now also shows the mini formatting bar (bold, italic, underline,
  strikethrough, highlight, link, remove formatting) above the table actions.

- **Trimmed table context menu** — the menu now ends at "Delete Table";
  merge/split cells and header-row/column toggles were removed.

## Internal

- The editor was split from a single ~5,000-line file into focused modules
  (formatting rail, context menu, AI chat panel, notes panel, method bank
  panel, PDF pipeline hook + preview modal). No functional changes intended.

## For updaters

Your vault, lesson plans, mindmaps, materials and settings are untouched.
Installers for Windows, Linux and macOS (Apple Silicon and Intel) are
attached below.
