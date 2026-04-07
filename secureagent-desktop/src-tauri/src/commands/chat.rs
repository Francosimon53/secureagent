use super::ollama::{chat, ChatMessage, ChatResponse};
use super::storage::{save_message, SaveMessageInput};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageInput {
    pub conversation_id: String,
    pub model: String,
    pub content: String,
    pub history: Vec<ChatMessage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SendMessageResponse {
    pub user_message_id: String,
    pub assistant_message_id: String,
    pub content: String,
}

#[tauri::command]
pub async fn send_message(input: SendMessageInput) -> Result<SendMessageResponse, String> {
    // Save user message
    let user_message = save_message(SaveMessageInput {
        conversation_id: input.conversation_id.clone(),
        role: "user".to_string(),
        content: input.content.clone(),
    })
    .await?;

    // Build messages for Ollama
    let mut messages = input.history;
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: input.content,
    });

    // Get response from Ollama
    let response: ChatResponse = chat(input.model, messages).await?;

    // Save assistant message
    let assistant_message = save_message(SaveMessageInput {
        conversation_id: input.conversation_id,
        role: "assistant".to_string(),
        content: response.content.clone(),
    })
    .await?;

    Ok(SendMessageResponse {
        user_message_id: user_message.id,
        assistant_message_id: assistant_message.id,
        content: response.content,
    })
}
