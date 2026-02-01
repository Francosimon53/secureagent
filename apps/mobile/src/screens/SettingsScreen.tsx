/**
 * SecureAgent Mobile - Settings Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { api } from '../services/api';
import { notifications } from '../services/notifications';
import type { Settings } from '../types';

interface SettingsScreenProps {
  onBack?: () => void;
}

export function SettingsScreen({ onBack }: SettingsScreenProps): React.ReactElement {
  const [settings, setSettings] = useState<Settings>({
    apiUrl: 'http://localhost:3000',
    pushNotifications: true,
    voiceInputEnabled: true,
    hapticFeedback: true,
    theme: 'system',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const saved = await api.getSettings();
    setSettings(saved);
    checkConnection(saved.apiUrl);
  };

  const checkConnection = async (url: string) => {
    setIsConnected(null);
    const connected = await api.healthCheck();
    setIsConnected(connected);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.saveSettings(settings);

      if (settings.pushNotifications) {
        await notifications.requestPermission();
      }

      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = () => {
    checkConnection(settings.apiUrl);
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Icon name="arrow-back" size={24} color="#ffffff" />
          </Pressable>
        )}
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API CONFIGURATION</Text>

          <View style={styles.field}>
            <Text style={styles.label}>API URL</Text>
            <TextInput
              style={styles.input}
              value={settings.apiUrl}
              onChangeText={(value) => updateSetting('apiUrl', value)}
              placeholder="http://localhost:3000"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.connectionStatus}>
              {isConnected === null ? (
                <Text style={styles.statusText}>Checking...</Text>
              ) : isConnected ? (
                <>
                  <Icon name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={[styles.statusText, styles.statusConnected]}>
                    Connected
                  </Text>
                </>
              ) : (
                <>
                  <Icon name="close-circle" size={16} color="#ef4444" />
                  <Text style={[styles.statusText, styles.statusDisconnected]}>
                    Not connected
                  </Text>
                </>
              )}
              <Pressable onPress={handleTestConnection} style={styles.testButton}>
                <Text style={styles.testButtonText}>Test</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>API Key (optional)</Text>
            <TextInput
              style={styles.input}
              value={settings.apiKey || ''}
              onChangeText={(value) => updateSetting('apiKey', value)}
              placeholder="Enter your API key"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>FEATURES</Text>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Push Notifications</Text>
              <Text style={styles.toggleHint}>Receive alerts and updates</Text>
            </View>
            <Switch
              value={settings.pushNotifications}
              onValueChange={(value) => updateSetting('pushNotifications', value)}
              trackColor={{ false: '#333', true: '#4a90d9' }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Voice Input</Text>
              <Text style={styles.toggleHint}>Use microphone for voice commands</Text>
            </View>
            <Switch
              value={settings.voiceInputEnabled}
              onValueChange={(value) => updateSetting('voiceInputEnabled', value)}
              trackColor={{ false: '#333', true: '#4a90d9' }}
              thumbColor="#ffffff"
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>Haptic Feedback</Text>
              <Text style={styles.toggleHint}>Vibration for interactions</Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(value) => updateSetting('hapticFeedback', value)}
              trackColor={{ false: '#333', true: '#4a90d9' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>APPEARANCE</Text>

          <View style={styles.themeOptions}>
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <Pressable
                key={theme}
                style={[
                  styles.themeOption,
                  settings.theme === theme && styles.themeOptionActive,
                ]}
                onPress={() => updateSetting('theme', theme)}
              >
                <Icon
                  name={
                    theme === 'light'
                      ? 'sunny-outline'
                      : theme === 'dark'
                      ? 'moon-outline'
                      : 'phone-portrait-outline'
                  }
                  size={24}
                  color={settings.theme === theme ? '#4a90d9' : '#a0a0a0'}
                />
                <Text
                  style={[
                    styles.themeOptionText,
                    settings.theme === theme && styles.themeOptionTextActive,
                  ]}
                >
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.version}>SecureAgent v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a0a0a0',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#ffffff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#ffffff',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#a0a0a0',
  },
  statusConnected: {
    color: '#22c55e',
  },
  statusDisconnected: {
    color: '#ef4444',
  },
  testButton: {
    marginLeft: 'auto',
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#0f3460',
    borderRadius: 4,
  },
  testButtonText: {
    fontSize: 12,
    color: '#4a90d9',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#ffffff',
  },
  toggleHint: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 2,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  themeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  themeOptionActive: {
    borderColor: '#4a90d9',
    backgroundColor: 'rgba(74, 144, 217, 0.1)',
  },
  themeOptionText: {
    fontSize: 12,
    color: '#a0a0a0',
    marginTop: 8,
  },
  themeOptionTextActive: {
    color: '#4a90d9',
  },
  saveButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  version: {
    fontSize: 12,
    color: '#666',
  },
});
