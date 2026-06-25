import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile, exists, mkdir, copyFile } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store";
import type { KnowledgeSource, KnowledgeChunk, KnowledgeCategory, KnowledgeIndex, SearchResult, ImportProgress } from "./types";

const KNOWLEDGE_SUBDIR = ".teacherpro/knowledge";
const INDEX_FILE = ".teacherpro/knowledge-index.json";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSavedEmbedder(): string {
  try {
    return localStorage.getItem("tp-knowledge-embedder") || "nomic-embed-text";
  } catch {
    return "nomic-embed-text";
  }
}

function saveEmbedder(modelId: string): void {
  try {
    localStorage.setItem("tp-knowledge-embedder", modelId);
  } catch {}
}

interface KnowledgeState {
  sources: KnowledgeSource[];
  categories: KnowledgeCategory[];
  index: KnowledgeIndex | null;
  isIndexing: boolean;
  importProgress: ImportProgress | null;
  selectedSourceId: string | null;
  searchResults: SearchResult[];
  enabledInChat: boolean;
  chatCategoryFilter: string | null;
  embedderModelId: string;

  loadIndex: () => Promise<void>;
  addSource: () => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  reindexSource: (id: string) => Promise<void>;
  reindexAll: () => Promise<void>;
  searchSimilar: (text: string, limit?: number) => SearchResult[];
  setSelectedSource: (id: string | null) => void;
  setEnabledInChat: (enabled: boolean) => void;
  setChatCategoryFilter: (category: string | null) => void;
  setEmbedderModelId: (modelId: string) => void;
  addCategory: (name: string, subject?: string) => void;
  removeCategory: (id: string) => void;
  buildKnowledgeContext: (query: string, maxChunks?: number) => string;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  sources: [],
  embedderModelId: getSavedEmbedder(),
  categories: [
    { id: "allgemein", name: "Allgemein", priority: 10, description: "Allgemeine Pädagogik und Methodik" },
    { id: "lehrproben", name: "Lehrproben", priority: 100, description: "Eigene ausformulierte Lehrproben" },
    { id: "lehrplan", name: "Lehrplan", priority: 50, description: "Bildungspläne und Vorgaben" },
  ],
  index: null,
  isIndexing: false,
  importProgress: null,
  selectedSourceId: null,
  searchResults: [],
  enabledInChat: false,
  chatCategoryFilter: null,

  loadIndex: async () => {
    try {
      const vault = useAppStore.getState().vaultPath;
      if (!vault) return;
      const indexPath = await join(vault, INDEX_FILE);
      if (!(await exists(indexPath))) return;
      const raw = await readTextFile(indexPath);
      const index = JSON.parse(raw) as KnowledgeIndex;
      // Rebuild sources list from index
      const sourceMap = new Map<string, KnowledgeSource>();
      for (const chunk of index.chunks) {
        if (!sourceMap.has(chunk.sourceId)) {
          sourceMap.set(chunk.sourceId, {
            id: chunk.sourceId,
            name: chunk.sourceName,
            relativePath: "",
            category: chunk.category,
            priority: chunk.priority,
            tags: chunk.tags,
            status: "indexed",
            chunkCount: 0,
            createdAt: chunk.createdAt,
          });
        }
        sourceMap.get(chunk.sourceId)!.chunkCount++;
      }
      set({ index, sources: Array.from(sourceMap.values()) });
    } catch (e) {
      console.warn("Failed to load knowledge index:", e);
    }
  },

