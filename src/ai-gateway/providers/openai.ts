/**
 * OpenAI Provider
 *
 * Implementation for OpenAI API (GPT-4o, GPT-5, o1, etc.)
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIStreamChunk,
  AIMessage,
  AIToolCall,
  ProviderCapability,
} from '../types.js';
import { AIGatewayError } from '../types.js';
import { BaseAIProvider, type AIProviderOptions } from './base.js';

export class OpenAIProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'openai';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'completion',
    'embedding',
    'image_generation',
    'image_analysis',
    'audio_transcription',
    'function_calling',
    'streaming',
    'json_mode',
  ];

  protected getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'gpt-4o';

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
    const model = request.model ?? 'gpt-4o';
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
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.responseFormat) body.response_format = request.responseFormat;

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.toolChoice) body.tool_choice = request.toolChoice;
    }

    if (stream) {
      body.stream_options = { include_usage: true };
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
      provider: 'openai',
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
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

export function createOpenAIProvider(options: AIProviderOptions): OpenAIProvider {
  return new OpenAIProvider(options);
}
