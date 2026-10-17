# TeacherPro v2.2.3 – Cross-Device Vault Portability

## Added

### 🔄 Geräteübergreifende Vault-Portabilität
Settings wie Lehrername, Fächer (mit Farben), Sprache, Sidebar-Zustand und
UI-Präferenzen werden jetzt beim ersten Öffnen eines Vaults auf einem neuen
Gerät aus der `.teacherpro/ui-settings.backup.json` gelesen und nicht mehr mit
Defaultwerten überschrieben.

KI-Modell, Provider und AI-Runtime-Einstellungen bleiben gerätespezifisch –
jedes Gerät behält seine eigenen Defaults.

## Fixed

### 🐛 Settings-Overwrite-Bug in `openVault`
Beim Öffnen eines Vaults auf einem neuen Gerät (bzw. nach einer Neuinstallation)
wurde die Backup-Datei im Vault (.teacherpro/ui-settings.backup.json) mit leeren
Defaults überschrieben. Dadurch gingen alle portablen Einstellungen verloren.

**Neues Verhalten:** Die App liest zuerst die existierende Backup-Datei im Vault,
übernimmt die portablen Settings (Lehrername, Fächer, Sprache, UI-Zustand) und
lässt KI-Einstellungen auf dem neuen Gerät bei den Werkseinstellungen.

## Files Changed
- `src/store.ts` – `openVault()` merged jetzt portable Settings aus
  Vault-Backup, ohne AI-Konfiguration zu überschreiben
