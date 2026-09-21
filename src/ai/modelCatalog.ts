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
  maxNumCtx: number;
  defaultNumPredict: number;
  description: string;
  recommended: boolean;
  capabilities?: AiModelCapability[];
}

export const AI_MODEL_CATALOG: AiModelCatalogItem[] = [
  // ── Tier 1: Läuft auf jedem Laptop (8 GB RAM genügen) ──
  {
    id: "granite4.2:3b",
    label: "Granite 4.2 3B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~2,2 GB",
    recommendedRam: "VRAM: 4 GB · CPU: 8+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 8192,
    maxNumCtx: 131072,
    defaultNumPredict: 1024,
    description: "IBMs kompaktes Granite-4.2-Modell mit solider Mehrsprachigkeit und effizientem Tool-Einsatz – läuft flüssig auf sehr schwacher Hardware.",
    recommended: false,
    capabilities: ["multilingual", "low-latency"],
  },
  {
    id: "qwen3.5:4b",
    label: "Qwen 3.5 4B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~3,4 GB",
    recommendedRam: "VRAM: 6-8 GB · CPU: 12+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 1024,
    description: "Kompaktes Multilingual-Modell mit 201 Sprachen und riesigem 256K-Kontext – ideal für einfache Übersetzungen und Unterrichtsfragen auf schwacher Hardware.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },
  {
    id: "granite4.2:8b",
    label: "Granite 4.2 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~5,3 GB",
    recommendedRam: "VRAM: 6-8 GB · CPU: 12+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    maxNumCtx: 131072,
    defaultNumPredict: 1024,
    description: "Ausgewogenes Granite-4.2-Profil mit 128K-Kontext und zuverlässiger Mehrsprachigkeit – eine der aktuellsten Optionen für Laptops ohne dedizierte GPU.",
    recommended: false,
    capabilities: ["multilingual", "low-latency"],
  },
  {
    id: "lfm2.5:8b",
    label: "LFM 2.5 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~5,2 GB",
    recommendedRam: "VRAM: 6-8 GB · CPU: 12+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    maxNumCtx: 131072,
    defaultNumPredict: 1024,
    description: "Ultraschnelles Edge-Modell von Liquid AI, optimiert für niedrige Latenz und geringen Speicherbedarf – ideal für flotte Antworten und einfache Textarbeit.",
    recommended: false,
    capabilities: ["multilingual", "low-latency"],
  },
  {
    id: "ministral-3:8b",
    label: "Ministral 3 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~6,0 GB",
    recommendedRam: "VRAM: 8-10 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 1024,
    description: "Kompaktes Ministral-3-Modell von Mistral mit 256K-Kontext und guter Mehrsprachigkeit – effiziente europäische Alternative für 16-GB-Rechner.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },

  // ── Tier 2: Empfohlen für die meisten (16 GB RAM / 12 GB VRAM) ──
  {
    id: "qwen3.5:9b",
    label: "Qwen 3.5 9B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~6,6 GB",
    recommendedRam: "VRAM: 8-12 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 1024,
    description: "EMPFOHLENES STANDARD-MODELL: Beste Mehrsprachigkeit (201 Sprachen), Thinking-Unterstützung, riesiger 256K-Kontext und exzellente Deutschqualität – ideal für Unterrichtsplanung, Chat und Übersetzung.",
    recommended: true,
    capabilities: ["multilingual", "reasoning", "low-latency", "long-context"],
  },
  {
    id: "gemma4:e2b",
    label: "Gemma 4 E2B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~7,2 GB",
    recommendedRam: "VRAM: 8-10 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    maxNumCtx: 131072,
    defaultNumPredict: 1024,
    description: "Schnelles Gemma-4-Profil mit starkem Speed/Qualitäts-Verhältnis – gut für schnelle Überarbeitungen und Chat bei moderater Hardware.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "reasoning", "long-context"],
  },
  {
    id: "gemma4:12b",
    label: "Gemma 4 12B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~7,6 GB",
    recommendedRam: "VRAM: 8-10 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 16384,
    maxNumCtx: 262144,
    defaultNumPredict: 1024,
    description: "Aktuelles Gemma-4-Profil mit 256K-Kontext und Thinking-Modus – deutlich mehr Qualität als E4B bei ähnlichem Speicherbedarf, ideal für die meisten 16-GB-Rechner.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "ministral-3:14b",
    label: "Ministral 3 14B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~9,1 GB",
    recommendedRam: "VRAM: 10-12 GB · CPU: 20+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Mittelgroßes Ministral-3-Modell mit 256K-Kontext und starker Mehrsprachigkeit – die beste 14B-Option für Laptops mit 16 GB RAM.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:e4b",
    label: "Gemma 4 E4B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~9,6 GB",
    recommendedRam: "VRAM: 10-14 GB · CPU: 24+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 131072,
    defaultNumPredict: 1024,
    description: "Solider Allrounder für umfangreichere Unterrichts-Chats und mehrsprachige Aufgaben – bewährt und zuverlässig.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gpt-oss:20b",
    label: "GPT-OSS 20B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~14 GB",
    recommendedRam: "VRAM: 16+ GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 131072,
    defaultNumPredict: 2048,
    description: "OpenAI-Open-Weight-Modell mit ausgeprägtem Reasoning und einstellbarer Denkintensität – stärkste lokale Option für GPUs mit 16 GB VRAM.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },

  // ── Tier 3: Für High-End-GPUs (24 GB VRAM, z. B. RTX 4090) ──
  {
    id: "qwen3.6:27b",
    label: "Qwen 3.6 27B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~18 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Qwen 3.6 27B mit 256K-Kontext, Thinking-Modus und exzellenter Mehrsprachigkeit – aktuelle Generation für anspruchsvolle Unterrichtsplanung.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "qwen3.8:27b",
    label: "Qwen 3.8 27B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~18 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Neuestes Qwen-Flaggschiff für lokale Systeme: erstklassiges Reasoning, 256K-Kontext und herausragende Deutschqualität.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:26b",
    label: "Gemma 4 26B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~19 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 48+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Hochkapazitives Gemma-4-Profil für tiefgreifendes Reasoning, mehrsprachige Aufgaben und lange, strukturierte Ausgaben – für Highend-Systeme.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:31b",
    label: "Gemma 4 31B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~20 GB",
    recommendedRam: "VRAM: 24 GB · CPU: 48+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Größtes lokales Gemma-4-Modell (dense) mit 256K-Kontext – Spitzenqualität für GPUs mit 24 GB VRAM.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "qwen3.6:35b",
    label: "Qwen 3.6 35B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~24 GB",
    recommendedRam: "VRAM: 24 GB · CPU: 48+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    maxNumCtx: 262144,
    defaultNumPredict: 2048,
    description: "Qwen 3.6 35B für 24-GB-GPUs – maximale lokale Qualität, 256K-Kontext und starkes Reasoning für anspruchsvollste pädagogische Aufgaben.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },

  // ── Embedding model (not used for chat) ──
  {
    id: "bge-m3",
    label: "BGE-M3 (Embedding)",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~2,2 GB",
    recommendedRam: "VRAM: 4-6 GB · CPU: 8+ GB RAM",
    recommendedContext: "Max input: 8192 tokens",
    defaultNumCtx: 8192,
    maxNumCtx: 8192,
    defaultNumPredict: 128,
    description: "Multilingual embedding model für RAG (Retrieval-Augmented Generation). Erzeugt 1024-dimensionale Vektoren und unterstützt 100+ Sprachen – ideal für die Wissensdatenbank-Suche.",
    recommended: true,
    capabilities: ["multilingual"],
  },
];

export const DEFAULT_AI_MODEL_ID = "qwen3.5:9b";
export const EMBEDDING_MODEL_ID = "bge-m3";

export const DEFAULT_MODEL_RUNTIME_DEFAULTS = {
  defaultNumCtx: 6144,
  defaultNumPredict: 896,
};

const AI_THINKING_MODEL_IDS = new Set<string>([
  "qwen3.5:4b",
  "qwen3.5:9b",
  "gemma4:e2b",
  "gemma4:e4b",
  "gemma4:12b",
  "gemma4:26b",
  "gemma4:31b",
  "qwen3.6:27b",
  "qwen3.6:35b",
  "qwen3.8:27b",
  "gpt-oss:20b",
]);

export function doesAiModelSupportThinking(modelId: string): boolean {
  return AI_THINKING_MODEL_IDS.has(modelId);
}

export function getAiModelCatalogItem(modelId: string): AiModelCatalogItem | undefined {
  return AI_MODEL_CATALOG.find((model) => model.id === modelId);
}

export function getAiModelRuntimeDefaults(modelId: string): {
  defaultNumCtx: number;
  maxNumCtx: number;
  defaultNumPredict: number;
} {
  const item = getAiModelCatalogItem(modelId);
  if (!item) {
    return { ...DEFAULT_MODEL_RUNTIME_DEFAULTS, maxNumCtx: 8192 };
  }

  return {
    defaultNumCtx: item.defaultNumCtx,
    maxNumCtx: item.maxNumCtx,
    defaultNumPredict: item.defaultNumPredict,
  };
}
