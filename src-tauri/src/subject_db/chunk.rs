use super::FolderMeta;
use super::pdf::PageText;
use super::Chunk;

const CHUNK_SIZE: usize = 500;   // target characters per chunk
const CHUNK_OVERLAP: usize = 100; // overlap between consecutive chunks (in chars)

/// Split pages into chunks, each tagged with folder metadata.
pub fn chunk_pages(pages: &[PageText], meta: &FolderMeta, source_file: &str) -> Vec<Chunk> {
    let mut chunks: Vec<Chunk> = Vec::new();

    for page in pages {
        let page_chunks = chunk_text(&page.text, CHUNK_SIZE, CHUNK_OVERLAP);
        for text in page_chunks {
            let text = text.trim().to_string();
            if text.len() < 20 {
                continue;
            }
            chunks.push(Chunk {
                id: uuid::Uuid::new_v4().to_string(),
                text,
                source_file: source_file.to_string(),
                page: page.page_num,
                subject: meta.subject.clone(),
                grade: meta.grade.clone(),
                topic: meta.topic.clone(),
                language: "de".to_string(),
            });
        }
    }

    chunks
}

/// Split text into overlapping chunks of approximately `size` **characters**.
///
/// Works on chars (not bytes) so multi-byte UTF-8 is handled correctly.
/// Tries to split on paragraph → newline → sentence → word boundaries.
fn chunk_text(text: &str, size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();

    if total <= size {
        return vec![chars.into_iter().collect()];
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut start: usize = 0;

    loop {
        if start >= total {
            break;
        }

        let end = find_split_char(&chars, start, size);
        let chunk: String = chars[start..end].iter().collect();
        chunks.push(chunk);

        if end >= total {
            break;
        }

        // Move start backwards by `overlap` chars
        let next_start = if end > overlap { end - overlap } else { 0 };
        if next_start <= start {
            start = end;
        } else {
            start = next_start;
        }
    }

    chunks
}

/// Find a good split position (as char-index) around `start + max_size`.
/// Prefers paragraph breaks > newlines > sentence ends > word boundaries.
fn find_split_char(chars: &[char], start: usize, max_size: usize) -> usize {
    let total = chars.len();
    let target = start + max_size;
    if target >= total {
        return total;
    }

    let search_start = if target > 60 { target - 60 } else { 0 };
    let search_end = total.min(target + 20);

    // Search backwards from target through the search window

    // 1. Paragraph break: \n\n
    let mut i = target.min(search_end);
    while i > search_start + 2 {
        if chars[i - 1] == '\n' && chars[i - 2] == '\n' {
            return i;
        }
        i -= 1;
    }

    // 2. Single newline
    let mut i = target.min(search_end);
    while i > search_start + 1 {
        if chars[i - 1] == '\n' {
            return i;
        }
        i -= 1;
    }

    // 3. Sentence end (. ! ?)
    let mut i = target.min(search_end);
    while i > search_start + 1 {
        if chars[i - 1] == '.' || chars[i - 1] == '!' || chars[i - 1] == '?' {
            return i;
        }
        i -= 1;
    }

    // 4. Space (word boundary)
    let mut i = target.min(search_end);
    while i > search_start + 1 {
        if chars[i - 1] == ' ' {
            return i;
        }
        i -= 1;
    }

    // 5. Exact cut
    target.min(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_text() {
        let text = "Kurzer Text.";
        let chunks = chunk_text(text, 500, 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Kurzer Text.");
    }

    #[test]
    fn test_long_text_splits() {
        let text = "a".repeat(1200);
        let chunks = chunk_text(&text, 500, 100);
        assert!(chunks.len() >= 2);
    }

    #[test]
    fn test_utf8_special_chars() {
        // Contains multi-byte UTF-8: ’ → U+2019 (3 bytes), ä → U+00E4 (2 bytes)
        let text = "Grammatik  [Das Passiv in allen Zeiten]\n\n© englischtipps.com\n\nDas ist ’ein Test’ mit ä, ö, ü und ß."
            .repeat(10);
        let chunks = chunk_text(&text, 100, 20);
        assert!(!chunks.is_empty());
        // Should not panic (this was the crashing case)
        for chunk in &chunks {
            assert!(!chunk.is_empty());
        }
    }

    #[test]
    fn test_split_on_paragraph() {
        let text = "Absatz eins.\n\nAbsatz zwei.\n\nAbsatz drei.\n\nAbsatz vier.\n\nAbsatz fünf.";
        let chunks = chunk_text(text, 30, 5);
        for chunk in &chunks {
            if chunk.len() > 3 {
                assert!(!chunk.starts_with('\n'), "Chunk starts with newline");
            }
        }
    }
}
