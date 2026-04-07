use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateConversationInput {
    pub title: Option<String>,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveMessageInput {
    pub conversation_id: String,
    pub role: String,
    pub content: String,
}

// In-memory storage for demo purposes
// In production, this uses tauri-plugin-sql from the frontend
use std::sync::Mutex;
use once_cell::sync::Lazy;

static CONVERSATIONS: Lazy<Mutex<Vec<Conversation>>> = Lazy::new(|| Mutex::new(vec![]));
static MESSAGES: Lazy<Mutex<Vec<Message>>> = Lazy::new(|| Mutex::new(vec![]));

#[tauri::command]
pub async fn get_conversations() -> Result<Vec<Conversation>, String> {
    let conversations = CONVERSATIONS.lock().map_err(|e| e.to_string())?;
    let mut result = conversations.clone();
    result.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(result)
}

#[tauri::command]
pub async fn get_conversation(id: String) -> Result<Option<Conversation>, String> {
    let conversations = CONVERSATIONS.lock().map_err(|e| e.to_string())?;
    Ok(conversations.iter().find(|c| c.id == id).cloned())
}

#[tauri::command]
pub async fn create_conversation(input: CreateConversationInput) -> Result<Conversation, String> {
    let now = Utc::now();
    let conversation = Conversation {
        id: Uuid::new_v4().to_string(),
        title: input.title.unwrap_or_else(|| "New Chat".to_string()),
        model: input.model,
        created_at: now,
        updated_at: now,
    };

    let mut conversations = CONVERSATIONS.lock().map_err(|e| e.to_string())?;
    conversations.push(conversation.clone());

    Ok(conversation)
}

#[tauri::command]
pub async fn delete_conversation(id: String) -> Result<(), String> {
    let mut conversations = CONVERSATIONS.lock().map_err(|e| e.to_string())?;
    conversations.retain(|c| c.id != id);

    let mut messages = MESSAGES.lock().map_err(|e| e.to_string())?;
    messages.retain(|m| m.conversation_id != id);

    Ok(())
}

#[tauri::command]
pub async fn get_messages(conversation_id: String) -> Result<Vec<Message>, String> {
    let messages = MESSAGES.lock().map_err(|e| e.to_string())?;
    let mut result: Vec<Message> = messages
        .iter()
        .filter(|m| m.conversation_id == conversation_id)
        .cloned()
        .collect();
    result.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(result)
}

#[tauri::command]
pub async fn save_message(input: SaveMessageInput) -> Result<Message, String> {
    let message = Message {
        id: Uuid::new_v4().to_string(),
        conversation_id: input.conversation_id.clone(),
        role: input.role,
        content: input.content,
        created_at: Utc::now(),
    };

    let mut messages = MESSAGES.lock().map_err(|e| e.to_string())?;
    messages.push(message.clone());

    // Update conversation's updated_at
    let mut conversations = CONVERSATIONS.lock().map_err(|e| e.to_string())?;
    if let Some(conv) = conversations.iter_mut().find(|c| c.id == input.conversation_id) {
        conv.updated_at = Utc::now();
    }

    Ok(message)
}
