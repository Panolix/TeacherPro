# Release Notes - TeacherPro v1.5.0

### Version 1.5.0 (April 16, 2026)

This release focuses on AI runtime maturity, cleaner sidebar ergonomics, and stronger local-first settings resilience.

## Highlights

**AI runtime diagnostics and reliability**
- Added backend `ai_runtime_diagnostics` and surfaced diagnostics in AI Settings (server source, backend policy, active model processor usage).
- Added vault-backed settings durability mirror at `.teacherpro/ui-settings.backup.json` with automatic fallback restore.
- Improved Windows runtime execution behavior using hidden process flags to prevent random terminal popups.
- Added backend auto-recovery for CPU fallback cases when a GPU backend is preferred.

**Model catalog and chat behavior upgrades**
- Expanded AI model catalog to current practical local families: Gemma 4, Qwen 3, Llama 3.2, DeepSeek R1 8B, Mistral Small 3.1, and Phi 4.
- Added model-aware runtime defaults (`num_ctx`, `num_predict`) and larger prompt guardrails for richer lesson-context chat.
- Replaced benchmark recommendation cards with neutral capability chips (`reasoning`, `multilingual`, `low-latency`, `long-context`, `english-focused`).
- Thinking mode is now model-aware: unsupported models disable the toggle and no longer receive thinking requests.

**Sidebar and UX polish**
- Introduced a unified collapsible sidebar search block with one query across Lesson Plans, Mindmaps, Materials, and Trash.
- Simplified section actions to cleaner icon-ghost controls.
- Materials section now uses a single `+` action with compact Add files/Add folder menu.
- Improved material image preview compatibility via blob URL + MIME mapping for common image extensions.

## Fixes

- Stabilized mini sidebar calendar date cell layout to prevent visual gap jitter.
- Fixed theme mode persistence so selected mode is stored correctly.
- Improved image preview reliability for: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`, `avif`, `tif`, `tiff`, and `ico`.
