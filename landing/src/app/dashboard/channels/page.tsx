'use client';

import { useEffect, useState } from 'react';

interface ChannelConfig {
  name: string;
  icon: string;
  endpoint: string;
  status: 'online' | 'offline' | 'error' | 'loading';
  configured: boolean;
  details: Record<string, unknown>;
  setupSteps: string[];
  envVars: string[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

const initialChannels: ChannelConfig[] = [
  {
    name: 'Telegram',
    icon: '📱',
    endpoint: '/api/telegram',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create a bot with @BotFather on Telegram',
      'Get the bot token from @BotFather',
      'Set TELEGRAM_BOT_TOKEN environment variable',
      'Register webhook with Telegram API',
    ],
    envVars: ['TELEGRAM_BOT_TOKEN'],
  },
  {
    name: 'Discord',
    icon: '🎮',
    endpoint: '/api/discord',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create app at Discord Developer Portal',
      'Get Application ID and Public Key',
      'Create Bot and get token',
      'Set Interactions Endpoint URL',
      'Register slash commands',
    ],
    envVars: ['DISCORD_BOT_TOKEN', 'DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY'],
  },
  {
    name: 'WhatsApp',
    icon: '💬',
    endpoint: '/api/whatsapp',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create Meta Developer account',
      'Create app with WhatsApp product',
      'Get Phone Number ID and Access Token',
      'Configure webhook URL',
      'Subscribe to messages',
    ],
    envVars: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_VERIFY_TOKEN'],
  },
  {
    name: 'Slack',
    icon: '💼',
    endpoint: '/api/slack',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create Slack app at api.slack.com',
      'Add Bot Token Scopes',
      'Install app to workspace',
      'Enable Event Subscriptions',
      'Set Request URL',
    ],
    envVars: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
  },
  {
    name: 'Signal',
    icon: '🔐',
    endpoint: '/api/signal',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Install signal-cli on your server',
      'Link signal-cli to your phone number',
      'Generate keypair and register device',
      'Configure JSON-RPC endpoint',
      'Set environment variables',
    ],
    envVars: ['SIGNAL_CLI_PATH', 'SIGNAL_PHONE_NUMBER', 'SIGNAL_DATA_PATH'],
  },
  {
    name: 'iMessage',
    icon: '🍎',
    endpoint: '/api/imessage',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Requires macOS with Messages app signed in',
      'Grant Full Disk Access to your app',
      'Grant Automation permission for Messages',
      'Configure polling interval',
      'Set sender Apple ID',
    ],
    envVars: ['IMESSAGE_SENDER_ID', 'IMESSAGE_POLL_INTERVAL'],
  },
  {
    name: 'Matrix',
    icon: '🌐',
    endpoint: '/api/matrix',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create account on Matrix homeserver',
      'Get access token from account settings',
      'Or use username/password authentication',
      'Configure homeserver URL',
      'Join or create rooms',
    ],
    envVars: ['MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN', 'MATRIX_USER_ID'],
  },
  {
    name: 'Google Chat',
    icon: '💬',
    endpoint: '/api/google-chat',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Create project in Google Cloud Console',
      'Enable Google Chat API',
      'Configure OAuth consent screen',
      'Create credentials (Service Account)',
      'Enable Google Chat App in configuration',
      'Set HTTP endpoint URL for your bot',
    ],
    envVars: ['GOOGLE_CHAT_SERVICE_ACCOUNT', 'GOOGLE_CHAT_PROJECT_ID'],
  },
  {
    name: 'Microsoft Teams',
    icon: '🟣',
    endpoint: '/api/teams',
    status: 'loading',
    configured: false,
    details: {},
    setupSteps: [
      'Go to Azure Portal or Bot Framework',
      'Create Azure Bot resource',
      'Get Microsoft App ID and Password',
      'Configure messaging endpoint URL',
      'Create Teams app manifest',
      'Install app in Teams',
    ],
    envVars: ['MICROSOFT_APP_ID', 'MICROSOFT_APP_PASSWORD', 'MICROSOFT_TENANT_ID'],
  },
];

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelConfig[]>(initialChannels);
  const [selectedChannel, setSelectedChannel] = useState<ChannelConfig | null>(null);

  useEffect(() => {
    channels.forEach(async (channel, index) => {
      try {
        const res = await fetch(`${API_BASE}${channel.endpoint}`);
        const data = await res.json();
        setChannels(prev => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            status: data.status?.ready ? 'online' : 'offline',
            configured: data.status?.ready || false,
            details: data.status || {},
          };
          return updated;
        });
      } catch {
        setChannels(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'error' };
          return updated;
        });
      }
    });
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'offline': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'error': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Connected';
      case 'offline': return 'Not Configured';
      case 'error': return 'Error';
      case 'loading': return 'Checking...';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Channels</h1>
        <p className="text-gray-400 mt-1">Manage your messaging platform integrations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Channel Cards */}
        <div className="space-y-4">
          {channels.map((channel) => (
            <div
              key={channel.name}
              className={`p-6 bg-gray-900/50 border rounded-xl cursor-pointer transition-all hover:border-gray-600 ${
                selectedChannel?.name === channel.name ? 'border-blue-500' : 'border-gray-800'
              }`}
              onClick={() => setSelectedChannel(channel)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{channel.icon}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{channel.name}</h3>
                    <p className="text-sm text-gray-400">{channel.endpoint}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm border ${getStatusColor(channel.status)}`}>
                  {getStatusText(channel.status)}
                </span>
              </div>

              {/* Config Status */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {channel.envVars.map((envVar) => {
                  const isConfigured = channel.details[envVar.toLowerCase().replace(/_/g, '') + 'Configured'] ||
                    channel.details[envVar.split('_').map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()).join('') + 'Configured'];
                  return (
                    <div
                      key={envVar}
                      className={`px-3 py-2 rounded-lg text-xs ${
                        isConfigured
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {isConfigured ? '✓' : '○'} {envVar}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Setup Instructions */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          {selectedChannel ? (
            <>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{selectedChannel.icon}</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">{selectedChannel.name} Setup</h2>
                  <p className="text-sm text-gray-400">Follow these steps to configure</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Setup Steps</h3>
                <ol className="space-y-3">
                  {selectedChannel.setupSteps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-gray-300">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 space-y-4">
                <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Required Environment Variables</h3>
                <div className="space-y-2">
                  {selectedChannel.envVars.map((envVar) => (
                    <div
                      key={envVar}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                    >
                      <code className="text-sm text-blue-400">{envVar}</code>
                      <button className="text-xs text-gray-400 hover:text-white">
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <a
                  href={`${API_BASE}${selectedChannel.endpoint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 text-center bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-medium transition-colors"
                >
                  View API Documentation →
                </a>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <span className="text-5xl mb-4">👈</span>
              <p>Select a channel to see setup instructions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
