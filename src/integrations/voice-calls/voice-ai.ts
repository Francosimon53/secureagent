/**
 * AI Voice Conversation
 *
 * Real-time speech-to-text, AI processing, and text-to-speech
 * for natural phone conversations.
 */

import type {
  ConversationState,
  TranscriptionEvent,
  VoiceSettings,
} from './types.js';
import type { ElevenLabsConfig, VoiceCallsConfig } from './config.js';

// ElevenLabs TTS response
interface ElevenLabsStreamChunk {
  audio: string; // Base64 encoded audio
  isFinal: boolean;
  normalizedAlignment?: {
    char_start_times_ms: number[];
    chars_durations_ms: number[];
  };
}

// AI response handler
type AIResponseHandler = (
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  context: Record<string, unknown>
) => Promise<string>;

export class VoiceAI {
  private config: VoiceCallsConfig;
  private elevenLabsConfig?: ElevenLabsConfig;
  private conversations: Map<string, ConversationState> = new Map();
  private aiHandler?: AIResponseHandler;
  private voiceSettings: VoiceSettings;

  constructor(config: VoiceCallsConfig) {
    this.config = config;
    this.elevenLabsConfig = config.elevenLabs;
    this.voiceSettings = config.voiceSettings as VoiceSettings;
  }

  /**
   * Set the AI response handler
   */
  setAIHandler(handler: AIResponseHandler): void {
    this.aiHandler = handler;
  }

  /**
   * Start a new conversation
   */
  startConversation(callSid: string, context?: Record<string, unknown>): ConversationState {
    const state: ConversationState = {
      callSid,
      messages: [
        {
          role: 'system',
          content: this.config.aiSystemPrompt,
          timestamp: Date.now(),
        },
      ],
      context: context || {},
      taskCompleted: false,
    };

    this.conversations.set(callSid, state);
    return state;
  }

  /**
   * Get conversation state
   */
  getConversation(callSid: string): ConversationState | undefined {
    return this.conversations.get(callSid);
  }

  /**
   * Process transcribed speech and generate AI response
   */
  async processUserSpeech(
    callSid: string,
    text: string
  ): Promise<{
    response: string;
    shouldEndCall: boolean;
    actions?: Array<{ type: string; params: Record<string, unknown> }>;
  }> {
    const conversation = this.conversations.get(callSid);
    if (!conversation) {
      throw new Error(`No conversation found for call ${callSid}`);
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    });

    // Detect intent and entities
    const { intent, entities } = this.extractIntentAndEntities(text);
    conversation.intent = intent;
    conversation.entities = { ...conversation.entities, ...entities };

    // Generate AI response
    let response: string;
    let shouldEndCall = false;
    const actions: Array<{ type: string; params: Record<string, unknown> }> = [];

    if (this.aiHandler) {
      response = await this.aiHandler(conversation.messages, conversation.context);
    } else {
      // Default responses based on intent
      response = this.generateDefaultResponse(intent, entities, conversation.context);
    }

    // Check for end-of-call indicators
    if (this.shouldEndCall(text, response)) {
      shouldEndCall = true;
      conversation.taskCompleted = true;
    }

    // Add assistant response
    conversation.messages.push({
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
    });

