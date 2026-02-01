/**
 * Voice Calls Integration - Configuration
 */

import { z } from 'zod';

// Twilio config
export const TwilioConfigSchema = z.object({
  accountSid: z.string(),
  authToken: z.string(),
  phoneNumber: z.string().optional(), // Default outbound number
  twimlAppSid: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
});

export type TwilioConfig = z.infer<typeof TwilioConfigSchema>;

// ElevenLabs config for TTS and voice cloning
export const ElevenLabsConfigSchema = z.object({
  apiKey: z.string(),
  defaultVoiceId: z.string().default('21m00Tcm4TlvDq8ikWAM'), // Rachel
  modelId: z.string().default('eleven_monolingual_v1'),
});

export type ElevenLabsConfig = z.infer<typeof ElevenLabsConfigSchema>;

// Speech-to-text config
export const STTConfigSchema = z.object({
  provider: z.enum(['twilio', 'google', 'deepgram', 'whisper']).default('twilio'),
  language: z.string().default('en-US'),
  model: z.string().optional(),
  apiKey: z.string().optional(), // For non-Twilio providers
});

export type STTConfig = z.infer<typeof STTConfigSchema>;

// Voice settings schema
export const VoiceSettingsSchema = z.object({
  defaultVoiceId: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  useVoiceClone: z.boolean().default(false),
  voiceCloneId: z.string().optional(),
  speakingRate: z.number().min(0.5).max(2.0).default(1.0),
  greeting: z.string().default('Hello, this is SecureAgent speaking. How can I help you?'),
  voicemailGreeting: z.string().default(
    "Hi, I'm not available right now. Please leave a message after the tone and I'll get back to you soon."
  ),
  callScreening: z.boolean().default(false),
  autoAnswer: z.boolean().default(false),
  autoAnswerDelay: z.number().min(0).max(30).default(5),
  recordAllCalls: z.boolean().default(false),
  transcribeVoicemails: z.boolean().default(true),
});

// Main voice calls config
export const VoiceCallsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  twilio: TwilioConfigSchema.optional(),
  elevenLabs: ElevenLabsConfigSchema.optional(),
  stt: STTConfigSchema.optional(),
  voiceSettings: VoiceSettingsSchema.default({}),

  // Webhook URLs (set by the system)
  webhookBaseUrl: z.string().optional(),

  // AI settings
  aiSystemPrompt: z.string().default(`You are a helpful AI assistant handling a phone call.
Be concise and natural in your responses.
If you need to perform an action, explain what you're doing.
If you can't help with something, politely explain and offer alternatives.`),

  maxCallDuration: z.number().default(1800), // 30 minutes
  silenceTimeout: z.number().default(10), // 10 seconds
});

export type VoiceCallsConfig = z.infer<typeof VoiceCallsConfigSchema>;

// Default config
export const defaultVoiceCallsConfig: VoiceCallsConfig = {
  enabled: true,
  voiceSettings: {
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
    useVoiceClone: false,
    speakingRate: 1.0,
    greeting: 'Hello, this is SecureAgent speaking. How can I help you?',
    voicemailGreeting:
      "Hi, I'm not available right now. Please leave a message after the tone and I'll get back to you soon.",
    callScreening: false,
    autoAnswer: false,
    autoAnswerDelay: 5,
    recordAllCalls: false,
    transcribeVoicemails: true,
  },
  aiSystemPrompt: `You are a helpful AI assistant handling a phone call.
Be concise and natural in your responses.
If you need to perform an action, explain what you're doing.
If you can't help with something, politely explain and offer alternatives.`,
  maxCallDuration: 1800,
  silenceTimeout: 10,
};
