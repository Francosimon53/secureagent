/**
 * SecureAgent Mobile - Chat Input Component
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

interface ChatInputProps {
  onSend: (message: string) => void;
  onVoicePress?: () => void;
  isLoading?: boolean;
  isListening?: boolean;
  voiceEnabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onVoicePress,
  isLoading = false,
  isListening = false,
  voiceEnabled = false,
  placeholder = 'Ask SecureAgent...',
}: ChatInputProps): React.ReactElement {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSend(text.trim());
      setText('');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#a0a0a0"
          multiline
          maxLength={4000}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          editable={!isLoading}
        />

        {voiceEnabled && (
          <Pressable
            style={[
              styles.voiceButton,
              isListening && styles.voiceButtonActive,
            ]}
            onPress={onVoicePress}
            disabled={isLoading}
          >
            <Icon
              name={isListening ? 'mic' : 'mic-outline'}
              size={22}
              color={isListening ? '#4a90d9' : '#a0a0a0'}
            />
          </Pressable>
        )}
      </View>

      <Pressable
        style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
        onPress={handleSend}
        disabled={isLoading || !text.trim()}
      >
        {isLoading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Icon name="send" size={20} color="#ffffff" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 120,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    paddingVertical: 4,
    maxHeight: 100,
  },
  voiceButton: {
    padding: 4,
    marginLeft: 8,
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(74, 144, 217, 0.2)',
    borderRadius: 12,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4a90d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
