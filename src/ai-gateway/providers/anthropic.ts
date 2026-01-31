/**
 * Anthropic Provider
 *
 * Implementation for Anthropic API (Claude Opus, Sonnet, Haiku)
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

export class AnthropicProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'anthropic';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'image_analysis',
    'function_calling',
    'streaming',
  ];

  protected getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1';
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': '2024-01-01',
      'Content-Type': 'application/json',
      ...this.headers,
    };
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'claude-sonnet-4-20250514';

    const body = this.buildRequestBody(request, model);

    const response = await this.fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return this.parseResponse(data, model, startTime);
  }

  async *chatStream(request: AIRequestOptions): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = request.model ?? 'claude-sonnet-4-20250514';
    const body = this.buildRequestBody(request, model, true);

    const response = await this.fetch(`${this.baseUrl}/messages`, {
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
    let currentId = this.generateId();

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

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'message_start') {
                currentId = parsed.message?.id || currentId;
              } else if (parsed.type === 'content_block_delta') {
                yield {
                  id: currentId,
                  delta: {
                    content: parsed.delta?.text,
                  },
                };
              } else if (parsed.type === 'message_delta') {
                yield {
                  id: currentId,
                  delta: {},
                  finishReason: this.mapStopReason(parsed.delta?.stop_reason),
                  usage: parsed.usage ? {
                    promptTokens: parsed.usage.input_tokens || 0,
                    completionTokens: parsed.usage.output_tokens || 0,
                    totalTokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0),
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
    // Extract system message if present
    let systemMessage: string | undefined;
    const messages: AIMessage[] = [];

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemMessage = typeof msg.content === 'string' ? msg.content : '';
      } else {
        messages.push(msg);
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: messages.map(m => this.formatMessage(m)),
      max_tokens: request.maxTokens ?? 8192,
      stream,
    };

    if (systemMessage) body.system = systemMessage;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.stop) body.stop_sequences = request.stop;

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));

      if (request.toolChoice) {
        if (request.toolChoice === 'auto') {
          body.tool_choice = { type: 'auto' };
        } else if (request.toolChoice === 'required') {
          body.tool_choice = { type: 'any' };
        } else if (request.toolChoice === 'none') {
          // Don't send tools at all
          delete body.tools;
        } else if (typeof request.toolChoice === 'object') {
          body.tool_choice = { type: 'tool', name: request.toolChoice.function.name };
        }
      }
    }

    return body;
  }

  private formatMessage(message: AIMessage): object {
    const formatted: Record<string, unknown> = {
      role: message.role === 'assistant' ? 'assistant' : 'user',
    };

    if (typeof message.content === 'string') {
      formatted.content = message.content;
    } else if (Array.isArray(message.content)) {
      formatted.content = message.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url') {
          return {
            type: 'image',
            source: { type: 'url', url: part.imageUrl },
          };
        } else if (part.type === 'image_base64') {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.mimeType || 'image/png',
              data: part.imageData,
            },
          };
        }
        return part;
      });
    }

    // Handle tool results
    if (message.role === 'tool' && message.toolCallId) {
      formatted.role = 'user';
      formatted.content = [{
        type: 'tool_result',
        tool_use_id: message.toolCallId,
        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      }];
    }

    return formatted;
  }

  private parseResponse(data: any, model: string, startTime: number): AIResponse {
    const message: AIMessage = {
      role: 'assistant',
      content: '',
    };

    // Extract text content
    const textBlocks = data.content?.filter((c: any) => c.type === 'text') || [];
    message.content = textBlocks.map((b: any) => b.text).join('');

    // Extract tool use
    const toolUseBlocks = data.content?.filter((c: any) => c.type === 'tool_use') || [];
    if (toolUseBlocks.length > 0) {
      message.toolCalls = toolUseBlocks.map((tc: any) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        },
      }));
    }

    return {
      id: data.id,
      provider: 'anthropic',
      model: data.model || model,
      message,
      finishReason: this.mapStopReason(data.stop_reason),
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
      latencyMs: Date.now() - startTime,
    };
  }

  private mapStopReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      default:
        return 'stop';
    }
  }
}

export function createAnthropicProvider(options: AIProviderOptions): AnthropicProvider {
  return new AnthropicProvider(options);
}
