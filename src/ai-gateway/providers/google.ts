/**
 * Google Provider
 *
 * Implementation for Google AI API (Gemini 2.5 Pro, Flash, etc.)
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

export class GoogleProvider extends BaseAIProvider {
  readonly provider: AIProvider = 'google';
  readonly capabilities: ProviderCapability[] = [
    'chat',
    'embedding',
    'image_generation',
    'image_analysis',
    'function_calling',
    'streaming',
  ];

  protected getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  async chat(request: AIRequestOptions): Promise<AIResponse> {
    const startTime = Date.now();
    const model = request.model ?? 'gemini-2.5-pro';

    const body = this.buildRequestBody(request, model);

    const response = await this.fetch(
      `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return this.parseResponse(data, model, startTime);
  }

  async *chatStream(request: AIRequestOptions): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = request.model ?? 'gemini-2.5-pro';
    const body = this.buildRequestBody(request, model);

    const response = await this.fetch(
      `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify(body),
      }
    );

    const reader = response.body?.getReader();
    if (!reader) {
      throw new AIGatewayError('PROVIDER_ERROR', 'No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const streamId = this.generateId();

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
              const candidate = parsed.candidates?.[0];

              if (candidate?.content?.parts) {
                const text = candidate.content.parts
                  .filter((p: any) => p.text)
                  .map((p: any) => p.text)
                  .join('');

                yield {
                  id: streamId,
                  delta: { content: text },
                  finishReason: this.mapFinishReason(candidate.finishReason),
                  usage: parsed.usageMetadata ? {
                    promptTokens: parsed.usageMetadata.promptTokenCount || 0,
                    completionTokens: parsed.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: parsed.usageMetadata.totalTokenCount || 0,
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

  private buildRequestBody(request: AIRequestOptions, model: string): object {
    const contents = this.formatContents(request.messages);

    const body: Record<string, unknown> = { contents };

    // Generation config
    const generationConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.maxTokens !== undefined) generationConfig.maxOutputTokens = request.maxTokens;
    if (request.topP !== undefined) generationConfig.topP = request.topP;
    if (request.stop) generationConfig.stopSequences = request.stop;

    if (request.responseFormat?.type === 'json_object') {
      generationConfig.responseMimeType = 'application/json';
    }

    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    // Tools/function calling
    if (request.tools && request.tools.length > 0) {
      body.tools = [{
        functionDeclarations: request.tools.map(tool => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        })),
      }];

      if (request.toolChoice === 'auto') {
        body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
      } else if (request.toolChoice === 'required') {
        body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
      } else if (request.toolChoice === 'none') {
        body.toolConfig = { functionCallingConfig: { mode: 'NONE' } };
      }
    }

    // System instruction
    const systemMessages = request.messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      body.systemInstruction = {
        parts: systemMessages.map(m => ({
          text: typeof m.content === 'string' ? m.content : '',
        })),
      };
    }

    return body;
  }

  private formatContents(messages: AIMessage[]): object[] {
    const contents: object[] = [];

    for (const message of messages) {
      if (message.role === 'system') continue; // Handled separately

      const role = message.role === 'assistant' ? 'model' : 'user';
      const parts: object[] = [];

      if (typeof message.content === 'string') {
        parts.push({ text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            parts.push({
              fileData: { mimeType: 'image/jpeg', fileUri: part.imageUrl },
            });
          } else if (part.type === 'image_base64') {
            parts.push({
              inlineData: {
                mimeType: part.mimeType || 'image/png',
                data: part.imageData,
              },
            });
          }
        }
      }

      // Handle tool calls in assistant messages
      if (message.toolCalls) {
        for (const tc of message.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            },
          });
        }
      }

      // Handle tool results
      if (message.role === 'tool' && message.toolCallId) {
        parts.push({
          functionResponse: {
            name: message.name || 'function',
            response: {
              result: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
            },
          },
        });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  private parseResponse(data: any, model: string, startTime: number): AIResponse {
    const candidate = data.candidates?.[0];
    if (!candidate) {
      throw new AIGatewayError('PROVIDER_ERROR', 'No candidates in response');
    }

    const message: AIMessage = {
      role: 'assistant',
      content: '',
    };

    // Extract text content
    const textParts = candidate.content?.parts?.filter((p: any) => p.text) || [];
    message.content = textParts.map((p: any) => p.text).join('');

    // Extract function calls
    const functionCalls = candidate.content?.parts?.filter((p: any) => p.functionCall) || [];
    if (functionCalls.length > 0) {
      message.toolCalls = functionCalls.map((fc: any, index: number) => ({
        id: `call_${index}`,
        type: 'function' as const,
        function: {
          name: fc.functionCall.name,
          arguments: JSON.stringify(fc.functionCall.args),
        },
      }));
    }

    return {
      id: this.generateId(),
      provider: 'google',
      model,
      message,
      finishReason: this.mapFinishReason(candidate.finishReason),
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  private mapFinishReason(reason: string | null): AIResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}

export function createGoogleProvider(options: AIProviderOptions): GoogleProvider {
  return new GoogleProvider(options);
}