  addSource: async () => {
    const vault = useAppStore.getState().vaultPath;
    if (!vault) return;

    const files = await open({
      multiple: true,
      filters: [
        { name: "Dokumente", extensions: ["pdf", "docx", "txt", "md"] },
      ],
    });
    if (!files || files.length === 0) return;

    const knowledgeDir = await join(vault, KNOWLEDGE_SUBDIR);
    await mkdir(knowledgeDir, { recursive: true });

    set({ isIndexing: true });

    const state = get();
    const index = state.index || { chunks: [], embedder: state.embedderModelId, updatedAt: "" };

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fileName = filePath.split(/[/\\]/).pop() || "unknown";
      const sourceId = generateId();

      set({
        importProgress: {
          current: i + 1,
          total: files.length,
          stage: "extracting",
          sourceName: fileName,
        },
      });

      try {
        // Copy file to knowledge dir
        const destPath = await join(knowledgeDir, fileName);
        await copyFile(filePath, destPath);

        // Extract text
        const textContent = await invoke<string>("extract_text", { filePath });

        set({
          importProgress: {
            current: i + 1, total: files.length, stage: "chunking", sourceName: fileName,
          },
        });

        // Chunk text
        const chunks = chunkText(textContent, fileName);

        // Embed each chunk
        const newChunks: KnowledgeChunk[] = [];
        for (let j = 0; j < chunks.length; j++) {
          set({
            importProgress: {
              current: i + 1,
              total: files.length,
              stage: "embedding",
              sourceName: `${fileName} (${j + 1}/${chunks.length})`,
            },
          });

          try {
            const modelId = get().embedderModelId;
            const embedding = await invoke<number[]>("ai_generate_embedding", {
              model: modelId,
              text: chunks[j].text,
            });

            newChunks.push({
              id: generateId(),
              sourceId,
              sourceName: fileName,
              category: "allgemein",
              priority: 10,
              tags: [],
              title: chunks[j].title,
              text: chunks[j].text,
              page: chunks[j].page,
              embedding,
              embedder: modelId,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn(`Failed to embed chunk ${j} of ${fileName}:`, e);
          }
        }

        index.chunks.push(...newChunks);

        set((s) => ({
          sources: [
            ...s.sources,
            {
              id: sourceId,
              name: fileName,
              relativePath: fileName,
              category: "allgemein",
              priority: 10,
              tags: [],
              status: "indexed",
              chunkCount: newChunks.length,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      } catch (e) {
        console.warn(`Failed to import ${fileName}:`, e);
      }
    }

    // Save index
    index.updatedAt = new Date().toISOString();
    try {
      const indexPath = await join(vault, INDEX_FILE);
      await writeTextFile(indexPath, JSON.stringify(index, null, 2));
    } catch (e) {
      console.warn("Failed to save knowledge index:", e);
    }

    set({ index, isIndexing: false, importProgress: null });
  },

  removeSource: async (id) => {
    const state = get();
    if (!state.index) return;
    state.index.chunks = state.index.chunks.filter((c) => c.sourceId !== id);
    set({
      sources: state.sources.filter((s) => s.id !== id),
      index: { ...state.index },
    });
    const vault = useAppStore.getState().vaultPath;
    if (vault) {
      const indexPath = await join(vault, INDEX_FILE);
      await writeTextFile(indexPath, JSON.stringify(state.index, null, 2));
    }
  },

  reindexSource: async (id) => {
    // For simplicity, remove and re-add
    await get().removeSource(id);
    await get().addSource();
  },

  reindexAll: async () => {
    set({ index: { chunks: [], embedder: get().embedderModelId, updatedAt: "" }, sources: [] });
    await get().addSource();
  },

  searchSimilar: (text, limit = 8) => {
    const index = get().index;
    if (!index || index.chunks.length === 0) return [];

    // Use a simple scoring approach: keyword matching since we can't embed on the fly in render
    const query = text.toLowerCase();
    const queryWords = query.split(/\s+/).filter((w) => w.length > 2);

    const scored = index.chunks.map((chunk) => {
      const chunkText = (chunk.title + " " + chunk.text + " " + chunk.tags.join(" ")).toLowerCase();
      let matchScore = 0;
      for (const word of queryWords) {
        if (chunkText.includes(word)) matchScore++;
      }
      const textSimilarity = matchScore / Math.max(queryWords.length, 1);
      const priorityBoost = chunk.priority / 100;
      return { chunk, score: textSimilarity * (1 + priorityBoost) };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },

  setSelectedSource: (id) => set({ selectedSourceId: id }),
  setEnabledInChat: (enabled) => set({ enabledInChat: enabled }),
  setChatCategoryFilter: (category) => set({ chatCategoryFilter: category }),
  setEmbedderModelId: (modelId) => {
    saveEmbedder(modelId);
    set({ embedderModelId: modelId });
  },

  addCategory: (name, subject) => {
    set((s) => ({
      categories: [
        ...s.categories,
        { id: name.toLowerCase().replace(/\s+/g, "-"), name, subject, priority: 50, description: "" },
      ],
    }));
  },

  removeCategory: (id) => {
    set((s) => ({ categories: s.categories.filter((c) => c.id !== id) }));
  },

  buildKnowledgeContext: (query, maxChunks = 8) => {
    const results = get().searchSimilar(query, maxChunks);
    const categoryFilter = get().chatCategoryFilter;
    const filtered = categoryFilter
      ? results.filter((r) => r.chunk.category === categoryFilter)
      : results;

    if (filtered.length === 0) return "";

    const lines = ["", "─── Wissensdatenbank ───"];
    for (const r of filtered.slice(0, maxChunks)) {
      const cat = r.chunk.category || "Allgemein";
      const file = r.chunk.sourceName;
      const page = r.chunk.page ? ` (Seite ${r.chunk.page})` : "";
      const star = r.chunk.priority >= 80 ? "★ " : "";
      lines.push(`${star}[${cat}] ${file}${page}:`);
      lines.push(`  "${r.chunk.text.slice(0, 300)}"`);
    }

    return lines.join("\n");
  },
}));

function chunkText(text: string, sourceName: string): Array<{ title: string; text: string; page?: number }> {
  const chunks: Array<{ title: string; text: string; page?: number }> = [];
  const words = text.split(/\s+/);
  const CHUNK_SIZE = 500;
  const OVERLAP = 50;

  for (let i = 0; i < words.length; i += CHUNK_SIZE - OVERLAP) {
    const chunkWords = words.slice(i, i + CHUNK_SIZE);
    const chunkText = chunkWords.join(" ");
    if (chunkText.trim().length < 20) continue;

    const firstLine = chunkText.split("\n")[0]?.trim() || "";
    const title = firstLine.length > 80 ? firstLine.slice(0, 80) + "…" : firstLine || sourceName;

    chunks.push({ title: title || sourceName, text: chunkText });
  }

  return chunks;
}
