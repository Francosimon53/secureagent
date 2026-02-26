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
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

interface DomainPrediction {
  domain: string;
  name: string;
  confidence: number;
}

interface ABCComponent {
  detected: boolean;
  pattern_matches: number;
}

interface AnalyzeResponse {
  classification: {
    predictions: DomainPrediction[];
    time_ms: number;
  };
  abc_analysis: {
    antecedent: ABCComponent;
    behavior: ABCComponent;
    consequence: ABCComponent;
    complete_chain: boolean;
    components_found: number;
  };
  key_concepts: string[];
  suggested_tasks: string[];
}

// =============================================================================
// Motor Brain Handler Implementation
// =============================================================================

export class MotorBrainHandler implements MessageHandler {
  private readonly config: { baseUrl: string; timeout: number };

  constructor(config: MotorBrainConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ''),
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

    const response = await this.analyze(message);
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
   * Send a message to the /analyze endpoint and return formatted text.
   * This is the primary method used by the command router.
   */
  async analyze(text: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const res = await fetch(`${this.config.baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Motor Brain API error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as AnalyzeResponse;

      logger.debug(
        { domains: data.classification.predictions.length, timeMs: data.classification.time_ms },
        'Motor Brain analyze response received'
      );

      return this.formatAnalyzeResponse(data);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error(`Motor Brain request timed out after ${this.config.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private formatAnalyzeResponse(data: AnalyzeResponse): string {
    const lines: string[] = [];

    // Domain classification
    const top = data.classification.predictions[0];
    if (top) {
      lines.push(`BCBA Domain: ${top.domain} - ${top.name} (${(top.confidence * 100).toFixed(0)}%)`);

      const others = data.classification.predictions.slice(1);
      if (others.length > 0) {
        const otherStr = others
          .map(p => `${p.domain} ${(p.confidence * 100).toFixed(0)}%`)
          .join(', ');
        lines.push(`Related: ${otherStr}`);
      }
    }

    // ABC analysis
    const abc = data.abc_analysis;
    const detected: string[] = [];
    if (abc.antecedent.detected) detected.push('Antecedent');
    if (abc.behavior.detected) detected.push('Behavior');
    if (abc.consequence.detected) detected.push('Consequence');
    if (detected.length > 0) {
      lines.push('');
      lines.push(`ABC Components: ${detected.join(', ')}${abc.complete_chain ? ' (complete chain)' : ''}`);
    }

    // Key concepts
    if (data.key_concepts.length > 0) {
      lines.push('');
      lines.push(`Key Concepts: ${data.key_concepts.join(', ')}`);
    }

    // Suggested study tasks
    if (data.suggested_tasks.length > 0) {
      lines.push('');
      lines.push('Suggested Tasks:');
      for (const task of data.suggested_tasks) {
        lines.push(`  - ${task}`);
      }
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createMotorBrainHandler(config: MotorBrainConfig): MotorBrainHandler {
  return new MotorBrainHandler(config);
}
