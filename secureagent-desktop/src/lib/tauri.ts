import type { OllamaModel, OllamaStatus, ChatMessage, Settings, Conversation, Message } from './ollama';

// Check if we're running in Tauri
const isTauri = typeof window !== 'undefined' && window.__TAURI__;

// Tauri invoke wrapper
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    console.warn(`Tauri not available, mocking command: ${cmd}`);
    return mockCommand(cmd, args);
  }
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

// Mock commands for development in browser
function mockCommand<T>(cmd: string, args?: Record<string, unknown>): T {
  switch (cmd) {
    case 'check_ollama':
      return { available: true, version: '0.1.0' } as T;
    case 'list_models':
      return [{ name: 'llama3.2', size: 2_000_000_000, modified_at: '', digest: '' }] as T;
    case 'get_settings':
      return { theme: 'system', default_model: 'llama3.2', autostart: false, global_shortcut: '' } as T;
    case 'get_setting':
      return null as T;
    case 'get_conversations':
      return [] as T;
    case 'get_autostart':
      return false as T;
    default:
      return {} as T;
  }
}

// Ollama Commands
export async function checkOllama(): Promise<OllamaStatus> {
  return invoke<OllamaStatus>('check_ollama');
}

export async function listModels(): Promise<OllamaModel[]> {
  return invoke<OllamaModel[]>('list_models');
}

export async function pullModel(name: string): Promise<void> {
  return invoke<void>('pull_model', { name });
}

export async function chat(model: string, messages: ChatMessage[]): Promise<{ content: string; model: string; done: boolean }> {
  return invoke<{ content: string; model: string; done: boolean }>('chat', { model, messages });
}

export async function chatStream(model: string, messages: ChatMessage[], conversationId: string): Promise<void> {
  return invoke<void>('chat_stream', { model, messages, conversationId });
}

// Settings Commands
export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke<void>('save_settings', { settings });
}

export async function getSetting(key: string): Promise<string | null> {
  return invoke<string | null>('get_setting', { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return invoke<void>('set_setting', { key, value });
}

export async function getAutostart(): Promise<boolean> {
  return invoke<boolean>('get_autostart');
}

export async function setAutostart(enabled: boolean): Promise<void> {
  return invoke<void>('set_autostart', { enabled });
}

// Storage Commands
export async function getConversations(): Promise<Conversation[]> {
  return invoke<Conversation[]>('get_conversations');
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return invoke<Conversation | null>('get_conversation', { id });
}

export async function createConversation(input: { title?: string; model: string }): Promise<Conversation> {
  return invoke<Conversation>('create_conversation', { input });
}

export async function deleteConversation(id: string): Promise<void> {
  return invoke<void>('delete_conversation', { id });
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return invoke<Message[]>('get_messages', { conversationId });
}

export async function saveMessage(input: { conversation_id: string; role: string; content: string }): Promise<Message> {
  return invoke<Message>('save_message', { input });
}

// Chat Commands
export async function sendMessage(input: {
  conversation_id: string;
  model: string;
  content: string;
  history: ChatMessage[];
}): Promise<{ user_message_id: string; assistant_message_id: string; content: string }> {
  return invoke<{ user_message_id: string; assistant_message_id: string; content: string }>('send_message', { input });
}

// Window API for Tauri
declare global {
  interface Window {
    __TAURI__?: {
      invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  }
}
