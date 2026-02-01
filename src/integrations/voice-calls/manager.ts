/**
 * Voice Calls Manager
 *
 * Unified interface for all voice call functionality.
 */

import type {
  Call,
  Message,
  Contact,
  CallHandlingRule,
  VoiceSettings,
  VoiceClone,
  Conference,
  IVRMenu,
  TwilioWebhookEvent,
} from './types.js';
import type { VoiceCallsConfig } from './config.js';
import { TwilioIntegration } from './twilio.js';
import { VoiceAI } from './voice-ai.js';
import { CallFeatures } from './call-features.js';
import { VoiceCloneService } from './voice-clone.js';

type CallEventHandler = (call: Call) => void;
type MessageEventHandler = (message: Message) => void;

export class VoiceCallsManager {
  private config: VoiceCallsConfig;
  private twilio: TwilioIntegration | null = null;
  private voiceAI: VoiceAI;
  private callFeatures: CallFeatures | null = null;
  private voiceClone: VoiceCloneService | null = null;

  private contacts: Map<string, Contact> = new Map();
  private callRules: Map<string, CallHandlingRule> = new Map();

  private callEventHandlers: CallEventHandler[] = [];
  private messageEventHandlers: MessageEventHandler[] = [];

  constructor(config: VoiceCallsConfig) {
    this.config = config;
    this.voiceAI = new VoiceAI(config);

    if (config.twilio) {
      this.twilio = new TwilioIntegration(config.twilio);
      this.callFeatures = new CallFeatures(config.twilio);
    }

    if (config.elevenLabs) {
      this.voiceClone = new VoiceCloneService(config.elevenLabs);
    }
  }

  /**
   * Initialize the voice calls system
   */
  async initialize(): Promise<void> {
    // Load any saved state
    // Configure webhooks if base URL is set
    if (this.config.webhookBaseUrl && this.twilio) {
      await this.configureWebhooks();
    }
  }

  /**
   * Configure Twilio webhooks for phone numbers
   */
  private async configureWebhooks(): Promise<void> {
    if (!this.twilio || !this.config.webhookBaseUrl) return;

    const numbers = await this.twilio.getPhoneNumbers();
    const webhookUrl = this.config.webhookBaseUrl;

    for (const number of numbers) {
      await this.twilio.configurePhoneNumber(number.id, {
        voiceUrl: `${webhookUrl}/voice/incoming`,
        voiceMethod: 'POST',
        smsUrl: `${webhookUrl}/voice/sms`,
        smsMethod: 'POST',
        statusCallback: `${webhookUrl}/voice/status`,
      });
    }
  }

  // ==================== Outbound Calls ====================

  /**
   * Make an outbound call
   */
  async makeCall(options: {
    to: string;
    from?: string;
    useAI?: boolean;
    script?: string;
    context?: Record<string, unknown>;
    record?: boolean;
  }): Promise<Call> {
    if (!this.twilio) {
      throw new Error('Twilio not configured');
    }

    const webhookUrl = this.config.webhookBaseUrl || '';

    // If using AI, set up conversation
    if (options.useAI) {
      // Create call with AI conversation flow
      const call = await this.twilio.makeCall({
        to: options.to,
        from: options.from,
        url: `${webhookUrl}/voice/ai-outbound?script=${encodeURIComponent(options.script || '')}`,
        statusCallback: `${webhookUrl}/voice/status`,
        record: options.record,
      });

      // Initialize AI conversation
      this.voiceAI.startConversation(call.sid, options.context);
      call.aiHandled = true;

      return call;
    }

    // Regular call (rings through)
    return this.twilio.makeCall({
      to: options.to,
      from: options.from,
      twiml: this.twilio.generateAnswerTwiML({
        dial: {
          number: options.to,
          callerId: options.from || this.config.twilio?.phoneNumber,
          record: options.record,
        },
      }),
      statusCallback: `${webhookUrl}/voice/status`,
      record: options.record,
    });
  }

