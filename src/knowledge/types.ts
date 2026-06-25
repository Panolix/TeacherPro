export interface KnowledgeSource {
  id: string;
  name: string;
  relativePath: string;
  category: string;
  priority: number;
  tags: string[];
  status: "pending" | "indexing" | "indexed" | "error";
  chunkCount: number;
  errorMessage?: string;
  createdAt: string;
}

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  category: string;
  priority: number;
  tags: string[];
  title: string;
  text: string;
  page?: number;
  embedding: number[];
  embedder: string;
  createdAt: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  subject?: string;
  priority: number;
  description: string;
}

export interface KnowledgeIndex {
  chunks: KnowledgeChunk[];
  embedder: string;
  updatedAt: string;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface SearchResult {
  chunk: KnowledgeChunk;
  score: number;
}

export interface ImportProgress {
  current: number;
  total: number;
  stage: "extracting" | "chunking" | "embedding";
  sourceName: string;
}
