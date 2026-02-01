/**
 * SecureAgent Mobile - Chat Screen
 */

import React, { useRef, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatMessage, ChatInput, QuickActions } from '../components';
import { useChat } from '../hooks/useChat';
import { useVoice } from '../hooks/useVoice';
import type { Message } from '../types';

export function ChatScreen(): React.ReactElement {
  const {
    messages,
    isLoading,
    sendMessage,
    runQuickAction,
  } = useChat();

  const {
    isListening,
    transcript,
    isAvailable: voiceAvailable,
    startListening,
    stopListening,
  } = useVoice();

  const flatListRef = useRef<FlatList>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Send transcript when voice input completes
  useEffect(() => {
    if (!isListening && transcript) {
      sendMessage(transcript);
    }
  }, [isListening, transcript, sendMessage]);

  const handleVoicePress = async () => {
    if (isListening) {
      await stopListening();
    } else {
      await startListening();
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} />
  );

  const keyExtractor = (item: Message) => item.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <QuickActions
          onAction={runQuickAction}
          disabled={isLoading}
        />

        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={keyExtractor}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />

        <ChatInput
          onSend={sendMessage}
          onVoicePress={handleVoicePress}
          isLoading={isLoading}
          isListening={isListening}
          voiceEnabled={voiceAvailable}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    paddingVertical: 16,
  },
});
