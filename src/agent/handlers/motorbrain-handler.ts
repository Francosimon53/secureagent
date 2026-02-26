/**
 * Motor Brain ABA Clinical Handler
 *
 * HTTP client for the Motor Brain hybrid RAG backend on Railway.
 * Calls POST /consulta with VLayer PHI sanitization.
 */

import type { MessageHandler } from '../agent.js';
import type { ConversationMessage, ToolCallRequest } from '../types.js';
import { getLogger } from '../../observability/logger.js';

const logger = getLogger().child({ module: 'MotorBrainHandler' });

// =============================================================================
// Types
// =============================================================================

export interface MotorBrainConfig {
  /** Motor Brain backend URL (e.g. https://abasensei-motor-brain-production.up.railway.app) */
  baseUrl: string;
  /** Tenant API key (X-API-Key header) */
  apiKey: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

interface ConsultaResponse {
  respuesta: string;
  fuentes_utilizadas: number;
  sanitizado: boolean;
  phi_detectado: boolean;
  phi_items_removidos: number;
  phi_categorias: string[];
  session_id?: string;
  procesado_en_ms: number;
  timestamp: string;
}

// =============================================================================
// Motor Brain Handler Implementation
// =============================================================================

export class MotorBrainHandler implements MessageHandler {
  private readonly config: { baseUrl: string; apiKey: string; timeout: number };

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

    const response = await this.consulta(message);
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
   * Send a clinical query to Motor Brain's /consulta endpoint.
   * Pipeline: VLayer PHI sanitization → FAISS RAG → OpenAI → response.
   */
  async consulta(texto: string, contexto?: string): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const body: Record<string, string> = { texto };
      if (contexto) {
        body.contexto = contexto;
      }

      const res = await fetch(`${this.config.baseUrl}/consulta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        throw new Error(`Motor Brain API error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as ConsultaResponse;

      logger.debug(
        {
          sessionId: data.session_id,
          timeMs: data.procesado_en_ms,
          phiDetected: data.phi_detectado,
          phiRemoved: data.phi_items_removidos,
          sources: data.fuentes_utilizadas,
        },
        'Motor Brain consulta response received'
      );

      return data.respuesta;
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
