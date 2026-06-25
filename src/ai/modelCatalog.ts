export type AiModelTier = "small" | "medium" | "large";
export type AiModelCapability =
  | "multilingual"
  | "reasoning"
  | "low-latency"
  | "long-context"
  | "english-focused"
  | "embedding";

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
  // ── Tier 1: Läuft auf jedem Laptop (8 GB RAM genügen) ──
  {
    id: "qwen3.5:4b",
    label: "Qwen 3.5 4B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~3,4 GB",
    recommendedRam: "VRAM: 6-8 GB · CPU: 12+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 1024,
    description: "Kompaktes Multilingual-Modell mit 201 Sprachen und riesigem 256K-Kontext – ideal für einfache Übersetzungen und Unterrichtsfragen auf schwacher Hardware.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },

  // ── Tier 2: Empfohlen für die meisten (16 GB RAM) ──
  {
    id: "qwen3.5:9b",
    label: "Qwen 3.5 9B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~6,6 GB",
    recommendedRam: "VRAM: 8-12 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 1024,
    description: "NEUES STANDARD-MODELL: Beste Mehrsprachigkeit (201 Sprachen), Thinking-Unterstützung, riesiger 256K-Kontext und exzellente Deutschqualität – ideal für Unterrichtsplanung, Chat und Übersetzung.",
    recommended: true,
    capabilities: ["multilingual", "reasoning", "low-latency", "long-context"],
  },
  // ── Tier 3: Für leistungsstarke Rechner (16-32 GB RAM / GPU) ──
  {
    id: "gemma4:e2b",
    label: "Gemma 4 E2B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~7,2 GB",
    recommendedRam: "VRAM: 8-10 GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 16384,
    defaultNumPredict: 1024,
    description: "Schnelles Gemma-4-Profil mit starkem Speed/Qualitäts-Verhältnis – gut für schnelle Überarbeitungen und Chat bei moderater Hardware.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "reasoning", "long-context"],
  },
  {
    id: "deepseek-r1:8b",
    label: "DeepSeek R1 8B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~5,2 GB",
    recommendedRam: "VRAM: 10-12 GB · CPU: 20+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Reasoning-Modell mit einzigartigen logischen Denkfähigkeiten – ideal für Schritt-für-Schritt-Analysen, Lernzielprüfung und komplexe pädagogische Fragen.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:e4b",
    label: "Gemma 4 E4B",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~9,6 GB",
    recommendedRam: "VRAM: 10-14 GB · CPU: 24+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 1024,
    description: "Solider Allrounder für umfangreichere Unterrichts-Chats und mehrsprachige Aufgaben – bewährt und zuverlässig.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "mistral-small3.1:24b",
    label: "Mistral Small 3.1 24B",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~15 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 128K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Starkes Multilingual-Modell mit exzellenter europäischer Sprachabdeckung und schneller Befolgung von Anweisungen – Premium-Option für anspruchsvolle Unterrichtsvorbereitung.",
    recommended: false,
    capabilities: ["multilingual", "low-latency", "long-context"],
  },

  // ── Tier 4: Für High-End-Hardware (32+ GB RAM) ──
  {
    id: "qwen3.5:27b",
    label: "Qwen 3.5 27B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~17 GB",
    recommendedRam: "VRAM: 24+ GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Premium-Mehrsprachigkeitsmodell mit maximaler Qualität für tiefgehende Unterrichtsanalyse, anspruchsvolle Übersetzungen und komplexe pädagogische Aufgaben.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "gemma4:26b",
    label: "Gemma 4 26B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~18 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 48+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 32768,
    defaultNumPredict: 2048,
    description: "Hochkapazitives Gemma-4-Profil für tiefgreifendes Reasoning, mehrsprachige Aufgaben und lange, strukturierte Ausgaben – für Highend-Systeme.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  {
    id: "qwen3.6:27b",
    label: "Qwen 3.6 27B",
    tier: "large",
    source: "ollama-registry",
    estimatedDisk: "~17 GB",
    recommendedRam: "VRAM: 20-24 GB · CPU: 32+ GB RAM",
    recommendedContext: "Max context: 256K tokens",
    defaultNumCtx: 8192,
    defaultNumPredict: 4096,
    description: "Neueste Qwen-Generation (3 Wochen alt) mit MoE-Architektur und optimiertem agentischen Coding – beste Wahl für anspruchsvolle Analyse und lange Kontexte auf Highend-Systemen.",
    recommended: false,
    capabilities: ["multilingual", "reasoning", "long-context"],
  },
  // ═══════════════════════════════════════════════════════
  // Embedding-Modelle – für die Wissensdatenbank
  // Laufen auf allen GPUs via Ollama (Apple Metal, NVIDIA CUDA, AMD ROCm, Intel via Vulkan/CPU)
  // Jede Stufe bietet: eine multilinguale Option (DE+EN) + eine Extra-Option
  // ═══════════════════════════════════════════════════════
  {
    id: "bge-m3",
    label: "BGE M3",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~2,2 GB",
    recommendedRam: "VRAM: 6+ GB · CPU: 16+ GB RAM",
    recommendedContext: "Max context: 8192 tokens",
    defaultNumCtx: 2048,
    defaultNumPredict: 128,
    description: "🇩🇪 BESTES DEUTSCH + Multilingual (1024 Dim · 2,2 GB) – Spitzenreiter für deutsche Texte und 100+ Sprachen. Exzellent für Fachtexte, Lehrproben.",
    recommended: false,
    capabilities: ["embedding", "multilingual"],
  },
  {
    id: "bge-large:en",
    label: "BGE Large EN v1.5",
    tier: "medium",
    source: "ollama-registry",
    estimatedDisk: "~1,3 GB",
    recommendedRam: "VRAM: 6+ GB · CPU: 12+ GB RAM",
    recommendedContext: "Max context: 512 tokens",
    defaultNumCtx: 2048,
    defaultNumPredict: 128,
    description: "🇬🇧 BESTES ENGLISCH (1024 Dim · 1,3 GB) – State-of-the-Art für englische Texte, beste Retrieval-Qualität für Fachtexte.",
    recommended: false,
    capabilities: ["embedding", "english-focused"],
  },
  {
    id: "nomic-embed-text",
    label: "Nomic Embed Text",
    tier: "small",
    source: "ollama-registry",
    estimatedDisk: "~274 MB",
    recommendedRam: "VRAM: 2+ GB · CPU: 8+ GB RAM",
    recommendedContext: "Max context: 8192 tokens",
    defaultNumCtx: 2048,
    defaultNumPredict: 128,
    description: "🇩🇪🇬🇧 LEICHT & SCHNELL (768 Dim · 274 MB) – Multilingualer Allrounder für Deutsch und Englisch. Läuft auf jedem Rechner, empfohlen für die meisten.",
    recommended: true,
    capabilities: ["embedding", "low-latency", "multilingual"],
  },
];

export const DEFAULT_AI_MODEL_ID = "qwen3.5:9b";

export const DEFAULT_MODEL_RUNTIME_DEFAULTS = {
  defaultNumCtx: 6144,
  defaultNumPredict: 896,
};

const AI_THINKING_MODEL_IDS = new Set<string>([
  "qwen3.5:4b",
  "qwen3.5:9b",
  "qwen3.5:27b",
  "qwen3.6:27b",
  "gemma4:e2b",
  "gemma4:e4b",
  "gemma4:26b",
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
