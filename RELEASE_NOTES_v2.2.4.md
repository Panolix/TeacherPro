# TeacherPro v2.2.4 – Sicherheits- und UI-Update

## Added

### 🎨 Einheitliches Hover- und Druck-Feedback für alle Buttons
Alle Schaltflächen der App – rechte Editor-Leiste, Seitenleiste, Top-Bar,
Kalender, Dialoge und KI-Chat – reagieren jetzt mit derselben dezenten
Animation: leichtes Anheben beim Überfahren, sanftes Eindrücken beim Klicken.
Primär-Buttons leuchten beim Hover auf, destruktive Buttons bleiben rot.

### ↔️ Spaltenbreite von Tabellen per Maus ziehen
Fährt man im Unterrichtstabellen-Editor über eine Spaltengrenze, wechselt der
Cursor zum bekannten Links-rechts-Symbol. Beim Ziehen markiert eine Akzentlinie
die aktive Spaltengrenze.

## Fixed

### 🔒 Sicherheitshärtung
- Druck- und Öffnen-Befehle validieren Pfade und übergeben sie nie mehr als
  Teil eines Shell-/AppleScript-Strings
- Subject-DB-Befehle prüfen `Fach/Stufe/Thema/Dateiname` und verhindern
  Pfad-Traversal
- Dateisystem-Zugriff der App ist auf den Vault und das Temp-Verzeichnis
  beschränkt (Laufzeit-Freigabe inkl. kanonischer Pfade)
- Content-Security-Policy für die Produktions-App (Dev-CSP separat)
- Vorschau-Rendering bereinigt (Highlight-Farben, Überschriften)
- GGUF-Import nutzt sichere Temp-Dateien statt eines vorhersagbaren Pfads

### 🐛 Tote Hover-Effekte behoben
Fontgrößen-Auswahl, Geplantes-Datum-Kalender, KI-Chat-Datenbankauswahl,
Wochen-Navigation, „Heute"-Button sowie Plus/Löschen im Kalender hatten
unsichtbare Hover-Zustände; sie reagieren jetzt wie der Rest der App.

## Files Changed
- `src-tauri/src/lib.rs`, `src-tauri/src/subject_db/mod.rs` – Sicherheitshärtung
- `src-tauri/capabilities/default.json`, `src-tauri/tauri.conf.json` – Scopes, CSP
- `src/components/*` – einheitliches Hover-/Druck-Feedback, Tabellen-Resize-Cursor
- `src/index.css` – zentrale Interaktions-Regeln
