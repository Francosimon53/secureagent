/**
 * OpenRouter Provider
 *
 * Implementation for OpenRouter API (access to 100+ models)
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIStreamChunk,
  AIMessage,
  ProviderCapability,
} from '../types.js';
import { AIGatewayError } from '../types.js';
import { BaseAIProvider, type AIProviderOptions } from './base.js';

export interface OpenRouterProviderOptions extends AIProviderOptions {
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'openrouter';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'function_calling',
    'streaming',
    'image_analysis',
  ];

  private readonly siteUrl?: string;
  private readonly siteName?: string;

  constructor(options: OpenRouterProviderOptions) {
    super(options);
    this.siteUrl = options.siteUrl;
    this.siteName = options.siteName;
  }

  protected getDefaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.headers,
    };

    if (this.siteUrl) headers['HTTP-Referer'] = this.siteUrl;
    if (this.siteName) headers['X-Title'] = this.siteName;

    return headers;
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'openrouter/auto';

    const body = this.buildRequestBody(request, model);

    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return this.parseResponse(data, model, startTime);
  }

  async *chatStream(request: AIRequestOptions): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = request.model ?? 'openrouter/auto';
    const body = this.buildRequestBody(request, model, true);

    const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIGatewayError('PROVIDER_ERROR', 'No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];

              if (choice) {
                yield {
                  id: parsed.id,
                  delta: {
                    content: choice.delta?.content,
                    toolCalls: choice.delta?.tool_calls?.map((tc: any) => ({
                      id: tc.id,
                      type: 'function',
                      function: tc.function,
                    })),
                  },
                  finishReason: this.mapFinishReason(choice.finish_reason),
                  usage: parsed.usage ? {
                    promptTokens: parsed.usage.prompt_tokens,
                    completionTokens: parsed.usage.completion_tokens,
                    totalTokens: parsed.usage.total_tokens,
                  } : undefined,
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get available models from OpenRouter
   */
  async getAvailableModels(): Promise<any[]> {
    const response = await this.fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    const data = await response.json() as { data?: unknown[] };
    return data.data || [];
  }

  private buildRequestBody(request: AIRequestOptions, model: string, stream = false): object {
    // Map shorthand model names to full OpenRouter model IDs
    const modelId = this.mapModelId(model);

    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map(m => this.formatMessage(m)),
      stream,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.frequencyPenalty !== undefined) body.frequency_penalty = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) body.presence_penalty = request.presencePenalty;
    if (request.stop) body.stop = request.stop;

    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.toolChoice) body.tool_choice = request.toolChoice;
    }

    // OpenRouter-specific options
    body.route = 'fallback'; // Enable fallback routing

    return body;
  }

  private mapModelId(model: string): string {
    // Map common shorthand names to full OpenRouter model IDs
    const modelMap: Record<string, string> = {
      'openrouter/auto': 'openrouter/auto',
      // OpenAI models
      'gpt-5': 'openai/gpt-4o', // Fallback until GPT-5 available
      'gpt-4o': 'openai/gpt-4o',
      'gpt-4o-mini': 'openai/gpt-4o-mini',
      'o1': 'openai/o1',
      'o1-mini': 'openai/o1-mini',
      // Anthropic models
      'claude-opus-4-5': 'anthropic/claude-3.5-sonnet', // Fallback
      'claude-sonnet-4': 'anthropic/claude-3.5-sonnet',
      'claude-3-5-sonnet': 'anthropic/claude-3.5-sonnet',
      'claude-3-haiku': 'anthropic/claude-3-haiku',
      // Google models
      'gemini-2.5-pro': 'google/gemini-pro-1.5',
      'gemini-2.5-flash': 'google/gemini-flash-1.5',
      // Meta models
      'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct',
      'llama-3.1-405b': 'meta-llama/llama-3.1-405b-instruct',
      // DeepSeek models
      'deepseek-chat': 'deepseek/deepseek-chat',
      'deepseek-coder': 'deepseek/deepseek-coder',
      // Mixtral
      'mixtral-8x22b': 'mistralai/mixtral-8x22b-instruct',
      'mixtral-8x7b': 'mistralai/mixtral-8x7b-instruct',
    };

    return modelMap[model] || model;
  }

  private formatMessage(message: AIMessage): object {
    const formatted: Record<string, unknown> = {
      role: message.role,
    };

    if (typeof message.content === 'string') {
      formatted.content = message.content;
    } else if (Array.isArray(message.content)) {
      formatted.content = message.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url') {
          return { type: 'image_url', image_url: { url: part.imageUrl } };
        } else if (part.type === 'image_base64') {
          return {
            type: 'image_url',
            image_url: { url: `data:${part.mimeType || 'image/png'};base64,${part.imageData}` },
          };
        }
        return part;
      });
    }

    if (message.name) formatted.name = message.name;
    if (message.toolCallId) formatted.tool_call_id = message.toolCallId;
    if (message.toolCalls) formatted.tool_calls = message.toolCalls;

    return formatted;
  }

  private parseResponse(data: any, model: string, startTime: number): AIResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new AIGatewayError('PROVIDER_ERROR', 'No choices in response');
    }

    const message: AIMessage = {
      role: 'assistant',
      content: choice.message?.content || '',
    };

    if (choice.message?.tool_calls) {
      message.toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    return {
      id: data.id,
      provider: 'openrouter',
      model: data.model || model,
      message,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      latencyMs: Date.now() - startTime,
      metadata: {
        actualModel: data.model,
        routedBy: 'openrouter',
      },
    };
  }

  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

export function createOpenRouterProvider(options: OpenRouterProviderOptions): OpenRouterProvider {
  return new OpenRouterProvider(options);
}
