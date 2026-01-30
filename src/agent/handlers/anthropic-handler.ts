/**
 * Anthropic Claude Message Handler
 *
 * Implements the MessageHandler interface for Claude AI integration.
 * Supports tool use, streaming, and conversation continuity.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageHandler } from '../agent.js';
import type { ConversationMessage, ToolCallRequest } from '../types.js';
import { getLogger } from '../../observability/logger.js';
import { randomUUID } from 'crypto';

const logger = getLogger().child({ module: 'AnthropicHandler' });

// =============================================================================
// Types
// =============================================================================

export interface AnthropicHandlerConfig {
  /** Anthropic API key (defaults to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Model to use */
  model?: AnthropicModel;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Enable streaming responses */
  streaming?: boolean;
  /** Default system prompt */
  defaultSystemPrompt?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Maximum retries on failure */
  maxRetries?: number;
}

export type AnthropicModel =
  | 'claude-opus-4-20250514'
  | 'claude-sonnet-4-20250514'
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307';

type AnthropicMessage = Anthropic.MessageParam;
type AnthropicTool = Anthropic.Tool;
type AnthropicContentBlockParam = Anthropic.ContentBlockParam;
type AnthropicToolResultBlockParam = Anthropic.ToolResultBlockParam;

// =============================================================================
// Anthropic Handler Implementation
// =============================================================================

export class AnthropicHandler implements MessageHandler {
  private readonly client: Anthropic;
  private readonly config: Required<AnthropicHandlerConfig>;
  private conversationMessages: Map<string, AnthropicMessage[]> = new Map();

