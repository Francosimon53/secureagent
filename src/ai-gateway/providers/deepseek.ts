/**
 * DeepSeek Provider
 *
 * Implementation for DeepSeek API (cost-effective alternative)
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

export class DeepSeekProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'deepseek';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'function_calling',
    'streaming',
    'json_mode',
  ];

  protected getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com/v1';
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'deepseek-chat';

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
    const model = request.model ?? 'deepseek-chat';
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

  private buildRequestBody(request: AIRequestOptions, model: string, stream = false): object {
    const body: Record<string, unknown> = {
      model,
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

    return body;
  }

  private formatMessage(message: AIMessage): object {
    const formatted: Record<string, unknown> = {
      role: message.role,
    };

    if (typeof message.content === 'string') {
      formatted.content = message.content;
    } else if (Array.isArray(message.content)) {
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
      provider: 'deepseek',
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

export function createDeepSeekProvider(options: AIProviderOptions): DeepSeekProvider {
  return new DeepSeekProvider(options);
}
