/**
 * Email Negotiation Provider
 *
 * Email sending providers for negotiation communications.
 */

import { BaseSavingsProvider, SavingsProviderError } from './base.js';

/**
 * Email send options
 */
export interface EmailSendOptions {
  to: string | string[];
  subject: string;
  body: string;
  bodyHtml?: string;
  from?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  trackOpens?: boolean;
  trackClicks?: boolean;
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  contentType: string;
}

/**
 * Email send result
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Email provider type
 */
export type EmailProviderType = 'smtp' | 'sendgrid' | 'ses' | 'mailgun' | 'mock';

/**
 * Email provider configuration
 */
export interface EmailProviderConfig {
  type: EmailProviderType;
  fromEmail: string;
  fromName?: string;
  replyToEmail?: string;

  // SMTP config
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  };

  // SendGrid config
  sendgrid?: {
    apiKey: string;
  };

  // AWS SES config
  ses?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };

  // Mailgun config
  mailgun?: {
    apiKey: string;
    domain: string;
  };
}

/**
 * Email negotiation provider interface
 */
export interface EmailNegotiationProvider {
  readonly name: string;
  readonly version: string;

  send(options: EmailSendOptions): Promise<EmailSendResult>;
  isConfigured(): boolean;
  getProviderType(): EmailProviderType;
}

/**
 * Base email provider implementation
 */
export abstract class BaseEmailProvider extends BaseSavingsProvider implements EmailNegotiationProvider {
  abstract readonly version: string;
  protected readonly emailConfig: EmailProviderConfig;

  get type(): string {
    return 'email';
  }

  constructor(config: EmailProviderConfig) {
    super({ name: config.type });
    this.emailConfig = config;
  }

  abstract send(options: EmailSendOptions): Promise<EmailSendResult>;
  abstract isConfigured(): boolean;

  getProviderType(): EmailProviderType {
    return this.emailConfig.type;
  }

  protected buildFromAddress(): string {
    if (this.emailConfig.fromName) {
      return `${this.emailConfig.fromName} <${this.emailConfig.fromEmail}>`;
    }
    return this.emailConfig.fromEmail;
  }

  protected validateOptions(options: EmailSendOptions): string[] {
    const errors: string[] = [];

    if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
      errors.push('Recipient email is required');
    }

    if (!options.subject) {
      errors.push('Email subject is required');
    }

    if (!options.body && !options.bodyHtml) {
      errors.push('Email body is required');
    }

    // Validate email formats
    const emails = Array.isArray(options.to) ? options.to : [options.to];
    for (const email of emails) {
      if (!this.isValidEmail(email)) {
        errors.push(`Invalid email address: ${email}`);
      }
    }

    return errors;
  }

  protected isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

/**
 * Mock email provider for testing
 */
export class MockEmailProvider extends BaseEmailProvider {
  readonly name = 'mock-email';
  readonly version = '1.0.0';

  private sentEmails: Array<EmailSendOptions & { sentAt: number }> = [];

