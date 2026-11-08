use super::{checked_db_target, collect_dirs, is_pdf_path, FolderMeta};
use std::path::{Path, PathBuf};

pub struct PdfDocument {
    pub path: PathBuf,
    pub filename: String,
    pub meta: FolderMeta,
}

fn add_pdfs(
    vault: &str,
    folder: &Path,
    subject: &str,
    grade: Option<&str>,
    topic: Option<&str>,
    docs: &mut Vec<PdfDocument>,
) -> Result<(), String> {
    let folder = checked_db_target(vault, folder)?;
    for entry in std::fs::read_dir(&folder).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !is_pdf_path(&entry.path()) || !entry.path().is_file() {
            continue;
        }
        let path = checked_db_target(vault, &entry.path())?;
        let filename = entry.file_name().to_string_lossy().to_string();
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or("Invalid PDF filename")?;
        docs.push(PdfDocument {
            meta: FolderMeta {
                subject: subject.into(),
                grade: grade.unwrap_or(stem).into(),
                topic: topic.unwrap_or(stem).into(),
            },
            path,
            filename,
        });
    }
    Ok(())
}

/// Use the same synthetic hierarchy at all levels, without moving user files.
pub fn collect_documents(vault: &str, root: &Path) -> Result<Vec<PdfDocument>, String> {
    let mut docs = Vec::new();
    for subject in collect_dirs(root)? {
        let name = subject.file_name().to_string_lossy().to_string();
        let subject_path = checked_db_target(vault, &subject.path())?;
        add_pdfs(vault, &subject_path, &name, None, None, &mut docs)?;
        for grade in collect_dirs(&subject_path)? {
            let grade_name = grade.file_name().to_string_lossy().to_string();
            let grade_path = checked_db_target(vault, &grade.path())?;
            add_pdfs(
                vault,
                &grade_path,
                &name,
                Some(&grade_name),
                None,
                &mut docs,
            )?;
            for topic in collect_dirs(&grade_path)? {
                let topic_name = topic.file_name().to_string_lossy().to_string();
                add_pdfs(
                    vault,
                    &topic.path(),
                    &name,
                    Some(&grade_name),
                    Some(&topic_name),
                    &mut docs,
                )?;
            }
        }
    }
    docs.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(docs)
}

pub fn fingerprint(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 250 * 1024 * 1024 {
        return Err("PDF is too large (limit 250 MB).".into());
    }
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    std::io::copy(&mut file, &mut hash).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovers_all_folder_levels_without_moving_files() {
        let vault = tempfile::tempdir().unwrap();
        let root = vault.path().join("SubjectDBs");
        std::fs::create_dir_all(root.join("English/9/Grammar")).unwrap();
        for relative in [
            "English/curriculum.PDF",
            "English/9/guide.pdf",
            "English/9/Grammar/worksheet.pdf",
        ] {
            std::fs::write(root.join(relative), b"fixture").unwrap();
        }
        let docs = collect_documents(vault.path().to_str().unwrap(), &root).unwrap();
        assert_eq!(docs.len(), 3);
        let subject = docs
            .iter()
            .find(|d| d.filename == "curriculum.PDF")
            .unwrap();
        assert_eq!(
            (&*subject.meta.grade, &*subject.meta.topic),
            ("curriculum", "curriculum")
        );
        let grade = docs.iter().find(|d| d.filename == "guide.pdf").unwrap();
        assert_eq!((&*grade.meta.grade, &*grade.meta.topic), ("9", "guide"));
        let topic = docs.iter().find(|d| d.filename == "worksheet.pdf").unwrap();
        assert_eq!((&*topic.meta.grade, &*topic.meta.topic), ("9", "Grammar"));
        assert!(root.join("English/curriculum.PDF").exists());
    }

    #[test]
    fn detects_same_name_content_changes() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("same.pdf");
        std::fs::write(&pdf, b"first").unwrap();
        let first = fingerprint(&pdf).unwrap();
        assert_eq!(first, fingerprint(&pdf).unwrap());
        std::fs::write(&pdf, b"second").unwrap();
        assert_ne!(first, fingerprint(&pdf).unwrap());
    }
}
