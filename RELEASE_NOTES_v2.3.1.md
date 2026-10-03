# TeacherPro v2.3.1

A data-safety and stability patch. No visual changes — everything looks and
behaves the same, it just can no longer lose your work.

## Fixed

- **Crash-safe document saving** — lessons, mindmaps and the settings backup are
  now written atomically (temp file + rename) on Windows, macOS and Linux. A
  crash or power loss mid-save can no longer truncate a document; the previous
  version is always preserved.
- **Embedding stores are no longer wiped by a crash** — a partially written
  `chunks.json` in the Subject DB is now quarantined as
  `chunks.json.corrupt-<timestamp>` instead of being silently replaced with an
  empty store, so indexed PDFs stay recoverable.
- **Save errors are reported** — failed chunk-store writes no longer fail
  silently; errors now appear in the import/delete result messages.
- **No more UI freezes during AI operations** — runtime status, diagnostics and
  model install/removal moved to background threads, so the window stays
  responsive while Ollama starts up, pulls or removes models.
- **Duplicating binary materials** — duplicating PDFs, images and other
  non-text materials from the vault context menu now works (it previously read
  everything as text and failed).
- **Wrong document closed on delete/rename** — deleting or renaming a lesson or
  mindmap whose name is a suffix of another file's name (e.g. "Lesson.json" vs
  "My Lesson.json") no longer closes or retargets the wrong open document.
  Path comparison is now exact and separator-aware on all platforms.
- **Settings races** — rapidly changing settings (slider drags, quick folder
  toggles) can no longer interleave save cycles and drop a value.
- **Cross-platform test fix** — the vector store top-k test used parallel
  embeddings (all cosine scores 1.0); it now exercises a strictly ordered
  similarity ranking.

## Housekeeping

- `zustand` and `lucide-react` moved to runtime dependencies; unused
  `clsx`/`tailwind-merge` removed.
- Removed leftover debug logging (including AI response dumps) and obsolete
  repo files (`patch_main_content.js`, `*.bak` backups).
- Zero clippy warnings on Windows/macOS/Linux targets.