  constructor(config?: Partial<EmailProviderConfig>) {
    super({
      type: 'mock',
      fromEmail: config?.fromEmail ?? 'test@example.com',
      fromName: config?.fromName ?? 'Test Sender',
      ...config,
    });
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const errors = this.validateOptions(options);
    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join(', '),
      };
    }

    // Simulate sending
    const messageId = `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.sentEmails.push({
      ...options,
      sentAt: Date.now(),
    });

    return {
      success: true,
      messageId,
      timestamp: Date.now(),
    };
  }

  isConfigured(): boolean {
    return true;
  }

  /**
   * Get sent emails (for testing)
   */
  getSentEmails(): Array<EmailSendOptions & { sentAt: number }> {
    return this.sentEmails;
  }

  /**
   * Clear sent emails (for testing)
   */
  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

/**
 * SMTP email provider
 *
 * Note: In production, this would use nodemailer or similar library.
 */
export class SmtpEmailProvider extends BaseEmailProvider {
  readonly name = 'smtp-email';
  readonly version = '1.0.0';

  constructor(config: EmailProviderConfig) {
    if (!config.smtp) {
      throw new SavingsProviderError('SMTP configuration is required', 'smtp-email');
    }
    super({ ...config, type: 'smtp' });
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const errors = this.validateOptions(options);
    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join(', '),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SMTP not configured',
      };
    }

    // In production, this would use nodemailer:
    // const transporter = nodemailer.createTransport(this.emailConfig.smtp);
    // const result = await transporter.sendMail({ ... });

    // For now, return a mock success
    return {
      success: true,
      messageId: `smtp-${Date.now()}`,
      timestamp: Date.now(),
      details: {
        note: 'SMTP sending would be implemented with nodemailer in production',
      },
    };
  }

  isConfigured(): boolean {
    return !!(
      this.emailConfig.smtp?.host &&
      this.emailConfig.smtp?.port
    );
  }
}

/**
 * SendGrid email provider
 *
 * Note: In production, this would use the @sendgrid/mail SDK.
 */
export class SendGridEmailProvider extends BaseEmailProvider {
  readonly name = 'sendgrid-email';
  readonly version = '1.0.0';

  constructor(config: EmailProviderConfig) {
    if (!config.sendgrid) {
      throw new SavingsProviderError('SendGrid configuration is required', 'sendgrid-email');
    }
    super({ ...config, type: 'sendgrid' });
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const errors = this.validateOptions(options);
    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join(', '),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'SendGrid not configured',
      };
    }

    // In production, this would use @sendgrid/mail:
    // sgMail.setApiKey(this.emailConfig.sendgrid.apiKey);
    // await sgMail.send({ ... });

    return {
      success: true,
      messageId: `sg-${Date.now()}`,
      timestamp: Date.now(),
      details: {
        note: 'SendGrid sending would be implemented with @sendgrid/mail in production',
      },
    };
  }

  isConfigured(): boolean {
    return !!this.emailConfig.sendgrid?.apiKey;
  }
}

/**
 * AWS SES email provider
 *
 * Note: In production, this would use the AWS SDK.
 */
export class SesEmailProvider extends BaseEmailProvider {
  readonly name = 'ses-email';
  readonly version = '1.0.0';

  constructor(config: EmailProviderConfig) {
    if (!config.ses) {
      throw new SavingsProviderError('SES configuration is required', 'ses-email');
    }
    super({ ...config, type: 'ses' });
  }

  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    const errors = this.validateOptions(options);
    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join(', '),
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'AWS SES not configured',
      };
    }

    // In production, this would use AWS SDK:
    // const ses = new SESClient({ ... });
    // await ses.send(new SendEmailCommand({ ... }));

    return {
      success: true,
      messageId: `ses-${Date.now()}`,
      timestamp: Date.now(),
      details: {
        note: 'SES sending would be implemented with AWS SDK in production',
      },
    };
  }

  isConfigured(): boolean {
    return !!(
      this.emailConfig.ses?.region &&
      this.emailConfig.ses?.accessKeyId &&
      this.emailConfig.ses?.secretAccessKey
    );
  }
}

/**
 * Email provider factory
 */
export function createEmailProvider(config: EmailProviderConfig): EmailNegotiationProvider {
  switch (config.type) {
    case 'smtp':
      return new SmtpEmailProvider(config);
    case 'sendgrid':
      return new SendGridEmailProvider(config);
    case 'ses':
      return new SesEmailProvider(config);
    case 'mock':
    default:
      return new MockEmailProvider(config);
  }
}

/**
 * Email template manager
 */
export class EmailTemplateManager {
  private templates: Map<string, EmailTemplate> = new Map();

  /**
   * Register a template
   */
  register(id: string, template: EmailTemplate): void {
    this.templates.set(id, template);
  }

  /**
   * Get a template by ID
   */
  get(id: string): EmailTemplate | null {
    return this.templates.get(id) ?? null;
  }

  /**
   * Render a template with variables
   */
  render(id: string, variables: Record<string, string>): {
    subject: string;
    body: string;
    bodyHtml?: string;
  } | null {
    const template = this.templates.get(id);
    if (!template) {
      return null;
    }

    let subject = template.subject;
    let body = template.body;
    let bodyHtml = template.bodyHtml;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      body = body.replace(new RegExp(placeholder, 'g'), value);
      if (bodyHtml) {
        bodyHtml = bodyHtml.replace(new RegExp(placeholder, 'g'), value);
      }
    }

    return { subject, body, bodyHtml };
  }

  /**
   * List all template IDs
   */
  list(): string[] {
    return Array.from(this.templates.keys());
  }
}

/**
 * Email template
 */
export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  variables: string[];
}
