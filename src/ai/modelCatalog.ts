export type AiModelTier = "small" | "medium" | "large";

export interface AiModelCatalogItem {
  id: string;
  label: string;
  tier: AiModelTier;
  source: "ollama-registry";
  estimatedDisk: string;
  recommendedRam: string;
  description: string;
  recommended: boolean;
}

export const AI_MODEL_CATALOG: AiModelCatalogItem[] = [
  {
    id: "gemma4:e2b",
    label: "Gemma 4 E2B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~7.2 GB",
    recommendedRam: "12-16 GB",
    description: "Small Gemma 4 profile with strong speed/quality balance for classroom rewrite and chat tasks.",
    recommended: false,
  },
  {
    id: "gemma4:e4b",
    label: "Gemma 4 E4B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~9.6 GB",
    recommendedRam: "16-24 GB",
    description: "Recommended Gemma 4 default for richer lesson chat responses and broader writing context.",
    recommended: true,
  },
  {
    id: "gemma4:26b",
    label: "Gemma 4 26B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~18 GB",
    recommendedRam: "32-48 GB",
    description: "High-capacity Gemma 4 profile for deeper reasoning and longer structured outputs.",
    recommended: false,
  },
  {
    id: "gemma4:31b",
    label: "Gemma 4 31B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~20 GB",
    recommendedRam: "48-64 GB",
    description: "Largest Gemma 4 profile for maximum quality, intended for workstation-class hardware.",
    recommended: false,
  },
];

export const DEFAULT_AI_MODEL_ID = "gemma4:e4b";
