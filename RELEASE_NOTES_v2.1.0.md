# TeacherPro v2.1.0 – Deutsche Lokalisierung & Methodenbank-Update

## 🌍 Deutsche Lokalisierung (i18n)

- **Komplette Übersetzung** aller UI-Komponenten – Editor, Sidebar, Kalender, Mindmap, Einstellungen, Statusleiste, Kontextmenüs, Dialoge
- **Sprachumschalter** in den Einstellungen (Erscheinungsbild → Sprache) zwischen Deutsch und Englisch
- **Sprache wird dauerhaft gespeichert** und bleibt nach Neustart erhalten
- **Kalender & Datum** – Wochentage und Monatsnamen jetzt auf Deutsch (via date-fns locale)
- **Standardtitel** neuer Dokumente ist jetzt "Neue Stunde" (deutsch) bzw. "New Lesson Plan" (englisch)
- **KI-Prompts** – Alle System-Prompts (Chat, Rewrite, Translate) auf Deutsch
- **Methodenbank-Panel** – Suchfilter, Kategorien und Detailansicht auf Deutsch

## 📚 Methodenbank-Überarbeitung

- **28 seltene/exotische Einträge entfernt** – PBL-Phasen, Workshop-Phasen, Agile Scrum, Philosophical Chairs, Escape Room, PechaKucha u. a.
- **11 neue Methoden hinzugefügt**, typisch fürs deutsche Referendariat:
  - Kugellager / Speed Dating, Platzdeckchen/Placemat, Kartenabfrage, Ampelabfrage
  - Lerntagebuch, Portfolioarbeit, Wochenplanarbeit, Tandemarbeit
  - Freiarbeit, Lernzirkel/Stationenlernen, Lerntempoduett
- **3 neue Phasen**: Hausaufgabenbesprechung, Ergebnissicherung/Tafelbild, Wiederholung/Übungsphase
- **Deutsche Version** der Methodenbank (`method-bank.de.json`) mit vollständig übersetzten Inhalten
- **Slash-Menü (`/`)** zeigt jetzt bis zu 30 Vorschläge an (vorher nur 7)
- **Zeitvorschläge** via `/` in der Zeitspalte (5-60 Minuten in 5er-Schritten)

## ⚡ KI-Verbesserungen

- **Modellkatalog aktualisiert**: Qwen 3.5 9B als neues Standard-Modell (256K Kontext, 201 Sprachen)
- Veraltete Modelle entfernt: Qwen 3 8B/14B, Phi 4, Gemma 4 31B
- Neue Modelle hinzugefügt: Qwen 3.5 4B/9B/27B, Qwen 3.6 27B, TranslateGemma
- **Ollama wird jetzt immer geschlossen** wenn TeacherPro beendet wird (alle Plattformen)
- **Diagnostik-Sektion** aus den KI-Einstellungen entfernt (kein Einfrieren mehr beim Tab-Wechsel)
- **Kein automatischer Start** von Ollama beim Öffnen der KI-Einstellungen

## 🐛 Fehlerbehebungen

- "Neue Stunde" statt "New Lesson Plan" beim Anlegen neuer Dokumente
- Kalender zeigt "Stunde · 15. Jun" statt "calendar.defaultlessontitle"
- "Sozialform" wird nicht mehr abgeschnitten (Spaltenbreite 100→140px)
- Sprach-Buttons in Einstellungen jetzt lesbar (tp-action-btn statt Kreisen)
- `/`-Slash-Menü zeigt jetzt alle Methodenbank-Einträge, nicht nur die ersten 7

## 🔧 Technisches

- TypeScript-Check (`tsc --noEmit`) läuft fehlerfrei
- Vite-Build und Tauri-Build erfolgreich getestet (Windows)
- i18n-Infrastruktur mit `de.ts`/`en.ts`, `useTranslation`-Hook, persistierter Sprache
- `date-fns` locale (de) für deutsche Datumsformatierung
