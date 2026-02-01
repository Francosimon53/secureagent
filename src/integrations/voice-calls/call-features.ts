/**
 * Call Features
 *
 * Advanced call functionality: conference calls, recording,
 * transfer, hold, and IVR menus.
 */

import type {
  Conference,
  ConferenceParticipant,
  IVRMenu,
  IVROption,
  CallAction,
} from './types.js';
import type { TwilioConfig } from './config.js';

export class CallFeatures {
  private config: TwilioConfig;
  private baseUrl = 'https://api.twilio.com/2010-04-01';
  private conferences: Map<string, Conference> = new Map();
  private ivrMenus: Map<string, IVRMenu> = new Map();

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

  // ==================== Conference Calls ====================

  /**
   * Create a conference call
   */
  async createConference(options: {
    name: string;
    participants: string[];
    moderatorNumber?: string;
    startOnEnter?: boolean;
    endOnExit?: boolean;
    record?: boolean;
    statusCallback?: string;
  }): Promise<Conference> {
    const conferenceId = `conf_${Date.now()}`;

    const conference: Conference = {
      id: conferenceId,
      sid: '', // Will be set when first participant joins
      name: options.name,
      status: 'init',
      participants: [],
      startTime: Date.now(),
    };

    this.conferences.set(conferenceId, conference);

    // Dial out to participants
    for (const number of options.participants) {
      await this.addParticipantToConference(conferenceId, number, {
        startOnEnter: number === options.moderatorNumber || options.startOnEnter,
        endOnExit: number === options.moderatorNumber || options.endOnExit,
        record: options.record,
        statusCallback: options.statusCallback,
      });
    }

    return conference;
  }

  /**
   * Add participant to conference
   */
  async addParticipantToConference(
    conferenceId: string,
    phoneNumber: string,
    options?: {
      startOnEnter?: boolean;
      endOnExit?: boolean;
      muted?: boolean;
      hold?: boolean;
      record?: boolean;
      statusCallback?: string;
    }
  ): Promise<void> {
    const conference = this.conferences.get(conferenceId);
    if (!conference) {
      throw new Error(`Conference ${conferenceId} not found`);
    }

    const from = this.config.phoneNumber;
    if (!from) {
      throw new Error('No outbound phone number configured');
    }

    // Generate TwiML for joining conference
    const conferenceName = conference.name.replace(/[^a-zA-Z0-9]/g, '_');
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference`;

    if (options?.startOnEnter !== false) twiml += ' startConferenceOnEnter="true"';
    if (options?.endOnExit) twiml += ' endConferenceOnExit="true"';
    if (options?.muted) twiml += ' muted="true"';
    if (options?.record) twiml += ' record="record-from-start"';
    if (options?.statusCallback) {
      twiml += ` statusCallback="${options.statusCallback}"`;
      twiml += ' statusCallbackEvent="start end join leave mute hold"';
    }

    twiml += `>${conferenceName}</Conference>
  </Dial>
</Response>`;

    // Make outbound call to participant
    const result = await this.api<{ sid: string }>('/Calls.json', 'POST', {
      To: phoneNumber,
      From: from,
      Twiml: twiml,
    });

    // Update conference
    conference.participants.push({
      callSid: result.sid,
      phoneNumber,
      muted: options?.muted || false,
      hold: options?.hold || false,
      joinedAt: Date.now(),
    });

    if (!conference.sid) {
      conference.sid = result.sid;
    }
    conference.status = 'in-progress';
  }

  /**
   * Generate TwiML to join an existing conference
   */
  generateJoinConferenceTwiML(options: {
    conferenceName: string;
    muted?: boolean;
    startOnEnter?: boolean;
    endOnExit?: boolean;
    waitUrl?: string;
    record?: boolean;
    statusCallback?: string;
  }): string {
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference`;

    if (options.muted) twiml += ' muted="true"';
    if (options.startOnEnter !== false) twiml += ' startConferenceOnEnter="true"';
    if (options.endOnExit) twiml += ' endConferenceOnExit="true"';
    if (options.waitUrl) twiml += ` waitUrl="${options.waitUrl}"`;
    if (options.record) twiml += ' record="record-from-start"';
    if (options.statusCallback) {
      twiml += ` statusCallback="${options.statusCallback}"`;
    }

    twiml += `>${options.conferenceName}</Conference>
  </Dial>
</Response>`;

    return twiml;
  }

