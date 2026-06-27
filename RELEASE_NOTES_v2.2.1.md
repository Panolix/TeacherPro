# TeacherPro v2.2.1 – Bugfix Release

## Fixed

### 🐛 KI-Chat: HTML-Entities werden jetzt korrekt dargestellt
`&rightarrow;`, `&amp;`, `&lt;` und andere HTML-Entities aus KI-Antworten
werden nun korrekt als tatsächliche Zeichen angezeigt (z. B. `→`, `&`, `<`).

### 🐛 Embedding-Modell (bge-m3) wird korrekt erkannt
Wenn Ollama das Modell mit `:latest`-Tag listet, wird es jetzt trotzdem als
installiert erkannt – der grüne Haken und „Standard" erscheinen wie erwartet.

### 🐛 „Aktualisieren"-Button flackert nicht mehr
Der Refresh-Button in den KI-Einstellungen läuft nicht mehr in einer
Endlosschleife. Die `syncInstalledModels`-Funktion ist stabil, sodass der
Effekt nur bei Bedarf feuert (insbesondere unter macOS behoben).

## Files Changed
- `src/components/Editor.tsx` – HTML-Entity-Dekodierung in `AiMarkdown`
- `src-tauri/src/lib.rs` – Tag-Stripping in `parse_ollama_models`
- `src/components/SettingsModal.tsx` – `useCallback` für `syncInstalledModels`
