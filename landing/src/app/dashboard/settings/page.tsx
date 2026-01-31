'use client';

import { useState } from 'react';

interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  enabled: boolean;
  customPrompt: string;
  priority: number;
}

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
  agents: {
    autoRouting: boolean;
    defaultAgent: string;
    showAgentBadge: boolean;
    persistAgentChoice: boolean;
    agents: AgentConfig[];
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
  agents: {
    autoRouting: true,
    defaultAgent: 'general',
    showAgentBadge: true,
    persistAgentChoice: false,
    agents: [
      {
        id: 'general',
        name: 'General Assistant',
        emoji: '🛡️',
        description: 'Your helpful all-purpose assistant',
        color: '#3B82F6',
        enabled: true,
        customPrompt: '',
        priority: 1,
      },
      {
        id: 'code',
        name: 'Code Helper',
        emoji: '💻',
        description: 'Programming, debugging, and technical help',
        color: '#10B981',
        enabled: true,
        customPrompt: '',
        priority: 2,
      },
      {
        id: 'research',
        name: 'Research Agent',
        emoji: '🔍',
        description: 'Web searches, data gathering, and analysis',
        color: '#8B5CF6',
        enabled: true,
        customPrompt: '',
        priority: 3,
      },
      {
        id: 'creative',
        name: 'Creative Writer',
        emoji: '✨',
        description: 'Stories, content, and creative writing',
        color: '#EC4899',
        enabled: true,
        customPrompt: '',
        priority: 4,
      },
    ],
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
  const [activeTab, setActiveTab] = useState<'general' | 'agents' | 'api' | 'channels' | 'features' | 'limits'>('general');
  const [isSaving, setIsSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [editingAgent, setEditingAgent] = useState<string | null>(null);

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'agents', label: 'Agents', icon: '🤖' },
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

        {activeTab === 'agents' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">AI Agents</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Configure multi-agent routing and agent behaviors
                </p>
              </div>
            </div>

            {/* Global Agent Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-800/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">Auto-Routing</h3>
                    <p className="text-xs text-gray-400">AI automatically selects the best agent</p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      agents: { ...prev.agents, autoRouting: !prev.agents.autoRouting }
                    }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      settings.agents.autoRouting ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.agents.autoRouting ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">Show Agent Badge</h3>
                    <p className="text-xs text-gray-400">Display which agent responded</p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      agents: { ...prev.agents, showAgentBadge: !prev.agents.showAgentBadge }
                    }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      settings.agents.showAgentBadge ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.agents.showAgentBadge ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-white">Persist Agent Choice</h3>
                    <p className="text-xs text-gray-400">Remember selected agent across sessions</p>
                  </div>
                  <button
                    onClick={() => setSettings(prev => ({
                      ...prev,
                      agents: { ...prev.agents, persistAgentChoice: !prev.agents.persistAgentChoice }
                    }))}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      settings.agents.persistAgentChoice ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.agents.persistAgentChoice ? 'left-7' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-gray-800/50 rounded-xl space-y-3">
                <h3 className="font-medium text-white">Default Agent</h3>
                <select
                  value={settings.agents.defaultAgent}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    agents: { ...prev.agents, defaultAgent: e.target.value }
                  }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="auto">🤖 Auto-Route</option>
                  {settings.agents.agents.filter(a => a.enabled).map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.emoji} {agent.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Agent List */}
            <div className="space-y-4">
              <h3 className="text-md font-medium text-white">Available Agents</h3>

              {settings.agents.agents.map((agent, index) => (
                <div
                  key={agent.id}
                  className={`p-4 rounded-xl border transition-all ${
                    agent.enabled
                      ? 'bg-gray-800/50 border-gray-700'
                      : 'bg-gray-900/30 border-gray-800 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: agent.color + '20', borderColor: agent.color, borderWidth: 2 }}
                      >
                        {agent.emoji}
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{agent.name}</h4>
                        <p className="text-sm text-gray-400">{agent.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingAgent(editingAgent === agent.id ? null : agent.id)}
                        className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
                      >
                        {editingAgent === agent.id ? 'Close' : 'Edit'}
                      </button>
                      <button
                        onClick={() => {
                          const newAgents = [...settings.agents.agents];
                          newAgents[index] = { ...agent, enabled: !agent.enabled };
                          setSettings(prev => ({
                            ...prev,
                            agents: { ...prev.agents, agents: newAgents }
                          }));
                        }}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          agent.enabled ? 'bg-green-600' : 'bg-gray-700'
                        }`}
                      >
                        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          agent.enabled ? 'left-7' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Edit Panel */}
                  {editingAgent === agent.id && (
                    <div className="mt-4 pt-4 border-t border-gray-700 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm text-gray-400">Display Name</label>
                          <input
                            type="text"
                            value={agent.name}
                            onChange={(e) => {
                              const newAgents = [...settings.agents.agents];
                              newAgents[index] = { ...agent, name: e.target.value };
                              setSettings(prev => ({
                                ...prev,
                                agents: { ...prev.agents, agents: newAgents }
                              }));
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm text-gray-400">Emoji</label>
                          <input
                            type="text"
                            value={agent.emoji}
                            onChange={(e) => {
                              const newAgents = [...settings.agents.agents];
                              newAgents[index] = { ...agent, emoji: e.target.value };
                              setSettings(prev => ({
                                ...prev,
                                agents: { ...prev.agents, agents: newAgents }
                              }));
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                            maxLength={2}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm text-gray-400">Description</label>
                        <input
                          type="text"
                          value={agent.description}
                          onChange={(e) => {
                            const newAgents = [...settings.agents.agents];
                            newAgents[index] = { ...agent, description: e.target.value };
                            setSettings(prev => ({
                              ...prev,
                              agents: { ...prev.agents, agents: newAgents }
                            }));
                          }}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm text-gray-400">
                          Custom System Prompt
                          <span className="text-xs text-gray-500 ml-2">(Leave empty to use default)</span>
                        </label>
                        <textarea
                          value={agent.customPrompt}
                          onChange={(e) => {
                            const newAgents = [...settings.agents.agents];
                            newAgents[index] = { ...agent, customPrompt: e.target.value };
                            setSettings(prev => ({
                              ...prev,
                              agents: { ...prev.agents, agents: newAgents }
                            }));
                          }}
                          rows={4}
                          placeholder="Enter a custom system prompt for this agent..."
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm text-gray-400">Accent Color</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={agent.color}
                              onChange={(e) => {
                                const newAgents = [...settings.agents.agents];
                                newAgents[index] = { ...agent, color: e.target.value };
                                setSettings(prev => ({
                                  ...prev,
                                  agents: { ...prev.agents, agents: newAgents }
                                }));
                              }}
                              className="w-12 h-10 rounded-lg cursor-pointer border-0"
                            />
                            <input
                              type="text"
                              value={agent.color}
                              onChange={(e) => {
                                const newAgents = [...settings.agents.agents];
                                newAgents[index] = { ...agent, color: e.target.value };
                                setSettings(prev => ({
                                  ...prev,
                                  agents: { ...prev.agents, agents: newAgents }
                                }));
                              }}
                              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-sm text-gray-400">Priority</label>
                          <input
                            type="number"
                            min="1"
                            max="10"
                            value={agent.priority}
                            onChange={(e) => {
                              const newAgents = [...settings.agents.agents];
                              newAgents[index] = { ...agent, priority: parseInt(e.target.value) || 1 };
                              setSettings(prev => ({
                                ...prev,
                                agents: { ...prev.agents, agents: newAgents }
                              }));
                            }}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                          />
                          <p className="text-xs text-gray-500">Lower = higher priority in auto-routing</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Agent Stats Preview */}
            <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700">
              <h3 className="text-md font-medium text-white mb-3">Quick Stats</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {settings.agents.agents.filter(a => a.enabled).length}
                  </p>
                  <p className="text-xs text-gray-400">Active Agents</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {settings.agents.autoRouting ? '✓' : '✗'}
                  </p>
                  <p className="text-xs text-gray-400">Auto-Routing</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {settings.agents.agents.filter(a => a.customPrompt).length}
                  </p>
                  <p className="text-xs text-gray-400">Custom Prompts</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">
                    {settings.agents.agents.find(a => a.id === settings.agents.defaultAgent)?.emoji || '🤖'}
                  </p>
                  <p className="text-xs text-gray-400">Default Agent</p>
                </div>
              </div>
            </div>
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