  /**
   * Mute/unmute participant
   */
  async muteParticipant(conferenceSid: string, callSid: string, muted: boolean): Promise<void> {
    await this.api(
      `/Conferences/${conferenceSid}/Participants/${callSid}.json`,
      'POST',
      { Muted: muted.toString() }
    );
  }

  /**
   * Hold/unhold participant
   */
  async holdParticipant(
    conferenceSid: string,
    callSid: string,
    hold: boolean,
    holdUrl?: string
  ): Promise<void> {
    const params: Record<string, string> = { Hold: hold.toString() };
    if (holdUrl) {
      params.HoldUrl = holdUrl;
    }

    await this.api(
      `/Conferences/${conferenceSid}/Participants/${callSid}.json`,
      'POST',
      params
    );
  }

  /**
   * Remove participant from conference
   */
  async removeParticipant(conferenceSid: string, callSid: string): Promise<void> {
    await this.api(
      `/Conferences/${conferenceSid}/Participants/${callSid}.json`,
      'DELETE'
    );
  }

  /**
   * End conference
   */
  async endConference(conferenceSid: string): Promise<void> {
    await this.api(`/Conferences/${conferenceSid}.json`, 'POST', {
      Status: 'completed',
    });
  }

  // ==================== Call Recording ====================

  /**
   * Start recording a call
   */
  async startRecording(
    callSid: string,
    options?: {
      channels?: 'mono' | 'dual';
      statusCallback?: string;
    }
  ): Promise<{ recordingSid: string }> {
    const params: Record<string, string> = {};

    if (options?.channels) {
      params.RecordingChannels = options.channels;
    }
    if (options?.statusCallback) {
      params.RecordingStatusCallback = options.statusCallback;
    }

    const result = await this.api<{ sid: string }>(
      `/Calls/${callSid}/Recordings.json`,
      'POST',
      params
    );

    return { recordingSid: result.sid };
  }

  /**
   * Stop recording
   */
  async stopRecording(callSid: string, recordingSid: string): Promise<void> {
    await this.api(
      `/Calls/${callSid}/Recordings/${recordingSid}.json`,
      'POST',
      { Status: 'stopped' }
    );
  }

  /**
   * Pause recording
   */
  async pauseRecording(callSid: string, recordingSid: string): Promise<void> {
    await this.api(
      `/Calls/${callSid}/Recordings/${recordingSid}.json`,
      'POST',
      { Status: 'paused' }
    );
  }

  /**
   * Resume recording
   */
  async resumeRecording(callSid: string, recordingSid: string): Promise<void> {
    await this.api(
      `/Calls/${callSid}/Recordings/${recordingSid}.json`,
      'POST',
      { Status: 'in-progress' }
    );
  }

  // ==================== Call Transfer ====================

  /**
   * Generate TwiML for warm transfer (with announcement)
   */
  generateWarmTransferTwiML(options: {
    targetNumber: string;
    announcement: string;
    callerId?: string;
    timeout?: number;
    fallbackUrl?: string;
  }): string {
    const callerId = options.callerId || this.config.phoneNumber;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Please hold while I transfer your call.</Say>
  <Dial callerId="${callerId}" timeout="${options.timeout || 30}"
        action="${options.fallbackUrl || ''}">
    <Number url="${this.generateWhisperUrl(options.announcement)}">
      ${options.targetNumber}
    </Number>
  </Dial>
  <Say voice="Polly.Amy">The transfer was unsuccessful. Please try again later.</Say>
</Response>`;
  }

  /**
   * Generate whisper URL (announces to receiver before connecting)
   */
  private generateWhisperUrl(message: string): string {
    // This would be an endpoint on your server
    return `/api/voice/whisper?message=${encodeURIComponent(message)}`;
  }

  /**
   * Generate TwiML for cold transfer (direct)
   */
  generateColdTransferTwiML(options: {
    targetNumber: string;
    callerId?: string;
    timeout?: number;
  }): string {
    const callerId = options.callerId || this.config.phoneNumber;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Transferring your call now.</Say>
  <Dial callerId="${callerId}" timeout="${options.timeout || 30}">
    <Number>${options.targetNumber}</Number>
  </Dial>
</Response>`;
  }

