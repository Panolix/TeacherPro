pub mod pdf;
pub mod chunk;
pub mod embed;
pub mod store;

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

const EMBEDDING_MODEL: &str = "bge-m3";

fn get_ollama_base_url() -> String {
    std::env::var("OLLAMA_HOST")
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string())
        .trim_end_matches('/')
        .to_string()
}

fn subject_db_dir(vault_path: &str) -> PathBuf {
    PathBuf::from(vault_path).join("SubjectDBs")
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

fn read_existing_sources(store_path: &Path) -> HashSet<String> {
    if store_path.exists() {
        store::load_chunks_meta(store_path)
            .ok()
            .map(|chunks| chunks.into_iter().map(|c| c.source_file).collect())
            .unwrap_or_default()
    } else {
        HashSet::new()
    }
}

// ── subject_db_list ──────────────────────────────────────────

#[tauri::command]
pub async fn subject_db_list(vault_path: String) -> Result<Vec<SubjectDbInfo>, String> {
    let db_dir = subject_db_dir(&vault_path);
    if !db_dir.exists() { return Ok(Vec::new()); }

    let mut subjects = Vec::new();
    for s_entry in collect_dirs(&db_dir)? {
        let subject_name = s_entry.file_name().to_string_lossy().to_string();
        let subject_path = s_entry.path();

        // Files directly in the subject folder
        let subject_pdfs = list_pdf_files_in_dir(&subject_path);

        let mut grades = Vec::new();
        for g_entry in collect_dirs(&subject_path)? {
            let grade_name = g_entry.file_name().to_string_lossy().to_string();
            let grade_path = g_entry.path();

            // Files directly in the grade folder + grade-level chunks.json
            let grade_store = grade_path.join("chunks.json");
            let grade_existing = read_existing_sources(&grade_store);
            let mut grade_pdfs = list_pdf_files_in_dir(&grade_path);
            // Mark grade-pdfs that have been embedded
            for pdf in &mut grade_pdfs {
                if grade_existing.contains(&pdf.name) {
                    pdf.is_embedded = true;
                    pdf.chunk_count = 1;
                }
            }

            let mut topics = Vec::new();
            for t_entry in collect_dirs(&grade_path)? {
                let topic_name = t_entry.file_name().to_string_lossy().to_string();
                let topic_path = t_entry.path();
                let store_path = topic_path.join("chunks.json");
                let existing = read_existing_sources(&store_path);

                let chunk_count = if store_path.exists() {
                    store::load_chunks_meta(&store_path).ok().map(|c| c.len()).unwrap_or(0)
                } else { 0 };

                let files = list_pdf_files(&topic_path, &existing)?;
                let pending_pdfs = files.iter().filter(|f| !f.is_embedded).count();

                topics.push(SubjectDbTopic { name: topic_name, chunk_count, pending_pdfs, files });
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

    let mut total_chunks = 0usize;
    let mut processed_files = 0usize;
    let mut errors: Vec<String> = Vec::new();

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
                let store_path = topic_path.join("chunks.json");

                let meta = FolderMeta {
                    subject: subject_name.clone(),
                    grade: grade_name.clone(),
                    topic: topic_name,
                };

                let result = process_topic_folder(&topic_path, &meta, &store_path, &app).await?;
                total_chunks += result.0;
                processed_files += result.1;
                errors.extend(result.2);
            }

            // 2) Process PDFs directly in the grade folder (not in a topic subfolder)
            let result = process_loose_pdfs(&grade_path, &subject_name, &grade_name, &app).await?;
            total_chunks += result.0;
            processed_files += result.1;
            errors.extend(result.2);
        }

        // 3) Process PDFs directly in the subject folder
        let result = process_loose_pdfs(&subject_path, &subject_name, "", &app).await?;
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
    store_path: &Path,
    app: &tauri::AppHandle,
) -> Result<(usize, usize, Vec<String>), String> {
    let mut store = store::load_or_new(store_path);
    let existing_sources: HashSet<String> = store.chunks.iter().map(|c| c.chunk.source_file.clone()).collect();

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

        match process_and_embed_pdf(&entry.path(), &filename, meta).await {
            Ok(chunked) => {
                let count = chunked.len();
                store.add_chunks(chunked);
                total_chunks += count;
                processed += 1;
            }
            Err(e) => errors.push(format!("{filename}: {e}")),
        }
    }

    // Save store if anything changed
    if processed > 0 {
        store::save_store(&store, store_path).ok();
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

        let meta;
        let store_path;
        let file_to_process;
        if grade.is_empty() {
            // Subject-level PDF → use stem as both grade and topic
            let dir = folder_path.join(&stem);
            std::fs::create_dir_all(&dir).ok();
            let dest = dir.join(&filename);
            if !dest.exists() { std::fs::rename(entry.path(), &dest).ok(); }
            meta = FolderMeta {
                subject: subject.to_string(),
                grade: stem.clone(),
                topic: stem.clone(),
            };
            store_path = dir.join("chunks.json");
            file_to_process = dest;
        } else {
            // Grade-level PDF → save to grade/chunks.json with topic = filename
            meta = FolderMeta {
                subject: subject.to_string(),
                grade: grade.to_string(),
                topic: stem.clone(),
            };
            store_path = folder_path.join("chunks.json");
            file_to_process = entry.path().to_path_buf();
        };

        let existing = read_existing_sources(&store_path);
        if existing.contains(&filename) { continue; }

        match process_and_embed_pdf(&file_to_process, &filename, &meta).await {
            Ok(chunked) => {
                let mut store = store::load_or_new(&store_path);
                let count = chunked.len();
                store.add_chunks(chunked);
                store::save_store(&store, &store_path).ok();
                total_chunks += count;
                processed += 1;
            }
            Err(e) => errors.push(format!("{filename}: {e}")),
        }
    }

    Ok((total_chunks, processed, errors))
}

/// Extract text → chunk → embed a single PDF file.
async fn process_and_embed_pdf(
    path: &Path,
    filename: &str,
    meta: &FolderMeta,
) -> Result<Vec<ChunkWithEmbedding>, String> {
    let pages = pdf::extract_text_from_pdf(path)?;
    let total_text: usize = pages.iter().map(|p| p.text.len()).sum();
    if total_text < 10 {
        return Err("no text content (scanned PDF?)".to_string());
    }

    let chunks = chunk::chunk_pages(&pages, meta, filename);
    let texts: Vec<String> = chunks.iter().map(|c| c.text.clone()).collect();
    let base_url = get_ollama_base_url();

    let embeddings = embed::embed_texts(&texts, EMBEDDING_MODEL, &base_url).await?;

    let chunked: Vec<ChunkWithEmbedding> = chunks
        .into_iter()
        .zip(embeddings)
        .map(|(chunk, embedding)| ChunkWithEmbedding { chunk, embedding })
        .collect();

    Ok(chunked)
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
    let base = subject_db_dir(&vault_path).join(&subject);
    let file_path = match (&grade, &topic) {
        (Some(g), Some(t)) => base.join(g).join(t).join(&filename),
        (Some(g), None) => base.join(g).join(&filename),
        (None, _) => base.join(&filename),
    };

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete file: {e}"))?;

        // Also remove associated chunks from chunks.json if topic level
        if let (Some(g), Some(t)) = (grade, topic) {
            let store_path = base.join(&g).join(&t).join("chunks.json");
            if store_path.exists() {
                if let Ok(mut store) = store::load_store(&store_path) {
                    store.chunks.retain(|c| c.chunk.source_file != filename);
                    store::save_store(&store, &store_path).ok();
                }
            }
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
    let db_dir = subject_db_dir(&vault_path);
    let top_k = top_k.clamp(1, 50) as usize;

    let base_url = get_ollama_base_url();
    let query_emb = embed::embed_texts(&[query], EMBEDDING_MODEL, &base_url)
        .await?
        .into_iter()
        .next()
        .ok_or("Embedding returned empty result".to_string())?;

    let search_dir = db_dir.join(&subject);
    if !search_dir.exists() { return Ok(Vec::new()); }

    let topics = collect_topic_dirs(&search_dir, &grade, &topic)?;
    let mut all_scored = Vec::new();

    for dir in &topics {
        let store_path = dir.join("chunks.json");
        if !store_path.exists() { continue; }
        if let Ok(store) = store::load_store(&store_path) {
            all_scored.extend(store.query(&query_emb, top_k));
        }
    }

    all_scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    all_scored.truncate(top_k);
    Ok(all_scored)
}

// ── subject_db_delete ────────────────────────────────────────

#[tauri::command]
pub async fn subject_db_delete(
    vault_path: String,
    subject: String,
    grade: Option<String>,
    topic: Option<String>,
) -> Result<(), String> {
    let db_dir = subject_db_dir(&vault_path);
    let target = db_dir.join(&subject);

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

// ── subject_db_diagnose ──────────────────────────────────────

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

    // Check if bge-m3 is available via Ollama
    let base_url = get_ollama_base_url();
    let model_available = tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(5))
            .build();
        agent.post(&format!("{base_url}/api/show"))
            .send_json(serde_json::json!({"model": "bge-m3"}))
            .is_ok()
    }).await.unwrap_or(false);

    let mut results = Vec::new();
    for s_entry in collect_dirs(&db_dir)? {
        let subject = s_entry.file_name().to_string_lossy().to_string();
        for g_entry in collect_dirs(&s_entry.path())? {
            let grade = g_entry.file_name().to_string_lossy().to_string();
            for t_entry in collect_dirs(&g_entry.path())? {
                let topic = t_entry.file_name().to_string_lossy().to_string();
                let store_path = t_entry.path().join("chunks.json");
                let has_store = store_path.exists();
                let chunk_count = if has_store {
                    store::load_chunks_meta(&store_path).ok().map(|c| c.len()).unwrap_or(0)
                } else { 0 };
                results.push(DbDiagnostic {
                    subject: subject.clone(),
                    grade: grade.clone(),
                    topic,
                    chunk_count,
                    has_store,
                    store_path: store_path.to_string_lossy().to_string(),
                    embedding_model_available: model_available,
                });
            }
            // Also check grade-level store
            let grade_store = g_entry.path().join("chunks.json");
            if grade_store.exists() {
                let chunk_count = store::load_chunks_meta(&grade_store).ok().map(|c| c.len()).unwrap_or(0);
                if chunk_count > 0 {
                    results.push(DbDiagnostic {
                        subject: subject.clone(),
                        grade: grade.clone(),
                        topic: "(grade-level)".to_string(),
                        chunk_count,
                        has_store: true,
                        store_path: grade_store.to_string_lossy().to_string(),
                        embedding_model_available: model_available,
                    });
                }
            }
        }
    }
    Ok(results)
}

