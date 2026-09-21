# TeacherPro v2.3.0 – Fresh AI Model Catalog

## Changed

### 🧠 Updated local AI model catalog
The downloadable model list now features current generations instead of older
2024/early-2025 models. Every entry runs locally via Ollama and is sized for
real hardware — from 8 GB RAM laptops up to a 24 GB VRAM GPU (RTX 4090 class).

**Small (8 GB RAM)**
- Granite 4.2 3B
- Qwen 3.5 4B
- Granite 4.2 8B
- LFM 2.5 8B
- Ministral 3 8B

**Medium (16 GB RAM / 12 GB VRAM)**
- Qwen 3.5 9B — still the recommended default
- Gemma 4 E2B
- Gemma 4 12B
- Ministral 3 14B
- Gemma 4 E4B
- GPT-OSS 20B

**Large (24 GB VRAM)**
- Qwen 3.6 27B
- Qwen 3.8 27B
- Gemma 4 26B
- Gemma 4 31B
- Qwen 3.6 35B

Thinking-mode support was extended to the new Qwen 3.6/3.8, Gemma 4 12B/31B and
GPT-OSS models.

### 🗑️ Removed outdated models
Llama 3.1 8B, Llama 3.2 3B, DeepSeek R1 8B/14B, Mistral Nemo 12B,
Mistral Small 3.1 24B and Qwen 3.5 27B have been removed in favour of the
current models above. The `bge-m3` embedding model is unchanged.

## Removed
- Unused legacy `modelCatalog` translation strings in `src/i18n/de.ts` and `en.ts`.

## Files Changed
- `src/ai/modelCatalog.ts` – refreshed model catalog and thinking-model list
- `src/i18n/de.ts`, `src/i18n/en.ts` – removed unused model catalog strings
- `CHANGELOG.md` – v2.3.0 entry
