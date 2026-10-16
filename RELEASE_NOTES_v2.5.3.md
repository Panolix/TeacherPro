# TeacherPro v2.5.3

A maintenance and hardening release. Printing from the app on macOS is fixed,
the dependency trees were refreshed to close all known advisories, and the
app finally gets its proper application identifier instead of the leftover
scaffolding placeholder. Nothing in the editor, vault or AI workflows
changes — lesson plans, mindmaps and materials are untouched.

## Fixed

- **Printing on macOS** — the print dialog previously failed with "couldn't
  be opened because you don't have permission to view it". macOS sandboxes
  Preview, and it could not read the app's print spool file. Print jobs are
  now handed to Preview through the system launcher, which grants Preview the
  access it needs. Verified in a packaged build on macOS.

## Security

- **Dependency refresh** — the project now builds with zero known
  vulnerabilities in both dependency trees. Previously there were several
  advisories, including a paste-handling issue in the editor's ProseMirror
  layer and several TLS advisories in the Rust network stack. TipTap, Rustls
  and the Tauri runtime were updated to their current patch levels.

## Changed

- **Proper application identifier** — the app identifier changed from the
  `com.pano.temp-app` placeholder (a leftover from project scaffolding) to
  `com.pano.teacherpro`. On the first launch after updating, settings are
  copied automatically from the old location, so the vault path, subjects and
  preferences are kept. The only one-time difference is that the "recents"
  list starts empty.

## Removed

- **Unused dependencies** — two libraries (`docx` and `html2pdf.js`) that no
  code referenced anymore were dropped. Purely internal, no behavior change.

## For updaters

Your vault, lesson plans, mindmaps and materials are untouched. Settings are
migrated automatically on first launch. Installers for Windows, Linux and
macOS (Apple Silicon and Intel) are attached below.
