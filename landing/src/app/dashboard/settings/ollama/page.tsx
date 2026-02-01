'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface OllamaModel {
  name: string;
  size: string;
  modified: string;
  digest: string;
}

interface OllamaStatus {
  available: boolean;
  models: OllamaModel[];
  error?: string;
}

const RECOMMENDED_MODELS = [
  {
    id: 'llama3.2',
    name: 'Llama 3.2 3B',
    size: '~2GB',
    description: 'Fast and efficient for everyday tasks',
    recommended: true,
  },
  {
    id: 'llama3.1',
    name: 'Llama 3.1 8B',
    size: '~4.7GB',
    description: 'Great balance of speed and quality',
  },
  {
    id: 'mistral',
    name: 'Mistral 7B',
    size: '~4.1GB',
    description: 'Fast European open-source model',
  },
  {
    id: 'codellama',
    name: 'Code Llama 7B',
    size: '~3.8GB',
    description: 'Optimized for code generation',
  },
  {
    id: 'phi3',
    name: 'Phi-3 Mini',
    size: '~2.2GB',
    description: 'Microsoft compact but capable model',
  },
  {
    id: 'gemma2',
    name: 'Gemma 2 9B',
    size: '~5.4GB',
    description: 'Google open-source model',
  },
  {
    id: 'qwen2.5',
    name: 'Qwen 2.5 7B',
    size: '~4.4GB',
    description: 'Strong multilingual support',
  },
  {
    id: 'deepseek-coder-v2',
    name: 'DeepSeek Coder V2',
    size: '~8.9GB',
    description: 'Excellent for code tasks',
  },
];

