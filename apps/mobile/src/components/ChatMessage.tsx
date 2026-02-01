/**
 * SecureAgent Mobile - Chat Message Component
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import type { Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps): React.ReactElement {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  const handleLongPress = () => {
    Clipboard.setString(message.content);
    // Could show toast here
  };

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={500}>
      <View
        style={[
          styles.container,
          isUser && styles.userContainer,
          isSystem && styles.systemContainer,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isUser && styles.userBubble,
            isSystem && styles.systemBubble,
          ]}
        >
          <Text
            style={[
              styles.text,
              isUser && styles.userText,
              isSystem && styles.systemText,
            ]}
            selectable
          >
            {message.content}
          </Text>
        </View>
        <Text style={styles.timestamp}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginHorizontal: 16,
    alignItems: 'flex-start',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  systemContainer: {
    alignItems: 'center',
  },
  bubble: {
    maxWidth: '85%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#0f3460',
  },
  userBubble: {
    backgroundColor: '#4a90d9',
    borderBottomRightRadius: 4,
  },
  systemBubble: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 8,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
    color: '#ffffff',
  },
  userText: {
    color: '#ffffff',
  },
  systemText: {
    color: '#ef4444',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 11,
    color: '#a0a0a0',
    marginTop: 4,
    marginHorizontal: 4,
  },
});
