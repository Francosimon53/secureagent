'use client';

import { useState } from 'react';

export default function ExtensionPage() {
  const [apiKey, setApiKey] = useState('');
  const [copied, setCopied] = useState(false);

  const generateApiKey = () => {
    const key = 'sk-' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    setApiKey(key);
  };

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Chrome Extension</h1>
        <p className="text-gray-400">
          Install the SecureAgent Chrome Extension to use AI assistance on any webpage.
        </p>
      </div>

      {/* Features */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="text-3xl mb-3">💬</div>
          <h3 className="text-lg font-semibold text-white mb-2">Chat Interface</h3>
          <p className="text-gray-400 text-sm">
            Open the popup to chat with AI directly from any webpage. Get quick answers without leaving your current tab.
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="text-3xl mb-3">✨</div>
          <h3 className="text-lg font-semibold text-white mb-2">Text Selection</h3>
          <p className="text-gray-400 text-sm">
            Highlight any text on a page to instantly ask AI about it. Perfect for quick explanations and definitions.
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="text-3xl mb-3">📄</div>
          <h3 className="text-lg font-semibold text-white mb-2">Page Summarization</h3>
          <p className="text-gray-400 text-sm">
            Summarize any webpage with one click. Get the key points from articles, documentation, and more.
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="text-3xl mb-3">🔧</div>
          <h3 className="text-lg font-semibold text-white mb-2">Quick Actions</h3>
          <p className="text-gray-400 text-sm">
            Right-click on selected text for quick actions: translate, explain, rewrite, and more.
          </p>
        </div>
      </div>

      {/* Installation Steps */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-6">Installation Guide</h2>

        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              1
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Download the Extension</h4>
              <p className="text-gray-400 text-sm mb-3">
                Clone or download the extension files from the repository.
              </p>
              <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
                git clone https://github.com/your-org/secureagent.git<br />
                cd secureagent/chrome-extension
              </code>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              2
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Open Chrome Extensions</h4>
              <p className="text-gray-400 text-sm mb-3">
                Navigate to Chrome&apos;s extension management page.
              </p>
              <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
                chrome://extensions
              </code>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              3
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Enable Developer Mode</h4>
              <p className="text-gray-400 text-sm">
                Toggle the &quot;Developer mode&quot; switch in the top-right corner of the extensions page.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              4
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Load the Extension</h4>
              <p className="text-gray-400 text-sm">
                Click &quot;Load unpacked&quot; and select the <code className="bg-gray-800 px-1 rounded">chrome-extension</code> folder from the repository.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              5
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">Configure API Key</h4>
              <p className="text-gray-400 text-sm">
                Click the extension icon, then click the settings (⚙️) button to enter your API key.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* API Key Generation */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Generate API Key</h2>
        <p className="text-gray-400 text-sm mb-4">
          Generate an API key to authenticate the Chrome Extension with SecureAgent.
        </p>

        <div className="space-y-4">
          <button
            onClick={generateApiKey}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            Generate New API Key
          </button>

          {apiKey && (
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <code className="text-green-400 text-sm font-mono break-all">
                  {apiKey}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="flex-shrink-0 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors text-sm"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-yellow-500 text-xs mt-3">
                ⚠️ Save this key securely. It won&apos;t be shown again.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Usage Tips */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Usage Tips</h2>

        <div className="space-y-4 text-sm">
          <div className="flex gap-3">
            <span className="text-blue-400">•</span>
            <p className="text-gray-400">
              <span className="text-white font-medium">Keyboard shortcut:</span> Press{' '}
              <code className="bg-gray-800 px-1 rounded">Ctrl+Shift+S</code> (or{' '}
              <code className="bg-gray-800 px-1 rounded">Cmd+Shift+S</code> on Mac) to open the popup quickly.
            </p>
          </div>

          <div className="flex gap-3">
            <span className="text-blue-400">•</span>
            <p className="text-gray-400">
              <span className="text-white font-medium">Right-click menu:</span> Select text and right-click to see SecureAgent options in the context menu.
            </p>
          </div>

          <div className="flex gap-3">
            <span className="text-blue-400">•</span>
            <p className="text-gray-400">
              <span className="text-white font-medium">Quick actions:</span> Use the action buttons in the popup for common tasks like summarize, translate, and explain.
            </p>
          </div>

          <div className="flex gap-3">
            <span className="text-blue-400">•</span>
            <p className="text-gray-400">
              <span className="text-white font-medium">Pin the extension:</span> Click the puzzle piece icon in Chrome and pin SecureAgent for easy access.
            </p>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Troubleshooting</h2>

        <div className="space-y-4">
          <div>
            <h4 className="text-white font-medium mb-1">Extension not working?</h4>
            <p className="text-gray-400 text-sm">
              Make sure you&apos;ve entered a valid API key in the extension settings. The key should start with <code className="bg-gray-800 px-1 rounded">sk-</code>.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-1">Can&apos;t select text?</h4>
            <p className="text-gray-400 text-sm">
              Some websites disable text selection. Try using the right-click context menu instead, or copy the text and paste it into the chat.
            </p>
          </div>

          <div>
            <h4 className="text-white font-medium mb-1">API errors?</h4>
            <p className="text-gray-400 text-sm">
              Check that the SecureAgent server is running and accessible. The default API URL is <code className="bg-gray-800 px-1 rounded">http://localhost:3000/api</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
