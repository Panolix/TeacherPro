export type AiModelTier = "small" | "medium" | "large";
export type AiModelCapability =
  | "multilingual"
  | "reasoning"
  | "low-latency"
  | "long-context"
  | "english-focused";

export interface AiModelCatalogItem {
  id: string;
  label: string;
  tier: AiModelTier;
  source: "ollama-registry";
  estimatedDisk: string;
  recommendedRam: string;
  recommendedContext: string;
  defaultNumCtx: number;
  defaultNumPredict: number;
  description: string;
  recommended: boolean;
  capabilities?: AiModelCapability[];
}

export const AI_MODEL_CATALOG: AiModelCatalogItem[] = [
  {
    id: "gemma4:e2b",
    label: "Gemma 4 E2B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~7.2 GB",
    recommendedRam: "VRAM: 8-10 GB (CPU fallback: 16+ GB RAM)",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    defaultNumPredict: 1024,
    description: "Small Gemma 4 profile with strong speed/quality balance for classroom rewrite, multilingual chat, and translation tasks.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "reasoning", "long-context"],
  },
  {
    id: "gemma4:e4b",
    label: "Gemma 4 E4B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~9.6 GB",
    recommendedRam: "VRAM: 10-14 GB (CPU fallback: 24+ GB RAM)",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 1024,
    description: "Recommended Gemma 4 default for richer lesson chat responses, multilingual tasks, and broader writing context.",
    recommended: true,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:26b",
    label: "Gemma 4 26B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~18 GB",
    recommendedRam: "VRAM: 20-24 GB (CPU fallback: 48+ GB RAM)",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "High-capacity Gemma 4 profile for deeper reasoning, multilingual tasks, and longer structured outputs.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:31b",
    label: "Gemma 4 31B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~20 GB",
    recommendedRam: "VRAM: 24 GB+ (CPU fallback: 64+ GB RAM)",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Largest Gemma 4 profile for maximum quality across reasoning, multilingual, and long-context tasks.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "qwen3:8b",
    label: "Qwen 3 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~5.2 GB",
    recommendedRam: "VRAM: 8-10 GB (CPU fallback: 16+ GB RAM)",
    recommendedContext: "Max context: 40K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 1024,
    description: "Latest Qwen generation with excellent multilingual instruction-following and translation quality.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "qwen3:14b",
    label: "Qwen 3 14B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~9.3 GB",
    recommendedRam: "VRAM: 14-18 GB (CPU fallback: 32+ GB RAM)",
    recommendedContext: "Max context: 40K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Stronger planning and reasoning depth than 8B models while remaining practical on prosumer GPUs.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "llama3.2:3b",
    label: "Llama 3.2 3B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~2.0 GB",
    recommendedRam: "VRAM: 4-6 GB (CPU fallback: 12+ GB RAM)",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    defaultNumPredict: 640,
    description: "Very fast multilingual lightweight model for quick rewrites, short summaries, and low-latency classroom workflows.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },
  {
    id: "deepseek-r1:8b",
    label: "DeepSeek R1 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~5.2 GB",
    recommendedRam: "VRAM: 10-12 GB (CPU fallback: 20+ GB RAM)",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Reasoning-focused distilled model (Qwen3-8B base) with strong logic, multilingual grounding, and stepwise analysis.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "mistral-small3.1:24b",
    label: "Mistral Small 3.1 24B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~15 GB",
    recommendedRam: "VRAM: 20-24 GB (CPU fallback: 48+ GB RAM)",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Strong multilingual frontier model with benchmarked European/Asian/Middle Eastern language coverage, fast rewrite, and instruction following.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },
  {
    id: "phi4:14b",
    label: "Phi 4 14B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~9.1 GB",
    recommendedRam: "VRAM: 14-18 GB (CPU fallback: 32+ GB RAM)",
    recommendedContext: "Max context: 16K tokens (model hard ceiling)",
    defaultNumCtx: 16384,
    defaultNumPredict: 1024,
    description: "High-quality compact reasoning model from Microsoft with strong instruction adherence and low-latency behavior.",
    recommended: false,
    capabilities: ["english-focused", "reasoning", "low-latency"],
  },
];

export const DEFAULT_AI_MODEL_ID = "gemma4:e4b";

export const DEFAULT_MODEL_RUNTIME_DEFAULTS = {
  defaultNumCtx: 6144,
  defaultNumPredict: 896,
};

const AI_THINKING_MODEL_IDS = new Set<string>([
  "gemma4:e2b",
  "gemma4:e4b",
  "gemma4:26b",
  "gemma4:31b",
  "qwen3:8b",
  "qwen3:14b",
  "deepseek-r1:8b",
]);

export function doesAiModelSupportThinking(modelId: string): boolean {
  return AI_THINKING_MODEL_IDS.has(modelId);
}

export function getAiModelCatalogItem(modelId: string): AiModelCatalogItem | undefined {
  return AI_MODEL_CATALOG.find((model) => model.id === modelId);
}

export function getAiModelRuntimeDefaults(modelId: string): {
  defaultNumCtx: number;
  defaultNumPredict: number;
} {
  const item = getAiModelCatalogItem(modelId);
  if (!item) {
    return DEFAULT_MODEL_RUNTIME_DEFAULTS;
  }

  return {
    defaultNumCtx: item.defaultNumCtx,
    defaultNumPredict: item.defaultNumPredict,
  };
}