  /**
   * Make an AI-assisted call with a specific task
   */
  async makeAICall(options: {
    to: string;
    task: string;
    context?: Record<string, unknown>;
    voiceId?: string;
  }): Promise<Call> {
    // Build AI context from task
    const aiContext = {
      task: options.task,
      ...options.context,
    };

    // Generate appropriate script based on task
    const script = this.generateTaskScript(options.task, options.context || {});

    return this.makeCall({
      to: options.to,
      useAI: true,
      script,
      context: aiContext,
      record: true,
    });
  }

  /**
   * Generate script based on call task
   */
  private generateTaskScript(task: string, context: Record<string, unknown>): string {
    const taskLower = task.toLowerCase();

    // Appointment scheduling
    if (taskLower.includes('appointment') || taskLower.includes('schedule')) {
      const preferredTime = context.preferredTime || 'sometime this week';
      return `Hello, I'm calling on behalf of ${context.callerName || 'your patient'}. I'd like to schedule an appointment for ${preferredTime}. What times do you have available?`;
    }

    // Restaurant reservation
    if (taskLower.includes('reservation') || taskLower.includes('restaurant')) {
      const partySize = context.partySize || 2;
      const time = context.time || '7pm';
      const date = context.date || 'tonight';
      return `Hello, I'd like to make a reservation for ${partySize} people for ${date} at ${time}. Is that available?`;
    }

    // Birthday call
    if (taskLower.includes('birthday') || taskLower.includes('wish')) {
      const recipientName = context.recipientName || 'them';
      return `Hello ${recipientName}! I'm calling to wish you a very happy birthday! I hope you have a wonderful day filled with joy and celebration.`;
    }

    // General inquiry
    if (taskLower.includes('ask') || taskLower.includes('inquire')) {
      return `Hello, I'm calling to inquire about ${context.inquiry || 'your services'}. Could you help me with some information?`;
    }

    // Default
    return `Hello, I'm calling on behalf of ${context.callerName || 'someone'}. ${task}`;
  }

  // ==================== Inbound Call Handling ====================

  /**
   * Handle incoming call webhook
   */
  handleIncomingCall(event: TwilioWebhookEvent): string {
    if (!this.twilio) {
      return this.generateRejectTwiML();
    }

    // Process the call
    const call = this.twilio.processWebhookEvent(event);

    // Check call handling rules
    const rule = this.findMatchingRule(event);

    if (rule) {
      return this.executeCallRule(rule, event);
    }

    // Default behavior based on settings
    if (this.config.voiceSettings.autoAnswer) {
      // Answer with AI
      return this.voiceAI.generateConversationTwiML({
        callSid: event.CallSid,
        webhookUrl: this.config.webhookBaseUrl || '',
      });
    }

    if (this.config.voiceSettings.callScreening) {
      // Screen the call
      return this.generateScreeningTwiML(event);
    }

    // Let it ring through
    return this.generatePassthroughTwiML();
  }

