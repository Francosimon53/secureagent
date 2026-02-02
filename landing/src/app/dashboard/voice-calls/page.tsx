'use client';

import { useState, useEffect } from 'react';

interface Call {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  from: string;
  to: string;
  startTime: number;
  duration: number;
  aiHandled: boolean;
  transcription?: string;
  voicemailUrl?: string;
  voicemailTranscription?: string;
  contactName: string;
}

interface CallRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: Array<{
    type: string;
    operator: string;
    value: string;
  }>;
  actions: Array<{
    type: string;
    params?: Record<string, unknown>;
  }>;
}

interface VoiceSettings {
  greeting: string;
  voicemailGreeting: string;
  autoAnswer: boolean;
  autoAnswerDelay: number;
  callScreening: boolean;
  recordAllCalls: boolean;
  transcribeVoicemails: boolean;
  defaultVoiceId: string;
  useVoiceClone: boolean;
  voiceCloneId: string | null;
  speakingRate: number;
}

export default function VoiceCallsPage() {
  const [activeTab, setActiveTab] = useState<'history' | 'settings' | 'rules' | 'voicemail'>('history');
  const [calls, setCalls] = useState<Call[]>([]);
  const [rules, setRules] = useState<CallRule[]>([]);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSettings, setEditingSettings] = useState(false);

  // Fetch data on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [callsRes, rulesRes, settingsRes] = await Promise.all([
        fetch('/api/voice/calls'),
        fetch('/api/voice/rules'),
        fetch('/api/voice/settings'),
      ]);

      const callsData = await callsRes.json();
      const rulesData = await rulesRes.json();
      const settingsData = await settingsRes.json();

      setCalls(callsData.calls || []);
      setRules(rulesData.rules || []);
      setSettings(settingsData.settings || null);
    } catch (error) {
      console.error('Failed to fetch voice data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    // In a real app, this would call the API
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled } : r))
    );
  };

  const updateSettings = async (newSettings: Partial<VoiceSettings>) => {
    try {
      const res = await fetch('/api/voice/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  const voicemails = calls.filter((c) => c.voicemailUrl || c.voicemailTranscription);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Voice Calls</h1>
          <p className="text-gray-400 mt-1">
            Manage your AI-powered phone calls, voicemail, and call routing
          </p>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2">
          <span>📞</span>
          <span>New Call</span>
        </button>
      </div>

      {/* Setup Required Banner */}
      <div className="bg-gradient-to-r from-purple-500/10 to-violet-500/10 border border-purple-500/30 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
            📞
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-white">Setup Required</h3>
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-medium rounded-full">Coming Soon</span>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              AI-powered voice calls require integration with telephony services like Twilio or Bland.ai. This feature is in development and will allow SecureAgent to make and receive calls on your behalf.
            </p>
            <p className="text-gray-500 text-xs">
              Planned features: AI call handling, voicemail transcription, call screening, custom voice cloning • ETA: Q2 2025
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <span className="text-xl">📞</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{calls.length}</p>
              <p className="text-sm text-gray-400">Total Calls</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <span className="text-xl">🤖</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {calls.filter((c) => c.aiHandled).length}
              </p>
              <p className="text-sm text-gray-400">AI Handled</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <span className="text-xl">📥</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{voicemails.length}</p>
              <p className="text-sm text-gray-400">Voicemails</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <span className="text-xl">📋</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">
                {rules.filter((r) => r.enabled).length}
              </p>
              <p className="text-sm text-gray-400">Active Rules</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <nav className="flex gap-4">
          {[
            { id: 'history', label: 'Call History', icon: '📞' },
            { id: 'voicemail', label: 'Voicemail', icon: '📥' },
            { id: 'rules', label: 'Call Rules', icon: '📋' },
            { id: 'settings', label: 'Settings', icon: '⚙️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'history' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Direction
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Number
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Time
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Duration
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">
                    AI
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    className="hover:bg-gray-800/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className={call.direction === 'inbound' ? 'text-green-400' : 'text-blue-400'}>
                        {call.direction === 'inbound' ? '📥' : '📤'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{call.contactName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-sm">
                      {call.direction === 'inbound' ? call.from : call.to}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {formatTime(call.startTime)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          call.status === 'completed'
                            ? 'bg-green-500/20 text-green-400'
                            : call.status === 'no-answer'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {call.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {call.aiHandled && (
                        <span className="text-purple-400" title="AI handled">
                          🤖
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {calls.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-2">📞</p>
              <p>No calls yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'voicemail' && (
        <div className="space-y-4">
          {voicemails.length === 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
              <p className="text-4xl mb-2">📭</p>
              <p className="text-gray-400">No voicemails</p>
            </div>
          ) : (
            voicemails.map((vm) => (
              <div
                key={vm.id}
                className="bg-gray-900 rounded-xl border border-gray-800 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium">{vm.contactName}</p>
                    <p className="text-gray-400 text-sm font-mono">{vm.from}</p>
                  </div>
                  <p className="text-gray-400 text-sm">{formatTime(vm.startTime)}</p>
                </div>
                {vm.voicemailTranscription && (
                  <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
                    <p className="text-sm text-gray-300">{vm.voicemailTranscription}</p>
                  </div>
                )}
                {vm.voicemailUrl && (
                  <div className="mt-3">
                    <audio controls className="w-full h-10" src={vm.voicemailUrl}>
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
                    Call Back
                  </button>
                  <button className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              + Add Rule
            </button>
          </div>
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleRule(rule.id, !rule.enabled)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      rule.enabled ? 'bg-blue-600' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        rule.enabled ? 'left-5' : 'left-1'
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-white font-medium">{rule.name}</p>
                    <p className="text-gray-400 text-sm">Priority: {rule.priority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-400 hover:text-white transition-colors">
                    ✏️
                  </button>
                  <button className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                    🗑️
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Conditions</p>
                  <div className="space-y-1">
                    {rule.conditions.map((cond, i) => (
                      <p key={i} className="text-sm text-gray-400">
                        {cond.type} {cond.operator} &quot;{cond.value}&quot;
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1">Actions</p>
                  <div className="space-y-1">
                    {rule.actions.map((action, i) => (
                      <p key={i} className="text-sm text-gray-400">
                        {action.type}
                        {action.params && ` → ${JSON.stringify(action.params)}`}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {rules.length === 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
              <p className="text-4xl mb-2">📋</p>
              <p className="text-gray-400">No call rules configured</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && settings && (
        <div className="space-y-6">
          {/* Greetings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Greetings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Call Greeting
                </label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  value={settings.greeting}
                  onChange={(e) =>
                    setSettings({ ...settings, greeting: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Voicemail Greeting
                </label>
                <textarea
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  value={settings.voicemailGreeting}
                  onChange={(e) =>
                    setSettings({ ...settings, voicemailGreeting: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          {/* Call Options */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Call Options</h3>
            <div className="space-y-4">
              {[
                {
                  key: 'autoAnswer',
                  label: 'Auto Answer',
                  description: 'Automatically answer incoming calls with AI',
                },
                {
                  key: 'callScreening',
                  label: 'Call Screening',
                  description: 'Screen unknown callers before connecting',
                },
                {
                  key: 'recordAllCalls',
                  label: 'Record All Calls',
                  description: 'Automatically record all calls for review',
                },
                {
                  key: 'transcribeVoicemails',
                  label: 'Transcribe Voicemails',
                  description: 'Automatically transcribe voicemail messages',
                },
              ].map((option) => (
                <div
                  key={option.key}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <p className="text-white font-medium">{option.label}</p>
                    <p className="text-gray-400 text-sm">{option.description}</p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        [option.key]: !settings[option.key as keyof VoiceSettings],
                      })
                    }
                    className={`relative w-12 h-7 rounded-full transition-colors ${
                      settings[option.key as keyof VoiceSettings]
                        ? 'bg-blue-600'
                        : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                        settings[option.key as keyof VoiceSettings]
                          ? 'left-6'
                          : 'left-1'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Voice Settings */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Voice Settings</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-white font-medium">Use Voice Clone</p>
                  <p className="text-gray-400 text-sm">
                    Use your cloned voice for AI calls
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      useVoiceClone: !settings.useVoiceClone,
                    })
                  }
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    settings.useVoiceClone ? 'bg-blue-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      settings.useVoiceClone ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Speaking Rate: {settings.speakingRate.toFixed(1)}x
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={settings.speakingRate}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      speakingRate: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={() => updateSettings(settings)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
