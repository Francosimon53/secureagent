use crate::services::ollama::{OllamaClient, OllamaModel};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub available: bool,
    pub version: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub model: String,
    pub done: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PullProgress {
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

#[tauri::command]
pub async fn check_ollama() -> Result<OllamaStatus, String> {
    let client = OllamaClient::new();

    match client.check_status().await {
        Ok(version) => Ok(OllamaStatus {
            available: true,
            version: Some(version),
            error: None,
        }),
        Err(e) => Ok(OllamaStatus {
            available: false,
            version: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<OllamaModel>, String> {
    let client = OllamaClient::new();
    client.list_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pull_model<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<(), String> {
    let client = OllamaClient::new();

    client
        .pull_model(&name, |progress| {
            let _ = app.emit("pull-progress", progress);
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn chat(model: String, messages: Vec<ChatMessage>) -> Result<ChatResponse, String> {
    let client = OllamaClient::new();

    let ollama_messages: Vec<crate::services::ollama::Message> = messages
        .into_iter()
        .map(|m| crate::services::ollama::Message {
            role: m.role,
            content: m.content,
        })
        .collect();

    let response = client
        .chat(&model, ollama_messages)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ChatResponse {
        content: response.message.content,
        model: response.model,
        done: response.done,
    })
}

#[tauri::command]
pub async fn chat_stream<R: Runtime>(
    app: AppHandle<R>,
    model: String,
    messages: Vec<ChatMessage>,
    conversation_id: String,
) -> Result<(), String> {
    let client = OllamaClient::new();

    let ollama_messages: Vec<crate::services::ollama::Message> = messages
        .into_iter()
        .map(|m| crate::services::ollama::Message {
            role: m.role,
            content: m.content,
        })
        .collect();

    client
        .chat_stream(&model, ollama_messages, |chunk| {
            let _ = app.emit(
                "chat-stream",
                serde_json::json!({
                    "conversation_id": conversation_id,
                    "content": chunk.message.content,
                    "done": chunk.done,
                }),
            );
        })
        .await
        .map_err(|e| e.to_string())
}
