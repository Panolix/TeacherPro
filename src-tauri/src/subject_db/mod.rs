pub mod pdf;
pub mod chunk;
pub mod store_sqlite;

use crate::ai::embeddings;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::Emitter;

// ── Data structures ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: String,
    pub text: String,
    pub source_file: String,
    pub page: u32,
    pub subject: String,
    pub grade: String,
    pub topic: String,
    pub language: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // legacy chunks.json store still uses it
pub struct ChunkWithEmbedding {
    pub chunk: Chunk,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScoredChunk {
    pub id: String,
    pub text: String,
    pub source: String,
    pub page: u32,
    pub subject: String,
    pub grade: String,
    pub topic: String,
    pub score: f32,
}

/// A single PDF file visible in the tree (at any folder level).
#[derive(Debug, Clone, Serialize)]
pub struct SubjectDbFile {
    pub name: String,
    pub is_embedded: bool,
    pub chunk_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubjectDbInfo {
    pub subject: String,
    pub grades: Vec<SubjectDbGrade>,
    pub files: Vec<SubjectDbFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubjectDbGrade {
    pub name: String,
    pub topics: Vec<SubjectDbTopic>,
    pub files: Vec<SubjectDbFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubjectDbTopic {
    pub name: String,
    pub chunk_count: usize,
    pub pending_pdfs: usize,
    pub files: Vec<SubjectDbFile>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportResult {
    pub total_chunks: usize,
    pub processed_files: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FolderMeta {
    pub subject: String,
    pub grade: String,
    pub topic: String,
}

fn subject_db_dir(vault_path: &str) -> PathBuf {
    PathBuf::from(vault_path).join("SubjectDBs")
}

/// Validate a single folder or file name coming from the frontend.
///
/// Rejects path separators, traversal components, empty names and NUL bytes so
/// a crafted `subject`/`grade`/`topic`/`filename` can never escape the subject
/// database directory. Backslashes are only rejected on Windows, where they act
/// as path separators; on Unix they are valid (if unusual) file-name characters.
fn validate_segment(raw: &str, field: &str) -> Result<String, String> {
    if raw.is_empty() || raw == "." || raw == ".." {
        return Err(format!("Invalid {field}."));
    }
    if raw.contains('\0') || raw.contains('/') {
        return Err(format!("Invalid {field}."));
    }
    #[cfg(windows)]
    if raw.contains('\\') {
        return Err(format!("Invalid {field}."));
    }
    Ok(raw.to_string())
}

// ── Helpers ──────────────────────────────────────────────────

/// Collect immediate subdirectories, sorted by name.
fn collect_dirs(path: &Path) -> Result<Vec<std::fs::DirEntry>, String> {
    if !path.exists() { return Ok(Vec::new()); }
    let mut entries: Vec<_> = std::fs::read_dir(path)
        .map_err(|e| format!("read_dir {path:?}: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .collect();
    entries.sort_by_key(|e| e.file_name());
    Ok(entries)
}

/// List PDF files in a directory with embed status from a set of known sources.
fn list_pdf_files(dir: &Path, existing_sources: &HashSet<String>) -> Result<Vec<SubjectDbFile>, String> {
    if !dir.exists() { return Ok(Vec::new()); }
    let mut files: Vec<SubjectDbFile> = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| format!("read_dir failed: {e}"))? {
        let entry = entry.map_err(|e| format!("entry failed: {e}"))?;
        let path = entry.path();
        if !path.is_file() { continue; }
        if path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase() != "pdf" { continue; }
        let name = entry.file_name().to_string_lossy().to_string();
        let is_embedded = existing_sources.contains(&name);
        files.push(SubjectDbFile { name, is_embedded, chunk_count: if is_embedded { 1 } else { 0 } });
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

fn read_existing_sources(vault_path: &str, subject: &str, grade: &str, topic: &str) -> HashSet<String> {
    let db_path = store_sqlite::db_path(vault_path);
    if !db_path.exists() {
        return HashSet::new();
    }
    match rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(conn) => store_sqlite::embedded_sources(&conn, subject, grade, topic)
            .unwrap_or_default()
            .into_iter()
            .collect(),
        Err(_) => HashSet::new(),
    }
}



// ── subject_db_list ──────────────────────────────────────────

#[tauri::command]
pub async fn subject_db_list(vault_path: String) -> Result<Vec<SubjectDbInfo>, String> {
    let db_dir = subject_db_dir(&vault_path);
    if !db_dir.exists() { return Ok(Vec::new()); }

    let sqlite_counts: std::collections::HashMap<(String, String, String), i64> = {
        let db_path = store_sqlite::db_path(&vault_path);
        let mut map = std::collections::HashMap::new();
        if db_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open_with_flags(
                &db_path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
            ) {
                if let Ok(mut stmt) = conn.prepare(
                    "SELECT subject, grade, topic, COUNT(*) FROM chunks GROUP BY subject, grade, topic",
                ) {
                    if let Ok(rows) = stmt.query_map([], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, i64>(3)?,
                        ))
                    }) {
                        for row in rows.flatten() {
                            map.insert((row.0.clone(), row.1.clone(), row.2.clone()), row.3);
                        }
                    }
                }
            }
        }
        map
    };

    let mut subjects = Vec::new();
    for s_entry in collect_dirs(&db_dir)? {
        let subject_name = s_entry.file_name().to_string_lossy().to_string();
        let subject_path = s_entry.path();

        let subject_pdfs = list_pdf_files_in_dir(&subject_path);

        let mut grades = Vec::new();
        for g_entry in collect_dirs(&subject_path)? {
            let grade_name = g_entry.file_name().to_string_lossy().to_string();
            let grade_path = g_entry.path();

            // Grade-pdfs live in the DB with topic = stem; check per-topic counts.
            let mut grade_pdfs = list_pdf_files_in_dir(&grade_path);
            for pdf in &mut grade_pdfs {
                let stem = pdf.name.trim_end_matches(".pdf").to_string();
                let embedded = sqlite_counts
                    .keys()
                    .any(|(s, g, t)| s == &subject_name && g == &grade_name && (t == &pdf.name || t == &stem));
                if embedded {
                    pdf.is_embedded = true;
                    pdf.chunk_count = 1;
                }
            }

            let mut topics = Vec::new();
            for t_entry in collect_dirs(&grade_path)? {
                let topic_name = t_entry.file_name().to_string_lossy().to_string();
                let topic_path = t_entry.path();

                let chunk_count = sqlite_counts
                    .get(&(subject_name.clone(), grade_name.clone(), topic_name.clone()))
                    .copied()
                    .unwrap_or(0);
                let existing = read_existing_sources(&vault_path, &subject_name, &grade_name, &topic_name);

                let files = list_pdf_files(&topic_path, &existing)?;
                let pending_pdfs = files.iter().filter(|f| !f.is_embedded).count();

                topics.push(SubjectDbTopic { name: topic_name, chunk_count: chunk_count as usize, pending_pdfs, files });
            }

            grades.push(SubjectDbGrade { name: grade_name, topics, files: grade_pdfs });
        }

        subjects.push(SubjectDbInfo { subject: subject_name, grades, files: subject_pdfs });
    }

    Ok(subjects)
}

/// Simple file listing without embed status (for subject/grade-level display).
fn list_pdf_files_in_dir(dir: &Path) -> Vec<SubjectDbFile> {
    if !dir.exists() { return Vec::new(); }
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() && p.extension().and_then(|e| e.to_str()) == Some("pdf") {
                files.push(SubjectDbFile {
                    name: e.file_name().to_string_lossy().to_string(),
                    is_embedded: false,
                    chunk_count: 0,
                });
            }
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));
    files
}

// ── subject_db_scan_import ───────────────────────────────────

#[tauri::command]
pub async fn subject_db_scan_import(
    app: tauri::AppHandle,
    vault_path: String,
) -> Result<ImportResult, String> {
    let db_dir = subject_db_dir(&vault_path);
    if !db_dir.exists() {
        std::fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create SubjectDBs: {e}"))?;
    }

    init_subject_db(&app);

    let mut total_chunks = 0usize;
    let mut processed_files = 0usize;
    let mut errors: Vec<String> = Vec::new();

    // Open the DB fresh per usage site; rusqlite::Connection is not Send, so it
    // must never be held across an await point.
    let existing_map = {
        let conn = store_sqlite::open(&vault_path)?;
        let mut map: std::collections::HashMap<(String, String, String), HashSet<String>> =
            std::collections::HashMap::new();
        for s_entry in collect_dirs(&db_dir)? {
            let subject = s_entry.file_name().to_string_lossy().to_string();
            for g_entry in collect_dirs(&s_entry.path())? {
                let grade = g_entry.file_name().to_string_lossy().to_string();
                for t_entry in collect_dirs(&g_entry.path())? {
                    let topic = t_entry.file_name().to_string_lossy().to_string();
                    let sources = store_sqlite::embedded_sources(&conn, &subject, &grade, &topic)
                        .unwrap_or_default();
                    map.insert(
                        (subject.clone(), grade.clone(), topic.clone()),
                        sources.into_iter().collect(),
                    );
                }
            }
        }
        map
    };

    let subject_dirs = collect_dirs(&db_dir)?;
    for s_entry in &subject_dirs {
        let subject_name = s_entry.file_name().to_string_lossy().to_string();
        let subject_path = s_entry.path();

        let _ = app.emit("subject-db-progress", serde_json::json!({
            "phase": "subject", "subject": &subject_name,
        }));

        // 1) Process topic-level folders
        for g_entry in collect_dirs(&subject_path)? {
            let grade_name = g_entry.file_name().to_string_lossy().to_string();
            let grade_path = g_entry.path();

            for t_entry in collect_dirs(&grade_path)? {
                let topic_name = t_entry.file_name().to_string_lossy().to_string();
                let topic_path = t_entry.path();

                let meta = FolderMeta {
                    subject: subject_name.clone(),
                    grade: grade_name.clone(),
                    topic: topic_name.clone(),
                };

                let existing = existing_map
                    .get(&(subject_name.clone(), grade_name.clone(), topic_name.clone()))
                    .cloned()
                    .unwrap_or_default();
                let result = process_topic_folder(&topic_path, &meta, &app, existing, &vault_path).await?;
                total_chunks += result.0;
                processed_files += result.1;
                errors.extend(result.2);
            }

            // 2) Process PDFs directly in the grade folder (not in a topic subfolder)
            let existing = existing_map
                .get(&(subject_name.clone(), grade_name.clone(), String::new()))
                .cloned()
                .unwrap_or_default();
            let result =
                process_loose_pdfs(&grade_path, &subject_name, &grade_name, &app, existing, &vault_path).await?;
            total_chunks += result.0;
            processed_files += result.1;
            errors.extend(result.2);
        }

        // 3) Process PDFs directly in the subject folder
        let result = process_loose_pdfs(&subject_path, &subject_name, "", &app, HashSet::new(), &vault_path).await?;
        total_chunks += result.0;
        processed_files += result.1;
        errors.extend(result.2);
    }

    Ok(ImportResult { total_chunks, processed_files, errors })
}

/// Process a topic folder: find new PDFs, chunk, embed, save.
async fn process_topic_folder(
    topic_path: &Path,
    meta: &FolderMeta,
    app: &tauri::AppHandle,
    existing_sources: HashSet<String>,
    vault_path: &str,
) -> Result<(usize, usize, Vec<String>), String> {
    let mut pdf_files: Vec<_> = std::fs::read_dir(topic_path)
        .map_err(|e| format!("read topic dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && e.path().extension().and_then(|ext| ext.to_str()) == Some("pdf"))
        .collect();
    pdf_files.sort_by_key(|e| e.file_name());

    let mut total_chunks = 0usize;
    let mut processed = 0usize;
    let mut errors = Vec::new();

    for entry in &pdf_files {
        let filename = entry.file_name().to_string_lossy().to_string();
        if existing_sources.contains(&filename) { continue; }

        let _ = app.emit("subject-db-progress", serde_json::json!({
            "phase": "file", "filename": &filename,
            "subject": &meta.subject, "grade": &meta.grade, "topic": &meta.topic,
        }));

        match process_and_embed_pdf(&entry.path(), &filename, meta, vault_path).await {
            Ok(count) => {
                total_chunks += count;
                processed += 1;
            }
            Err(e) => errors.push(format!("{filename}: {e}")),
        }
    }

    Ok((total_chunks, processed, errors))
}

/// Process PDFs that are loose in a folder (not inside a topic subfolder).
/// Saves chunks to `grade/chunks.json` with topic = filename stem.
/// When grade is empty (subject-level files), saves to `subject/{stem}/chunks.json` 
/// with the stem used as both grade and topic.
async fn process_loose_pdfs(
    folder_path: &Path,
    subject: &str,
    grade: &str,
    _app: &tauri::AppHandle,
    known_sources: HashSet<String>,
    vault_path: &str,
) -> Result<(usize, usize, Vec<String>), String> {
    let mut pdf_files: Vec<_> = std::fs::read_dir(folder_path)
        .map_err(|e| format!("read dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file() && e.path().extension().and_then(|ext| ext.to_str()) == Some("pdf"))
        .collect();
    pdf_files.sort_by_key(|e| e.file_name());

    let mut total_chunks = 0usize;
    let mut processed = 0usize;
    let mut errors = Vec::new();

    for entry in &pdf_files {
        let filename = entry.file_name().to_string_lossy().to_string();
        let stem = entry.path().file_stem().and_then(|s| s.to_str()).unwrap_or(&filename).to_string();

        let (meta, file_to_process) = if grade.is_empty() {
            let dir = folder_path.join(&stem);
            std::fs::create_dir_all(&dir).ok();
            let dest = dir.join(&filename);
            if !dest.exists() { std::fs::rename(entry.path(), &dest).ok(); }
            (
                FolderMeta {
                    subject: subject.to_string(),
                    grade: stem.clone(),
                    topic: stem.clone(),
                },
                dest,
            )
        } else {
            (
                FolderMeta {
                    subject: subject.to_string(),
                    grade: grade.to_string(),
                    topic: stem.clone(),
                },
                entry.path().to_path_buf(),
            )
        };

        if known_sources.contains(&filename) { continue; }

        match process_and_embed_pdf(&file_to_process, &filename, &meta, vault_path).await {
            Ok(count) => {
                total_chunks += count;
                processed += 1;
            }
            Err(e) => errors.push(format!("{filename}: {e}")),
        }
    }

    Ok((total_chunks, processed, errors))
}

/// Extract text → chunk → embed a single PDF file (fastembed in-process).
async fn process_and_embed_pdf(
    path: &Path,
    filename: &str,
    meta: &FolderMeta,
    vault_path: &str,
) -> Result<usize, String> {
    let pages = pdf::extract_text_from_pdf(path)?;
    let total_text: usize = pages.iter().map(|p| p.text.len()).sum();
    if total_text < 10 {
        return Err("no text content (scanned PDF?)".to_string());
    }

    let chunks = chunk::chunk_pages(&pages, meta, filename);
    if chunks.is_empty() {
        return Ok(0);
    }
    let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();

    let app = APP_HANDLE
        .get()
        .ok_or("App handle not initialized")?;
    embeddings::ensure_embedder(app)?;

    let vectors = crate::ai::client::run_blocking(move || embeddings::embed_texts(&texts))?;

    // L2-normalize for pure dot-product cosine
    let rows: Vec<(String, i64, String, Vec<f32>)> = chunks
        .iter()
        .zip(vectors)
        .map(|(chunk, v)| {
            let mut v = v;
            let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
            for x in v.iter_mut() {
                *x /= norm;
            }
            (chunk.text.clone(), chunk.page as i64, chunk.language.clone(), v)
        })
        .collect();

    let count = rows.len();
    // SQLite write happens here (short, non-async scope — Connection never
    // crosses an await point).
    let conn = store_sqlite::open(vault_path)?;
    store_sqlite::replace_document(
        &conn,
        &meta.subject,
        &meta.grade,
        &meta.topic,
        filename,
        &rows,
    )?;
    Ok(count)
}

static APP_HANDLE: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

pub fn init_subject_db(app: &tauri::AppHandle) {
    let _ = APP_HANDLE.set(app.clone());
}

// ── subject_db_add_pdfs ──────────────────────────────────────

#[tauri::command]
pub async fn subject_db_add_pdfs(
    vault_path: String,
    subject: String,
    grade: Option<String>,
    topic: Option<String>,
    file_paths: Vec<String>,
) -> Result<(), String> {
    let subject = validate_segment(&subject, "subject")?;
    let grade = grade.map(|g| validate_segment(&g, "grade")).transpose()?;
    let topic = topic.map(|t| validate_segment(&t, "topic")).transpose()?;

    let base = subject_db_dir(&vault_path).join(&subject);

    let target_dir = match (&grade, &topic) {
        (Some(g), Some(t)) => base.join(g).join(t),
        (Some(g), None) => base.join(g),
        (None, _) => base,  // subject level (topic ignored if present without grade)
    };

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create target dir: {e}"))?;

    let mut copied = 0usize;
    for src in &file_paths {
        let src_path = Path::new(src);
        let filename = src_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown.pdf".to_string());
        if !filename.to_lowercase().ends_with(".pdf") { continue; }
        let dest = target_dir.join(&filename);
        if dest.exists() { continue; }
        match std::fs::copy(src_path, &dest) {
            Ok(_) => copied += 1,
            Err(e) => eprintln!("Copy failed for {filename}: {e}"),
        }
    }

    if copied == 0 && !file_paths.is_empty() {
        return Err("No files were copied (already exist or invalid).".to_string());
    }
    Ok(())
}

// ── subject_db_delete_file ────────────────────────────────────

#[tauri::command]
pub async fn subject_db_delete_file(
    vault_path: String,
    subject: String,
    grade: Option<String>,
    topic: Option<String>,
    filename: String,
) -> Result<(), String> {
    let subject = validate_segment(&subject, "subject")?;
    let grade = grade.map(|g| validate_segment(&g, "grade")).transpose()?;
    let topic = topic.map(|t| validate_segment(&t, "topic")).transpose()?;
    let filename = validate_segment(&filename, "filename")?;

    let base = subject_db_dir(&vault_path).join(&subject);
    let file_path = match (&grade, &topic) {
        (Some(g), Some(t)) => base.join(g).join(t).join(&filename),
        (Some(g), None) => base.join(g).join(&filename),
        (None, _) => base.join(&filename),
    };

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file: {e}"))?;

        // Remove associated chunks from the SQLite index
        if let (Some(g), Some(t)) = (grade, topic) {
            let conn = store_sqlite::open(&vault_path)?;
            store_sqlite::delete_document(&conn, &subject, &g, &t, &filename)?;
        }
    }

    Ok(())
}

// ── subject_db_query ─────────────────────────────────────────

#[tauri::command]
pub async fn subject_db_query(
    vault_path: String,
    subject: String,
    grade: Option<String>,
    topic: Option<String>,
    query: String,
    top_k: u32,
) -> Result<Vec<ScoredChunk>, String> {
    let subject = validate_segment(&subject, "subject")?;
    let grade = grade.map(|g| validate_segment(&g, "grade")).transpose()?;
    let topic = topic.map(|t| validate_segment(&t, "topic")).transpose()?;

    let top_k = top_k.clamp(1, 50) as usize;

    let db_path = store_sqlite::db_path(&vault_path);
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let app = APP_HANDLE.get().ok_or("App handle not initialized")?;
    embeddings::ensure_embedder(app)?;

    let q = query.clone();
    let query_emb = crate::ai::client::run_blocking(move || embeddings::embed_texts(&[q]))?
        .into_iter()
        .next()
        .ok_or("Embedding returned empty result".to_string())?;
    let norm = query_emb.iter().map(|x| x * x).sum::<f32>().sqrt().max(1e-12);
    let query_vec: Vec<f32> = query_emb.iter().map(|x| x / norm).collect();

    let conn = store_sqlite::open(&vault_path)?;
    let dense = store_sqlite::dense_search(
        &conn,
        &subject,
        grade.as_deref(),
        topic.as_deref(),
        &query_vec,
        top_k * 2,
    )?;
    let fts = store_sqlite::fts_search(
        &conn,
        &subject,
        grade.as_deref(),
        topic.as_deref(),
        &query,
        top_k * 2,
    )?;
    let fused = store_sqlite::fuse(dense, fts, top_k);

    Ok(fused
        .into_iter()
        .map(|s| ScoredChunk {
            id: s.row.chunk_id.to_string(),
            text: s.row.text,
            source: s.row.source_file,
            page: s.row.page.max(0) as u32,
            subject: s.row.subject,
            grade: s.row.grade,
            topic: s.row.topic,
            score: s.score,
        })
        .collect())
}

// ── subject_db_delete ────────────────────────────────────────

#[tauri::command]
pub async fn subject_db_delete(
    vault_path: String,
    subject: String,
    grade: Option<String>,
    topic: Option<String>,
) -> Result<(), String> {
    let subject = validate_segment(&subject, "subject")?;
    let grade = grade.map(|g| validate_segment(&g, "grade")).transpose()?;
    let topic = topic.map(|t| validate_segment(&t, "topic")).transpose()?;

    let db_dir = subject_db_dir(&vault_path);
    let target = db_dir.join(&subject);

    {
        let conn = store_sqlite::open(&vault_path)?;
        store_sqlite::delete_hierarchy(
            &conn,
            &subject,
            grade.as_deref(),
            topic.as_deref(),
        )?;
    }

    if let Some(g) = &grade {
        let grade_dir = target.join(g);
        if let Some(t) = &topic {
            let topic_dir = grade_dir.join(t);
            if topic_dir.exists() {
                std::fs::remove_dir_all(&topic_dir)
                    .map_err(|e| format!("delete topic dir: {e}"))?;
            }
        } else if grade_dir.exists() {
            std::fs::remove_dir_all(&grade_dir)
                .map_err(|e| format!("delete grade dir: {e}"))?;
        }
    } else if target.exists() {
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("delete subject dir: {e}"))?;
    }
    Ok(())
}

// \u2500\u2500 subject_db_diagnose \u2500\u2500

#[derive(Serialize)]
pub struct DbDiagnostic {
    pub subject: String,
    pub grade: String,
    pub topic: String,
    pub chunk_count: usize,
    pub has_store: bool,
    pub store_path: String,
    pub embedding_model_available: bool,
}

#[tauri::command]
pub async fn subject_db_diagnose(
    vault_path: String,
) -> Result<Vec<DbDiagnostic>, String> {
    let db_dir = subject_db_dir(&vault_path);
    if !db_dir.exists() {
        return Ok(Vec::new());
    }

    // Embedder readiness = weights present on disk (in-process ONNX)
    let model_available = APP_HANDLE
        .get()
        .map(|app| {
            crate::ai::embeddings::emb_models_dir(app)
                .map(|d| d.join("model_quantized.onnx").is_file())
                .unwrap_or(false)
        })
        .unwrap_or(false);

    let conn = store_sqlite::open(&vault_path)?;
    let mut results = Vec::new();
    for s_entry in collect_dirs(&db_dir)? {
        let subject = s_entry.file_name().to_string_lossy().to_string();
        for g_entry in collect_dirs(&s_entry.path())? {
            let grade = g_entry.file_name().to_string_lossy().to_string();
            for t_entry in collect_dirs(&g_entry.path())? {
                let topic = t_entry.file_name().to_string_lossy().to_string();
                let chunk_count = store_sqlite::chunk_count_by_hierarchy(
                    &conn, &subject, Some(&grade), Some(&topic),
                )?;
                if chunk_count > 0 {
                    results.push(DbDiagnostic {
                        subject: subject.clone(),
                        grade: grade.clone(),
                        topic,
                        chunk_count: chunk_count as usize,
                        has_store: true,
                        store_path: store_sqlite::db_path(&vault_path).to_string_lossy().to_string(),
                        embedding_model_available: model_available,
                    });
                }
            }
            // Grade-level (topic = stem) counts
            let grade_count = store_sqlite::chunk_count_by_hierarchy(&conn, &subject, Some(&grade), None)?;
            if grade_count > 0 {
                results.push(DbDiagnostic {
                    subject: subject.clone(),
                    grade: grade.clone(),
                    topic: "(grade-level)".to_string(),
                    chunk_count: grade_count as usize,
                    has_store: true,
                    store_path: store_sqlite::db_path(&vault_path).to_string_lossy().to_string(),
                    embedding_model_available: model_available,
                });
            }
        }
    }
    Ok(results)
}

// ── Utility ──────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::validate_segment;

    #[test]
    fn accepts_plain_folder_names() {
        assert_eq!(validate_segment("Math", "subject").unwrap(), "Math");
        assert_eq!(validate_segment("Grade-7 A", "grade").unwrap(), "Grade-7 A");
        assert_eq!(validate_segment("Unit 1.2 (basics)", "topic").unwrap(), "Unit 1.2 (basics)");
    }

    #[test]
    fn rejects_traversal_and_separators() {
        assert!(validate_segment("", "subject").is_err());
        assert!(validate_segment(".", "subject").is_err());
        assert!(validate_segment("..", "subject").is_err());
        assert!(validate_segment("../Lesson Plans", "topic").is_err());
        assert!(validate_segment("a/b", "topic").is_err());
        assert!(validate_segment("/etc", "subject").is_err());
        assert!(validate_segment("bad\0name", "filename").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn rejects_backslash_on_windows() {
        assert!(validate_segment("a\\b", "topic").is_err());
    }

    #[cfg(not(windows))]
    #[test]
    fn allows_backslash_on_unix() {
        assert_eq!(validate_segment("a\\b", "topic").unwrap(), "a\\b");
    }
}
