'use client';

import { useState, useEffect } from 'react';

interface Model {
  id: string;
  name: string;
  provider: string;
  inputCost: number;
  outputCost: number;
  maxTokens: number;
  color: string;
}

interface ModelResponse {
  modelId: string;
  modelName: string;
  provider: string;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  error?: string;
  color: string;
}

interface CompareResult {
  id: string;
  prompt: string;
  timestamp: number;
  results: ModelResponse[];
  totalLatencyMs: number;
  totalCostUsd: number;
}

interface ModelsResponse {
  models: Model[];
  byProvider: Record<string, Model[]>;
}

export default function ComparePage() {
  const [models, setModels] = useState<Model[]>([]);
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, Model[]>>({});
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [history, setHistory] = useState<CompareResult[]>([]);
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch available models
  useEffect(() => {
    fetch('/api/compare?action=models')
      .then((res) => res.json())
      .then((data: ModelsResponse) => {
        setModels(data.models);
        setModelsByProvider(data.byProvider);
        // Pre-select first 2 models
        if (data.models.length >= 2) {
          setSelectedModels([data.models[0].id, data.models[1].id]);
        }
      })
      .catch(console.error);

    // Fetch history
    fetch('/api/compare?action=history')
      .then((res) => res.json())
      .then((data) => setHistory(data.history || []))
      .catch(console.error);
  }, []);

  const toggleModel = (modelId: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(modelId)) {
        return prev.filter((id) => id !== modelId);
      }
      if (prev.length >= 4) {
        return prev; // Max 4 models
      }
      return [...prev, modelId];
    });
  };

  const handleCompare = async () => {
    if (!prompt.trim() || selectedModels.length < 2) return;

    setIsLoading(true);
    setResult(null);
    setRatings({});

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          models: selectedModels,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setResult(data);
        setHistory((prev) => [data, ...prev.slice(0, 19)]);
      } else {
        alert(data.error || 'Comparison failed');
      }
    } catch (error) {
      console.error('Compare error:', error);
      alert('Failed to compare models');
    } finally {
      setIsLoading(false);
    }
  };

  const copyResponse = async (text: string, modelId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(modelId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const rateResponse = (comparisonId: string, modelId: string) => {
    setRatings((prev) => ({ ...prev, [comparisonId]: modelId }));
  };

  const formatCost = (cost: number) => {
    if (cost < 0.0001) return '<$0.0001';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(3)}`;
  };

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const loadHistoryItem = (item: CompareResult) => {
    setResult(item);
    setPrompt(item.prompt);
    setSelectedModels(item.results.map((r) => r.modelId));
    setShowHistory(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Comparison</h1>
          <p className="text-gray-400 mt-1">
            Compare responses from multiple AI models side-by-side
          </p>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History ({history.length})
        </button>
      </div>

      {/* History Panel */}
      {showHistory && history.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-white mb-3">Recent Comparisons</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => loadHistoryItem(item)}
                className="w-full text-left p-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white truncate flex-1">
                    {item.prompt.slice(0, 60)}
                    {item.prompt.length > 60 ? '...' : ''}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2 mt-1">
                  {item.results.map((r) => (
                    <span
                      key={r.modelId}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: r.color + '20', color: r.color }}
                    >
                      {r.modelName}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Model Selection */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Select Models to Compare
          </h2>
          <span className="text-sm text-gray-400">
            {selectedModels.length}/4 selected
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
            <div key={provider} className="space-y-2">
              <h3 className="text-sm font-medium text-gray-400">{provider}</h3>
              <div className="space-y-1">
                {providerModels.map((model) => (
                  <label
                    key={model.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedModels.includes(model.id)
                        ? 'bg-blue-600/20 border border-blue-500/50'
                        : 'bg-gray-800/50 border border-transparent hover:bg-gray-800'
                    } ${
                      selectedModels.length >= 4 && !selectedModels.includes(model.id)
                        ? 'opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(model.id)}
                      onChange={() => toggleModel(model.id)}
                      disabled={selectedModels.length >= 4 && !selectedModels.includes(model.id)}
                      className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 bg-gray-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: model.color }}
                        />
                        <span className="text-white text-sm font-medium truncate">
                          {model.name}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        ${model.inputCost}/${model.outputCost} per 1M tokens
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Your Prompt</h2>
        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt to compare model responses..."
            rows={4}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setPrompt('Explain quantum computing in simple terms.')}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors"
              >
                Example: Explain quantum computing
              </button>
              <button
                onClick={() => setPrompt('Write a Python function to find prime numbers.')}
                className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors"
              >
                Example: Code task
              </button>
            </div>
            <button
              onClick={handleCompare}
              disabled={isLoading || selectedModels.length < 2 || !prompt.trim()}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Comparing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare Models
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex flex-wrap gap-6">
              <div>
                <span className="text-gray-400 text-sm">Total Time</span>
                <p className="text-white font-semibold">
                  {formatLatency(result.totalLatencyMs)}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Total Cost</span>
                <p className="text-white font-semibold">
                  {formatCost(result.totalCostUsd)}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Models Compared</span>
                <p className="text-white font-semibold">{result.results.length}</p>
              </div>
              {ratings[result.id] && (
                <div>
                  <span className="text-gray-400 text-sm">Your Pick</span>
                  <p className="text-green-400 font-semibold">
                    {result.results.find((r) => r.modelId === ratings[result.id])?.modelName}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Response Cards */}
          <div className={`grid gap-4 ${
            result.results.length === 2 ? 'md:grid-cols-2' :
            result.results.length === 3 ? 'md:grid-cols-3' :
            'md:grid-cols-2 lg:grid-cols-4'
          }`}>
            {result.results.map((response) => (
              <div
                key={response.modelId}
                className={`bg-gray-900/50 border rounded-xl overflow-hidden ${
                  ratings[result.id] === response.modelId
                    ? 'border-green-500 ring-2 ring-green-500/20'
                    : 'border-gray-800'
                }`}
              >
                {/* Header */}
                <div
                  className="px-4 py-3 border-b border-gray-800"
                  style={{ backgroundColor: response.color + '10' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: response.color }}
                      />
                      <span className="font-semibold text-white">
                        {response.modelName}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{response.provider}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="px-4 py-2 bg-gray-800/30 flex gap-4 text-xs">
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{formatLatency(response.latencyMs)}</span>
                  </span>
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{response.totalTokens}</span> tokens
                  </span>
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{formatCost(response.costUsd)}</span>
                  </span>
                </div>

                {/* Response Content */}
                <div className="p-4 max-h-80 overflow-y-auto">
                  {response.error ? (
                    <p className="text-red-400">{response.error}</p>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans">
                        {response.response}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-t border-gray-800 flex gap-2">
                  <button
                    onClick={() => copyResponse(response.response, response.modelId)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors"
                  >
                    {copiedId === response.modelId ? (
                      <>
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => rateResponse(result.id, response.modelId)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-sm transition-colors ${
                      ratings[result.id] === response.modelId
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    {ratings[result.id] === response.modelId ? 'Best!' : 'Best'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !isLoading && (
        <div className="bg-gray-900/30 border border-dashed border-gray-700 rounded-xl p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-400 mb-2">
            No comparison yet
          </h3>
          <p className="text-gray-500">
            Select 2-4 models and enter a prompt to compare their responses
          </p>
        </div>
      )}
    </div>
  );
}
