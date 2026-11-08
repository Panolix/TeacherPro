use std::path::{Component, Path, PathBuf};

/// Resolve links before checking containment, including the deepest existing
/// ancestor of a target that is about to be created.
pub(crate) fn resolve_within(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    if candidate
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err("Path contains parent-directory components.".into());
    }
    let root = std::fs::canonicalize(root).map_err(|e| format!("Cannot resolve root: {e}"))?;
    let mut ancestor = candidate.to_path_buf();
    let mut suffix = Vec::new();
    loop {
        match std::fs::symlink_metadata(&ancestor) {
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                suffix.push(ancestor.file_name().ok_or("Invalid path.")?.to_os_string());
                ancestor = ancestor.parent().ok_or("Invalid path.")?.to_path_buf();
            }
            Err(e) => return Err(format!("Cannot inspect path: {e}")),
        }
    }
    let mut resolved =
        std::fs::canonicalize(&ancestor).map_err(|e| format!("Cannot resolve path: {e}"))?;
    if !resolved.starts_with(&root) {
        return Err("Path resolves outside the vault.".into());
    }
    for name in suffix.into_iter().rev() {
        resolved.push(name);
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::resolve_within;
    use std::path::Path;

    #[cfg(unix)]
    fn link_directory(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).unwrap();
    }

    #[cfg(windows)]
    fn link_directory(target: &Path, link: &Path) {
        let output = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(link.to_string_lossy().replace('/', "\\"))
            .arg(target.to_string_lossy().replace('/', "\\"))
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn resolves_existing_and_missing_contained_targets() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("new/topic/file.pdf");
        assert_eq!(
            resolve_within(dir.path(), &target).unwrap(),
            std::fs::canonicalize(dir.path())
                .unwrap()
                .join("new/topic/file.pdf")
        );
        std::fs::write(dir.path().join("index.db"), b"fixture").unwrap();
        assert!(resolve_within(dir.path(), &dir.path().join("index.db")).is_ok());
    }

    #[test]
    fn rejects_traversal_and_prefix_lookalikes() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        let sibling = dir.path().join("vault-other");
        std::fs::create_dir(&root).unwrap();
        std::fs::create_dir(&sibling).unwrap();
        assert!(resolve_within(&root, &root.join("../vault-other/file.pdf")).is_err());
        assert!(resolve_within(&root, &sibling.join("file.pdf")).is_err());
    }

    #[test]
    fn rejects_nested_link_escapes_for_delete_and_creation() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join("vault");
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(vault.join("SubjectDBs")).unwrap();
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("lesson.pdf"), b"fixture").unwrap();
        link_directory(&outside, &vault.join("SubjectDBs/English"));
        assert!(resolve_within(&vault, &vault.join("SubjectDBs/English/lesson.pdf")).is_err());
        assert!(resolve_within(&vault, &vault.join("SubjectDBs/English/new/topic.pdf")).is_err());
        assert!(outside.join("lesson.pdf").exists());
    }

    #[test]
    fn sqlite_rejects_an_outside_index_directory_before_creating_files() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join("vault");
        let outside = dir.path().join("outside");
        std::fs::create_dir(&vault).unwrap();
        std::fs::create_dir(&outside).unwrap();
        link_directory(&outside, &vault.join("SubjectDBs"));
        assert!(crate::subject_db::store_sqlite::open(vault.to_str().unwrap()).is_err());
        assert!(!outside.join("index.db").exists());
    }

    #[test]
    fn sqlite_rejects_outside_sidecars_for_read_and_write_connections() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join("vault");
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(vault.join("SubjectDBs")).unwrap();
        std::fs::create_dir(&outside).unwrap();
        link_directory(&outside, &vault.join("SubjectDBs/index.db-wal"));
        assert!(crate::subject_db::store_sqlite::checked_db_path(vault.to_str().unwrap()).is_err());
        assert!(crate::subject_db::store_sqlite::open(vault.to_str().unwrap()).is_err());
        assert!(!vault.join("SubjectDBs/index.db").exists());
    }

    #[test]
    fn vault_registration_rejects_a_link_to_the_filesystem_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().ancestors().last().unwrap();
        let link = dir.path().join("root-alias");
        link_directory(root, &link);
        assert!(crate::register_vault_root(link.to_string_lossy().into_owned()).is_err());
    }
}
