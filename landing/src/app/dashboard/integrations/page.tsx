'use client';

import { useState, useEffect } from 'react';

interface Integration {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  authType: 'oauth' | 'api_key' | 'local' | 'none';
  platforms: string[];
  connected: boolean;
  connectedAt?: number;
  lastUsed?: number;
  error?: string;
  setupSteps: { number: number; title: string; description: string; link?: string }[];
  docsUrl?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'notion',
    displayName: 'Notion',
    description: 'Connect to Notion for page and database management',
    icon: '📝',
    category: 'productivity',
    authType: 'api_key',
    platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Create Integration', description: 'Go to Notion integrations page and create a new integration', link: 'https://www.notion.so/my-integrations' },
      { number: 2, title: 'Copy Token', description: 'Copy the Internal Integration Token from your integration settings' },
      { number: 3, title: 'Share Pages', description: 'Share the pages and databases you want to access with your integration' },
      { number: 4, title: 'Connect', description: 'Paste your token here to connect' },
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started',
  },
  {
    name: 'google-calendar',
    displayName: 'Google Calendar',
    description: 'Connect to Google Calendar for event management',
    icon: '📅',
    category: 'calendar',
    authType: 'oauth',
    platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Click Connect', description: 'Click the Connect button to start the OAuth flow' },
      { number: 2, title: 'Sign In', description: 'Sign in with your Google account in the popup window' },
      { number: 3, title: 'Grant Access', description: 'Allow SecureAgent to access your calendar' },
      { number: 4, title: 'Done', description: 'You will be redirected back and connected automatically' },
    ],
    docsUrl: 'https://developers.google.com/calendar/api/guides/overview',
  },
  {
    name: 'gmail',
    displayName: 'Gmail',
    description: 'Connect to Gmail for email management',
    icon: '✉️',
    category: 'communication',
    authType: 'oauth',
    platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Click Connect', description: 'Click the Connect button to start the OAuth flow' },
      { number: 2, title: 'Sign In', description: 'Sign in with your Google account in the popup window' },
      { number: 3, title: 'Grant Access', description: 'Allow SecureAgent to access your Gmail' },
      { number: 4, title: 'Done', description: 'You will be redirected back and connected automatically' },
    ],
    docsUrl: 'https://developers.google.com/gmail/api/guides',
  },
  {
    name: 'obsidian',
    displayName: 'Obsidian',
    description: 'Connect to your local Obsidian vault for note management',
    icon: '📓',
    category: 'notes',
    authType: 'local',
    platforms: ['macos', 'windows', 'linux'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Find Vault Path', description: 'Locate your Obsidian vault folder on your computer' },
      { number: 2, title: 'Copy Path', description: 'Copy the full path to your vault folder' },
      { number: 3, title: 'Connect', description: 'Paste the path here to connect' },
    ],
    docsUrl: 'https://help.obsidian.md/Getting+started/Create+a+vault',
  },
  {
    name: 'trello',
    displayName: 'Trello',
    description: 'Connect to Trello for board and card management',
    icon: '📋',
    category: 'tasks',
    authType: 'api_key',
    platforms: ['web', 'macos', 'windows', 'linux', 'ios', 'android'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Get API Key', description: 'Go to Trello Power-Ups admin and create a new Power-Up', link: 'https://trello.com/power-ups/admin' },
      { number: 2, title: 'Generate Key', description: 'Click on your Power-Up and go to API Key section' },
      { number: 3, title: 'Get Token', description: 'Click "Token" link next to your API key to generate a token' },
      { number: 4, title: 'Connect', description: 'Enter both your API Key and Token here' },
    ],
    docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/',
  },
  {
    name: 'apple-reminders',
    displayName: 'Apple Reminders',
    description: 'Connect to Apple Reminders on macOS',
    icon: '⏰',
    category: 'tasks',
    authType: 'none',
    platforms: ['macos'],
    connected: false,
    setupSteps: [
      { number: 1, title: 'Click Connect', description: 'Click the Connect button below' },
      { number: 2, title: 'Grant Permission', description: 'When prompted, allow SecureAgent to control Reminders in System Preferences' },
      { number: 3, title: 'Done', description: 'You can now use Reminders with SecureAgent' },
    ],
    docsUrl: 'https://support.apple.com/guide/reminders/welcome/mac',
  },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Fetch integration status on mount
  useEffect(() => {
    fetchIntegrationStatus();
  }, []);

  const fetchIntegrationStatus = async () => {
    try {
      const response = await fetch('/api/integrations');
      if (response.ok) {
        const data = await response.json();
        if (data.connections) {
          setIntegrations(prev => prev.map(int => {
            const connection = data.connections.find((c: { integrationName: string }) => c.integrationName === int.name);
            if (connection) {
              return {
                ...int,
                connected: connection.connected,
                connectedAt: connection.connectedAt,
                lastUsed: connection.lastUsed,
                error: connection.error,
              };
            }
            return int;
          }));
        }
      }
    } catch {
      // Silently fail - integrations may not be available
    }
  };

  const handleConnect = async (integration: Integration) => {
    setConnecting(integration.name);
    setError(null);

    try {
      if (integration.authType === 'oauth') {
        // Start OAuth flow
        const state = Math.random().toString(36).substring(7);
        localStorage.setItem('oauth_state', state);

        const response = await fetch(`/api/integrations/oauth/google/start?state=${state}`);
        if (response.ok) {
          const data = await response.json();
          // Open OAuth popup
          window.open(data.authUrl, 'oauth', 'width=500,height=600');
        } else {
          throw new Error('Failed to start OAuth flow');
        }
      } else {
        // API key or local connection
        const response = await fetch('/api/integrations/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            integrationName: integration.name,
            credentials,
          }),
        });

        if (response.ok) {
          await fetchIntegrationStatus();
          setSelectedIntegration(null);
          setCredentials({});
        } else {
          const data = await response.json();
          throw new Error(data.error || 'Failed to connect');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (integration: Integration) => {
    setConnecting(integration.name);
    setError(null);

    try {
      const response = await fetch('/api/integrations/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationName: integration.name }),
      });

      if (response.ok) {
        await fetchIntegrationStatus();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnection failed');
    } finally {
      setConnecting(null);
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      productivity: 'bg-blue-500/20 text-blue-400',
      calendar: 'bg-green-500/20 text-green-400',
      communication: 'bg-purple-500/20 text-purple-400',
      notes: 'bg-yellow-500/20 text-yellow-400',
      tasks: 'bg-orange-500/20 text-orange-400',
    };
    return colors[category] || 'bg-gray-500/20 text-gray-400';
  };

  const renderCredentialInputs = (integration: Integration) => {
    switch (integration.name) {
      case 'notion':
        return (
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Internal Integration Token</label>
            <input
              type="password"
              value={credentials.apiKey || ''}
              onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
              placeholder="secret_..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>
        );
      case 'trello':
        return (
          <>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">API Key</label>
              <input
                type="text"
                value={credentials.apiKey || ''}
                onChange={(e) => setCredentials({ ...credentials, apiKey: e.target.value })}
                placeholder="Enter API Key"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Token</label>
              <input
                type="password"
                value={credentials.token || ''}
                onChange={(e) => setCredentials({ ...credentials, token: e.target.value })}
                placeholder="Enter Token"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
              />
            </div>
          </>
        );
      case 'obsidian':
        return (
          <div className="space-y-2">
            <label className="block text-sm text-gray-400">Vault Path</label>
            <input
              type="text"
              value={credentials.vaultPath || ''}
              onChange={(e) => setCredentials({ ...credentials, vaultPath: e.target.value })}
              placeholder="/Users/you/Documents/MyVault"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="text-gray-400 mt-1">Connect external services to extend SecureAgent capabilities</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className={`bg-gray-900/50 border rounded-xl p-5 transition-all hover:border-gray-600 ${
              integration.connected ? 'border-green-500/50' : 'border-gray-800'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center text-2xl">
                  {integration.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-white">{integration.displayName}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(integration.category)}`}>
                    {integration.category}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {integration.connected ? (
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" title="Connected" />
                ) : (
                  <span className="w-3 h-3 bg-gray-600 rounded-full" title="Disconnected" />
                )}
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-4">{integration.description}</p>

            {integration.connected && (
              <div className="text-xs text-gray-500 mb-4 space-y-1">
                <div>Connected: {formatDate(integration.connectedAt)}</div>
                {integration.lastUsed && (
                  <div>Last used: {formatDate(integration.lastUsed)}</div>
                )}
              </div>
            )}

            {integration.error && (
              <div className="text-xs text-red-400 mb-4">{integration.error}</div>
            )}

            <div className="flex gap-2">
              {integration.connected ? (
                <button
                  onClick={() => handleDisconnect(integration)}
                  disabled={connecting === integration.name}
                  className="flex-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {connecting === integration.name ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (integration.authType === 'oauth' || integration.authType === 'none') {
                      handleConnect(integration);
                    } else {
                      setSelectedIntegration(integration);
                    }
                  }}
                  disabled={connecting === integration.name}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {connecting === integration.name ? 'Connecting...' : 'Connect'}
                </button>
              )}
              <button
                onClick={() => setSelectedIntegration(integration)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm font-medium transition-colors"
              >
                Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Connection Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedIntegration.icon}</span>
                  <div>
                    <h2 className="text-xl font-bold text-white">{selectedIntegration.displayName}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(selectedIntegration.category)}`}>
                      {selectedIntegration.category}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedIntegration(null);
                    setCredentials({});
                    setError(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <p className="text-gray-400">{selectedIntegration.description}</p>

              {/* Platforms */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Available on</h3>
                <div className="flex gap-2">
                  {selectedIntegration.platforms.map((platform) => (
                    <span key={platform} className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400 capitalize">
                      {platform}
                    </span>
                  ))}
                </div>
              </div>

              {/* Setup Steps */}
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-3">Setup Instructions</h3>
                <div className="space-y-3">
                  {selectedIntegration.setupSteps.map((step) => (
                    <div key={step.number} className="flex gap-3">
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-xs text-white flex-shrink-0">
                        {step.number}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-white">{step.title}</h4>
                        <p className="text-sm text-gray-400">{step.description}</p>
                        {step.link && (
                          <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-400 hover:underline"
                          >
                            Open link
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Credential Inputs (for API key/local integrations) */}
              {selectedIntegration.authType !== 'oauth' && selectedIntegration.authType !== 'none' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-300">Credentials</h3>
                  {renderCredentialInputs(selectedIntegration)}
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {selectedIntegration.docsUrl && (
                  <a
                    href={selectedIntegration.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm font-medium transition-colors text-center"
                  >
                    Documentation
                  </a>
                )}
                {selectedIntegration.connected ? (
                  <button
                    onClick={() => handleDisconnect(selectedIntegration)}
                    disabled={connecting === selectedIntegration.name}
                    className="flex-1 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {connecting === selectedIntegration.name ? 'Disconnecting...' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(selectedIntegration)}
                    disabled={connecting === selectedIntegration.name}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {connecting === selectedIntegration.name ? 'Connecting...' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
