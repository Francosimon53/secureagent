/**
 * OpenAI GPT Message Handler
 *
 * Implements the MessageHandler interface for OpenAI GPT integration.
 * Supports tool use, streaming, and conversation continuity.
 */

import OpenAI from 'openai';
import type { MessageHandler } from '../agent.js';
import type { ConversationMessage, ToolCallRequest } from '../types.js';
import { getLogger } from '../../observability/logger.js';

const logger = getLogger().child({ module: 'OpenAIHandler' });

// =============================================================================
// Types
// =============================================================================

export interface OpenAIHandlerConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use */
  model?: OpenAIModel;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response generation (0-2) */
  temperature?: number;
  /** Enable streaming responses */
  streaming?: boolean;
  /** Default system prompt */
  defaultSystemPrompt?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Organization ID */
  organization?: string;
}

export type OpenAIModel =
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gpt-4-turbo'
  | 'gpt-4'
  | 'gpt-3.5-turbo'
  | 'o1'
  | 'o1-mini'
  | 'o1-preview';

type OpenAIMessage = OpenAI.ChatCompletionMessageParam;
type OpenAITool = OpenAI.ChatCompletionTool;

// =============================================================================
// OpenAI Handler Implementation
// =============================================================================

export class OpenAIHandler implements MessageHandler {
  private readonly client: OpenAI;
  private readonly config: Required<OpenAIHandlerConfig>;
  private conversationMessages: Map<string, OpenAIMessage[]> = new Map();

  constructor(config: OpenAIHandlerConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new OpenAI({
      apiKey,
      timeout: config.timeout ?? 120000,
      maxRetries: config.maxRetries ?? 3,
      organization: config.organization,
    });

    this.config = {
      apiKey,
      model: config.model ?? 'gpt-4o',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      streaming: config.streaming ?? false,
      defaultSystemPrompt: config.defaultSystemPrompt ?? '',
      timeout: config.timeout ?? 120000,
      maxRetries: config.maxRetries ?? 3,
      organization: config.organization ?? '',
    };

    logger.info({ model: this.config.model }, 'OpenAI handler initialized');
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(
    message: string,
    context: {
      conversationId: string;
      history: ConversationMessage[];
      systemPrompt?: string;
      availableTools: Array<{ name: string; description: string; parameters: unknown }>;
    }
  ): Promise<{
    response: string;
    toolCalls?: ToolCallRequest[];
    complete: boolean;
  }> {
    const { conversationId, history, systemPrompt, availableTools } = context;

    logger.debug(
      {
        conversationId,
        messageLength: message.length,
        historyLength: history.length,
        toolCount: availableTools.length,
      },
      'Processing message'
    );

    // Build messages array
    const messages: OpenAIMessage[] = [];

    // Add system prompt
    const sysPrompt = systemPrompt ?? this.config.defaultSystemPrompt;
    if (sysPrompt) {
      messages.push({
        role: 'system',
        content: sysPrompt,
      });
    }

    // Convert history to OpenAI format
    messages.push(...this.convertHistoryToMessages(history));

    // Add the new user message
    messages.push({
      role: 'user',
      content: message,
    });

    // Store messages for continuation
    this.conversationMessages.set(conversationId, messages);

    // Convert tools to OpenAI format
    const tools = this.convertToolsToOpenAIFormat(availableTools);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      return this.parseResponse(response, conversationId);
    } catch (error) {
      logger.error({ error, conversationId }, 'Failed to process message');
      throw this.handleError(error);
    }
  }

