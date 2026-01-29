import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BaseChannel,
  WhatsAppChannel,
  TelegramChannel,
  DiscordChannel,
  SlackChannel,
  parseCommand,
} from '../../src/channels/index.js';
import type { Message, SendOptions } from '../../src/channels/index.js';

// Concrete implementation for testing
class TestChannel extends BaseChannel {
  private messageHandler?: (message: Message) => Promise<void>;

  constructor() {
    super('test-channel');
  }

  async connect(): Promise<void> {
    this.setConnected(true);
  }

  async disconnect(): Promise<void> {
    this.setConnected(false);
  }

  async send(channelId: string, content: string, options?: SendOptions): Promise<void> {
    // Mock send
  }

  onMessage(handler: (message: Message) => Promise<void>): void {
    this.messageHandler = handler;
  }

  // Helper to simulate incoming message
  async simulateMessage(message: Message): Promise<void> {
    const sanitized = this['sanitizeIncoming'](message);
    if (this.messageHandler) {
      await this.messageHandler(sanitized);
    }
  }
}

describe('BaseChannel', () => {
  let channel: TestChannel;

  beforeEach(() => {
    channel = new TestChannel();
  });

  it('should track connection state', async () => {
    expect(channel.isConnected()).toBe(false);

    await channel.connect();
    expect(channel.isConnected()).toBe(true);

    await channel.disconnect();
    expect(channel.isConnected()).toBe(false);
  });

  it('should handle message events', async () => {
    const receivedMessages: Message[] = [];

    channel.onMessage(async (message) => {
      receivedMessages.push(message);
    });

    await channel.simulateMessage({
      id: 'msg-1',
      channelId: 'ch-1',
      senderId: 'user-1',
      content: 'Hello!',
      timestamp: Date.now(),
    });

    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0].content).toBe('Hello!');
  });

  it('should sanitize outgoing content for secrets', () => {
    const content = 'API key: sk-1234567890abcdefghijklmnopqrstuvwxyz123456789012';
    const sanitized = channel['sanitizeOutgoing'](content);

    expect(sanitized).not.toContain('sk-');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
  });
});

describe('WhatsAppChannel', () => {
  let channel: WhatsAppChannel;

  beforeEach(() => {
    channel = new WhatsAppChannel({
      phoneNumberId: 'test-phone-id',
      accessToken: 'test-token',
      webhookVerifyToken: 'verify-token',
    });
  });

  describe('verifyWebhook', () => {
    it('should verify webhook subscription', () => {
      const result = channel.verifyWebhook(
        'subscribe',
        'verify-token',
        'challenge-123'
      );

      expect(result.verified).toBe(true);
      expect(result.challenge).toBe('challenge-123');
    });

    it('should reject invalid verify token', () => {
      const result = channel.verifyWebhook(
        'subscribe',
        'wrong-token',
        'challenge-123'
      );

      expect(result.verified).toBe(false);
    });
  });
});

describe('TelegramChannel', () => {
  let channel: TelegramChannel;

  beforeEach(() => {
    channel = new TelegramChannel({
      botToken: 'test-bot-token',
    });
  });

  it('should be instantiable', () => {
    expect(channel).toBeDefined();
  });
});

describe('DiscordChannel', () => {
  let channel: DiscordChannel;

  beforeEach(() => {
    channel = new DiscordChannel({
      botToken: 'test-discord-token',
      applicationId: 'app-123',
    });
  });

  it('should be instantiable', () => {
    expect(channel).toBeDefined();
  });
});

describe('SlackChannel', () => {
  let channel: SlackChannel;

  beforeEach(() => {
    channel = new SlackChannel({
      botToken: 'xoxb-test-token',
      signingSecret: 'signing-secret',
    });
  });

  it('should be instantiable', () => {
    expect(channel).toBeDefined();
  });
});

describe('parseCommand', () => {
  it('should parse simple commands', () => {
    const result = parseCommand('/help');

    expect(result?.command).toBe('help');
  });

  it('should parse commands with arguments', () => {
    const result = parseCommand('/remind me at 5pm');

    expect(result?.command).toBe('remind');
    expect(result?.args).toBe('me at 5pm');
  });

  it('should return null for non-commands', () => {
    const result = parseCommand('just a regular message');

    expect(result).toBeNull();
  });
});
