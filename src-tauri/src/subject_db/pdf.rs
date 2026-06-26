use std::path::Path;

/// Text content of a single page.
#[derive(Debug, Clone)]
pub struct PageText {
    pub text: String,
    pub page_num: u32,
}

/// Extract text from a PDF file.
///
/// Strategy:
/// 1. Try `pdf-extract` for digital PDFs (pure Rust, works everywhere).
/// 2. If pdf-extract yields very little text (< 50 chars) and Tesseract CLI
///    is available, render pages via `pdftoppm` + OCR via `tesseract`.
/// 3. Otherwise, return what we got (or an error).
pub fn extract_text_from_pdf(path: &Path) -> Result<Vec<PageText>, String> {
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // Strategy 1: pdf-extract (handles digital PDFs)
    match pdf_extract::extract_text(path) {
        Ok(text) if text.len() >= 50 => {
            // Split by form feeds or double newlines to approximate pages.
            // pdf-extract doesn't give page numbers, so we treat it as one page.
            Ok(vec![PageText {
                text: text.trim().to_string(),
                page_num: 1,
            }])
        }
        Ok(_) => {
            // Very little text → likely a scanned PDF. Try OCR fallback.
            match ocr_fallback(path) {
                Ok(pages) if !pages.is_empty() => Ok(pages),
                Ok(_) => Err(format!(
                    "{}: scanned PDF detected. Install Tesseract + poppler for OCR support.\n\
                     macOS: brew install tesseract poppler\n\
                     Linux: apt install tesseract-ocr poppler-utils\n\
                     Windows: https://github.com/UB-Mannheim/tesseract/wiki",
                    filename
                )),
                Err(e) => Err(format!("{filename}: {e}")),
            }
        }
        Err(e) => {
            // pdf-extract failed entirely. Try OCR fallback for scanned PDFs.
            match ocr_fallback(path) {
                Ok(pages) if !pages.is_empty() => Ok(pages),
                Ok(_) => Err(format!(
                    "{filename}: PDF extraction failed: {e}.\n\
                     If this is a scanned PDF, install Tesseract + poppler.",
                )),
                Err(ocr_err) => Err(format!(
                    "{filename}: pdf-extract error: {e}; OCR fallback error: {ocr_err}",
                )),
            }
        }
    }
}

/// Fallback OCR for scanned PDFs using system CLI tools.
///
/// Requires: `pdftoppm` (poppler) and `tesseract` to be installed.
/// Renders each page as a PNG, then runs Tesseract OCR on it.
fn ocr_fallback(path: &Path) -> Result<Vec<PageText>, String> {
    // Check if required tools are available
    if !command_exists("pdftoppm") || !command_exists("tesseract") {
        return Err("OCR tools not found".to_string());
    }

    // Create a temp directory for rendered page images
    let tmp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp dir: {e}"))?;
    let tmp_path = tmp_dir.path();

    // Render PDF pages to PNG using pdftoppm
    // Output: tmp_dir/page-1.png, page-2.png, ...
    let render_output = std::process::Command::new("pdftoppm")
        .arg("-png")
        .arg("-r")
        .arg("300") // 300 DPI for good OCR
        .arg(path)
        .arg(tmp_path.join("page"))
        .output()
        .map_err(|e| format!("Failed to run pdftoppm: {e}"))?;

    if !render_output.status.success() {
        let stderr = String::from_utf8_lossy(&render_output.stderr);
        return Err(format!("pdftoppm failed: {stderr}"));
    }

    // Collect rendered page images (sorted by filename)
    let mut page_images: Vec<_> = std::fs::read_dir(tmp_path)
        .map_err(|e| format!("Failed to read temp dir: {e}"))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().map(|t| t.is_file()).unwrap_or(false)
                && e.path().extension().map(|ext| ext == "png").unwrap_or(false)
        })
        .collect();
    page_images.sort_by_key(|e| e.file_name());

    if page_images.is_empty() {
        return Err("pdftoppm produced no page images".to_string());
    }

    // OCR each page with Tesseract
    let mut pages: Vec<PageText> = Vec::new();
    for (i, entry) in page_images.iter().enumerate() {
        let img_path = entry.path();

        let ocr_output = std::process::Command::new("tesseract")
            .arg(img_path.to_str().unwrap_or(""))
            .arg("stdout")
            .arg("-l")
            .arg("deu+eng") // German + English (order = priority)
            .arg("--psm")
            .arg("6") // Assume uniform text block
            .output()
            .map_err(|e| format!("Tesseract failed on page {}: {e}", i + 1))?;

        if !ocr_output.status.success() {
            let stderr = String::from_utf8_lossy(&ocr_output.stderr);
            // Non-fatal: skip this page
            eprintln!("Tesseract page {} warning: {stderr}", i + 1);
            continue;
        }

        let text = String::from_utf8_lossy(&ocr_output.stdout).trim().to_string();
        if !text.is_empty() {
            pages.push(PageText {
                text,
                page_num: (i + 1) as u32,
            });
        }
    }

    // temp dir is automatically cleaned up on drop

    Ok(pages)
}

fn command_exists(cmd: &str) -> bool {
    std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
