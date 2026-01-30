/**
 * Content Creator Suite - LinkedIn Message Drafter
 *
 * AI-powered message drafting for LinkedIn outreach and networking.
 */

import type {
  LinkedInMessage,
  ContentProviderResult,
  VoiceProfile,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export type MessageType =
  | 'connection_request'
  | 'follow_up'
  | 'introduction'
  | 'thank_you'
  | 'collaboration'
  | 'job_inquiry'
  | 'congratulations'
  | 'custom';

export interface MessageTemplate {
  id: string;
  name: string;
  type: MessageType;
  subject?: string;
  body: string;
  variables: string[];
}

export interface DraftMessageOptions {
  type: MessageType;
  recipientName: string;
  recipientTitle?: string;
  recipientCompany?: string;
  context?: string;
  customInstructions?: string;
  voiceProfileId?: string;
  maxLength?: number;
}

export interface DraftedMessage {
  subject?: string;
  content: string;
  type: MessageType;
  recipientName: string;
  characterCount: number;
  tokensUsed: number;
  generatedAt: number;
}

// =============================================================================
// Default Templates
// =============================================================================

const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'connection_request_default',
    name: 'Standard Connection Request',
    type: 'connection_request',
    body: `Hi {recipientName},

I came across your profile and was impressed by your work {context}. I'd love to connect and learn more about your experience in {field}.

Looking forward to connecting!`,
    variables: ['recipientName', 'context', 'field'],
  },
  {
    id: 'follow_up_default',
    name: 'Follow-up Message',
    type: 'follow_up',
    body: `Hi {recipientName},

I hope this message finds you well. I wanted to follow up on {context}.

{customContent}

Would love to hear your thoughts when you have a moment.

Best regards`,
    variables: ['recipientName', 'context', 'customContent'],
  },
  {
    id: 'introduction_default',
    name: 'Introduction Message',
    type: 'introduction',
    body: `Hi {recipientName},

My name is {senderName}, and I {senderContext}. I noticed that you {recipientContext} and thought there might be potential synergies between us.

Would you be open to a brief call to explore how we might collaborate?

Best regards`,
    variables: ['recipientName', 'senderName', 'senderContext', 'recipientContext'],
  },
  {
    id: 'congratulations_default',
    name: 'Congratulations',
    type: 'congratulations',
    body: `Hi {recipientName},

Congratulations on {achievement}! That's a fantastic accomplishment.

{customContent}

Wishing you continued success!`,
    variables: ['recipientName', 'achievement', 'customContent'],
  },
  {
    id: 'thank_you_default',
    name: 'Thank You',
    type: 'thank_you',
    body: `Hi {recipientName},

I wanted to take a moment to thank you for {context}. It really meant a lot.

{customContent}

Thank you again!`,
    variables: ['recipientName', 'context', 'customContent'],
  },
];

// =============================================================================
// Message Drafter Service
// =============================================================================

