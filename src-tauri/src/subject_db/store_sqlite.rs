//! SQLite vector+FTS store for SubjectDBs (docs/AI_V3_PLAN.md §3.5).
//!
//! One database per vault: `<vault>/SubjectDBs/index.db`.
//! - `chunks`: metadata + text (hierarchical: subject/grade/topic)
//! - `vecs`: L2-normalized f32 blob (1024-dim bge-m3) — brute-force cosine in Rust
//! - `fts`: FTS5 keyword index for hybrid retrieval
//!
//! Replaces the per-topic chunks.json stores. Existing chunk folders are NOT
//! migrated (accepted in plan §2); re-run "Scan & Import" to rebuild.

use rusqlite::{params, Connection, OpenFlags};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct StoredChunkRow {
    pub chunk_id: i64,
    pub subject: String,
    pub grade: String,
    pub topic: String,
    pub source_file: String,
    pub page: i64,
    pub lang: String,
    pub text: String,
}

pub struct ScoredRow {
    pub row: StoredChunkRow,
    pub score: f32,
}

pub fn db_path(vault_path: &str) -> std::path::PathBuf {
    std::path::PathBuf::from(vault_path)
        .join("SubjectDBs")
        .join("index.db")
}

pub fn open(vault_path: &str) -> Result<Connection, String> {
    let path = db_path(vault_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )
    .map_err(|e| format!("Failed to open SubjectDB index: {e}"))?;
    // Scans and queries use separate connections; wait instead of failing
    // immediately with SQLITE_BUSY while another connection is writing.
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| format!("Failed to configure SubjectDB busy timeout: {e}"))?;
    conn.pragma_update(None, "journal_mode", "WAL").ok();
    conn.pragma_update(None, "synchronous", "NORMAL").ok();
    // Required for the vecs ON DELETE CASCADE to fire (SQLite defaults FK off);
    // without it, replaced/deleted docs leave orphan vec blobs behind.
    conn.pragma_update(None, "foreign_keys", "ON").ok();
    create_schema(&conn)?;
    Ok(conn)
}

fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id INTEGER PRIMARY KEY,
            doc_key TEXT NOT NULL,
            subject TEXT NOT NULL,
            grade TEXT NOT NULL,
            topic TEXT NOT NULL,
            source_file TEXT NOT NULL,
            page INTEGER NOT NULL,
            lang TEXT NOT NULL,
            text TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_key);
        CREATE INDEX IF NOT EXISTS idx_chunks_hier ON chunks(subject, grade, topic);
        CREATE TABLE IF NOT EXISTS vecs (
            chunk_id INTEGER PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
            vec BLOB NOT NULL
        );
        CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
            text, content='chunks', content_rowid='chunk_id', tokenize='unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS fts_ins AFTER INSERT ON chunks BEGIN
            INSERT INTO fts(rowid, text) VALUES (new.chunk_id, new.text);
        END;
        CREATE TRIGGER IF NOT EXISTS fts_del AFTER DELETE ON chunks BEGIN
            INSERT INTO fts(fts, rowid, text) VALUES ('delete', old.chunk_id, old.text);
        END;
        "#,
    )
    .map_err(|e| format!("Failed to create schema: {e}"))?;
    Ok(())
}