  constructor(config: AnthropicHandlerConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or pass apiKey in config.'
      );
    }

    this.client = new Anthropic({
      apiKey,
      timeout: config.timeout ?? 120000,
      maxRetries: config.maxRetries ?? 3,
    });

    this.config = {
      apiKey,
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0.7,
      streaming: config.streaming ?? false,
      defaultSystemPrompt: config.defaultSystemPrompt ?? '',
      timeout: config.timeout ?? 120000,
      maxRetries: config.maxRetries ?? 3,
    };

    logger.info({ model: this.config.model }, 'Anthropic handler initialized');
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

    // Convert history to Anthropic format
    const messages = this.convertHistoryToMessages(history);

    // Add the new user message
    messages.push({
      role: 'user',
      content: message,
    });

    // Store messages for continuation
    this.conversationMessages.set(conversationId, messages);

    // Convert tools to Anthropic format
    const tools = this.convertToolsToAnthropicFormat(availableTools);

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: systemPrompt ?? this.config.defaultSystemPrompt,
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
      messages = this.convertHistoryToMessages(history);
    }

    // Add tool results as a user message with tool_result blocks
    const toolResultBlocks: AnthropicToolResultBlockParam[] = toolResults.map((tr) => ({
      type: 'tool_result' as const,
      tool_use_id: tr.toolCallId,
      content: tr.error
        ? JSON.stringify({ error: tr.error })
        : JSON.stringify(tr.result),
      is_error: !!tr.error,
    }));

    messages.push({
      role: 'user',
      content: toolResultBlocks,
    });

    // Update stored messages
    this.conversationMessages.set(conversationId, messages);

    try {
      // Get available tools from the last assistant message if it had tool calls
      const response = await this.client.messages.create({
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
  getModel(): AnthropicModel {
    return this.config.model;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AnthropicHandlerConfig>): void {
    Object.assign(this.config, updates);
    logger.info({ updates: Object.keys(updates) }, 'Handler config updated');
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private convertHistoryToMessages(history: ConversationMessage[]): AnthropicMessage[] {
    const messages: AnthropicMessage[] = [];
    let pendingToolUses: Array<{ id: string; name: string; input: unknown }> = [];

    for (const msg of history) {
      if (msg.role === 'system') {
        // System messages are handled separately in Anthropic API
        continue;
      }

      if (msg.role === 'user') {
        messages.push({
          role: 'user',
          content: msg.content,
        });
      } else if (msg.role === 'assistant') {
        // Check if this message has tool calls in metadata
        const toolCalls = msg.metadata?.toolCalls as ToolCallRequest[] | undefined;

        if (toolCalls && toolCalls.length > 0) {
          const content: AnthropicContentBlockParam[] = [];

          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }

          for (const tc of toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
            pendingToolUses.push({
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }

          messages.push({
            role: 'assistant',
            content,
          });
        } else {
          messages.push({
            role: 'assistant',
            content: msg.content,
          });
        }
      } else if (msg.role === 'tool' && msg.toolCallId) {
        // Tool results need to be grouped after assistant message
        // Find the corresponding tool use and add as tool_result
        const toolResult: AnthropicToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content,
        };

        // Check if last message is a user message with tool results
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'user' && Array.isArray(lastMsg.content)) {
          (lastMsg.content as AnthropicToolResultBlockParam[]).push(toolResult);
        } else {
          messages.push({
            role: 'user',
            content: [toolResult],
          });
        }
      }
    }

    return messages;
  }

  private convertToolsToAnthropicFormat(
    tools: Array<{ name: string; description: string; parameters: unknown }>
  ): AnthropicTool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as AnthropicTool['input_schema'],
    }));
  }

  private parseResponse(
    response: Anthropic.Message,
    conversationId: string
  ): {
    response: string;
    toolCalls?: ToolCallRequest[];
    complete: boolean;
  } {
    let textContent = '';
    const toolCalls: ToolCallRequest[] = [];

    // Process content blocks
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
          timestamp: Date.now(),
        });
      }
    }

    // Add assistant message to stored conversation
    const messages = this.conversationMessages.get(conversationId) ?? [];
    messages.push({
      role: 'assistant',
      content: response.content,
    });
    this.conversationMessages.set(conversationId, messages);

    // Determine if conversation is complete
    // It's complete if there are no tool calls and stop reason is 'end_turn'
    const complete = toolCalls.length === 0 && response.stop_reason === 'end_turn';

    logger.debug(
      {
        conversationId,
        responseLength: textContent.length,
        toolCallCount: toolCalls.length,
        stopReason: response.stop_reason,
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
    if (error instanceof Anthropic.APIError) {
      const message = `Anthropic API error: ${error.message}`;
      logger.error(
        {
          status: error.status,
          code: error.error,
          type: error.name,
        },
        message
      );

      if (error.status === 401) {
        return new Error('Invalid Anthropic API key');
      } else if (error.status === 429) {
        return new Error('Anthropic rate limit exceeded. Please try again later.');
      } else if (error.status === 500) {
        return new Error('Anthropic service error. Please try again later.');
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
// Factory Function
// =============================================================================

/**
 * Create an Anthropic handler instance
 */
export function createAnthropicHandler(config?: AnthropicHandlerConfig): AnthropicHandler {
  return new AnthropicHandler(config);
}

/**
 * Create an Anthropic handler with Claude Sonnet (recommended for most use cases)
 */
export function createClaudeSonnetHandler(config?: Omit<AnthropicHandlerConfig, 'model'>): AnthropicHandler {
  return new AnthropicHandler({
    ...config,
    model: 'claude-sonnet-4-20250514',
  });
}

/**
 * Create an Anthropic handler with Claude Opus (most capable)
 */
export function createClaudeOpusHandler(config?: Omit<AnthropicHandlerConfig, 'model'>): AnthropicHandler {
  return new AnthropicHandler({
    ...config,
    model: 'claude-opus-4-20250514',
  });
}

/**
 * Create an Anthropic handler with Claude Haiku (fastest, most cost-effective)
 */
export function createClaudeHaikuHandler(config?: Omit<AnthropicHandlerConfig, 'model'>): AnthropicHandler {
  return new AnthropicHandler({
    ...config,
    model: 'claude-3-5-haiku-20241022',
  });
}
