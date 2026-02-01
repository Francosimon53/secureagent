/**
 * SecureAgent Mobile - Shared Types
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  apiUrl: string;
  apiKey?: string;
  pushNotifications: boolean;
  voiceInputEnabled: boolean;
  hapticFeedback: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ChatResponse {
  response: string;
  conversationId?: string;
}

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  prompt: string;
}

export interface NotificationData {
  type: 'message' | 'reminder' | 'alert';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
