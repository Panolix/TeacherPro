## TeacherPro v2.1.2

### Fixed
- **Ollama GPU-Erkennung auf Windows**: `OLLAMA_LLM_LIBRARY` wird nicht mehr explizit gesetzt — Ollama auto-detect findet CUDA jetzt korrekt (RTX 4090 u. a.).
- **Ollama-Prozesse bleiben erhalten**: Der Windows-Dienst/die Tray-App wird beim App-Start nicht mehr gekillt. CPU-Fallback bei eigenem Start entfällt.
- **Robustere GPU-Erkennung**: `nvidia-smi` wird jetzt auch in Standard-NVIDIA-Pfaden gesucht; Fallback auf CUDA-Backend-Ordner falls `nvidia-smi` nicht im PATH liegt.

### Changed
- **Ollama-Shutdown unter Windows**: Nur der eigene Child-Prozess wird beendet — der Windows-Dienst bleibt unangetastet.
