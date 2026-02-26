/**
 * Telegram Command Router
 *
 * Routes ABA-specific commands (/aba, /nota, /soap) to the Motor Brain backend
 * and passes all other messages through to the default agent handler (Claude).
 */

import type { Message } from '../base.js';
import { MotorBrainHandler } from '../../agent/handlers/motorbrain-handler.js';
import { getLogger } from '../../observability/logger.js';

const logger = getLogger().child({ module: 'CommandRouter' });

// =============================================================================
// Constants
// =============================================================================

const SOAP_PREFIX =
  'Generate a SOAP note for this ABA therapy session. Format with Subjective, Objective, Assessment, Plan sections. Session details: ';

const HELP_TEXT = [
  '\u{1F9E0} *Motor Brain - ABA Clinical Assistant*',
  '',
  '*Commands:*',
  '/aba <question> - Ask the ABA clinical AI',
  '/nota <session details> - Generate a SOAP session note',
  '/soap <session details> - Same as /nota',
  '/help - Show this message',
  '',
  '*Examples:*',
  '/aba what is manding in ABA?',
  '/nota DTT session with Juan, worked on manding, 15/20 correct trials',
  '/soap Parent training with Maria\'s mom, reviewed reinforcement strategies',
  '',
  'Any message without a command goes to the general AI assistant.',
].join('\n');

// =============================================================================
// Types
// =============================================================================

export interface CommandRouterConfig {
  /** Motor Brain backend URL */
  motorBrainUrl: string;
  /** Motor Brain request timeout in ms */
  motorBrainTimeout?: number;
  /** Bot username (for group chat command filtering) */
  botUsername?: string;
}

type SendFn = (chatId: string, content: string, options?: Record<string, unknown>) => Promise<void>;
type SendActionFn = (chatId: string, action: string) => Promise<void>;
type DefaultHandler = (message: Message) => Promise<void>;

// =============================================================================
// Command Router Implementation
// =============================================================================

export class CommandRouter {
  private readonly motorBrain: MotorBrainHandler;
  private readonly botUsername?: string;

  constructor(config: CommandRouterConfig) {
    this.motorBrain = new MotorBrainHandler({
      baseUrl: config.motorBrainUrl,
      timeout: config.motorBrainTimeout,
    });
    this.botUsername = config.botUsername;

    logger.info('Command router initialized');
  }

  /**
   * Create a message handler that routes commands to the appropriate backend.
   *
   * @param send        - Send a text message to a chat (telegram.send.bind(telegram))
   * @param sendAction  - Send a chat action like "typing" (telegram.sendChatAction.bind(telegram))
   * @param defaultHandler - Fallback handler for non-ABA messages (routes to Claude agent)
   */
  createHandler(
    send: SendFn,
    sendAction: SendActionFn,
    defaultHandler: DefaultHandler
  ): (message: Message) => Promise<void> {
    return async (message: Message) => {
      const parsed = this.parseCommand(message.content);

      if (!parsed) {
        await defaultHandler(message);
        return;
      }

      switch (parsed.command) {
        case 'help':
        case 'start':
          await send(message.channelId, HELP_TEXT, { parseMode: 'Markdown' });
          return;

        case 'aba': {
          if (!parsed.args) {
            await send(message.channelId, 'Usage: /aba <your ABA question>');
            return;
          }
          await this.handleMotorBrain(message.channelId, parsed.args, send, sendAction);
          return;
        }

        case 'nota':
        case 'soap': {
          if (!parsed.args) {
            await send(message.channelId, 'Usage: /nota <session details>');
            return;
          }
          await this.handleMotorBrain(
            message.channelId,
            SOAP_PREFIX + parsed.args,
            send,
            sendAction
          );
          return;
        }

        default:
          // Unknown command — pass through to default handler (Claude)
          await defaultHandler(message);
          return;
      }
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Parse a command from message text.
   * Supports multi-line messages (unlike the base parseCommand which uses .*$).
   * Only returns a result for commands we explicitly handle; unknown commands
   * return null so they fall through to the default handler.
   */
  private parseCommand(text: string): { command: string; args: string } | null {
    const match = text.match(/^\/([a-zA-Z0-9_]+)(?:@([a-zA-Z0-9_]+))?\s*([\s\S]*)/);
    if (!match) return null;

    const [, command, mentionedBot, args = ''] = match;

    // If addressed to a different bot, ignore
    if (
      mentionedBot &&
      this.botUsername &&
      mentionedBot.toLowerCase() !== this.botUsername.toLowerCase()
    ) {
      return null;
    }

    // Only handle commands we know about; let everything else fall through
    const handledCommands = ['aba', 'nota', 'soap', 'help', 'start'];
    if (!handledCommands.includes(command)) {
      return null;
    }

    return { command, args: args.trim() };
  }

  private async handleMotorBrain(
    chatId: string,
    message: string,
    send: SendFn,
    sendAction: SendActionFn
  ): Promise<void> {
    try {
      await sendAction(chatId, 'typing');
      const response = await this.motorBrain.analyze(message);
      await send(chatId, response);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg, chatId }, 'Motor Brain request failed');
      await send(
        chatId,
        `ABA Assistant error: ${errorMsg}\n\nPlease try again or send a regular message for the general assistant.`
      );
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createCommandRouter(config: CommandRouterConfig): CommandRouter {
  return new CommandRouter(config);
}
