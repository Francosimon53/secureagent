/**
 * SecureAgent Mobile - Chat Hook
 */

import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';
import type { Message, Conversation } from '../types';

const CONVERSATIONS_KEY = '@secureagent/conversations';

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  conversationId: string | null;
  sendMessage: (text: string) => Promise<void>;
  runQuickAction: (action: string, content: string) => Promise<void>;
  clearMessages: () => void;
  loadConversation: (id: string) => Promise<void>;
  saveConversation: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messageIdCounter = useRef(0);

  const generateId = (): string => {
    messageIdCounter.current += 1;
    return `msg_${Date.now()}_${messageIdCounter.current}`;
  };

  const addMessage = useCallback((role: Message['role'], content: string) => {
    const message: Message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, message]);
    return message;
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    setError(null);
    addMessage('user', text);
    setIsLoading(true);

    try {
      const result = await api.sendMessage(text, conversationId || undefined);

      if (result.success && result.data) {
        addMessage('assistant', result.data.response);
        if (result.data.conversationId) {
          setConversationId(result.data.conversationId);
        }
      } else {
        setError(result.error || 'Failed to get response');
        addMessage('system', result.error || 'Failed to get response');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      addMessage('system', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, conversationId, addMessage]);

  const runQuickAction = useCallback(async (action: string, content: string) => {
    if (!content.trim() || isLoading) return;

    setError(null);
    const actionNames: Record<string, string> = {
      summarize: 'Summarizing...',
      translate: 'Translating...',
      explain: 'Explaining...',
      grammar: 'Fixing grammar...',
    };
    addMessage('user', actionNames[action] || `Running ${action}...`);
    setIsLoading(true);

    try {
      const result = await api.runQuickAction(action, content);

      if (result.success && result.data) {
        addMessage('assistant', result.data.response);
      } else {
        setError(result.error || 'Failed to process');
        addMessage('system', result.error || 'Failed to process');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMsg);
      addMessage('system', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const stored = await AsyncStorage.getItem(CONVERSATIONS_KEY);
      if (stored) {
        const conversations: Conversation[] = JSON.parse(stored);
        const conversation = conversations.find((c) => c.id === id);
        if (conversation) {
          setMessages(conversation.messages);
          setConversationId(conversation.id);
        }
      }
    } catch (err) {
      console.error('Failed to load conversation:', err);
    }
  }, []);

  const saveConversation = useCallback(async () => {
    if (messages.length === 0) return;

    try {
      const stored = await AsyncStorage.getItem(CONVERSATIONS_KEY);
      const conversations: Conversation[] = stored ? JSON.parse(stored) : [];

      const id = conversationId || `conv_${Date.now()}`;
      const existingIndex = conversations.findIndex((c) => c.id === id);

      const conversation: Conversation = {
        id,
        title: messages[0]?.content.slice(0, 50) || 'New conversation',
        messages,
        createdAt: existingIndex >= 0 ? conversations[existingIndex].createdAt : Date.now(),
        updatedAt: Date.now(),
      };

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.unshift(conversation);
      }

      // Keep only last 50 conversations
      const trimmed = conversations.slice(0, 50);
      await AsyncStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(trimmed));
      setConversationId(id);
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [messages, conversationId]);

  return {
    messages,
    isLoading,
    error,
    conversationId,
    sendMessage,
    runQuickAction,
    clearMessages,
    loadConversation,
    saveConversation,
  };
}
