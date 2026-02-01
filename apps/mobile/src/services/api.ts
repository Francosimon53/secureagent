/**
 * SecureAgent Mobile - API Service
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse, ChatResponse, Settings } from '../types';

const DEFAULT_API_URL = 'http://localhost:3000';
const SETTINGS_KEY = '@secureagent/settings';

class ApiService {
  private apiUrl: string = DEFAULT_API_URL;
  private apiKey: string | undefined;

  async initialize(): Promise<void> {
    const settings = await this.getSettings();
    this.apiUrl = settings.apiUrl || DEFAULT_API_URL;
    this.apiKey = settings.apiKey;
  }

  async getSettings(): Promise<Settings> {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
    return {
      apiUrl: DEFAULT_API_URL,
      pushNotifications: true,
      voiceInputEnabled: true,
      hapticFeedback: true,
      theme: 'system',
    };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    this.apiUrl = settings.apiUrl;
    this.apiKey = settings.apiKey;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async sendMessage(
    message: string,
    conversationId?: string
  ): Promise<ApiResponse<ChatResponse>> {
    try {
      const response = await fetch(`${this.apiUrl}/api/chat`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        data: {
          response: data.response || data.message,
          conversationId: data.conversationId,
        },
      };
    } catch (error) {
      console.error('API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async runQuickAction(
    action: string,
    content: string
  ): Promise<ApiResponse<ChatResponse>> {
    const prompts: Record<string, string> = {
      summarize: `Summarize the following text concisely:\n\n${content}`,
      translate: `Translate the following text to English (or to the user's language if already in English):\n\n${content}`,
      explain: `Explain the following in simple terms:\n\n${content}`,
      grammar: `Fix any grammar and spelling errors in the following text, return only the corrected text:\n\n${content}`,
    };

    const prompt = prompts[action] || `${action}:\n\n${content}`;
    return this.sendMessage(prompt);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/api/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const api = new ApiService();
