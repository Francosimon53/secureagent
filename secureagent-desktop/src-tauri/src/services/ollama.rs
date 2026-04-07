use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

const OLLAMA_BASE_URL: &str = "http://localhost:11434";
const TIMEOUT_SECS: u64 = 300; // 5 minutes for long responses

#[derive(Error, Debug)]
pub enum OllamaError {
    #[error("Ollama is not running at {0}")]
    NotRunning(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("Failed to parse response: {0}")]
    Parse(String),
    #[error("Model not found: {0}")]
    ModelNotFound(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaModel {
    pub name: String,
    pub modified_at: String,
    pub size: u64,
    pub digest: String,
    #[serde(default)]
    pub details: Option<ModelDetails>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelDetails {
    pub format: Option<String>,
    pub family: Option<String>,
    pub parameter_size: Option<String>,
    pub quantization_level: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponseChunk {
    pub model: String,
    pub created_at: String,
    pub message: Message,
    pub done: bool,
    #[serde(default)]
    pub total_duration: Option<u64>,
    #[serde(default)]
    pub load_duration: Option<u64>,
    #[serde(default)]
    pub prompt_eval_count: Option<u32>,
    #[serde(default)]
    pub eval_count: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullProgress {
    pub status: String,
    #[serde(default)]
    pub digest: Option<String>,
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub completed: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ListModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VersionResponse {
    version: String,
}

pub struct OllamaClient {
    client: Client,
    base_url: String,
}

impl OllamaClient {
    pub fn new() -> Self {
        Self::with_base_url(OLLAMA_BASE_URL.to_string())
    }

    pub fn with_base_url(base_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(TIMEOUT_SECS))
            .build()
            .expect("Failed to create HTTP client");

        Self { client, base_url }
    }

    pub async fn check_status(&self) -> Result<String, OllamaError> {
        let url = format!("{}/api/version", self.base_url);

        let response = self
            .client
            .get(&url)
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(|_| OllamaError::NotRunning(self.base_url.clone()))?;

        let version: VersionResponse = response.json().await?;
        Ok(version.version)
    }

    pub async fn list_models(&self) -> Result<Vec<OllamaModel>, OllamaError> {
        let url = format!("{}/api/tags", self.base_url);

        let response = self.client.get(&url).send().await?;
        let list: ListModelsResponse = response.json().await?;

        Ok(list.models)
    }

    pub async fn pull_model<F>(&self, name: &str, on_progress: F) -> Result<(), OllamaError>
    where
        F: Fn(PullProgress),
    {
        let url = format!("{}/api/pull", self.base_url);

        let request = PullRequest {
            name: name.to_string(),
            stream: Some(true),
        };

        let response = self.client.post(&url).json(&request).send().await?;

        let mut bytes = response.bytes_stream();
        use futures::StreamExt;

        while let Some(chunk) = bytes.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            // Parse each line as JSON
            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }

                if let Ok(progress) = serde_json::from_str::<PullProgress>(line) {
                    on_progress(progress);
                }
            }
        }

        Ok(())
    }

    pub async fn chat(
        &self,
        model: &str,
        messages: Vec<Message>,
    ) -> Result<ChatResponseChunk, OllamaError> {
        let url = format!("{}/api/chat", self.base_url);

        let request = ChatRequest {
            model: model.to_string(),
            messages,
            stream: Some(false),
        };

        let response = self.client.post(&url).json(&request).send().await?;
        let status = response.status();

        if status == 404 {
            return Err(OllamaError::ModelNotFound(model.to_string()));
        }

        let chat_response: ChatResponseChunk = response
            .json()
            .await
            .map_err(|e| OllamaError::Parse(e.to_string()))?;

        Ok(chat_response)
    }

    pub async fn chat_stream<F>(
        &self,
        model: &str,
        messages: Vec<Message>,
        on_chunk: F,
    ) -> Result<(), OllamaError>
    where
        F: Fn(ChatResponseChunk),
    {
        let url = format!("{}/api/chat", self.base_url);

        let request = ChatRequest {
            model: model.to_string(),
            messages,
            stream: Some(true),
        };

        let response = self.client.post(&url).json(&request).send().await?;
        let status = response.status();

        if status == 404 {
            return Err(OllamaError::ModelNotFound(model.to_string()));
        }

        let mut bytes = response.bytes_stream();
        use futures::StreamExt;

        while let Some(chunk) = bytes.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if line.is_empty() {
                    continue;
                }

                if let Ok(chat_chunk) = serde_json::from_str::<ChatResponseChunk>(line) {
                    let is_done = chat_chunk.done;
                    on_chunk(chat_chunk);

                    if is_done {
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }
}

impl Default for OllamaClient {
    fn default() -> Self {
        Self::new()
    }
}
