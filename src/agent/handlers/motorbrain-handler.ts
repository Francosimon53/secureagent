/**
 * Motor Brain ABA Clinical Handler
 *
 * HTTP client for the Motor Brain ABA backend on Railway.
 * Implements MessageHandler for compatibility with the agent framework,
 * but primarily used via sendToMotorBrain() for direct ABA clinical queries.
 */

import type { MessageHandler } from '../agent.js';
import type { ConversationMessage, ToolCallRequest } from '../types.js';
import { getLogger } from '../../observability/logger.js';

const logger = getLogger().child({ module: 'MotorBrainHandler' });

// =============================================================================
// Types
// =============================================================================

export interface MotorBrainConfig {
  /** Motor Brain backend URL (e.g. https://web-production-16afd.up.railway.app) */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

interface MotorBrainApiResponse {
  respuesta?: string;
  response?: string;
  error?: string;
}

// =============================================================================
// Motor Brain Handler Implementation
// =============================================================================

export class MotorBrainHandler implements MessageHandler {
  private readonly config: Required<MotorBrainConfig>;

  constructor(config: MotorBrainConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      apiKey: config.apiKey,
      timeout: config.timeout ?? 30000,
    };

    logger.info({ baseUrl: this.config.baseUrl }, 'Motor Brain handler initialized');
  }

  /**
   * Process a message through Motor Brain (MessageHandler interface)
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
    logger.debug(
      { conversationId: context.conversationId, messageLength: message.length },
      'Sending message to Motor Brain'
    );

    const response = await this.sendToMotorBrain(message);
    return { response, complete: true };
  }

  /**
   * Motor Brain does not support tool calls — no-op continuation
   */
  async continueWithToolResults(): Promise<{
    response: string;
    toolCalls?: ToolCallRequest[];
    complete: boolean;
  }> {
    return { response: '', complete: true };
  }

  /**
   * Send a message directly to Motor Brain's /consulta endpoint.
   * This is the primary method used by the command router.
   */
  async sendToMotorBrain(message: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await fetch(`${this.config.baseUrl}/consulta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje: message,
          api_key: this.config.apiKey,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Motor Brain API error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as MotorBrainApiResponse;

      if (data.error) {
        throw new Error(`Motor Brain error: ${data.error}`);
      }

      // Handle both response field names
      const reply = data.respuesta ?? data.response;
      if (!reply) {
        throw new Error('Motor Brain returned empty response');
      }

      logger.debug({ responseLength: reply.length }, 'Motor Brain response received');
      return reply;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Motor Brain request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createMotorBrainHandler(config: MotorBrainConfig): MotorBrainHandler {
  return new MotorBrainHandler(config);
}
