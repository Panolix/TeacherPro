use std::time::Duration;

/// Embed a batch of texts using Ollama's /api/embed endpoint.
///
/// If the model is not found, automatically pulls it via /api/pull.
pub async fn embed_texts(
    texts: &[String],
    model: &str,
    base_url: &str,
) -> Result<Vec<Vec<f32>>, String> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    let result = try_embed(texts, model, base_url).await;

    match &result {
        Err(err) if model_not_found(err) => {
            // Auto-pull the model and retry
            eprintln!("Embedding model '{model}' not found – pulling automatically...");
            pull_model(model, base_url).await?;
            try_embed(texts, model, base_url).await
        }
        _ => result,
    }
}

/// Attempt to embed texts.
async fn try_embed(
    texts: &[String],
    model: &str,
    base_url: &str,
) -> Result<Vec<Vec<f32>>, String> {
    let url = format!("{base_url}/api/embed");

    let body = serde_json::json!({
        "model": model,
        "input": texts,
    });

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(300))
        .build();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let response = agent
            .post(&url)
            .send_json(body)
            .map_err(|e| format!("Ollama embed request failed: {e}"))?;

        #[derive(serde::Deserialize)]
        struct EmbedResponse {
            embeddings: Vec<Vec<f64>>,
        }

        let resp: EmbedResponse = response
            .into_json()
            .map_err(|e| format!("Failed to parse embed response: {e}"))?;

        let embeddings: Vec<Vec<f32>> = resp
            .embeddings
            .into_iter()
            .map(|vec| vec.into_iter().map(|v| v as f32).collect())
            .collect();

        Ok(embeddings)
    })
    .await
    .map_err(|e| format!("Embedding task failed: {e}"))?;

    result
}

/// Pull an Ollama model via /api/pull.
async fn pull_model(model: &str, base_url: &str) -> Result<(), String> {
    let url = format!("{base_url}/api/pull");
    let body = serde_json::json!({ "model": model });

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(3600)) // 1 hour for large models
        .build();

    let url_clone = url.clone();
    let model_clone = model.to_string();
    let body_clone = body.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let response = agent
            .post(&url_clone)
            .send_json(body_clone)
            .map_err(|e| format!("Failed to pull model '{model_clone}': {e}"))?;

        // Read the streaming response to completion
        let mut reader = response.into_reader();
        let mut buf = Vec::new();
        std::io::Read::read_to_end(&mut reader, &mut buf)
            .map_err(|e| format!("Failed to read pull progress: {e}"))?;

        // Check if the last line indicates success
        let output = String::from_utf8_lossy(&buf);
        if output.contains("\"status\":\"success\"") || output.contains("\"error\"") {
            // If there's an error, report it
            if let Some(err_line) = output
                .lines()
                .find(|l| l.contains("\"error\""))
            {
                return Err(format!("Model pull error: {err_line}"));
            }
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Pull task failed: {e}"))?
}

/// Check if an error string indicates that the model was not found.
fn model_not_found(err: &str) -> bool {
    err.contains("model") && (err.contains("not found") || err.contains("404"))
}