/// Insert/replace all chunks for one document (doc_key = subject/grade/topic/file).
pub fn replace_document(
    conn: &Connection,
    subject: &str,
    grade: &str,
    topic: &str,
    source_file: &str,
    rows: &[(String, i64, String, Vec<f32>)], // (text, page, lang, vec)
) -> Result<usize, String> {
    let doc_key = format!("{subject}/{grade}/{topic}/{source_file}");
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    // Old rows deleted; the fts_del trigger removes their FTS entries and the
    // vecs FK cascade removes their vectors.
    tx.execute("DELETE FROM chunks WHERE doc_key = ?1", params![doc_key])
        .map_err(|e| e.to_string())?;
    for (text, page, lang, vec) in rows {
        tx.execute(
            "INSERT INTO chunks (doc_key, subject, grade, topic, source_file, page, lang, text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                doc_key,
                subject,
                grade,
                topic,
                source_file,
                page,
                lang,
                text
            ],
        )
        .map_err(|e| e.to_string())?;
        let chunk_id = tx.last_insert_rowid();
        let blob = vec_to_blob(vec);
        tx.execute(
            "INSERT INTO vecs (chunk_id, vec) VALUES (?1, ?2)",
            params![chunk_id, blob],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(rows.len())
}

/// Remove all chunks for a source file under a hierarchy prefix.
///
/// `topic = None` matches every topic under the grade (covers loose grade-level
/// PDFs, which are stored with topic = filename stem); `grade = None` matches
/// the whole subject (subject-level files).
pub fn delete_document_by_source(
    conn: &Connection,
    subject: &str,
    grade: Option<&str>,
    topic: Option<&str>,
    source_file: &str,
) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    match (grade, topic) {
        (Some(g), Some(t)) => tx.execute(
            "DELETE FROM chunks WHERE subject=?1 AND grade=?2 AND topic=?3 AND source_file=?4",
            params![subject, g, t, source_file],
        ),
        (Some(g), None) => tx.execute(
            "DELETE FROM chunks WHERE subject=?1 AND grade=?2 AND source_file=?3",
            params![subject, g, source_file],
        ),
        (None, _) => tx.execute(
            "DELETE FROM chunks WHERE subject=?1 AND source_file=?2",
            params![subject, source_file],
        ),
    }
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Remove all chunks under a hierarchy prefix (used by delete of grade/topic/subject).
pub fn delete_hierarchy(
    conn: &Connection,
    subject: &str,
    grade: Option<&str>,
    topic: Option<&str>,
) -> Result<(), String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    if let Some(g) = grade {
        if let Some(t) = topic {
            tx.execute(
                "DELETE FROM chunks WHERE subject=?1 AND grade=?2 AND topic=?3",
                params![subject, g, t],
            )
            .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "DELETE FROM chunks WHERE subject=?1 AND grade=?2",
                params![subject, g],
            )
            .map_err(|e| e.to_string())?;
        }
    } else {
        tx.execute("DELETE FROM chunks WHERE subject=?1", params![subject])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Dense retrieval: cosine over all vectors under the hierarchy filter.
pub fn dense_search(
    conn: &Connection,
    subject: &str,
    grade: Option<&str>,
    topic: Option<&str>,
    file: Option<&str>,
    query_vec: &[f32],
    top_k: usize,
) -> Result<Vec<ScoredRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT c.chunk_id, c.subject, c.grade, c.topic, c.source_file, c.page, c.lang, c.text, v.vec
             FROM chunks c JOIN vecs v ON v.chunk_id = c.chunk_id
             WHERE c.subject = ?1
               AND (?2 IS NULL OR c.grade = ?2)
               AND (?3 IS NULL OR c.topic = ?3)
               AND (?4 IS NULL OR c.source_file = ?4)",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![subject, grade, topic, file], |r| {
            Ok((
                StoredChunkRow {
                    chunk_id: r.get(0)?,
                    subject: r.get(1)?,
                    grade: r.get(2)?,
                    topic: r.get(3)?,
                    source_file: r.get(4)?,
                    page: r.get(5)?,
                    lang: r.get(6)?,
                    text: r.get(7)?,
                },
                r.get::<_, Vec<u8>>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut scored: Vec<ScoredRow> = Vec::new();
    for row in rows.flatten() {
        let (row, blob) = row;
        let vec = blob_to_vec(&blob);
        let score = dot(query_vec, &vec);
        scored.push(ScoredRow { row, score });
    }
    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(top_k);
    Ok(scored)
}

/// Keyword retrieval: FTS5 BM25.
pub fn fts_search(
    conn: &Connection,
    subject: &str,
    grade: Option<&str>,
    topic: Option<&str>,
    file: Option<&str>,
    query: &str,
    top_k: usize,
) -> Result<Vec<ScoredRow>, String> {
    // Escape query into prefix terms so partial German words still match.
    let sanitized: String = query
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == ' ' {
                c
            } else {
                ' '
            }
        })
        .collect();
    let fts_query = sanitized
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| format!("\"{w}\"*"))
        .collect::<Vec<_>>()
        .join(" ");
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    let sql = format!(
        "SELECT c.chunk_id, c.subject, c.grade, c.topic, c.source_file, c.page, c.lang, c.text,
                bm25(fts) AS rank
         FROM fts
         JOIN chunks c ON c.chunk_id = fts.rowid
         WHERE fts MATCH ?4
           AND c.subject = ?1
           AND (?2 IS NULL OR c.grade = ?2)
           AND (?3 IS NULL OR c.topic = ?3)
           AND (?5 IS NULL OR c.source_file = ?5)
         ORDER BY rank
         LIMIT {top_k}"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![subject, grade, topic, fts_query, file], |r| {
            Ok((
                StoredChunkRow {
                    chunk_id: r.get(0)?,
                    subject: r.get(1)?,
                    grade: r.get(2)?,
                    topic: r.get(3)?,
                    source_file: r.get(4)?,
                    page: r.get(5)?,
                    lang: r.get(6)?,
                    text: r.get(7)?,
                },
                r.get::<_, f64>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut scored: Vec<ScoredRow> = Vec::new();
    for row in rows.flatten() {
        let (row, bm25) = row;
        // bm25() returns lower=better (matches are ≤ 0, strong matches more
        // negative). Flip the sign so the exposed score is higher=better and
        // monotonic with the bm25 ranking. RRF only consumes ranks, this just
        // keeps the legacy `ScoredChunk.score` field honest.
        let score = 1.0 - bm25 as f32;
        scored.push(ScoredRow { row, score });
    }
    Ok(scored)
}

/// Reciprocal-rank fusion of two ranked lists.
pub fn fuse(dense: Vec<ScoredRow>, fts: Vec<ScoredRow>, top_k: usize) -> Vec<ScoredRow> {
    const K: f32 = 60.0;
    let mut fused: std::collections::HashMap<i64, (f32, ScoredRow)> =
        std::collections::HashMap::new();
    for (rank, row) in dense.into_iter().enumerate() {
        let entry = fused.entry(row.row.chunk_id).or_insert((0.0, row));
        entry.0 += 1.0 / (K + rank as f32 + 1.0);
    }
    for (rank, row) in fts.into_iter().enumerate() {
        let entry = fused.entry(row.row.chunk_id).or_insert((0.0, row));
        entry.0 += 1.0 / (K + rank as f32 + 1.0);
    }
    let mut out: Vec<ScoredRow> = fused
        .into_values()
        .map(|(score, entry)| ScoredRow {
            score,
            row: entry.row,
        })
        .collect();
    out.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out.truncate(top_k);
    out
}

// ---- embedder identity marker (re-index detection) ----

const META_EMBEDDER_ID: &str = "embedder_id";

pub fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    use rusqlite::OptionalExtension;
    conn.query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| {
        r.get::<_, String>(0)
    })
    .optional()
    .map_err(|e| e.to_string())
}

