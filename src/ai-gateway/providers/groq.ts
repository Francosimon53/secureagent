/**
 * Groq Provider
 *
 * Implementation for Groq API (Llama, Mixtral - ultra-fast inference)
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

export class GroqProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'groq';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'function_calling',
    'streaming',
  ];

  protected getDefaultBaseUrl(): string {
    return 'https://api.groq.com/openai/v1';
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'llama-3.3-70b-versatile';

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
    const model = request.model ?? 'llama-3.3-70b-versatile';
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
                  usage: parsed.x_groq?.usage ? {
                    promptTokens: parsed.x_groq.usage.prompt_tokens,
                    completionTokens: parsed.x_groq.usage.completion_tokens,
                    totalTokens: parsed.x_groq.usage.total_tokens,
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

  private buildRequestBody(request: AIRequestOptions, model: string, stream = false): object {
    const body: Record<string, unknown> = {
      model: this.mapModelId(model),
      messages: request.messages.map(m => this.formatMessage(m)),
      stream,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.stop) body.stop = request.stop;

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.toolChoice) body.tool_choice = request.toolChoice;
    }

    return body;
  }

  private mapModelId(model: string): string {
    // Map friendly model names to Groq model IDs
    const modelMap: Record<string, string> = {
      'llama-4-maverick-405b': 'llama-3.3-70b-versatile', // Placeholder until Llama 4 is available
      'llama-4-scout-70b': 'llama-3.3-70b-versatile',
      'llama-3.3-70b': 'llama-3.3-70b-versatile',
      'llama-3.1-405b': 'llama-3.1-405b-reasoning',
      'llama-3.1-70b': 'llama-3.1-70b-versatile',
      'llama-3.1-8b': 'llama-3.1-8b-instant',
      'mixtral-8x22b': 'mixtral-8x7b-32768', // Groq doesn't have 8x22b yet
      'mixtral-8x7b': 'mixtral-8x7b-32768',
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
      // Groq primarily supports text content
      formatted.content = message.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
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
      provider: 'groq',
      model: data.model || model,
      message,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      latencyMs: Date.now() - startTime,
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
      default:
        return 'stop';
    }
  }
}

export function createGroqProvider(options: AIProviderOptions): GroqProvider {
  return new GroqProvider(options);
}
