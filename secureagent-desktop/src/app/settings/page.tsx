'use client';

import { useEffect, useState } from 'react';
import {
  getSettings,
  saveSettings,
  getAutostart,
  setAutostart,
  listModels,
} from '@/lib/tauri';
import type { OllamaModel } from '@/lib/ollama';

interface Settings {
  theme: string;
  default_model: string;
  autostart: boolean;
  global_shortcut: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    theme: 'system',
    default_model: 'llama3.2',
    autostart: false,
    global_shortcut: 'CmdOrCtrl+Shift+Space',
  });
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const [savedSettings, modelList, autostartEnabled] = await Promise.all([
          getSettings(),
          listModels(),
          getAutostart(),
        ]);

        setSettings({
          theme: savedSettings.theme || 'system',
          default_model: savedSettings.default_model || 'llama3.2',
          autostart: autostartEnabled,
          global_shortcut:
            savedSettings.global_shortcut || 'CmdOrCtrl+Shift+Space',
        });
        setModels(modelList);
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      await saveSettings({
        theme: settings.theme,
        default_model: settings.default_model,
        autostart: settings.autostart,
        global_shortcut: settings.global_shortcut,
      });
      await setAutostart(settings.autostart);
      setMessage('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <a
          href="/"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
        </a>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Settings
        </h1>
      </header>

      {/* Settings Content */}
      <main className="max-w-2xl mx-auto p-6">
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.includes('success')
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
            }`}
          >
            {message}
          </div>
        )}

        <div className="space-y-6">
          {/* Appearance */}
          <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Appearance
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Theme
                </label>
                <select
                  value={settings.theme}
                  onChange={(e) =>
                    setSettings({ ...settings, theme: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          </section>

          {/* AI Model */}
          <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              AI Model
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Model
                </label>
                <select
                  value={settings.default_model}
                  onChange={(e) =>
                    setSettings({ ...settings, default_model: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  The model used for new conversations
                </p>
              </div>
            </div>
          </section>

          {/* System */}
          <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              System
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Launch at Login
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Start SecureAgent when you log in
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettings({ ...settings, autostart: !settings.autostart })
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    settings.autostart ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.autostart ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Global Shortcut
                </label>
                <input
                  type="text"
                  value={settings.global_shortcut}
                  onChange={(e) =>
                    setSettings({ ...settings, global_shortcut: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="CmdOrCtrl+Shift+Space"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Keyboard shortcut to open SecureAgent
                </p>
              </div>
            </div>
          </section>

          {/* About */}
          <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              About
            </h2>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>SecureAgent Desktop v1.0.0</p>
              <p>
                Powered by{' '}
                <a
                  href="https://ollama.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Ollama
                </a>
              </p>
              <p>Your AI assistant that runs 100% offline.</p>
            </div>
          </section>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </main>
    </div>
  );
}
