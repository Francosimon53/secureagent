/**
 * Voice Calls Integration Module
 *
 * Provides phone call and SMS functionality including:
 * - Twilio phone calls and SMS
 * - AI-powered voice conversations
 * - Voice cloning with ElevenLabs
 * - Conference calls, call recording, transfer
 * - IVR menus and call routing
 */

// Types
export type {
  CallStatus,
  CallDirection,
  Call,
  Message,
  PhoneNumber,
  Contact,
  CallHandlingRule,
  CallCondition,
  CallAction,
  VoiceSettings,
  VoiceClone,
  Voice,
  Conference,
  ConferenceParticipant,
  IVRMenu,
  IVROption,
  TranscriptionEvent,
  ConversationState,
  TwilioWebhookEvent,
} from './types.js';

// Configuration
export {
  TwilioConfigSchema,
  ElevenLabsConfigSchema,
  STTConfigSchema,
  VoiceSettingsSchema,
  VoiceCallsConfigSchema,
  defaultVoiceCallsConfig,
} from './config.js';

export type {
  TwilioConfig,
  ElevenLabsConfig,
  STTConfig,
  VoiceCallsConfig,
} from './config.js';

// Integrations
export { TwilioIntegration } from './twilio.js';
export { VoiceAI } from './voice-ai.js';
export { CallFeatures } from './call-features.js';
export { VoiceCloneService } from './voice-clone.js';

// Manager
export { VoiceCallsManager } from './manager.js';

// Tools
export {
  createVoiceCallTools,
  executeVoiceCallTool,
} from './tools.js';

export type {
  ToolDefinition,
  ToolResult,
} from './tools.js';
