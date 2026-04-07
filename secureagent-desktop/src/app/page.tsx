'use client';

import { useEffect, useState } from 'react';
import { Chat } from '@/components/Chat';
import { ModelSelector } from '@/components/ModelSelector';
import { checkOllama, listModels, getSetting } from '@/lib/tauri';
import type { OllamaModel, OllamaStatus } from '@/lib/ollama';

export default function Home() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // Check if setup is complete
        const setupValue = await getSetting('setup_complete');
        const isSetupComplete = setupValue === 'true';
        setSetupComplete(isSetupComplete);

        if (!isSetupComplete) {
          window.location.href = '/setup/';
          return;
        }

        // Check Ollama status
        const ollamaStatus = await checkOllama();
        setStatus(ollamaStatus);

        if (ollamaStatus.available) {
          // Load models
          const modelList = await listModels();
          setModels(modelList);

          // Get default model
          const defaultModel = await getSetting('default_model');
          if (defaultModel && modelList.some((m) => m.name === defaultModel)) {
            setSelectedModel(defaultModel);
          } else if (modelList.length > 0) {
            setSelectedModel(modelList[0].name);
          }
        }
      } catch (error) {
        console.error('Initialization error:', error);
      } finally {
        setLoading(false);
      }
    }

    init();
  }, []);

  if (loading || setupComplete === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!status?.available) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Ollama Not Running
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            SecureAgent requires Ollama to run AI models locally. Please start
            Ollama and refresh this page.
          </p>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-left">
            <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mb-2">
              # Install Ollama
            </p>
            <p className="text-sm font-mono text-gray-600 dark:text-gray-400 mb-4">
              brew install ollama
            </p>
            <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mb-2">
              # Start Ollama
            </p>
            <p className="text-sm font-mono text-gray-600 dark:text-gray-400">
              ollama serve
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            No Models Installed
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You need to download at least one model to start chatting.
          </p>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-left">
            <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mb-2">
              # Download a model
            </p>
            <p className="text-sm font-mono text-gray-600 dark:text-gray-400">
              ollama pull llama3.2
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          SecureAgent
        </h1>
        <div className="flex items-center gap-4">
          <ModelSelector
            models={models}
            selected={selectedModel}
            onSelect={setSelectedModel}
          />
          <a
            href="/settings/"
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
                d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden">
        <Chat model={selectedModel} />
      </main>
    </div>
  );
}
