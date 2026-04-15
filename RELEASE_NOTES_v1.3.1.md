# Release Notes — TeacherPro v1.3.1

### Version 1.3.1 (April 15, 2026)

Patch release fixing two visual and system-level regressions from v1.3.0.

## Fixes

**Scrollbars now consistently thin and dark**
The main editor area and the AI chat panel were showing the native OS white scrollbar instead of the app's thin dark style. All scroll containers now carry explicit `-webkit-scrollbar` and `scrollbar-color` overrides that take priority over OS defaults in the Tauri WebView.

**Ollama menu bar app closes with TeacherPro on macOS**
When quitting TeacherPro, the Ollama menu bar icon was staying alive. The shutdown routine now sends a graceful `osascript` quit to `Ollama.app`, then follows up with a case-insensitive `pkill -ix ollama` to catch both the app bundle and any CLI subprocess regardless of capitalisation.
