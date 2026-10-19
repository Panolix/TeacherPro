# TeacherPro v2.9.1

A focused follow-up release for AI model management, chat context handling and
knowledge-base citations.

## Highlights

- **Remove models from disk** — every downloaded model now has a delete button
  in Settings → AI Features (KI-Funktionen). It asks for confirmation, stops
  the engine when that model is loaded, clears the active model selection, and
  deletes the GGUF plus any partial or MTP draft files. Disk space is actually
  freed, and the model can be downloaded again later.

- **"Use" now routes both AI tasks** — clicking "Verwenden" sets both the chat
  model and the rewrite/translate model, so one activation covers both instead
  of leaving translation on "Automatic".

- **Better answers, fewer silent assumptions** — the chat prompt now supports
  lesson-aware questions, general questions and source-grounded research in
  one assistant. Replies follow the language of your message instead of always
  forcing German.

- **Clear knowledge-base states** — the model is now told whether no knowledge
  base is attached, the search returned no matches, or excerpts were found.
  It is instructed to say when the material does not answer the question
  instead of silently falling back to general knowledge.

- **Consistent citations** — knowledge excerpts use one stable format and the
  model is asked to cite sources as `[file, p.N]`. Source chips only list the
  excerpts actually sent to the model.

- **Context budgeting uses the right model** — the app now reads the target
  model's real context window, reserves room for the answer, and trims old chat
  history to fit. The old fake "grow the context" logic is gone.

- **Readable source chips** — citation chips previously used an undefined theme
  variable and rendered dark-on-dark. They are now readable without selecting
  the text.

## Fixed

- Switching to a new lesson now clears the previous knowledge-base scope;
  saving or renaming the same lesson keeps it.
- The draft-generator dialog no longer carries an old knowledge-base scope into
  a new lesson.
- OCR page ordering is numeric, so scanned PDFs with more than nine pages no
  longer cite page 10 before page 2 (and mislabel later pages).
- The "Aktionsbutton-Beschriftungen anzeigen" setting now actually hides and
  shows the top-bar action labels.
- The context bar includes the question segment and uses the real model context
  for its width.

## Notes

- Nothing to migrate: your vault, settings and downloaded models are preserved.
- Deleting a model only removes its local file; it can be downloaded again at
  any time.
- Existing knowledge-base indexes are unchanged; no re-import is required.