// ── Utility ──────────────────────────────────────────────────

fn collect_topic_dirs(
    subject_path: &Path,
    grade: &Option<String>,
    topic: &Option<String>,
) -> Result<Vec<PathBuf>, String> {
    let mut dirs = Vec::new();
    if let Some(g) = grade {
        let gp = subject_path.join(g);
        if !gp.exists() { return Ok(Vec::new()); }
        if let Some(t) = topic {
            let tp = gp.join(t);
            if tp.exists() && tp.is_dir() { dirs.push(tp); }
        } else {
            // Grade selected without topic → only search grade-level chunks
            // (PDFs directly in the grade folder, not in sub-topics)
            // If there's a grade-level chunks.json, include the grade path
            if gp.join("chunks.json").exists() {
                dirs.push(gp);
            }
            // Also check for virtual topic folders from subject-level PDF processing
            // This is for backward compatibility with subject-level PDFs that got
            // moved into stem-named folders
        }
    } else {
        // Subject selected without grade → search all grade-level chunks
        for ge in collect_dirs(subject_path)? {
            let gp = ge.path();
            if gp.join("chunks.json").exists() {
                dirs.push(gp.clone());
            }
            // Also include topic-level chunks in sub-folders
            if let Ok(topic_dirs) = collect_dirs(&gp) {
                for te in &topic_dirs { dirs.push(te.path()); }
            }
        }
    }
    Ok(dirs)
}
