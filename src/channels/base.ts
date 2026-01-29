import { detectPromptInjection } from '../security/guardrails/prompt-injection.js';

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SendOptions {
  replyTo?: string;
  ephemeral?: boolean;
}

export abstract class BaseChannel {
  protected name: string;
  protected connected = false;

  constructor(name: string) {
    this.name = name;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(channelId: string, content: string, options?: SendOptions): Promise<void>;
  abstract onMessage(handler: (message: Message) => Promise<void>): void;

  protected sanitizeIncoming(message: Message): Message {
    const detection = detectPromptInjection(message.content);

    if (detection.blocked) {
      console.warn(`[${this.name}] Blocked potential injection from ${message.senderId}`);
      return {
        ...message,
        content: detection.sanitized ?? '[Content filtered]',
        metadata: {
          ...message.metadata,
          filtered: true,
          filterReason: 'prompt_injection',
          confidence: detection.confidence,
        },
      };
    }

    return message;
  }

  protected sanitizeOutgoing(content: string): string {
    return content
      .replace(/sk-[a-zA-Z0-9]{48}/g, '[REDACTED_API_KEY]')
      .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/xox[baprs]-[a-zA-Z0-9-]{10,}/g, '[REDACTED_SLACK_TOKEN]');
  }

  protected setConnected(value: boolean): void {
    this.connected = value;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
