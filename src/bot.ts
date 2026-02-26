/**
 * SecureAgent Telegram Bot
 *
 * Entry point that wires up:
 * - TelegramChannel (polling)
 * - CommandRouter (/aba, /nota, /soap → Motor Brain)
 * - Agent + AnthropicHandler (everything else → Claude)
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN    - Telegram bot token from @BotFather
 *   MOTOR_BRAIN_API_KEY   - Motor Brain tenant API key (ask_...)
 *   ANTHROPIC_API_KEY     - Anthropic API key for Claude fallback
 *
 * Optional env vars:
 *   MOTOR_BRAIN_URL       - Motor Brain backend URL (default: https://abasensei-motor-brain-production.up.railway.app)
 *   MOTOR_BRAIN_TIMEOUT   - Request timeout in ms (default: 45000)
 *
 * Usage:
 *   node dist/bot.js
 */

import { TelegramChannel } from './channels/telegram/index.js';
import { CommandRouter } from './channels/telegram/command-router.js';
import { Agent } from './agent/agent.js';
import { AnthropicHandler } from './agent/handlers/anthropic-handler.js';
import { getLogger } from './observability/logger.js';

const logger = getLogger().child({ module: 'Bot' });

// =============================================================================
// Config
// =============================================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MOTOR_BRAIN_API_KEY = process.env.MOTOR_BRAIN_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MOTOR_BRAIN_URL =
  process.env.MOTOR_BRAIN_URL ?? 'https://abasensei-motor-brain-production.up.railway.app';
const MOTOR_BRAIN_TIMEOUT = Number(process.env.MOTOR_BRAIN_TIMEOUT) || 45000;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// =============================================================================
// Boot
// =============================================================================

async function main() {
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN', TELEGRAM_BOT_TOKEN);
  const motorBrainApiKey = requireEnv('MOTOR_BRAIN_API_KEY', MOTOR_BRAIN_API_KEY);
  requireEnv('ANTHROPIC_API_KEY', ANTHROPIC_API_KEY);

  // 1. Telegram channel (polling mode)
  const telegram = new TelegramChannel({
    botToken,
    polling: { enabled: true, timeout: 30 },
  });

  // 2. Claude agent (fallback for non-ABA messages)
  const agent = new Agent(
    {
      id: 'secureagent-telegram',
      name: 'SecureAgent',
      systemPrompt:
        'You are a helpful AI assistant. You can answer general questions. ' +
        'For ABA-specific clinical questions, suggest the user try /aba, /nota, or /soap commands.',
    },
    {
      messageHandler: new AnthropicHandler({
        model: 'claude-sonnet-4-20250514',
        maxTokens: 2048,
        temperature: 0.7,
      }),
    }
  );

  // 3. Command router (ABA commands → Motor Brain, rest → Claude)
  const router = new CommandRouter({
    motorBrainUrl: MOTOR_BRAIN_URL,
    motorBrainApiKey: motorBrainApiKey,
    motorBrainTimeout: MOTOR_BRAIN_TIMEOUT,
  });

  // 4. Wire message handler
  telegram.onMessage(
    router.createHandler(
      telegram.send.bind(telegram),
      telegram.sendChatAction.bind(telegram) as (chatId: string, action: string) => Promise<void>,
      async (msg) => {
        try {
          await telegram.sendChatAction(msg.channelId, 'typing');
          const response = await agent.processMessage(msg.content, {
            userId: msg.senderId,
            sessionId: msg.id,
            channel: { id: msg.channelId, type: 'telegram' },
          });
          await telegram.send(msg.channelId, response.message);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.error({ error: errorMsg, chatId: msg.channelId }, 'Claude agent error');
          await telegram.send(msg.channelId, 'Sorry, something went wrong. Please try again.');
        }
      }
    )
  );

  // 5. Connect and register bot commands with Telegram
  await telegram.connect();

  const botInfo = telegram.getBotInfo();
  logger.info(
    {
      botUsername: botInfo?.username,
      motorBrainUrl: MOTOR_BRAIN_URL,
    },
    'Bot started'
  );

  await telegram.setCommands([
    { command: 'aba', description: 'Ask the ABA clinical AI assistant' },
    { command: 'nota', description: 'Generate a SOAP session note' },
    { command: 'soap', description: 'Generate a SOAP session note (alias)' },
    { command: 'help', description: 'Show available commands' },
  ]);

  console.log(`Bot @${botInfo?.username} is running. Press Ctrl+C to stop.`);

  // 6. Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await telegram.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
