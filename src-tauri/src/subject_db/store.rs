use std::path::Path;

use super::{Chunk, ChunkWithEmbedding, ScoredChunk};

/// A persisted chunk with embedding.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct StoredChunk {
    #[serde(flatten)]
    chunk: Chunk,
    embedding: Vec<f32>,
}

/// A chunk's metadata without embedding (for listing).
#[derive(Debug, Clone, serde::Serialize)]
pub struct ChunkMeta {
    pub id: String,
    pub source_file: String,
    pub page: u32,
    pub subject: String,
    pub grade: String,
    pub topic: String,
}

/// In-memory vector store for a single topic folder.
#[derive(Debug, Clone)]
pub struct VectorStore {
    pub chunks: Vec<ChunkWithEmbedding>,
}

impl VectorStore {
    pub fn new() -> Self {
        VectorStore { chunks: Vec::new() }
    }

    /// Add chunks to the store.
    pub fn add_chunks(&mut self, new_chunks: Vec<ChunkWithEmbedding>) {
        self.chunks.extend(new_chunks);
    }

    /// Query the store by cosine similarity.
    /// Returns top-k scored chunks.
    pub fn query(&self, query_emb: &[f32], top_k: usize) -> Vec<ScoredChunk> {
        if self.chunks.is_empty() || query_emb.is_empty() {
            return Vec::new();
        }

        let mut scored: Vec<ScoredChunk> = self
            .chunks
            .iter()
            .map(|ce| {
                let score = cosine_similarity(query_emb, &ce.embedding);
                ScoredChunk {
                    id: ce.chunk.id.clone(),
                    text: ce.chunk.text.clone(),
                    source: ce.chunk.source_file.clone(),
                    page: ce.chunk.page,
                    subject: ce.chunk.subject.clone(),
                    grade: ce.chunk.grade.clone(),
                    topic: ce.chunk.topic.clone(),
                    score,
                }
            })
            .collect();

        // Sort by score descending
        scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(top_k);
        scored
    }
}

/// Load a store from disk, or create a new empty one.
pub fn load_or_new(path: &Path) -> VectorStore {
    load_store(path).unwrap_or_else(|_| VectorStore::new())
}

/// Load a store from a JSON file.
pub fn load_store(path: &Path) -> Result<VectorStore, String> {
    let data = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read store file: {e}"))?;
    let stored: Vec<StoredChunk> = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse store file: {e}"))?;

    let chunks: Vec<ChunkWithEmbedding> = stored
        .into_iter()
        .map(|s| ChunkWithEmbedding {
            chunk: s.chunk,
            embedding: s.embedding,
        })
        .collect();

    Ok(VectorStore { chunks })
}

/// Save a store to a JSON file.
pub fn save_store(store: &VectorStore, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create store directory: {e}"))?;
    }

    let stored: Vec<StoredChunk> = store
        .chunks
        .iter()
        .map(|ce| StoredChunk {
            chunk: ce.chunk.clone(),
            embedding: ce.embedding.clone(),
        })
        .collect();

    let data = serde_json::to_string_pretty(&stored)
        .map_err(|e| format!("Failed to serialize store: {e}"))?;

    std::fs::write(path, data)
        .map_err(|e| format!("Failed to write store file: {e}"))?;

    Ok(())
}

/// Load only metadata (no embeddings) from a store file.
/// Useful for listing chunk counts without loading full embeddings.
pub fn load_chunks_meta(path: &Path) -> Result<Vec<ChunkMeta>, String> {
    let data = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read store file: {e}"))?;
    let stored: Vec<StoredChunk> = serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse store file: {e}"))?;

    Ok(stored
        .into_iter()
        .map(|s| ChunkMeta {
            id: s.chunk.id,
            source_file: s.chunk.source_file,
            page: s.chunk.page,
            subject: s.chunk.subject,
            grade: s.chunk.grade,
            topic: s.chunk.topic,
        })
        .collect())
}

/// Cosine similarity between two vectors.
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let v = vec![1.0, 2.0, 3.0];
        let score = cosine_similarity(&v, &v);
        assert!((score - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        let score = cosine_similarity(&a, &b);
        assert!(score.abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 2.0];
        let b = vec![-1.0, -2.0];
        let score = cosine_similarity(&a, &b);
        assert!((score + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_query_returns_top_k() {
        let mut store = VectorStore::new();
        for i in 0..10 {
            let emb = vec![i as f32; 4];
            store.add_chunks(vec![ChunkWithEmbedding {
                chunk: Chunk {
                    id: format!("chunk-{i}"),
                    text: format!("Text {i}"),
                    source_file: "test.pdf".to_string(),
                    page: 1,
                    subject: "Math".to_string(),
                    grade: "8".to_string(),
                    topic: "Algebra".to_string(),
                    language: "de".to_string(),
                },
                embedding: emb,
            }]);
        }

        let query = vec![9.0; 4];
        let results = store.query(&query, 3);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].id, "chunk-9");
    }
}