    return { response, shouldEndCall, actions };
  }

  /**
   * Extract intent and entities from user speech
   */
  private extractIntentAndEntities(text: string): {
    intent?: string;
    entities: Record<string, string>;
  } {
    const normalized = text.toLowerCase();
    const entities: Record<string, string> = {};
    let intent: string | undefined;

    // Schedule/appointment intent
    if (normalized.includes('appointment') || normalized.includes('schedule') ||
        normalized.includes('book') || normalized.includes('reservation')) {
      intent = 'schedule_appointment';

      // Extract date/time
      const timeMatch = normalized.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (timeMatch) entities.time = timeMatch[1];

      const dateMatch = normalized.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week)/i);
      if (dateMatch) entities.date = dateMatch[1];
    }

    // Message/voicemail intent
    if (normalized.includes('message') || normalized.includes('tell them') ||
        normalized.includes('let them know')) {
      intent = 'leave_message';

      // Extract the message content
      const messageMatch = text.match(/(?:message|tell them|let them know)\s+(?:that\s+)?(.+)/i);
      if (messageMatch) entities.message = messageMatch[1];
    }

    // Greeting
    if (normalized.match(/^(hi|hello|hey|good morning|good afternoon)/)) {
      intent = 'greeting';
    }

    // Goodbye
    if (normalized.match(/(goodbye|bye|thank you|thanks|that's all)/)) {
      intent = 'goodbye';
    }

    // Question
    if (normalized.includes('?') || normalized.match(/^(what|when|where|how|why|who|is|are|do|does|can)/)) {
      intent = intent || 'question';
    }

    return { intent, entities };
  }

  /**
   * Generate default response based on intent
   */
  private generateDefaultResponse(
    intent: string | undefined,
    entities: Record<string, string>,
    context: Record<string, unknown>
  ): string {
    switch (intent) {
      case 'greeting':
        return this.voiceSettings.greeting;

      case 'goodbye':
        return "Thank you for calling. Have a great day! Goodbye.";

      case 'schedule_appointment':
        if (entities.date && entities.time) {
          return `I'd be happy to schedule that for ${entities.date} at ${entities.time}. Let me confirm that for you.`;
        }
        return "I can help you schedule an appointment. What date and time works best for you?";

      case 'leave_message':
        if (entities.message) {
          return `I'll make sure to pass along your message: "${entities.message}". Is there anything else?`;
        }
        return "Of course, what message would you like me to relay?";

      case 'question':
        return "That's a great question. Let me look into that for you.";

      default:
        return "I understand. How can I help you with that?";
    }
  }

  /**
   * Check if the call should end
   */
  private shouldEndCall(userText: string, aiResponse: string): boolean {
    const userLower = userText.toLowerCase();
    const aiLower = aiResponse.toLowerCase();

    // User explicitly ending
    if (userLower.match(/(goodbye|bye|hang up|that's all|no thanks|nothing else)/)) {
      return true;
    }

    // AI indicating end
    if (aiLower.includes('goodbye') || aiLower.includes('have a great day')) {
      return true;
    }

    return false;
  }

  /**
   * Generate speech audio from text using ElevenLabs
   */
  async textToSpeech(
    text: string,
    voiceId?: string
  ): Promise<Buffer> {
    if (!this.elevenLabsConfig) {
      throw new Error('ElevenLabs not configured');
    }

    const voice = voiceId ||
      (this.voiceSettings.useVoiceClone && this.voiceSettings.voiceCloneId) ||
      this.voiceSettings.defaultVoiceId;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsConfig.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.elevenLabsConfig.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Stream text-to-speech for lower latency
   */
  async *streamTextToSpeech(
    text: string,
    voiceId?: string
  ): AsyncGenerator<Buffer> {
    if (!this.elevenLabsConfig) {
      throw new Error('ElevenLabs not configured');
    }

    const voice = voiceId ||
      (this.voiceSettings.useVoiceClone && this.voiceSettings.voiceCloneId) ||
      this.voiceSettings.defaultVoiceId;

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.elevenLabsConfig.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.elevenLabsConfig.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs streaming error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }

  /**
   * Handle real-time transcription from Twilio Media Streams
   */
  processMediaStreamMessage(
    callSid: string,
    message: {
      event: string;
      media?: {
        payload: string; // Base64 audio
        timestamp: string;
      };
      streamSid?: string;
    }
  ): TranscriptionEvent | null {
    // This would integrate with a real-time STT service
    // For Twilio, you'd use <Gather> with speech recognition
    // or stream to a service like Deepgram/Google Speech

    if (message.event === 'media' && message.media) {
      // Process audio chunk for transcription
      // In production, this would send to an STT service
      return null;
    }

    return null;
  }

  /**
   * Generate TwiML for AI conversation flow
   */
  generateConversationTwiML(options: {
    callSid: string;
    prompt?: string;
    webhookUrl: string;
    timeout?: number;
  }): string {
    const timeout = options.timeout || this.config.silenceTimeout;

    // Start conversation if new
    if (!this.conversations.has(options.callSid)) {
      this.startConversation(options.callSid);
    }

    const greeting = options.prompt || this.voiceSettings.greeting;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${this.escapeXml(greeting)}</Say>
  <Gather input="speech" action="${options.webhookUrl}/speech" method="POST"
          speechTimeout="${timeout}" language="en-US">
  </Gather>
  <Say voice="Polly.Amy">I didn't catch that. Could you please repeat?</Say>
  <Redirect>${options.webhookUrl}/retry</Redirect>
</Response>`;
  }

  /**
   * Generate TwiML response with AI reply
   */
  generateResponseTwiML(options: {
    response: string;
    webhookUrl: string;
    shouldEndCall?: boolean;
    timeout?: number;
  }): string {
    const timeout = options.timeout || this.config.silenceTimeout;

    if (options.shouldEndCall) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${this.escapeXml(options.response)}</Say>
  <Hangup />
</Response>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${this.escapeXml(options.response)}</Say>
  <Gather input="speech" action="${options.webhookUrl}/speech" method="POST"
          speechTimeout="${timeout}" language="en-US">
  </Gather>
  <Say voice="Polly.Amy">Are you still there?</Say>
  <Redirect>${options.webhookUrl}/retry</Redirect>
</Response>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * End conversation
   */
  endConversation(callSid: string): ConversationState | undefined {
    const conversation = this.conversations.get(callSid);
    if (conversation) {
      conversation.taskCompleted = true;
      this.conversations.delete(callSid);
    }
    return conversation;
  }

  /**
   * Get all active conversations
   */
  getActiveConversations(): ConversationState[] {
    return Array.from(this.conversations.values());
  }
}
