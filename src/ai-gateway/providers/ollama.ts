/**
 * Ollama AI Provider
 *
 * Local LLM support via Ollama for complete privacy
 * No data leaves the user's machine
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIStreamChunk,
  ProviderCapability,
} from '../types.js';
import { AIGatewayError } from '../types.js';
import { BaseAIProvider, type AIProviderOptions } from './base.js';

// =============================================================================
// Ollama Types
// =============================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
    seed?: number;
  };
  format?: 'json';
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families?: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

// =============================================================================
// Ollama Provider Options
// =============================================================================

export interface OllamaProviderOptions extends Omit<AIProviderOptions, 'apiKey'> {
  apiKey?: string; // Optional for Ollama (no auth needed for local)
  baseUrl?: string;
  defaultModel?: string;
  autoDetect?: boolean;
}

// =============================================================================
// Popular Local Models
// =============================================================================

export const OLLAMA_MODELS = {
  // Llama 3 models
  'llama3.2': {
    name: 'Llama 3.2 3B',
    family: 'llama',
    parameterSize: '3B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Fast and efficient for everyday tasks',
  },
  'llama3.2:1b': {
    name: 'Llama 3.2 1B',
    family: 'llama',
    parameterSize: '1B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Ultra-fast for simple tasks',
  },
  'llama3.1': {
    name: 'Llama 3.1 8B',
    family: 'llama',
    parameterSize: '8B',
    capabilities: ['chat', 'streaming', 'function_calling'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Great balance of speed and quality',
  },
  'llama3.1:70b': {
    name: 'Llama 3.1 70B',
    family: 'llama',
    parameterSize: '70B',
    capabilities: ['chat', 'streaming', 'function_calling'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'High-quality responses, requires more RAM',
  },

  // Mistral models
  'mistral': {
    name: 'Mistral 7B',
    family: 'mistral',
    parameterSize: '7B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 32000,
    description: 'Fast European open-source model',
  },
  'mistral-nemo': {
    name: 'Mistral Nemo 12B',
    family: 'mistral',
    parameterSize: '12B',
    capabilities: ['chat', 'streaming', 'function_calling'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Powerful multilingual model',
  },

  // Code models
  'codellama': {
    name: 'Code Llama 7B',
    family: 'codellama',
    parameterSize: '7B',
    capabilities: ['chat', 'streaming', 'completion'] as ProviderCapability[],
    contextWindow: 16000,
    description: 'Optimized for code generation',
  },
  'codellama:13b': {
    name: 'Code Llama 13B',
    family: 'codellama',
    parameterSize: '13B',
    capabilities: ['chat', 'streaming', 'completion'] as ProviderCapability[],
    contextWindow: 16000,
    description: 'Better code quality, more RAM needed',
  },
  'deepseek-coder-v2': {
    name: 'DeepSeek Coder V2',
    family: 'deepseek',
    parameterSize: '16B',
    capabilities: ['chat', 'streaming', 'completion'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Excellent for code tasks',
  },

  // Phi models (Microsoft)
  'phi3': {
    name: 'Phi-3 Mini 3.8B',
    family: 'phi',
    parameterSize: '3.8B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Compact but capable model',
  },
  'phi3:medium': {
    name: 'Phi-3 Medium 14B',
    family: 'phi',
    parameterSize: '14B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'More capable, still efficient',
  },

  // Gemma models (Google)
  'gemma2': {
    name: 'Gemma 2 9B',
    family: 'gemma',
    parameterSize: '9B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 8192,
    description: 'Google\'s open-source model',
  },
  'gemma2:27b': {
    name: 'Gemma 2 27B',
    family: 'gemma',
    parameterSize: '27B',
    capabilities: ['chat', 'streaming'] as ProviderCapability[],
    contextWindow: 8192,
    description: 'Larger Gemma for better quality',
  },

  // Qwen models (Alibaba)
  'qwen2.5': {
    name: 'Qwen 2.5 7B',
    family: 'qwen',
    parameterSize: '7B',
    capabilities: ['chat', 'streaming', 'function_calling'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Strong multilingual support',
  },
  'qwen2.5-coder': {
    name: 'Qwen 2.5 Coder 7B',
    family: 'qwen',
    parameterSize: '7B',
    capabilities: ['chat', 'streaming', 'completion'] as ProviderCapability[],
    contextWindow: 128000,
    description: 'Specialized for coding',
  },
} as const;

export type OllamaModelId = keyof typeof OLLAMA_MODELS;

// =============================================================================
// Ollama Provider Implementation
// =============================================================================

export class OllamaProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'ollama';
  readonly capabilities: ProviderCapability[] = ['chat', 'streaming', 'completion'];

  private readonly defaultModel: string;
  private isAvailable: boolean | null = null;
  private availableModels: string[] = [];
  private lastHealthCheck: number = 0;
  private readonly healthCheckInterval = 30000; // 30 seconds

  constructor(options: OllamaProviderOptions = {}) {
    super({
      apiKey: options.apiKey ?? 'ollama-local', // Placeholder, not used
      baseUrl: options.baseUrl,
      timeout: options.timeout ?? 120000, // Longer timeout for local inference
      maxRetries: options.maxRetries ?? 1, // Less retries for local
      headers: options.headers,
    });
    this.defaultModel = options.defaultModel ?? 'llama3.2';

    // Auto-detect if enabled
    if (options.autoDetect !== false) {
      this.checkHealth().catch(() => {
        // Silently fail auto-detection
      });
    }
  }

  protected getDefaultBaseUrl(): string {
    return 'http://localhost:11434';
  }

  /**
   * Check if Ollama is running and available
   */
  async checkHealth(): Promise<boolean> {
    const now = Date.now();

    // Use cached result if recent
    if (this.isAvailable !== null && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isAvailable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as OllamaTagsResponse;
        this.availableModels = data.models.map((m) => m.name);
        this.isAvailable = true;
        this.lastHealthCheck = now;
        return true;
      }
    } catch {
      this.isAvailable = false;
      this.lastHealthCheck = now;
    }

    return false;
  }

  /**
   * Get list of available local models
   */
  async getAvailableModels(): Promise<OllamaModel[]> {
    try {
      const response = await this.fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
      });

      const data = (await response.json()) as OllamaTagsResponse;
      this.availableModels = data.models.map((m) => m.name);
      return data.models;
    } catch (error) {
      throw new AIGatewayError(
        'PROVIDER_UNAVAILABLE',
        'Ollama is not running. Start it with: ollama serve',
        503
      );
    }
  }

  /**
   * Check if a specific model is available locally
   */
  async hasModel(modelName: string): Promise<boolean> {
    await this.getAvailableModels();
    return this.availableModels.some(
      (m) => m === modelName || m.startsWith(`${modelName}:`)
    );
  }

  /**
   * Pull a model from Ollama registry
   */
  async pullModel(modelName: string, onProgress?: (progress: number) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    });

    if (!response.ok || !response.body) {
      throw new AIGatewayError('PROVIDER_ERROR', `Failed to pull model: ${modelName}`, response.status);
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
          if (data.total && data.completed && onProgress) {
            onProgress(Math.round((data.completed / data.total) * 100));
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }

  /**
   * Send a chat completion request
   */
  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new AIGatewayError(
        'PROVIDER_UNAVAILABLE',
        'Ollama is not running. Start it with: ollama serve',
        503
      );
    }

    const startTime = Date.now();
    const model = request.model ?? this.defaultModel;

    const ollamaRequest: OllamaChatRequest = {
      model,
      messages: this.convertMessages(request.messages),
      stream: false,
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        num_predict: request.maxTokens,
        stop: request.stop,
        seed: request.seed,
      },
    };

    if (request.responseFormat?.type === 'json_object') {
      ollamaRequest.format = 'json';
    }

    const response = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaRequest),
    });

    const data = (await response.json()) as OllamaChatResponse;
    const latencyMs = Date.now() - startTime;

    return {
      id: this.generateId(),
      provider: this.provider,
      model,
      message: {
        role: 'assistant',
        content: data.message.content,
      },
      finishReason: 'stop',
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      latencyMs,
      metadata: {
        local: true,
        totalDuration: data.total_duration,
        loadDuration: data.load_duration,
      },
    };
  }

  /**
   * Send a streaming chat completion request
   */
  async *chatStream(request: AIRequestOptions): AsyncGenerator<AIStreamChunk, void, unknown> {
    const isHealthy = await this.checkHealth();
    if (!isHealthy) {
      throw new AIGatewayError(
        'PROVIDER_UNAVAILABLE',
        'Ollama is not running. Start it with: ollama serve',
        503
      );
    }

    const model = request.model ?? this.defaultModel;

    const ollamaRequest: OllamaChatRequest = {
      model,
      messages: this.convertMessages(request.messages),
      stream: true,
      options: {
        temperature: request.temperature,
        top_p: request.topP,
        num_predict: request.maxTokens,
        stop: request.stop,
        seed: request.seed,
      },
    };

    if (request.responseFormat?.type === 'json_object') {
      ollamaRequest.format = 'json';
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok || !response.body) {
      const errorBody = await response.text();
      throw new AIGatewayError('PROVIDER_ERROR', `Ollama error: ${errorBody}`, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const id = this.generateId();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const chunk = JSON.parse(line) as OllamaStreamChunk;

          yield {
            id,
            delta: {
              content: chunk.message.content,
            },
            finishReason: chunk.done ? 'stop' : undefined,
            usage: chunk.done
              ? {
                  promptTokens: chunk.prompt_eval_count,
                  completionTokens: chunk.eval_count,
                  totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
                }
              : undefined,
          };
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  /**
   * Convert messages to Ollama format
   */
  private convertMessages(messages: AIRequestOptions['messages']): OllamaMessage[] {
    return messages.map((msg) => {
      let content: string;
      const images: string[] = [];

      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text ?? '')
          .join('\n');

        // Handle images for multimodal models
        for (const part of msg.content) {
          if (part.type === 'image_base64' && part.imageData) {
            images.push(part.imageData);
          }
        }
      } else {
        content = '';
      }

      const ollamaMessage: OllamaMessage = {
        role: msg.role === 'function' || msg.role === 'tool' ? 'assistant' : msg.role,
        content,
      };

      if (images.length > 0) {
        ollamaMessage.images = images;
      }

      return ollamaMessage;
    });
  }

  /**
   * Get status information
   */
  async getStatus(): Promise<{
    available: boolean;
    models: string[];
    url: string;
  }> {
    await this.checkHealth();
    return {
      available: this.isAvailable ?? false,
      models: this.availableModels,
      url: this.baseUrl,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an Ollama provider instance
 */
export function createOllamaProvider(options?: OllamaProviderOptions): OllamaProvider {
  return new OllamaProvider(options);
}

/**
 * Check if Ollama is available at the default URL
 */
export async function isOllamaAvailable(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get Ollama model info
 */
export function getOllamaModelInfo(modelId: string): (typeof OLLAMA_MODELS)[OllamaModelId] | undefined {
  // Try exact match first
  if (modelId in OLLAMA_MODELS) {
    return OLLAMA_MODELS[modelId as OllamaModelId];
  }

  // Try without tag suffix
  const baseName = modelId.split(':')[0];
  if (baseName in OLLAMA_MODELS) {
    return OLLAMA_MODELS[baseName as OllamaModelId];
  }

  return undefined;
}
