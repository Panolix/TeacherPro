# Release Notes - TeacherPro v1.5.1

### Version 1.5.1 (April 16, 2026)

This is a focused quality pass on the AI model catalog and inference pipeline, improving context window sizing, rewrite task efficiency, and output consistency.

## Changes

**AI model context window improvements**
- Context window defaults now reflect each model's actual architecture rather than conservative hardware-specific assumptions.
- Thinking models (Gemma 4 E4B/26B/31B, Qwen 3 8B/14B, DeepSeek R1 8B) all use a 32K default context window.
- Fixed `gemma4:31b` context being smaller than `gemma4:26b` — both are now 32768. The 31B is a larger dense model but anyone running it has the hardware to match.
- `gemma4:e4b` (the recommended default) raised from 16K to 32K — as the primary chat model it benefits most from the larger context.
- `recommendedContext` display strings now state model maximum token counts only, without GPU assumptions.

**Lesson chat context injection**
- Lesson content injected into chat prompts now scales with the model's context window, up to 20K characters (previously capped at 10K for all models). Teachers with longer lesson plans get significantly more of their content included.

**Rewrite and translate efficiency**
- Rewrite/translate tasks now request an 8K context window from Ollama instead of the full model default. Selection-based rewrites need at most ~1K tokens of context — requesting 32K was forcing unnecessary KV cache allocation on every task.
- Rewrite and translate temperature is now fixed at 0.35 for deterministic, consistent output. Chat temperature remains user-configurable. The two tasks have different goals: rewrite wants reliable execution, chat benefits from conversational variety.

**Set Default button**
- "Set Default" in the AI model catalog now sets both the chat model and the rewrite/translate model simultaneously, matching the expected behavior when picking a primary model.