  /**
   * Continue processing after tool results
   */
  async continueWithToolResults(
    toolResults: Array<{
      toolCallId: string;
      toolName: string;
      result: unknown;
      error?: string;
    }>,
    context: {
      conversationId: string;
      history: ConversationMessage[];
    }
  ): Promise<{
    response: string;
    toolCalls?: ToolCallRequest[];
    complete: boolean;
  }> {
    const { conversationId, history } = context;

    logger.debug(
      {
        conversationId,
        toolResultCount: toolResults.length,
      },
      'Continuing with tool results'
    );

    // Get existing messages or convert history
    let messages = this.conversationMessages.get(conversationId);
    if (!messages) {
      messages = [];
      const sysPrompt = this.config.defaultSystemPrompt;
      if (sysPrompt) {
        messages.push({ role: 'system', content: sysPrompt });
      }
      messages.push(...this.convertHistoryToMessages(history));
    }

    // Add tool results
    for (const tr of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: tr.toolCallId,
        content: tr.error
          ? JSON.stringify({ error: tr.error })
          : JSON.stringify(tr.result),
      });
    }

    // Update stored messages
    this.conversationMessages.set(conversationId, messages);

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages,
      });

      return this.parseResponse(response, conversationId);
    } catch (error) {
      logger.error({ error, conversationId }, 'Failed to continue with tool results');
      throw this.handleError(error);
    }
  }

  /**
   * Clear conversation history for a given conversation
   */
  clearConversation(conversationId: string): void {
    this.conversationMessages.delete(conversationId);
    logger.debug({ conversationId }, 'Conversation history cleared');
  }

  /**
   * Get the current model being used
   */
  getModel(): OpenAIModel {
    return this.config.model;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<OpenAIHandlerConfig>): void {
    Object.assign(this.config, updates);
    logger.info({ updates: Object.keys(updates) }, 'Handler config updated');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private convertHistoryToMessages(history: ConversationMessage[]): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    for (const msg of history) {
      if (msg.role === 'system') {
        messages.push({
          role: 'system',
          content: msg.content,
        });
      } else if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        const toolCalls = msg.metadata?.toolCalls as ToolCallRequest[] | undefined;

        if (toolCalls && toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          messages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      }
    }

    return messages;
  }

  private convertToolsToOpenAIFormat(
    tools: Array<{ name: string; description: string; parameters: unknown }>
  ): OpenAITool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    }));
  }

  private parseResponse(
    response: OpenAI.ChatCompletion,
    conversationId: string
  ): {
    response: string;
    toolCalls?: ToolCallRequest[];
    complete: boolean;
  } {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response choice returned from OpenAI');
    }

    const message = choice.message;
    const textContent = message.content ?? '';
    const toolCalls: ToolCallRequest[] = [];

    // Parse tool calls
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
            timestamp: Date.now(),
          });
        }
      }
    }

    // Add assistant message to stored conversation
    const messages = this.conversationMessages.get(conversationId) ?? [];
    messages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    });
    this.conversationMessages.set(conversationId, messages);

    // Determine if conversation is complete
    const complete = toolCalls.length === 0 && choice.finish_reason === 'stop';

    logger.debug(
      {
        conversationId,
        responseLength: textContent.length,
        toolCallCount: toolCalls.length,
        finishReason: choice.finish_reason,
        complete,
      },
      'Response parsed'
    );

    return {
      response: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      complete,
    };
  }

  private handleError(error: unknown): Error {
    if (error instanceof OpenAI.APIError) {
      const message = `OpenAI API error: ${error.message}`;
      logger.error(
        {
          status: error.status,
          code: error.code,
          type: error.type,
        },
        message
      );

      if (error.status === 401) {
        return new Error('Invalid OpenAI API key');
      } else if (error.status === 429) {
        return new Error('OpenAI rate limit exceeded. Please try again later.');
      } else if (error.status === 500) {
        return new Error('OpenAI service error. Please try again later.');
      }

      return new Error(message);
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error(`Unknown error: ${String(error)}`);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an OpenAI handler instance
 */
export function createOpenAIHandler(config?: OpenAIHandlerConfig): OpenAIHandler {
  return new OpenAIHandler(config);
}

/**
 * Create an OpenAI handler with GPT-4o (recommended)
 */
export function createGPT4oHandler(config?: Omit<OpenAIHandlerConfig, 'model'>): OpenAIHandler {
  return new OpenAIHandler({
    ...config,
    model: 'gpt-4o',
  });
}

/**
 * Create an OpenAI handler with GPT-4o-mini (faster, cheaper)
 */
export function createGPT4oMiniHandler(config?: Omit<OpenAIHandlerConfig, 'model'>): OpenAIHandler {
  return new OpenAIHandler({
    ...config,
    model: 'gpt-4o-mini',
  });
}
