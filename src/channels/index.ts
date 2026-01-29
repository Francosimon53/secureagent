export { BaseChannel, type Message, type SendOptions } from './base.js';

// WhatsApp
export { WhatsAppChannel, type WhatsAppConfig } from './whatsapp/index.js';

// Telegram
export { TelegramChannel, parseCommand, type TelegramConfig, type ParsedCommand } from './telegram/index.js';

// Discord
export {
  DiscordChannel,
  GatewayIntents,
  InteractionType,
  InteractionResponseType,
  ComponentType,
  ButtonStyle,
  type DiscordConfig,
  type DiscordUser,
  type DiscordMessage,
  type DiscordEmbed,
  type DiscordComponent,
  type DiscordInteraction,
  type DiscordChannelInfo,
} from './discord/index.js';

// Slack
export {
  SlackChannel,
  type SlackConfig,
  type SlackUser,
  type SlackChannelInfo,
  type SlackMessage,
  type SlackBlock,
  type SlackBlockElement,
  type SlackTextObject,
  type SlackAttachment,
  type SlackView,
  type SlackAction,
  type SlackEvent,
  type SlackEventPayload,
  type SlackInteractionPayload,
  type SlackSlashCommand,
} from './slack/index.js';

// Signal
export {
  SignalChannel,
  type SignalConfig,
  type SignalEnvelope,
  type SignalDataMessage,
  type SignalAttachment,
  type SignalReaction,
  type SignalGroupInfo,
} from './signal/index.js';

// iMessage (macOS only)
export {
  IMessageChannel,
  TapbackType,
  TapbackEmoji,
  type IMessageConfig,
  type IMessageRecord,
  type IMessageHandle,
  type IMessageChat,
  type IMessageAttachment,
  type ParsedMessage as IMessageParsedMessage,
} from './imessage/index.js';