  /**
   * Find matching call handling rule
   */
  private findMatchingRule(event: TwilioWebhookEvent): CallHandlingRule | null {
    const rules = Array.from(this.callRules.values())
      .filter((r) => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of rules) {
      if (this.evaluateConditions(rule.conditions, event)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Evaluate rule conditions
   */
  private evaluateConditions(
    conditions: CallHandlingRule['conditions'],
    event: TwilioWebhookEvent
  ): boolean {
    for (const condition of conditions) {
      let value: string;

      switch (condition.type) {
        case 'caller_id':
          value = event.From;
          break;
        case 'time_of_day':
          value = new Date().toTimeString().slice(0, 5);
          break;
        case 'day_of_week':
          value = new Date().getDay().toString();
          break;
        case 'contact_tag':
          const contact = this.findContactByNumber(event.From);
          value = contact?.tags?.join(',') || '';
          break;
        default:
          continue;
      }

      if (!this.evaluateCondition(condition, value)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    condition: CallHandlingRule['conditions'][0],
    value: string
  ): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return value.includes(condition.value as string);
      case 'starts_with':
        return value.startsWith(condition.value as string);
      case 'in_list':
        return (condition.value as string[]).includes(value);
      case 'in_range':
        const range = condition.value as { start: string; end: string };
        return value >= range.start && value <= range.end;
      default:
        return false;
    }
  }

  /**
   * Execute call handling rule
   */
  private executeCallRule(rule: CallHandlingRule, event: TwilioWebhookEvent): string {
    const webhookUrl = this.config.webhookBaseUrl || '';

    for (const action of rule.actions) {
      switch (action.type) {
        case 'answer_ai':
          return this.voiceAI.generateConversationTwiML({
            callSid: event.CallSid,
            webhookUrl,
          });

        case 'forward':
          return this.twilio!.generateAnswerTwiML({
            say: 'Please hold while I connect you.',
            dial: {
              number: action.params?.number as string,
              callerId: event.To,
            },
          });

        case 'voicemail':
          return this.twilio!.generateAnswerTwiML({
            say: this.config.voiceSettings.voicemailGreeting,
            record: {
              action: `${webhookUrl}/voice/voicemail`,
              maxLength: 120,
              transcribe: this.config.voiceSettings.transcribeVoicemails,
              transcribeCallback: `${webhookUrl}/voice/transcription`,
            },
          });

        case 'reject':
          return this.generateRejectTwiML(action.params?.message as string);

        case 'play_message':
          return this.twilio!.generateAnswerTwiML({
            say: action.params?.message as string,
            hangup: true,
          });

        case 'sms_response':
          // Send SMS and end call
          this.twilio!.sendSMS({
            to: event.From,
            body: action.params?.message as string,
          });
          return this.twilio!.generateAnswerTwiML({
            say: "I've sent you a text message with more information. Goodbye!",
            hangup: true,
          });
      }
    }

    return this.generatePassthroughTwiML();
  }

  /**
   * Generate screening TwiML
   */
  private generateScreeningTwiML(event: TwilioWebhookEvent): string {
    const contact = this.findContactByNumber(event.From);
    const callerName = contact?.name || 'Unknown caller';

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">You have an incoming call from ${callerName}.</Say>
  <Gather numDigits="1" action="${this.config.webhookBaseUrl}/voice/screen-response" timeout="10">
    <Say voice="Polly.Amy">Press 1 to answer, 2 to send to voicemail, or 3 to reject.</Say>
  </Gather>
  <Redirect>${this.config.webhookBaseUrl}/voice/voicemail</Redirect>
</Response>`;
  }

  /**
   * Generate passthrough TwiML (let it ring)
   */
  private generatePassthroughTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="30">
    <Number>${this.config.twilio?.phoneNumber}</Number>
  </Dial>
</Response>`;
  }

  /**
   * Generate reject TwiML
   */
  private generateRejectTwiML(message?: string): string {
    if (message) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${message}</Say>
  <Hangup />
</Response>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Reject reason="busy" />
</Response>`;
  }

  // ==================== SMS ====================

  /**
   * Send SMS
   */
  async sendSMS(options: {
    to: string;
    body: string;
    mediaUrl?: string[];
  }): Promise<Message> {
    if (!this.twilio) {
      throw new Error('Twilio not configured');
    }

    return this.twilio.sendSMS({
      to: options.to,
      body: options.body,
      mediaUrl: options.mediaUrl,
      statusCallback: this.config.webhookBaseUrl
        ? `${this.config.webhookBaseUrl}/voice/sms-status`
        : undefined,
    });
  }

  /**
   * Handle incoming SMS
   */
  handleIncomingSMS(event: {
    From: string;
    To: string;
    Body: string;
    NumMedia?: string;
    MediaUrl0?: string;
  }): string {
    const message: Message = {
      id: `msg_${Date.now()}`,
      sid: '',
      direction: 'inbound',
      from: event.From,
      to: event.To,
      body: event.Body,
      status: 'received',
      timestamp: Date.now(),
      mediaUrls: event.NumMedia && parseInt(event.NumMedia) > 0
        ? [event.MediaUrl0!]
        : undefined,
    };

    // Notify handlers
    this.messageEventHandlers.forEach((handler) => handler(message));

    // Auto-reply if configured
    // Return TwiML response
    return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  }

  // ==================== Contacts ====================

  /**
   * Add contact
   */
  addContact(contact: Omit<Contact, 'id'>): Contact {
    const newContact: Contact = {
      ...contact,
      id: `contact_${Date.now()}`,
    };
    this.contacts.set(newContact.id, newContact);
    return newContact;
  }

  /**
   * Find contact by phone number
   */
  findContactByNumber(number: string): Contact | undefined {
    const normalized = this.normalizePhoneNumber(number);

    for (const contact of Array.from(this.contacts.values())) {
      for (const phone of contact.phoneNumbers) {
        if (this.normalizePhoneNumber(phone.number) === normalized) {
          return contact;
        }
      }
    }

    return undefined;
  }

  /**
   * Normalize phone number to E.164
   */
  private normalizePhoneNumber(number: string): string {
    // Remove all non-digit characters except leading +
    let normalized = number.replace(/[^\d+]/g, '');

    // Add + if not present and starts with country code
    if (!normalized.startsWith('+') && normalized.length >= 10) {
      normalized = `+1${normalized.slice(-10)}`; // Assume US
    }

    return normalized;
  }

  /**
   * Get all contacts
   */
  getContacts(): Contact[] {
    return Array.from(this.contacts.values());
  }

  // ==================== Call Rules ====================

  /**
   * Add call handling rule
   */
  addCallRule(rule: Omit<CallHandlingRule, 'id'>): CallHandlingRule {
    const newRule: CallHandlingRule = {
      ...rule,
      id: `rule_${Date.now()}`,
    };
    this.callRules.set(newRule.id, newRule);
    return newRule;
  }

  /**
   * Get all call rules
   */
  getCallRules(): CallHandlingRule[] {
    return Array.from(this.callRules.values());
  }

  /**
   * Update call rule
   */
  updateCallRule(ruleId: string, updates: Partial<CallHandlingRule>): CallHandlingRule | null {
    const rule = this.callRules.get(ruleId);
    if (!rule) return null;

    const updated = { ...rule, ...updates };
    this.callRules.set(ruleId, updated);
    return updated;
  }

  /**
   * Delete call rule
   */
  deleteCallRule(ruleId: string): boolean {
    return this.callRules.delete(ruleId);
  }

  // ==================== Event Handlers ====================

  /**
   * Subscribe to call events
   */
  onCall(handler: CallEventHandler): () => void {
    this.callEventHandlers.push(handler);
    return () => {
      const idx = this.callEventHandlers.indexOf(handler);
      if (idx !== -1) this.callEventHandlers.splice(idx, 1);
    };
  }

  /**
   * Subscribe to message events
   */
  onMessage(handler: MessageEventHandler): () => void {
    this.messageEventHandlers.push(handler);
    return () => {
      const idx = this.messageEventHandlers.indexOf(handler);
      if (idx !== -1) this.messageEventHandlers.splice(idx, 1);
    };
  }

  // ==================== Getters ====================

  /**
   * Get Twilio integration
   */
  getTwilio(): TwilioIntegration | null {
    return this.twilio;
  }

  /**
   * Get Voice AI
   */
  getVoiceAI(): VoiceAI {
    return this.voiceAI;
  }

  /**
   * Get Call Features
   */
  getCallFeatures(): CallFeatures | null {
    return this.callFeatures;
  }

  /**
   * Get Voice Clone Service
   */
  getVoiceCloneService(): VoiceCloneService | null {
    return this.voiceClone;
  }

  /**
   * Get voice settings
   */
  getVoiceSettings(): VoiceSettings {
    return this.config.voiceSettings as VoiceSettings;
  }

  /**
   * Update voice settings
   */
  updateVoiceSettings(settings: Partial<VoiceSettings>): VoiceSettings {
    this.config.voiceSettings = { ...this.config.voiceSettings, ...settings };
    return this.config.voiceSettings as VoiceSettings;
  }

  /**
   * Get call history
   */
  getCallHistory(): Call[] {
    return this.twilio?.getCalls() || [];
  }

  /**
   * Get message history
   */
  getMessageHistory(): Message[] {
    return this.twilio?.getLocalMessages() || [];
  }
}
