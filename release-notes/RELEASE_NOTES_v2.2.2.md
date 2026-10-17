# TeacherPro v2.2.2 – Hotfix: Model Detection

## Fixed

### 🐛 Alle KI-Modelle werden jetzt korrekt erkannt
Die Modell-Namensnormalisierung in `parse_ollama_models` entfernt nur noch
das `:latest`-Suffix statt alle Tags. Dadurch werden Modelle mit Doppelpunkt
in der ID (z. B. `qwen3.5:9b`) nicht mehr fälschlich als `qwen3.5` verkürzt
und erscheinen wieder mit grünem Haken und „Standard"-Schaltfläche.

## Files Changed
- `src-tauri/src/lib.rs` – `strip_suffix(":latest")` statt `split(':').next()`
