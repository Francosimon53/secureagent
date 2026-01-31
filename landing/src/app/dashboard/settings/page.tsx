'use client';

import { useState } from 'react';

interface Settings {
  general: {
    agentName: string;
    systemPrompt: string;
    maxTokens: number;
    temperature: number;
  };
  api: {
    anthropicApiKey: string;
    openaiApiKey: string;
  };
  channels: {
    telegram: {
      botToken: string;
      enabled: boolean;
    };
    discord: {
      botToken: string;
      applicationId: string;
      publicKey: string;
      enabled: boolean;
    };
    whatsapp: {
      accessToken: string;
      phoneNumberId: string;
      verifyToken: string;
      enabled: boolean;
    };
    slack: {
      botToken: string;
      signingSecret: string;
      enabled: boolean;
    };
  };
  features: {
    webSearch: boolean;
    browserAutomation: boolean;
    codeExecution: boolean;
    fileOperations: boolean;
    imageGeneration: boolean;
  };
  limits: {
    maxMessagesPerMinute: number;
    maxTokensPerRequest: number;
    sessionTimeout: number;
  };
}

const defaultSettings: Settings = {
  general: {
    agentName: 'SecureAgent',
    systemPrompt: 'You are SecureAgent, a helpful AI assistant that can search the web, execute code, and help with various tasks.',
    maxTokens: 4096,
    temperature: 0.7,
  },
  api: {
    anthropicApiKey: '',
    openaiApiKey: '',
  },
  channels: {
    telegram: { botToken: '', enabled: false },
    discord: { botToken: '', applicationId: '', publicKey: '', enabled: false },
    whatsapp: { accessToken: '', phoneNumberId: '', verifyToken: '', enabled: false },
    slack: { botToken: '', signingSecret: '', enabled: false },
  },
  features: {
    webSearch: true,
    browserAutomation: true,
    codeExecution: false,
    fileOperations: true,
    imageGeneration: false,
  },
  limits: {
    maxMessagesPerMinute: 60,
    maxTokensPerRequest: 4096,
    sessionTimeout: 3600,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'channels' | 'features' | 'limits'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'api', label: 'API Keys', icon: '🔑' },
    { id: 'channels', label: 'Channels', icon: '📡' },
    { id: 'features', label: 'Features', icon: '⚡' },
    { id: 'limits', label: 'Limits', icon: '📊' },
  ];

  const handleSave = async () => {
    setIsSaving(true);
    // In production, save to API
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const toggleSecret = (key: string) => {
    setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const maskValue = (value: string, show: boolean) => {
    if (!value) return '';
    if (show) return value;
    return '•'.repeat(Math.min(value.length, 40));
  };

  const renderSecretInput = (label: string, key: string, value: string, onChange: (v: string) => void) => (
    <div className="space-y-2">
      <label className="block text-sm text-gray-400">{label}</label>
      <div className="flex gap-2">
        <input
          type={showSecrets[key] ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${label}`}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
        />
        <button
          onClick={() => toggleSecret(key)}
          className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white"
        >
          {showSecrets[key] ? '👁️' : '🔒'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Configure your SecureAgent instance</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg text-white font-medium transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        {activeTab === 'general' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white mb-4">General Settings</h2>

            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Agent Name</label>
              <input
                type="text"
                value={settings.general.agentName}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  general: { ...prev.general, agentName: e.target.value }
                }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-gray-400">System Prompt</label>
              <textarea
                value={settings.general.systemPrompt}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  general: { ...prev.general, systemPrompt: e.target.value }
                }))}
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Max Tokens</label>
                <input
                  type="number"
                  value={settings.general.maxTokens}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    general: { ...prev.general, maxTokens: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Temperature ({settings.general.temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.general.temperature}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    general: { ...prev.general, temperature: parseFloat(e.target.value) }
                  }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white mb-4">API Keys</h2>
            <p className="text-sm text-gray-400 mb-6">
              Store your API keys securely. Keys are encrypted at rest.
            </p>

            {renderSecretInput('Anthropic API Key', 'anthropic', settings.api.anthropicApiKey, (v) =>
              setSettings(prev => ({ ...prev, api: { ...prev.api, anthropicApiKey: v } }))
            )}

            {renderSecretInput('OpenAI API Key', 'openai', settings.api.openaiApiKey, (v) =>
              setSettings(prev => ({ ...prev, api: { ...prev.api, openaiApiKey: v } }))
            )}
          </div>
        )}

        {activeTab === 'channels' && (
          <div className="space-y-8">
            <h2 className="text-lg font-semibold text-white mb-4">Channel Configuration</h2>

            {/* Telegram */}
            <div className="p-4 bg-gray-800/50 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📱</span>
                  <h3 className="font-medium text-white">Telegram</h3>
                </div>
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    channels: { ...prev.channels, telegram: { ...prev.channels.telegram, enabled: !prev.channels.telegram.enabled } }
                  }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.channels.telegram.enabled ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.channels.telegram.enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>
              {renderSecretInput('Bot Token', 'telegram-token', settings.channels.telegram.botToken, (v) =>
                setSettings(prev => ({ ...prev, channels: { ...prev.channels, telegram: { ...prev.channels.telegram, botToken: v } } }))
              )}
            </div>

            {/* Discord */}
            <div className="p-4 bg-gray-800/50 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎮</span>
                  <h3 className="font-medium text-white">Discord</h3>
                </div>
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    channels: { ...prev.channels, discord: { ...prev.channels.discord, enabled: !prev.channels.discord.enabled } }
                  }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.channels.discord.enabled ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.channels.discord.enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>
              {renderSecretInput('Bot Token', 'discord-token', settings.channels.discord.botToken, (v) =>
                setSettings(prev => ({ ...prev, channels: { ...prev.channels, discord: { ...prev.channels.discord, botToken: v } } }))
              )}
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Application ID</label>
                <input
                  type="text"
                  value={settings.channels.discord.applicationId}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    channels: { ...prev.channels, discord: { ...prev.channels.discord, applicationId: e.target.value } }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Slack */}
            <div className="p-4 bg-gray-800/50 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💼</span>
                  <h3 className="font-medium text-white">Slack</h3>
                </div>
                <button
                  onClick={() => setSettings(prev => ({
                    ...prev,
                    channels: { ...prev.channels, slack: { ...prev.channels.slack, enabled: !prev.channels.slack.enabled } }
                  }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.channels.slack.enabled ? 'bg-green-600' : 'bg-gray-700'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    settings.channels.slack.enabled ? 'left-7' : 'left-1'
                  }`} />
                </button>
              </div>
              {renderSecretInput('Bot Token', 'slack-token', settings.channels.slack.botToken, (v) =>
                setSettings(prev => ({ ...prev, channels: { ...prev.channels, slack: { ...prev.channels.slack, botToken: v } } }))
              )}
              {renderSecretInput('Signing Secret', 'slack-secret', settings.channels.slack.signingSecret, (v) =>
                setSettings(prev => ({ ...prev, channels: { ...prev.channels, slack: { ...prev.channels.slack, signingSecret: v } } }))
              )}
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white mb-4">Feature Toggles</h2>
            <p className="text-sm text-gray-400 mb-6">
              Enable or disable specific agent capabilities.
            </p>

            <div className="space-y-4">
              {Object.entries(settings.features).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-white capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {key === 'webSearch' && 'Search the web for real-time information'}
                      {key === 'browserAutomation' && 'Control headless browser for scraping'}
                      {key === 'codeExecution' && 'Execute code in sandboxed environment'}
                      {key === 'fileOperations' && 'Read and write files on the server'}
                      {key === 'imageGeneration' && 'Generate images using AI models'}
                    </p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      features: { ...prev.features, [key]: !enabled }
                    }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      enabled ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      enabled ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'limits' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-white mb-4">Rate Limits</h2>
            <p className="text-sm text-gray-400 mb-6">
              Configure rate limiting and resource constraints.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Max Messages per Minute</label>
                <input
                  type="number"
                  value={settings.limits.maxMessagesPerMinute}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    limits: { ...prev.limits, maxMessagesPerMinute: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Max Tokens per Request</label>
                <input
                  type="number"
                  value={settings.limits.maxTokensPerRequest}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    limits: { ...prev.limits, maxTokensPerRequest: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm text-gray-400">Session Timeout (seconds)</label>
                <input
                  type="number"
                  value={settings.limits.sessionTimeout}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    limits: { ...prev.limits, sessionTimeout: parseInt(e.target.value) || 0 }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">Sessions will expire after this many seconds of inactivity</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