export class MessageDrafterService {
  private templates = new Map<string, MessageTemplate>();
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly generator: ContentGeneratorProvider,
    private readonly voiceProfileStore: VoiceProfileStore
  ) {
    // Load default templates
    for (const template of DEFAULT_TEMPLATES) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Draft a message using AI
   */
  async draftMessage(
    options: DraftMessageOptions
  ): Promise<ContentProviderResult<DraftedMessage>> {
    // Get voice profile if specified
    let voiceProfile: VoiceProfile | null = null;
    if (options.voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(options.voiceProfileId);
    }

    const prompt = this.buildDraftPrompt(options);
    const systemPrompt = this.buildSystemPrompt(options.type);

    const result = await this.generator.generate({
      prompt,
      systemPrompt,
      voiceProfile: voiceProfile ?? undefined,
      temperature: 0.7,
      maxTokens: options.maxLength ? Math.ceil(options.maxLength * 1.5) : 500,
    });

    if (!result.success) {
      return result as ContentProviderResult<DraftedMessage>;
    }

    let content = result.data.content.trim();

    // Extract subject line if present
    let subject: string | undefined;
    const subjectMatch = content.match(/^Subject:\s*(.+)\n/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      content = content.substring(subjectMatch[0].length).trim();
    }

    // Enforce max length
    if (options.maxLength && content.length > options.maxLength) {
      content = this.truncateMessage(content, options.maxLength);
    }

    const drafted: DraftedMessage = {
      subject,
      content,
      type: options.type,
      recipientName: options.recipientName,
      characterCount: content.length,
      tokensUsed: result.data.tokensUsed,
      generatedAt: Date.now(),
    };

    this.emit(CONTENT_EVENTS.LINKEDIN_MESSAGE_SENT, {
      type: options.type,
      recipientName: options.recipientName,
      characterCount: drafted.characterCount,
    });

    return {
      success: true,
      data: drafted,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Generate message variations
   */
  async generateVariations(
    options: DraftMessageOptions,
    count: number = 3
  ): Promise<ContentProviderResult<DraftedMessage[]>> {
    const prompt = `Generate ${count} different versions of a LinkedIn ${options.type.replace('_', ' ')} message.

Recipient: ${options.recipientName}
${options.recipientTitle ? `Title: ${options.recipientTitle}` : ''}
${options.recipientCompany ? `Company: ${options.recipientCompany}` : ''}
${options.context ? `Context: ${options.context}` : ''}
${options.customInstructions ? `Additional instructions: ${options.customInstructions}` : ''}

Requirements:
- Each version should be unique in approach and tone
- Keep each message professional yet personable
- Maximum ${options.maxLength ?? 500} characters each
- Don't be overly salesy or pushy

Format:
VERSION 1:
[message]

VERSION 2:
[message]
...`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: this.buildSystemPrompt(options.type),
      temperature: 0.9, // Higher temperature for variation
      maxTokens: count * 300,
    });

    if (!result.success) {
      return result as ContentProviderResult<DraftedMessage[]>;
    }

    const variations: DraftedMessage[] = [];
    const versionPattern = /VERSION\s*\d+:\s*([\s\S]*?)(?=VERSION\s*\d+:|$)/gi;
    let match;

    while ((match = versionPattern.exec(result.data.content)) !== null) {
      const content = match[1].trim();
      if (content) {
        variations.push({
          content,
          type: options.type,
          recipientName: options.recipientName,
          characterCount: content.length,
          tokensUsed: Math.floor(result.data.tokensUsed / count),
          generatedAt: Date.now(),
        });
      }
    }

    return {
      success: true,
      data: variations,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Use a template to generate a message
   */
  useTemplate(
    templateId: string,
    variables: Record<string, string>
  ): string | null {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }

    let message = template.body;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    // Remove any unfilled variables
    message = message.replace(/\{[^}]+\}/g, '');

    return message.trim();
  }

  /**
   * Create a custom template
   */
  createTemplate(template: Omit<MessageTemplate, 'id'>): MessageTemplate {
    const id = crypto.randomUUID();
    const newTemplate: MessageTemplate = {
      ...template,
      id,
    };

    this.templates.set(id, newTemplate);
    return newTemplate;
  }

  /**
   * Get all templates
   */
  getTemplates(type?: MessageType): MessageTemplate[] {
    let templates = Array.from(this.templates.values());

    if (type) {
      templates = templates.filter(t => t.type === type);
    }

    return templates;
  }

  /**
   * Get a specific template
   */
  getTemplate(templateId: string): MessageTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Delete a template
   */
  deleteTemplate(templateId: string): boolean {
    // Don't allow deleting default templates
    if (DEFAULT_TEMPLATES.some(t => t.id === templateId)) {
      return false;
    }
    return this.templates.delete(templateId);
  }

  /**
   * Personalize a message with recipient details
   */
  async personalizeMessage(
    baseMessage: string,
    recipientDetails: {
      name: string;
      title?: string;
      company?: string;
      recentActivity?: string;
      commonConnections?: string[];
      sharedInterests?: string[];
    }
  ): Promise<ContentProviderResult<string>> {
    const prompt = `Personalize this LinkedIn message for the recipient:

Original message:
"${baseMessage}"

Recipient details:
- Name: ${recipientDetails.name}
${recipientDetails.title ? `- Title: ${recipientDetails.title}` : ''}
${recipientDetails.company ? `- Company: ${recipientDetails.company}` : ''}
${recipientDetails.recentActivity ? `- Recent activity: ${recipientDetails.recentActivity}` : ''}
${recipientDetails.commonConnections?.length ? `- Common connections: ${recipientDetails.commonConnections.join(', ')}` : ''}
${recipientDetails.sharedInterests?.length ? `- Shared interests: ${recipientDetails.sharedInterests.join(', ')}` : ''}

Make the message feel more personal and relevant while keeping the same intent and length. Don't make it too long or add unnecessary flattery.

Return ONLY the personalized message, nothing else.`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: 'You are an expert at writing personalized, professional LinkedIn messages.',
      temperature: 0.7,
      maxTokens: 400,
    });

    if (!result.success) {
      return result as ContentProviderResult<string>;
    }

    return {
      success: true,
      data: result.data.content.trim(),
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Analyze and improve a message
   */
  async improveMessage(
    message: string,
    improvements: ('professionalism' | 'warmth' | 'brevity' | 'call_to_action')[]
  ): Promise<ContentProviderResult<{
    improved: string;
    changes: string[];
  }>> {
    const improvementInstructions = improvements.map(imp => {
      switch (imp) {
        case 'professionalism':
          return 'Make it more professional and polished';
        case 'warmth':
          return 'Add more warmth and personal touch';
        case 'brevity':
          return 'Make it more concise while keeping the key message';
        case 'call_to_action':
          return 'Add or improve the call-to-action';
        default:
          return '';
      }
    }).filter(Boolean);

    const prompt = `Improve this LinkedIn message:

"${message}"

Improvements to make:
${improvementInstructions.map(i => `- ${i}`).join('\n')}

Provide:
1. The improved message
2. A brief list of changes made

Format:
IMPROVED MESSAGE:
[message]

CHANGES:
- [change 1]
- [change 2]`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: 'You are an expert at crafting effective LinkedIn messages.',
      temperature: 0.5,
      maxTokens: 600,
    });

    if (!result.success) {
      return result as ContentProviderResult<{ improved: string; changes: string[] }>;
    }

    // Parse response
    const messageMatch = result.data.content.match(/IMPROVED MESSAGE:\s*([\s\S]*?)(?=CHANGES:|$)/i);
    const changesMatch = result.data.content.match(/CHANGES:\s*([\s\S]*?)$/i);

    const improved = messageMatch?.[1]?.trim() ?? message;
    const changesText = changesMatch?.[1] ?? '';
    const changes = changesText
      .split('\n')
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 0);

    return {
      success: true,
      data: {
        improved,
        changes,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Build the prompt for message drafting
   */
  private buildDraftPrompt(options: DraftMessageOptions): string {
    let prompt = `Write a ${options.type.replace('_', ' ')} message for LinkedIn.

Recipient: ${options.recipientName}`;

    if (options.recipientTitle) {
      prompt += `\nTitle: ${options.recipientTitle}`;
    }
    if (options.recipientCompany) {
      prompt += `\nCompany: ${options.recipientCompany}`;
    }
    if (options.context) {
      prompt += `\nContext: ${options.context}`;
    }
    if (options.customInstructions) {
      prompt += `\n\nAdditional instructions: ${options.customInstructions}`;
    }

    prompt += `

Requirements:
- Keep it professional yet personable
- Don't be overly formal or stiff
- Be genuine, not salesy
- Maximum ${options.maxLength ?? 500} characters
- Include a clear purpose or call-to-action

Return ONLY the message text, nothing else.`;

    return prompt;
  }

  /**
   * Build system prompt based on message type
   */
  private buildSystemPrompt(type: MessageType): string {
    const typeSpecificInstructions: Record<MessageType, string> = {
      connection_request: 'Focus on common ground and genuine interest in connecting.',
      follow_up: 'Reference previous interaction and provide value.',
      introduction: 'Be clear about who you are and why you\'re reaching out.',
      thank_you: 'Be sincere and specific about what you\'re thankful for.',
      collaboration: 'Clearly articulate mutual benefits of collaboration.',
      job_inquiry: 'Show genuine interest in the role and company.',
      congratulations: 'Be warm and genuine, don\'t make it about yourself.',
      custom: 'Adapt to the specific context provided.',
    };

    return `You are an expert at writing effective LinkedIn messages that get responses.
Your messages should be:
- Professional but not stuffy
- Personalized and relevant
- Concise and respectful of the recipient's time
- Clear about the purpose

${typeSpecificInstructions[type]}`;
  }

  /**
   * Truncate message at a natural break point
   */
  private truncateMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) return message;

    const truncated = message.substring(0, maxLength);

    // Try to end at a sentence
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclaim = truncated.lastIndexOf('!');
    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);

    if (lastSentence > maxLength * 0.7) {
      return message.substring(0, lastSentence + 1);
    }

    // Try to end at a paragraph
    const lastNewline = truncated.lastIndexOf('\n\n');
    if (lastNewline > maxLength * 0.5) {
      return message.substring(0, lastNewline);
    }

    return truncated.trim();
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMessageDrafter(
  generator: ContentGeneratorProvider,
  voiceProfileStore: VoiceProfileStore
): MessageDrafterService {
  return new MessageDrafterService(generator, voiceProfileStore);
}
