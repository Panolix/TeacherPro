# Release Notes — TeacherPro v1.4.1

### Version 1.4.1 (April 16, 2026)

This hotfix release ensures thin, elegant dark scrollbars render consistently in packaged installers across supported platforms.

## Highlights

**Cross-platform scrollbar hardening**
- Hardened global scrollbar CSS fallbacks in both `index.html` and `src/index.css`.
- Enforced explicit dark track/thumb colors for root and app scroll containers.
- Removed transparent scrollbar track overrides that could trigger white native gutters in packaged WebViews.

**Release pipeline protection**
- Added a dedicated scrollbar invariant check script: `npm run verify:scrollbars`.
- Release builds now fail fast if required scrollbar rules are missing.
- Both tag-triggered and manual cross-platform installer workflows include this check before packaging.

## Fixes

- Fixed large white scrollbar lanes appearing in installed app builds on some environments (notably macOS WKWebView).
- Kept scrollbar appearance consistent in key UI surfaces including main content, Notes, and AI Chat panels.