  // ==================== Hold with Music ====================

  /**
   * Generate TwiML to put caller on hold
   */
  generateHoldTwiML(options: {
    musicUrl?: string;
    message?: string;
    loop?: number;
    resumeUrl: string;
  }): string {
    const defaultMusic = 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-B6.mp3';
    const music = options.musicUrl || defaultMusic;

    let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';

    if (options.message) {
      twiml += `  <Say voice="Polly.Amy">${this.escapeXml(options.message)}</Say>\n`;
    }

    twiml += `  <Play loop="${options.loop || 0}">${music}</Play>\n`;
    twiml += `  <Redirect>${options.resumeUrl}</Redirect>\n`;
    twiml += '</Response>';

    return twiml;
  }

  // ==================== IVR Menus ====================

  /**
   * Create an IVR menu
   */
  createIVRMenu(menu: Omit<IVRMenu, 'id'>): IVRMenu {
    const ivrMenu: IVRMenu = {
      ...menu,
      id: `ivr_${Date.now()}`,
    };

    this.ivrMenus.set(ivrMenu.id, ivrMenu);
    return ivrMenu;
  }

  /**
   * Get IVR menu
   */
  getIVRMenu(menuId: string): IVRMenu | undefined {
    return this.ivrMenus.get(menuId);
  }

  /**
   * Generate TwiML for IVR menu
   */
  generateIVRTwiML(options: {
    menuId: string;
    webhookUrl: string;
    attempt?: number;
  }): string {
    const menu = this.ivrMenus.get(options.menuId);
    if (!menu) {
      throw new Error(`IVR menu ${options.menuId} not found`);
    }

    const attempt = options.attempt || 0;

    if (attempt >= menu.maxRetries) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${this.escapeXml(menu.timeoutMessage)}</Say>
  <Hangup />
</Response>`;
    }

    // Build options description
    const optionsText = menu.options
      .map((opt) => `Press ${opt.digit} for ${opt.description}`)
      .join('. ');

    const greeting = attempt === 0 ? menu.greeting : menu.invalidInputMessage;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${options.webhookUrl}/ivr/${options.menuId}" timeout="${menu.timeout}">
    <Say voice="Polly.Amy">${this.escapeXml(greeting)} ${this.escapeXml(optionsText)}</Say>
  </Gather>
  <Redirect>${options.webhookUrl}/ivr/${options.menuId}?attempt=${attempt + 1}</Redirect>
</Response>`;
  }

  /**
   * Process IVR selection
   */
  processIVRSelection(
    menuId: string,
    digit: string
  ): { action: CallAction; twiml?: string } | null {
    const menu = this.ivrMenus.get(menuId);
    if (!menu) {
      return null;
    }

    const option = menu.options.find((opt) => opt.digit === digit);
    if (!option) {
      return null;
    }

    return { action: option.action };
  }

  /**
   * Generate TwiML for IVR action
   */
  generateIVRActionTwiML(action: CallAction, webhookUrl: string): string {
    switch (action.type) {
      case 'forward':
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Connecting you now.</Say>
  <Dial>${action.params?.number}</Dial>
</Response>`;

      case 'voicemail':
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${action.params?.greeting || 'Please leave a message after the tone.'}</Say>
  <Record maxLength="120" action="${webhookUrl}/voicemail" transcribe="true" />
</Response>`;

      case 'answer_ai':
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${webhookUrl}/ai-conversation</Redirect>
</Response>`;

      case 'play_message':
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">${this.escapeXml(action.params?.message as string)}</Say>
  <Hangup />
</Response>`;

      case 'sms_response':
        // This would trigger an SMS via webhook
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">We'll send you a text message with more information. Goodbye!</Say>
  <Hangup />
</Response>`;

      default:
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup />
</Response>`;
    }
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
   * Get all conferences
   */
  getConferences(): Conference[] {
    return Array.from(this.conferences.values());
  }

  /**
   * Get all IVR menus
   */
  getIVRMenus(): IVRMenu[] {
    return Array.from(this.ivrMenus.values());
  }
}
