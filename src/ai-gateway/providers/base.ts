/**
 * Base AI Provider
 *
 * Abstract base class for AI provider implementations
 */

import type {
  AIProvider,
  AIRequestOptions,
  AIResponse,
  AIStreamChunk,
  ProviderConfig,
  ProviderCapability,
} from '../types.js';
import { AIGatewayError } from '../types.js';

export interface AIProviderOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export abstract class BaseAIProvider {
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly headers: Record<string, string>;

  abstract readonly provider: AIProvider;
  abstract readonly capabilities: ProviderCapability[];

  constructor(options: AIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? this.getDefaultBaseUrl();
    this.timeout = options.timeout ?? 60000;
    this.maxRetries = options.maxRetries ?? 3;
    this.headers = options.headers ?? {};
  }

  protected abstract getDefaultBaseUrl(): string;

  /**
   * Send a chat completion request
   */
  abstract chat(request: AIRequestOptions): Promise<AIResponse>;

  /**
   * Send a streaming chat completion request
   */
  abstract chatStream(request: AIRequestOptions): AsyncGenerator<AIStreamChunk, void, unknown>;

  /**
   * Check if provider supports a capability
   */
  hasCapability(capability: ProviderCapability): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Create authorization headers
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.headers,
    };
  }

  /**
   * Make an HTTP request with retries
   */
  protected async fetch(
    url: string,
    options: RequestInit,
    retries = this.maxRetries
  ): Promise<Response> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();

          // Don't retry on client errors (except rate limits)
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            throw new AIGatewayError(
              'PROVIDER_ERROR',
              `${this.provider} API error: ${errorBody}`,
              response.status
            );
          }

          // Retry on rate limits and server errors
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
            throw new AIGatewayError('RATE_LIMITED', 'Rate limited', 429, retryAfter, this.provider);
          }

          throw new AIGatewayError(
            'PROVIDER_ERROR',
            `${this.provider} API error: ${response.status}`,
            response.status
          );
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof AIGatewayError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        if (attempt < retries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw lastError ?? new AIGatewayError('PROVIDER_ERROR', 'Request failed after retries');
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected generateId(): string {
    return `${this.provider}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
