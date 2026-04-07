'use client';

import { useState, useEffect } from 'react';
import {
  checkOllama,
  listModels,
  pullModel,
  setSetting,
  setAutostart,
} from '@/lib/tauri';
import type { OllamaModel, OllamaStatus } from '@/lib/ollama';

type Step = 'check-ollama' | 'download-model' | 'preferences' | 'complete';

interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
}

export function SetupWizard() {
  const [step, setStep] = useState<Step>('check-ollama');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<PullProgress | null>(null);
  const [selectedModel, setSelectedModel] = useState('llama3.2');
  const [preferences, setPreferences] = useState({
    theme: 'system',
    autostart: false,
  });
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  const checkOllamaStatus = async () => {
    setChecking(true);
    try {
      const status = await checkOllama();
      setOllamaStatus(status);

      if (status.available) {
        const modelList = await listModels();
        setModels(modelList);

        // If models exist, skip to preferences
        if (modelList.length > 0) {
          setStep('preferences');
        } else {
          setStep('download-model');
        }
      }
    } catch (error) {
      console.error('Error checking Ollama:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadModel = async () => {
    setIsDownloading(true);
    setDownloadProgress({ status: 'Starting download...' });

    try {
      // Listen for progress events
      if (typeof window !== 'undefined' && window.__TAURI__) {
        const { listen } = await import('@tauri-apps/api/event');
        const unlisten = await listen<PullProgress>('pull-progress', (event) => {
          setDownloadProgress(event.payload);
        });

        await pullModel(selectedModel);
        unlisten();
      }

      // Refresh models
      const modelList = await listModels();
      setModels(modelList);
      setStep('preferences');
    } catch (error) {
      console.error('Error downloading model:', error);
      setDownloadProgress({ status: `Error: ${error}` });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSavePreferences = async () => {
    try {
      await setSetting('theme', preferences.theme);
      await setSetting('default_model', selectedModel);
      await setAutostart(preferences.autostart);
      await setSetting('setup_complete', 'true');
      setStep('complete');
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const handleComplete = () => {
    window.location.href = '/';
  };

  const renderStep = () => {
    switch (step) {
      case 'check-ollama':
        return (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              {checking ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              ) : ollamaStatus?.available ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-green-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-10 w-10 text-red-500"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              {checking
                ? 'Checking Ollama...'
                : ollamaStatus?.available
                ? 'Ollama Connected!'
                : 'Ollama Not Found'}
            </h2>

            {!checking && !ollamaStatus?.available && (
              <>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  SecureAgent requires Ollama to run AI models locally.
                </p>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-left mb-6">
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
                  onClick={checkOllamaStatus}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Check Again
                </button>
              </>
            )}

            {ollamaStatus?.available && (
              <p className="text-gray-600 dark:text-gray-400">
                Version: {ollamaStatus.version}
              </p>
            )}
          </div>
        );

      case 'download-model':
        return (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-primary-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Download an AI Model
            </h2>

            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Choose a model to download. We recommend starting with Llama 3.2
              for a good balance of speed and quality.
            </p>

            {!isDownloading ? (
              <>
                <div className="mb-6">
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full max-w-xs px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="llama3.2">Llama 3.2 (2GB) - Recommended</option>
                    <option value="llama3.2:1b">Llama 3.2 1B (1.3GB) - Faster</option>
                    <option value="mistral">Mistral (4GB)</option>
                    <option value="codellama">Code Llama (4GB)</option>
                    <option value="phi3">Phi 3 (2.2GB)</option>
                  </select>
                </div>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setStep('preferences')}
                    className="px-6 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleDownloadModel}
                    className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Download Model
                  </button>
                </div>
              </>
            ) : (
              <div className="max-w-md mx-auto">
                <div className="mb-4">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 transition-all duration-300"
                      style={{
                        width:
                          downloadProgress?.total && downloadProgress?.completed
                            ? `${(downloadProgress.completed / downloadProgress.total) * 100}%`
                            : '0%',
                      }}
                    />
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {downloadProgress?.status || 'Downloading...'}
                </p>
              </div>
            )}
          </div>
        );

      case 'preferences':
        return (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-primary-600"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Configure Preferences
            </h2>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Customize your SecureAgent experience.
            </p>

            <div className="max-w-sm mx-auto space-y-6 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Theme
                </label>
                <select
                  value={preferences.theme}
                  onChange={(e) =>
                    setPreferences({ ...preferences, theme: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Launch at Login
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Start SecureAgent automatically
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPreferences({
                      ...preferences,
                      autostart: !preferences.autostart,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                    preferences.autostart
                      ? 'bg-primary-600'
                      : 'bg-gray-200 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      preferences.autostart ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              onClick={handleSavePreferences}
              className="mt-8 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Continue
            </button>
          </div>
        );

      case 'complete':
        return (
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-green-500"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              You&apos;re All Set!
            </h2>

            <p className="text-gray-600 dark:text-gray-400 mb-8">
              SecureAgent is ready to use. Your AI assistant runs completely
              offline - your data never leaves your device.
            </p>

            <button
              onClick={handleComplete}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Start Chatting
            </button>
          </div>
        );
    }
  };

  const steps = ['check-ollama', 'download-model', 'preferences', 'complete'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 h-1">
        <div
          className="bg-primary-600 h-1 transition-all duration-300"
          style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full">{renderStep()}</div>
      </div>
    </div>
  );
}