export default function OllamaSettingsPage() {
  const [status, setStatus] = useState<OllamaStatus>({ available: false, models: [] });
  const [checking, setChecking] = useState(true);
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState(0);
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setChecking(true);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
      });

      if (response.ok) {
        const data = await response.json();
        const models = data.models?.map((m: { name: string; size: number; modified_at: string; digest: string }) => ({
          name: m.name,
          size: formatBytes(m.size),
          modified: new Date(m.modified_at).toLocaleDateString(),
          digest: m.digest.substring(0, 12),
        })) || [];

        setStatus({ available: true, models });
      } else {
        setStatus({ available: false, models: [], error: 'Failed to connect' });
      }
    } catch {
      setStatus({
        available: false,
        models: [],
        error: 'Ollama is not running. Start it with: ollama serve',
      });
    }
    setChecking(false);
  };

  const pullModel = async (modelId: string) => {
    setPulling(modelId);
    setPullProgress(0);

    try {
      const response = await fetch(`${ollamaUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId, stream: true }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to pull model');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.total && data.completed) {
              setPullProgress(Math.round((data.completed / data.total) * 100));
            }
            if (data.status === 'success') {
              setPullProgress(100);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      // Refresh model list
      await checkOllamaStatus();
    } catch (error) {
      console.error('Failed to pull model:', error);
    }

    setPulling(null);
    setPullProgress(0);
  };

  const deleteModel = async (modelName: string) => {
    if (!confirm(`Delete ${modelName}? This cannot be undone.`)) return;

    try {
      await fetch(`${ollamaUrl}/api/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });
      await checkOllamaStatus();
    } catch (error) {
      console.error('Failed to delete model:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const isModelInstalled = (modelId: string): boolean => {
    return status.models.some((m) => m.name === modelId || m.name.startsWith(`${modelId}:`));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/dashboard/settings"
              className="text-gray-400 hover:text-white transition-colors"
            >
              Settings
            </Link>
            <span className="text-gray-600">/</span>
            <h1 className="text-2xl font-bold text-white">Ollama (Local LLMs)</h1>
          </div>
          <p className="text-gray-400">
            Run AI models locally for complete privacy. No data leaves your machine.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.available ? (
            <span className="flex items-center gap-2 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              Not Running
            </span>
          )}
        </div>
      </div>

      {/* Privacy Banner */}
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🔒</div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Complete Privacy</h3>
            <p className="text-gray-300 text-sm">
              With Ollama, all AI processing happens on your machine. Your data never leaves your computer,
              making it perfect for sensitive documents, proprietary code, and confidential conversations.
            </p>
          </div>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Connection Status</h2>
          <button
            onClick={checkOllamaStatus}
            disabled={checking}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Refresh'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-gray-400 text-sm w-24">Ollama URL:</label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm"
              placeholder="http://localhost:11434"
            />
          </div>

          {!status.available && status.error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-red-400 text-sm">{status.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Installation Guide */}
      {!status.available && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-semibold text-white mb-6">Installation Guide</h2>

          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                1
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Install Ollama</h4>
                <p className="text-gray-400 text-sm mb-3">
                  Download and install Ollama from the official website.
                </p>
                <a
                  href="https://ollama.ai/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                >
                  Download Ollama
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                2
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Start the Ollama Server</h4>
                <p className="text-gray-400 text-sm mb-3">
                  Run the following command in your terminal:
                </p>
                <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
                  ollama serve
                </code>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                3
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Pull a Model</h4>
                <p className="text-gray-400 text-sm mb-3">
                  Download a model to get started. We recommend Llama 3.2 for most users:
                </p>
                <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
                  ollama pull llama3.2
                </code>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                4
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">Refresh This Page</h4>
                <p className="text-gray-400 text-sm">
                  Once Ollama is running, click the Refresh button above to detect your models.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installed Models */}
      {status.available && status.models.length > 0 && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-semibold text-white mb-4">Installed Models</h2>

          <div className="space-y-3">
            {status.models.map((model) => (
              <div
                key={model.name}
                className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <span className="text-green-400 text-lg">✓</span>
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{model.name}</h4>
                    <p className="text-gray-400 text-sm">
                      {model.size} • Updated {model.modified}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                    Local
                  </span>
                  <button
                    onClick={() => deleteModel(model.name)}
                    className="px-3 py-1 text-red-400 hover:bg-red-500/20 rounded transition-colors text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Models */}
      {status.available && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-xl font-semibold text-white mb-4">Available Models</h2>
          <p className="text-gray-400 text-sm mb-6">
            Click &quot;Install&quot; to download a model. Models run entirely on your machine.
          </p>

          <div className="grid gap-4">
            {RECOMMENDED_MODELS.map((model) => {
              const installed = isModelInstalled(model.id);
              const isPulling = pulling === model.id;

              return (
                <div
                  key={model.id}
                  className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        installed ? 'bg-green-500/20' : 'bg-gray-700'
                      }`}
                    >
                      <span className={installed ? 'text-green-400' : 'text-gray-400'}>
                        {installed ? '✓' : '📦'}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-white font-medium">{model.name}</h4>
                        {model.recommended && (
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">
                            Recommended
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm">
                        {model.description} • {model.size}
                      </p>
                    </div>
                  </div>
                  <div>
                    {installed ? (
                      <span className="px-3 py-1 text-green-400 text-sm">Installed</span>
                    ) : isPulling ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${pullProgress}%` }}
                          />
                        </div>
                        <span className="text-gray-400 text-sm">{pullProgress}%</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => pullModel(model.id)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
                      >
                        Install
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* System Requirements */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">System Requirements</h2>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-2">Minimum (7B models)</h4>
            <ul className="text-gray-400 text-sm space-y-1">
              <li>• 8GB RAM</li>
              <li>• 10GB disk space per model</li>
              <li>• Any modern CPU</li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-medium mb-2">Recommended (70B models)</h4>
            <ul className="text-gray-400 text-sm space-y-1">
              <li>• 64GB RAM or GPU with 48GB+ VRAM</li>
              <li>• 50GB disk space per model</li>
              <li>• NVIDIA GPU with CUDA support</li>
            </ul>
          </div>
        </div>

        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-yellow-400 text-sm">
            <strong>Note:</strong> Larger models produce better results but require more resources.
            Start with 3B-8B models and upgrade based on your hardware.
          </p>
        </div>
      </div>

      {/* Command Line Reference */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Command Line Reference</h2>

        <div className="space-y-4">
          <div>
            <p className="text-gray-400 text-sm mb-2">List installed models:</p>
            <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
              ollama list
            </code>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-2">Run a model directly:</p>
            <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
              ollama run llama3.2
            </code>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-2">Remove a model:</p>
            <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
              ollama rm llama3.2
            </code>
          </div>

          <div>
            <p className="text-gray-400 text-sm mb-2">Update a model:</p>
            <code className="block bg-gray-800 text-green-400 px-4 py-2 rounded text-sm font-mono">
              ollama pull llama3.2
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
