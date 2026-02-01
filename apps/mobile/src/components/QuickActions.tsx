/**
 * SecureAgent Mobile - Quick Actions Component
 */

import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Clipboard from '@react-native-clipboard/clipboard';

interface QuickAction {
  id: string;
  name: string;
  icon: string;
}

interface QuickActionsProps {
  onAction: (action: string, content: string) => void;
  disabled?: boolean;
}

const actions: QuickAction[] = [
  { id: 'summarize', name: 'Summarize', icon: 'document-text-outline' },
  { id: 'translate', name: 'Translate', icon: 'globe-outline' },
  { id: 'explain', name: 'Explain', icon: 'bulb-outline' },
  { id: 'grammar', name: 'Fix Grammar', icon: 'create-outline' },
];

export function QuickActions({
  onAction,
  disabled = false,
}: QuickActionsProps): React.ReactElement {
  const handlePress = async (actionId: string) => {
    if (disabled) return;

    try {
      const content = await Clipboard.getString();
      if (content) {
        onAction(actionId, content);
      } else {
        // Could show alert that clipboard is empty
        console.log('Clipboard is empty');
      }
    } catch (error) {
      console.error('Failed to read clipboard:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick Actions</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {actions.map((action) => (
          <Pressable
            key={action.id}
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={() => handlePress(action.id)}
            disabled={disabled}
          >
            <Icon
              name={action.icon}
              size={24}
              color={disabled ? '#666' : '#ffffff'}
            />
            <Text
              style={[styles.buttonText, disabled && styles.buttonTextDisabled]}
            >
              {action.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.hint}>
        Copy text to clipboard, then tap an action
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a0a0a0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  scrollContent: {
    paddingHorizontal: 12,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#0f3460',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 4,
    minWidth: 80,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 12,
    color: '#ffffff',
    marginTop: 4,
  },
  buttonTextDisabled: {
    color: '#666',
  },
  hint: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
});
