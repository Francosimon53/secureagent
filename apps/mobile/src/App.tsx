/**
 * SecureAgent Mobile - Main App Component
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { ChatScreen, SettingsScreen } from './screens';
import { api } from './services/api';
import { notifications } from './services/notifications';

type Screen = 'chat' | 'settings';

export default function App(): React.ReactElement {
  const [currentScreen, setCurrentScreen] = useState<Screen>('chat');

  useEffect(() => {
    // Initialize services
    api.initialize();
    notifications.configure();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.logo}>🛡️</Text>
            <Text style={styles.title}>SecureAgent</Text>
          </View>
          <Pressable
            style={styles.headerButton}
            onPress={() => setCurrentScreen(currentScreen === 'chat' ? 'settings' : 'chat')}
          >
            <Icon
              name={currentScreen === 'chat' ? 'settings-outline' : 'chatbubble-outline'}
              size={22}
              color="#a0a0a0"
            />
          </Pressable>
        </View>

        {/* Screen Content */}
        {currentScreen === 'chat' ? (
          <ChatScreen />
        ) : (
          <SettingsScreen onBack={() => setCurrentScreen('chat')} />
        )}

        {/* Bottom Tab Bar */}
        <View style={styles.tabBar}>
          <Pressable
            style={[styles.tab, currentScreen === 'chat' && styles.tabActive]}
            onPress={() => setCurrentScreen('chat')}
          >
            <Icon
              name={currentScreen === 'chat' ? 'chatbubble' : 'chatbubble-outline'}
              size={24}
              color={currentScreen === 'chat' ? '#4a90d9' : '#a0a0a0'}
            />
            <Text
              style={[styles.tabLabel, currentScreen === 'chat' && styles.tabLabelActive]}
            >
              Chat
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tab, currentScreen === 'settings' && styles.tabActive]}
            onPress={() => setCurrentScreen('settings')}
          >
            <Icon
              name={currentScreen === 'settings' ? 'settings' : 'settings-outline'}
              size={24}
              color={currentScreen === 'settings' ? '#4a90d9' : '#a0a0a0'}
            />
            <Text
              style={[styles.tabLabel, currentScreen === 'settings' && styles.tabLabelActive]}
            >
              Settings
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#16213e',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerButton: {
    padding: 8,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 20, // Safe area padding
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabActive: {
    // Active state styling
  },
  tabLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#4a90d9',
  },
});
