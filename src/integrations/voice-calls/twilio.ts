/**
 * Twilio Integration
 *
 * Handles phone calls, SMS, and Twilio-specific functionality.
 */

import type {
  Call,
  CallStatus,
  Message,
  PhoneNumber,
  TwilioWebhookEvent,
} from './types.js';
import type { TwilioConfig } from './config.js';

// Twilio REST API types
interface TwilioCallResource {
  sid: string;
  account_sid: string;
  to: string;
  from: string;
  status: string;
  start_time: string;
  end_time?: string;
  duration?: string;
  direction: string;
  price?: string;
  price_unit?: string;
}

interface TwilioMessageResource {
  sid: string;
  account_sid: string;
  to: string;
  from: string;
  body: string;
  status: string;
  date_sent: string;
  direction: string;
  num_media: string;
  media_url?: string[];
}

interface TwilioNumberResource {
  sid: string;
  phone_number: string;
  friendly_name: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  voice_url?: string;
  sms_url?: string;
}

export class TwilioIntegration {
  private config: TwilioConfig;
  private baseUrl = 'https://api.twilio.com/2010-04-01';
  private calls: Map<string, Call> = new Map();
  private messages: Map<string, Message> = new Map();

  constructor(config: TwilioConfig) {
    this.config = config;
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): string {
    const credentials = `${this.config.accountSid}:${this.config.authToken}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /**
   * Make API request to Twilio
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: Record<string, string>
  ): Promise<T> {
    const url = `${this.baseUrl}/Accounts/${this.config.accountSid}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    if (body) {
      options.body = new URLSearchParams(body).toString();
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(`Twilio API error: ${error.message || response.statusText}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Make an outbound call
   */
  async makeCall(options: {
    to: string;
    from?: string;
    twiml?: string;
    url?: string;
    statusCallback?: string;
    record?: boolean;
    timeout?: number;
    machineDetection?: 'Enable' | 'DetectMessageEnd';
  }): Promise<Call> {
    const from = options.from || this.config.phoneNumber;
    if (!from) {
      throw new Error('No from number specified');
    }

    const params: Record<string, string> = {
      To: options.to,
      From: from,
    };

    if (options.twiml) {
      params.Twiml = options.twiml;
    } else if (options.url) {
      params.Url = options.url;
    } else {
      throw new Error('Either twiml or url must be provided');
    }

    if (options.statusCallback) {
      params.StatusCallback = options.statusCallback;
      params.StatusCallbackEvent = 'initiated ringing answered completed';
      params.StatusCallbackMethod = 'POST';
    }

    if (options.record) {
      params.Record = 'true';
    }

    if (options.timeout) {
      params.Timeout = options.timeout.toString();
    }

    if (options.machineDetection) {
      params.MachineDetection = options.machineDetection;
    }

    const result = await this.api<TwilioCallResource>('/Calls.json', 'POST', params);

    const call: Call = {
      id: result.sid,
      sid: result.sid,
      direction: 'outbound',
      status: result.status as CallStatus,
      from: result.from,
      to: result.to,
      startTime: Date.now(),
      aiHandled: false,
    };

    this.calls.set(call.id, call);
    return call;
  }

  /**
   * Get call status
   */
  async getCall(callSid: string): Promise<Call | null> {
    try {
      const result = await this.api<TwilioCallResource>(`/Calls/${callSid}.json`);

      const call: Call = {
        id: result.sid,
        sid: result.sid,
        direction: result.direction === 'inbound' ? 'inbound' : 'outbound',
        status: result.status as CallStatus,
        from: result.from,
        to: result.to,
        startTime: new Date(result.start_time).getTime(),
        endTime: result.end_time ? new Date(result.end_time).getTime() : undefined,
        duration: result.duration ? parseInt(result.duration, 10) : undefined,
        aiHandled: this.calls.get(result.sid)?.aiHandled || false,
      };

      this.calls.set(call.id, call);
      return call;
    } catch {
      return null;
    }
  }

  /**
   * Update a call (redirect, end, etc.)
   */
  async updateCall(
    callSid: string,
    options: {
      twiml?: string;
      url?: string;
      status?: 'canceled' | 'completed';
    }
  ): Promise<Call | null> {
    const params: Record<string, string> = {};

    if (options.twiml) {
      params.Twiml = options.twiml;
    } else if (options.url) {
      params.Url = options.url;
    }

    if (options.status) {
      params.Status = options.status;
    }

    try {
      const result = await this.api<TwilioCallResource>(
        `/Calls/${callSid}.json`,
        'POST',
        params
      );

      return this.getCall(result.sid);
    } catch {
      return null;
    }
  }

  /**
   * End a call
   */
  async endCall(callSid: string): Promise<boolean> {
    const result = await this.updateCall(callSid, { status: 'completed' });
    return result !== null;
  }

  /**
   * Send SMS
   */
  async sendSMS(options: {
    to: string;
    from?: string;
    body: string;
    mediaUrl?: string[];
    statusCallback?: string;
  }): Promise<Message> {
    const from = options.from || this.config.phoneNumber;
    if (!from) {
      throw new Error('No from number specified');
    }

    const params: Record<string, string> = {
      To: options.to,
      From: from,
      Body: options.body,
    };

    if (options.mediaUrl && options.mediaUrl.length > 0) {
      options.mediaUrl.forEach((url, i) => {
        params[`MediaUrl${i}`] = url;
      });
    }

    if (options.statusCallback) {
      params.StatusCallback = options.statusCallback;
    }

    const result = await this.api<TwilioMessageResource>('/Messages.json', 'POST', params);

    const message: Message = {
      id: result.sid,
      sid: result.sid,
      direction: 'outbound',
      from: result.from,
      to: result.to,
      body: result.body,
      status: result.status as Message['status'],
      timestamp: new Date(result.date_sent).getTime(),
      mediaUrls: result.media_url,
    };

    this.messages.set(message.id, message);
    return message;
  }

  /**
   * Get messages
   */
  async getMessages(options?: {
    to?: string;
    from?: string;
    limit?: number;
  }): Promise<Message[]> {
    let endpoint = '/Messages.json?';

    if (options?.to) endpoint += `To=${encodeURIComponent(options.to)}&`;
    if (options?.from) endpoint += `From=${encodeURIComponent(options.from)}&`;
    if (options?.limit) endpoint += `PageSize=${options.limit}`;

    const result = await this.api<{ messages: TwilioMessageResource[] }>(endpoint);

    return result.messages.map((msg) => ({
      id: msg.sid,
      sid: msg.sid,
      direction: msg.direction === 'inbound' ? 'inbound' : 'outbound',
      from: msg.from,
      to: msg.to,
      body: msg.body,
      status: msg.status as Message['status'],
      timestamp: new Date(msg.date_sent).getTime(),
      mediaUrls: msg.media_url,
    }));
  }

  /**
   * Get phone numbers
   */
  async getPhoneNumbers(): Promise<PhoneNumber[]> {
    const result = await this.api<{ incoming_phone_numbers: TwilioNumberResource[] }>(
      '/IncomingPhoneNumbers.json'
    );

    return result.incoming_phone_numbers.map((num) => ({
      id: num.sid,
      number: num.phone_number,
      friendlyName: num.friendly_name,
      capabilities: num.capabilities,
      voiceUrl: num.voice_url,
      smsUrl: num.sms_url,
    }));
  }

  /**
   * Configure phone number webhooks
   */
  async configurePhoneNumber(
    numberSid: string,
    options: {
      voiceUrl?: string;
      voiceMethod?: 'GET' | 'POST';
      smsUrl?: string;
      smsMethod?: 'GET' | 'POST';
      statusCallback?: string;
    }
  ): Promise<void> {
    const params: Record<string, string> = {};

    if (options.voiceUrl) {
      params.VoiceUrl = options.voiceUrl;
      params.VoiceMethod = options.voiceMethod || 'POST';
    }

    if (options.smsUrl) {
      params.SmsUrl = options.smsUrl;
      params.SmsMethod = options.smsMethod || 'POST';
    }

    if (options.statusCallback) {
      params.StatusCallback = options.statusCallback;
    }

    await this.api(`/IncomingPhoneNumbers/${numberSid}.json`, 'POST', params);
  }

  /**
   * Get call recordings
   */
  async getRecordings(callSid: string): Promise<Array<{
    sid: string;
    url: string;
    duration: number;
  }>> {
    const result = await this.api<{
      recordings: Array<{
        sid: string;
        uri: string;
        duration: string;
      }>;
    }>(`/Calls/${callSid}/Recordings.json`);

    return result.recordings.map((rec) => ({
      sid: rec.sid,
      url: `https://api.twilio.com${rec.uri.replace('.json', '.mp3')}`,
      duration: parseInt(rec.duration, 10),
    }));
  }

  /**
   * Create a recording transcription
   */
  async transcribeRecording(recordingSid: string, callbackUrl: string): Promise<void> {
    await this.api(`/Recordings/${recordingSid}/Transcriptions.json`, 'POST', {
      TranscriptionCallback: callbackUrl,
    });
  }

  /**
   * Generate TwiML for answering a call
   */
  generateAnswerTwiML(options: {
    say?: string;
    voice?: string;
    gather?: {
      input: 'speech' | 'dtmf' | 'speech dtmf';
      action: string;
      timeout?: number;
      speechTimeout?: string;
      language?: string;
    };
    record?: {
      action: string;
      maxLength?: number;
      transcribe?: boolean;
      transcribeCallback?: string;
    };
    dial?: {
      number: string;
      callerId?: string;
      timeout?: number;
      record?: boolean;
    };
    redirect?: string;
    hangup?: boolean;
  }): string {
    let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

    if (options.say) {
      const voice = options.voice || 'Polly.Amy';
      twiml += `<Say voice="${voice}">${this.escapeXml(options.say)}</Say>`;
    }

    if (options.gather) {
      const g = options.gather;
      twiml += `<Gather input="${g.input}" action="${g.action}"`;
      if (g.timeout) twiml += ` timeout="${g.timeout}"`;
      if (g.speechTimeout) twiml += ` speechTimeout="${g.speechTimeout}"`;
      if (g.language) twiml += ` language="${g.language}"`;
      twiml += ' />';
    }

    if (options.record) {
      const r = options.record;
      twiml += `<Record action="${r.action}"`;
      if (r.maxLength) twiml += ` maxLength="${r.maxLength}"`;
      if (r.transcribe) twiml += ' transcribe="true"';
      if (r.transcribeCallback) twiml += ` transcribeCallback="${r.transcribeCallback}"`;
      twiml += ' />';
    }

    if (options.dial) {
      const d = options.dial;
      twiml += '<Dial';
      if (d.callerId) twiml += ` callerId="${d.callerId}"`;
      if (d.timeout) twiml += ` timeout="${d.timeout}"`;
      if (d.record) twiml += ' record="record-from-answer"';
      twiml += `><Number>${d.number}</Number></Dial>`;
    }

    if (options.redirect) {
      twiml += `<Redirect>${options.redirect}</Redirect>`;
    }

    if (options.hangup) {
      twiml += '<Hangup />';
    }

    twiml += '</Response>';
    return twiml;
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
   * Process incoming webhook event
   */
  processWebhookEvent(event: TwilioWebhookEvent): Call {
    const existingCall = this.calls.get(event.CallSid);

    const call: Call = {
      id: event.CallSid,
      sid: event.CallSid,
      direction: event.Direction === 'inbound' ? 'inbound' : 'outbound',
      status: event.CallStatus,
      from: event.From,
      to: event.To,
      startTime: existingCall?.startTime || Date.now(),
      aiHandled: existingCall?.aiHandled || false,
      recordingUrl: event.RecordingUrl || existingCall?.recordingUrl,
      transcription: event.TranscriptionText || existingCall?.transcription,
    };

    if (event.CallStatus === 'completed' && !call.endTime) {
      call.endTime = Date.now();
      call.duration = Math.round((call.endTime - call.startTime) / 1000);
    }

    this.calls.set(call.id, call);
    return call;
  }

  /**
   * Get cached calls
   */
  getCalls(): Call[] {
    return Array.from(this.calls.values());
  }

  /**
   * Get cached messages
   */
  getLocalMessages(): Message[] {
    return Array.from(this.messages.values());
  }
}