fn chunk_total(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT COUNT(*) FROM chunks", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

/// Clear the whole index when it was built with a different embedding model
/// (vectors from different models are not comparable). Returns true if reset.
pub fn reset_if_embedder_changed(conn: &Connection, embedder_id: &str) -> Result<bool, String> {
    if get_meta(conn, META_EMBEDDER_ID)?.as_deref() == Some(embedder_id) {
        return Ok(false);
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    if chunk_total(conn)? > 0 {
        tx.execute("DELETE FROM chunks", [])
            .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![META_EMBEDDER_ID, embedder_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(true)
}

/// Reject queries against an index built with a different embedding model.
pub fn assert_embedder(conn: &Connection, embedder_id: &str) -> Result<(), String> {
    if chunk_total(conn)? == 0 {
        return Ok(());
    }
    if get_meta(conn, META_EMBEDDER_ID)?.as_deref() == Some(embedder_id) {
        return Ok(());
    }
    Err("The knowledge index was built with a different embedding model. Run \"Scan & Import\" in Datenbanken to re-index.".to_string())
}

pub fn embedded_sources(
    conn: &Connection,
    subject: &str,
    grade: &str,
    topic: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT source_file FROM chunks WHERE subject=?1 AND grade=?2 AND topic=?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![subject, grade, topic], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    Ok(rows.flatten().collect())
}

// ---- blob helpers (little-endian f32) ----

fn vec_to_blob(vec: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(vec.len() * 4);
    for f in vec {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}
