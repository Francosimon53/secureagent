// Ollama Types

export interface OllamaStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: ModelDetails;
}

export interface ModelDetails {
  format?: string;
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  done: boolean;
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

// Settings Types

export interface Settings {
  theme: string;
  default_model: string;
  autostart: boolean;
  global_shortcut: string;
}

// Storage Types

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
}

// API Key Types

export interface ApiKey {
  provider: string;
  key: string;
}

// Utility function to format model size
export function formatModelSize(bytes: number): string {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / 1_000_000;
  return `${mb.toFixed(0)} MB`;
}

// Utility function to get model family from name
export function getModelFamily(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('llama')) return 'Llama';
  if (lowerName.includes('mistral')) return 'Mistral';
  if (lowerName.includes('phi')) return 'Phi';
  if (lowerName.includes('gemma')) return 'Gemma';
  if (lowerName.includes('codellama')) return 'Code Llama';
  if (lowerName.includes('deepseek')) return 'DeepSeek';
  return 'Other';
}

// Recommended models for different use cases
export const RECOMMENDED_MODELS = {
  general: 'llama3.2',
  fast: 'llama3.2:1b',
  coding: 'codellama',
  creative: 'mistral',
} as const;

// Model size estimates (approximate)
export const MODEL_SIZES: Record<string, string> = {
  'llama3.2': '2 GB',
  'llama3.2:1b': '1.3 GB',
  'llama3.1': '4.7 GB',
  'llama3.1:70b': '40 GB',
  'mistral': '4 GB',
  'mixtral': '26 GB',
  'codellama': '4 GB',
  'phi3': '2.2 GB',
  'phi3:medium': '7.9 GB',
  'gemma2': '5.4 GB',
  'deepseek-coder': '776 MB',
};
