# Release Notes — TeacherPro v1.3.2

### Version 1.3.2 (April 15, 2026)

Hotfix: the scrollbar fix from v1.3.1 was never committed to the repository and therefore was not included in any release build. This release corrects that.

## Fixes

**Scrollbar fix properly committed and shipped**
The custom thin dark scrollbar styles introduced in v1.3.1 were only applied to the local working directory and never committed. The fix — injecting `::-webkit-scrollbar` and `scrollbar-color` rules via a `<style>` block directly in `index.html` `<head>` — is now properly included. This is the only method reliably respected by the Tauri WKWebView document model.

## Known Issues

**Ollama background service shutdown not yet working**
Automatic shutdown of the Ollama service when quitting TeacherPro is not yet fully functional and is still being investigated. You may need to quit Ollama manually from the menu bar after closing TeacherPro.
