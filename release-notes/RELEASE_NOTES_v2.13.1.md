# TeacherPro v2.13.1

A polish and fix release: the German UI reads properly now, dates follow German
conventions, and the Qwen3.8 27B AI download verifies again.

## Fixed

- **German UI polish:** the method bank search hint no longer leaves a quote
  open, and wording across the sidebar, weekly planner, editor, settings and
  knowledge-base manager has been corrected and made consistent (for example
  "Neue Stunde hier", "In den Papierkorb", "Es ist ein Fehler aufgetreten",
  "z. B." with a space, and proper German quotation marks).
- **Empty week:** the weekly planner now says "Für diese Woche sind keine
  Stunden geplant".
- **German dates:** the week label, lesson titles and confirmation dialogs use
  day-first order ("16. Nov. – 22. Nov. 2026") instead of the English
  "Nov. 16 – Nov. 22, 2026". Picking a planned date writes `DD.MM.YYYY` to
  match the field's placeholder.
- **Qwen3.8 27B download:** the MTP draft-head checksum was pinned two
  characters short, so verification could never pass. The main GGUF checksum
  and size were also stale after the file was re-uploaded upstream. All pinned
  model hashes have been re-verified against Hugging Face.
- **Clearer hash errors:** a malformed pinned checksum now reports itself as
  such instead of looking like a corrupted download.
- **English copy:** the AI draft hint no longer references the German tab name
  "Datenbanken".

## Notes

- If you already have the Qwen3.8 27B main model file, the app keeps it and only
  downloads the missing MTP head. Retry the download after updating; the failed
  partial file is discarded automatically.

## Testing

- TypeScript build, ESLint, i18n verification (699 keys) and the full test suite
  (52 tests) pass, plus `cargo test` for the model catalog.

## Downloads

- **macOS:** universal `.dmg`
- **Windows:** `.msi` or `.exe` installer
- **Linux:** `.deb`, `.rpm` or `.AppImage`
