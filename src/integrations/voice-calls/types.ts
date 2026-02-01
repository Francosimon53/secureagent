/**
 * Voice Calls Integration - Shared Types
 */

// Call status
export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'busy'
  | 'failed'
  | 'no-answer'
  | 'canceled';

export type CallDirection = 'inbound' | 'outbound';

// Call record
export interface Call {
  id: string;
  sid: string; // Twilio call SID
  direction: CallDirection;
  status: CallStatus;
  from: string;
  to: string;
  startTime: number;
  endTime?: number;
  duration?: number; // seconds
  recordingUrl?: string;
  transcription?: string;
  voicemailUrl?: string;
  voicemailTranscription?: string;
  aiHandled: boolean;
  notes?: string;
  metadata?: Record<string, unknown>;
}

// SMS/Message
export interface Message {
  id: string;
  sid: string;
  direction: CallDirection;
  from: string;
  to: string;
  body: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  timestamp: number;
  mediaUrls?: string[];
}

// Phone number
export interface PhoneNumber {
  id: string;
  number: string; // E.164 format
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  voiceUrl?: string;
  smsUrl?: string;
}

// Contact
export interface Contact {
  id: string;
  name: string;
  phoneNumbers: Array<{
    type: 'mobile' | 'home' | 'work' | 'other';
    number: string;
  }>;
  email?: string;
  notes?: string;
  tags?: string[];
}

// Call handling rules
export interface CallHandlingRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: CallCondition[];
  actions: CallAction[];
}

export interface CallCondition {
  type: 'caller_id' | 'time_of_day' | 'day_of_week' | 'contact_tag';
  operator: 'equals' | 'contains' | 'starts_with' | 'in_range' | 'in_list';
  value: string | string[] | { start: string; end: string };
}

export interface CallAction {
  type:
    | 'answer_ai'
    | 'forward'
    | 'voicemail'
    | 'reject'
    | 'play_message'
    | 'sms_response'
    | 'conference';
  params?: Record<string, unknown>;
}

// Voice settings
export interface VoiceSettings {
  defaultVoiceId: string;
  useVoiceClone: boolean;
  voiceCloneId?: string;
  speakingRate: number; // 0.5 - 2.0
  greeting: string;
  voicemailGreeting: string;
  callScreening: boolean;
  autoAnswer: boolean;
  autoAnswerDelay: number; // seconds
  recordAllCalls: boolean;
  transcribeVoicemails: boolean;
}

// Voice clone
export interface VoiceClone {
  id: string;
  name: string;
  elevenLabsVoiceId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  sampleCount: number;
  createdAt: number;
  consentVerified: boolean;
}

// TTS Voice option
export interface Voice {
  id: string;
  name: string;
  provider: 'elevenlabs' | 'twilio' | 'google' | 'amazon';
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  preview_url?: string;
}

// Conference
export interface Conference {
  id: string;
  sid: string;
  name: string;
  status: 'init' | 'in-progress' | 'completed';
  participants: ConferenceParticipant[];
  startTime: number;
  endTime?: number;
  recordingUrl?: string;
}

export interface ConferenceParticipant {
  callSid: string;
  phoneNumber: string;
  name?: string;
  muted: boolean;
  hold: boolean;
  joinedAt: number;
}

// IVR Menu
export interface IVRMenu {
  id: string;
  name: string;
  greeting: string;
  options: IVROption[];
  timeout: number;
  maxRetries: number;
  invalidInputMessage: string;
  timeoutMessage: string;
}

export interface IVROption {
  digit: string; // '1', '2', etc. or '*', '#'
  description: string;
  action: CallAction;
}

// Real-time transcription
export interface TranscriptionEvent {
  type: 'partial' | 'final';
  text: string;
  confidence: number;
  timestamp: number;
  speaker?: 'caller' | 'agent';
}

// AI conversation state
export interface ConversationState {
  callSid: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
  }>;
  context: Record<string, unknown>;
  intent?: string;
  entities?: Record<string, string>;
  taskCompleted: boolean;
}

// Webhook events
export interface TwilioWebhookEvent {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: CallStatus;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  ApiVersion: string;
  Timestamp?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  TranscriptionText?: string;
  Digits?: string;
  SpeechResult?: string;
}
