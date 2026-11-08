# Audit fixes and regression tests — 2026-11-08

These changes repair persistence, safety and lifecycle bugs without changing the app's visual design or adding features.

## Original findings addressed

| Finding | Change | Verification |
| --- | --- | --- |
| Stale saves reset newer notes/metadata | Editor inputs initialize per document, not per save echo; same-document renames do not reload an older text snapshot | Mounted React metadata tests and delayed store-save tests |
| SubjectDB paths escape through links | Check final targets and creation ancestors; check SQLite index/sidecars; enforce the PDF import source scope | Temporary Windows junction fixtures, including outside index directories and sidecars |
| Vault switch bypasses save failure | Await outgoing saves before root changes; keep the previous vault on failure; clear vault-specific state | Store integration tests for success, failure, explicit discard and rejected registration |
| Copies share document identity | Assign stable lesson UUIDs, regenerate copy IDs, flush before copying, preserve binary material copies | Identity and duplication tests; legacy identities survive reopening/folder moves without a write merely to open a file |
| Close timer overrides a user's decision | Acknowledge/cancel the watchdog before awaiting writes or native confirmation; handle repeated close requests | Close-flow ordering, pending-dialog and failure tests |
| PDF index becomes stale / rescans repeat | Store SHA-256 fingerprints transactionally, reconcile disk removals, use consistent loose-PDF hierarchy, serialize scan/delete writes | Real SQLite replacement, FTS/vector cleanup, model-change and scope tests; filesystem scan tests |
| AI cancellation waits for a blocked read | Use cancellable asynchronous loopback HTTP, clean up failed preparation and editor-unmount requests | Local fake HTTP servers with stalled headers/body, fragmented UTF-8, HTTP failure and cancellation-before-start |
| macOS print chooses an earlier spool PDF | Pass the exact generated filename as an AppleScript argument and match it exactly | Code reviewed; native macOS acceptance testing remains required |

## Further bugs found and repaired

- Uppercase `.JSON` lessons and mindmaps were listed but did not open.
- Weekly-view navigation could unmount the editor before the outgoing save finished. It now awaits the same failure-aware flush as document navigation.
- Atomic replacement failure fell back to directly truncating the original document. Failed replacement now preserves the original and the complete temporary recovery copy, and reports a save failure.
- SQLite read-only connections also needed sidecar containment checks.
- A vault junction pointing to the filesystem root bypassed the original root check; canonical filesystem roots are now rejected.
- Windows trailing-dot/space name aliases are rejected by the SubjectDB segment validator.
- Subject-level PDFs now show their correct indexed/pending state, without moving the original files during scanning.

## Compatibility

- Lesson files remain version 1. The optional `id` field is populated for new/duplicated lessons and retained when a lesson is saved. Existing lessons still open normally.
- The next PDF scan computes missing fingerprints and re-indexes existing PDFs as needed; original PDFs are not rewritten.
- `jsdom` is a development-only dependency for mounted React tests, pinned to a major compatible with the project's documented Node.js minimum.
- The cancellable HTTP transport is local-only. Reqwest/Tokio were already present transitively and are now explicit dependencies for that transport. Other non-streaming HTTP paths remain unchanged.

## Test scope and remaining work

Verification: **29 frontend tests and 51 Rust tests pass** (39 additional tests compared with the audit baseline). Rust Clippy passes with warnings treated as errors; capability, i18n, scrollbar and typography checks pass.

Regression tests use in-memory filesystem mocks, mounted React hooks, real temporary SQLite databases, temporary junctions and local fake HTTP servers. No real teaching vault was opened or modified, and no model download or inference engine was started.

Native macOS printing, native dialog timing, real model inference/cancellation, and full desktop UI acceptance still need platform-specific smoke tests. The audit's separate recommendations about broad temp permissions, custom-command authorization, release gating, development dependency advisories, bundle size and existing lint warnings are not claimed resolved by these fixes. Rust dependency advisory scanning was not available in this environment.
