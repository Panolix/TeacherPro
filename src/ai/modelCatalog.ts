// AI v3 model catalog helpers. The Rust catalog (src-tauri/src/ai/catalog.rs)
// is the source of truth for model ids; this file only carries UI-side helpers.

/** v3 GGUF families without thinking support (per Rust catalog). */
const V3_NO_THINKING_PREFIXES = ["ministral", "smollm"];

export function doesV3ModelSupportThinking(modelId: string | null | undefined): boolean {
  if (!modelId) return true; // "Auto" resolves to the selected/downloaded model
  return !V3_NO_THINKING_PREFIXES.some((p) => modelId.startsWith(p));
}
