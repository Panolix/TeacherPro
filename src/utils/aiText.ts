export function parseThinkingFromResponse(raw: string): { thinking: string | null; response: string } {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
  const thinking = thinkMatch ? thinkMatch[1].trim() : null;
  const response = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { thinking, response };
}

export function normalizeAiFragmentOutput(rawOutput: string, originalSelection: string): string {
  let normalized = rawOutput.trim();

  // Strip <think>...</think> blocks emitted by reasoning models.
  normalized = normalized.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Drop wrapping code fences if the model emits markdown blocks.
  if (normalized.startsWith("```")) {
    normalized = normalized.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  normalized = normalized.replace(/\r\n/g, "\n").trim();

  const originalHadLineBreaks = originalSelection.includes("\n");
  if (!originalHadLineBreaks) {
    // Keep single-line fragments single-line.
    normalized = normalized.replace(/\s+/g, " ").trim();
  }

  const originalHasLists = /(^\s*[-*]\s+)|(^\s*\d+\.\s+)/m.test(originalSelection);
  if (!originalHasLists) {
    normalized = normalized
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .trim();
  }

  return normalized;
}
