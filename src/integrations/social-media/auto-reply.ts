/**
 * Social Media Auto-Reply Service
 *
 * AI-powered auto-reply with approval workflow
 */

import type {
  SocialPlatform,
  SocialInteraction,
  AutoReplySettings,
  ContentSuggestion,
} from './types.js';

export interface AutoReplyConfig {
  defaultSettings?: Partial<AutoReplySettings>;
  aiProvider?: AiReplyProvider;
}

export interface AiReplyProvider {
  generateReply(interaction: SocialInteraction, settings: AutoReplySettings): Promise<string>;
  analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'>;
}

export interface PendingReply {
  id: string;
  interaction: SocialInteraction;
  suggestedReply: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  approvedAt?: number;
  approvedBy?: string;
  editedReply?: string;
}

export interface ReplyCallback {
  (platform: SocialPlatform, interactionId: string, replyText: string): Promise<void>;
}

/**
 * Default AI reply provider using simple templates
 */
export class DefaultAiReplyProvider implements AiReplyProvider {
  private templates: Record<string, string[]> = {
    positive: [
      "Thank you so much for the kind words! We really appreciate your support! 🙏",
      "Thanks for sharing this! We're glad you found it helpful!",
      "We appreciate you taking the time to comment! Thank you! 💙",
    ],
    neutral: [
      "Thanks for your comment! Let us know if you have any questions.",
      "We appreciate your feedback! Feel free to reach out if you need anything.",
      "Thank you for engaging with us! We're here if you need help.",
    ],
    negative: [
      "We're sorry to hear about your experience. Please DM us so we can help resolve this.",
      "Thank you for your feedback. We'd like to learn more about your concerns - please reach out via DM.",
      "We appreciate you sharing this. Please contact us directly so we can address your concerns.",
    ],
    question: [
      "Great question! We'll get back to you with more details shortly.",
      "Thanks for asking! Let us look into this and follow up.",
      "Good question! We'll DM you with the answer.",
    ],
  };

  async generateReply(interaction: SocialInteraction, settings: AutoReplySettings): Promise<string> {
    const sentiment = await this.analyzeSentiment(interaction.content);
    const isQuestion = interaction.content.includes('?');

    let category: string = sentiment;
    if (isQuestion) {
      category = 'question';
    }

    const templates = this.templates[category] || this.templates['neutral'];
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Personalize with author name if friendly tone
    if (settings.tone === 'friendly' && interaction.authorDisplayName) {
      return `Hey ${interaction.authorDisplayName.split(' ')[0]}! ${template}`;
    }

    return template;
  }

  async analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
    const lowerText = text.toLowerCase();

    const positiveWords = ['love', 'great', 'awesome', 'amazing', 'thank', 'helpful', 'excellent', 'fantastic', 'wonderful', '❤️', '🙏', '👍', '🔥'];
    const negativeWords = ['hate', 'terrible', 'awful', 'worst', 'bad', 'horrible', 'disappointed', 'angry', 'frustrated', 'problem', 'issue', 'bug'];

    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
}

export class AutoReplyService {
  private settings: Map<SocialPlatform, AutoReplySettings> = new Map();
  private pendingReplies: Map<string, PendingReply> = new Map();
  private aiProvider: AiReplyProvider;
  private replyCallbacks: Map<SocialPlatform, ReplyCallback> = new Map();
  private repliesThisHour: Map<SocialPlatform, number> = new Map();
  private lastHourReset: number = Date.now();

  constructor(config: AutoReplyConfig = {}) {
    this.aiProvider = config.aiProvider || new DefaultAiReplyProvider();

    // Set default settings for all platforms
    if (config.defaultSettings) {
      for (const platform of ['twitter', 'linkedin', 'bluesky', 'youtube', 'instagram'] as SocialPlatform[]) {
        this.settings.set(platform, {
          enabled: false,
          requireApproval: true,
          respondToComments: true,
          respondToMentions: true,
          respondToDMs: false,
          maxRepliesPerHour: 20,
          replyDelay: 60,
          tone: 'professional',
          ...config.defaultSettings,
        });
      }
    }
  }

  /**
   * Update settings for a platform
   */
  updateSettings(platform: SocialPlatform, settings: Partial<AutoReplySettings>): void {
    const current = this.settings.get(platform) || {
      enabled: false,
      requireApproval: true,
      respondToComments: true,
      respondToMentions: true,
      respondToDMs: false,
    };

    this.settings.set(platform, { ...current, ...settings });
  }

  /**
   * Get settings for a platform
   */
  getSettings(platform: SocialPlatform): AutoReplySettings | undefined {
    return this.settings.get(platform);
  }

  /**
   * Set reply callback for a platform
   */
  setReplyCallback(platform: SocialPlatform, callback: ReplyCallback): void {
    this.replyCallbacks.set(platform, callback);
  }

  /**
   * Process an incoming interaction
   */
  async processInteraction(interaction: SocialInteraction): Promise<PendingReply | null> {
    const settings = this.settings.get(interaction.platform);

    if (!settings?.enabled) {
      return null;
    }

    // Check if we should respond to this type
    if (interaction.type === 'comment' && !settings.respondToComments) return null;
    if (interaction.type === 'mention' && !settings.respondToMentions) return null;
    if (interaction.type === 'dm' && !settings.respondToDMs) return null;

    // Check keyword filters
    if (settings.excludeKeywords?.some(kw => interaction.content.toLowerCase().includes(kw.toLowerCase()))) {
      return null;
    }

    if (settings.includeKeywords && settings.includeKeywords.length > 0) {
      if (!settings.includeKeywords.some(kw => interaction.content.toLowerCase().includes(kw.toLowerCase()))) {
        return null;
      }
    }

    // Check rate limit
    if (!this.checkRateLimit(interaction.platform, settings)) {
      return null;
    }

    // Generate reply
    const suggestedReply = await this.aiProvider.generateReply(interaction, settings);
    const sentiment = await this.aiProvider.analyzeSentiment(interaction.content);

    const pendingReply: PendingReply = {
      id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      interaction,
      suggestedReply,
      sentiment,
      confidence: this.calculateConfidence(interaction, sentiment),
      createdAt: Date.now(),
      status: 'pending',
    };

    this.pendingReplies.set(pendingReply.id, pendingReply);

    // Auto-send if no approval required and confidence is high
    if (!settings.requireApproval && pendingReply.confidence > 0.8) {
      await this.sendReply(pendingReply.id);
    }

    return pendingReply;
  }

  /**
   * Get pending replies
   */
  getPendingReplies(platform?: SocialPlatform): PendingReply[] {
    const all = Array.from(this.pendingReplies.values())
      .filter(r => r.status === 'pending');

    if (platform) {
      return all.filter(r => r.interaction.platform === platform);
    }

    return all;
  }

  /**
   * Get reply by ID
   */
  getPendingReply(id: string): PendingReply | undefined {
    return this.pendingReplies.get(id);
  }

  /**
   * Approve a pending reply
   */
  async approveReply(id: string, editedReply?: string, approvedBy?: string): Promise<PendingReply | null> {
    const reply = this.pendingReplies.get(id);
    if (!reply || reply.status !== 'pending') {
      return null;
    }

    reply.status = 'approved';
    reply.approvedAt = Date.now();
    reply.approvedBy = approvedBy;
    if (editedReply) {
      reply.editedReply = editedReply;
    }

    this.pendingReplies.set(id, reply);

    // Send the reply
    await this.sendReply(id);

    return reply;
  }

  /**
   * Reject a pending reply
   */
  rejectReply(id: string): PendingReply | null {
    const reply = this.pendingReplies.get(id);
    if (!reply || reply.status !== 'pending') {
      return null;
    }

    reply.status = 'rejected';
    this.pendingReplies.set(id, reply);

    return reply;
  }

  /**
   * Edit and approve a pending reply
   */
  async editAndApprove(id: string, newReply: string, approvedBy?: string): Promise<PendingReply | null> {
    return this.approveReply(id, newReply, approvedBy);
  }

  /**
   * Send an approved reply
   */
  private async sendReply(id: string): Promise<void> {
    const reply = this.pendingReplies.get(id);
    if (!reply) return;

    const callback = this.replyCallbacks.get(reply.interaction.platform);
    if (!callback) {
      console.error(`No reply callback set for ${reply.interaction.platform}`);
      return;
    }

    const settings = this.settings.get(reply.interaction.platform);
    const replyText = reply.editedReply || reply.suggestedReply;

    // Apply delay if configured
    const replyDelay = settings?.replyDelay;
    if (replyDelay && replyDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, replyDelay * 1000));
    }

    try {
      await callback(
        reply.interaction.platform,
        reply.interaction.platformInteractionId,
        replyText,
      );

      reply.status = 'sent';
      this.pendingReplies.set(id, reply);

      // Update rate limit counter
      const count = this.repliesThisHour.get(reply.interaction.platform) || 0;
      this.repliesThisHour.set(reply.interaction.platform, count + 1);
    } catch (error) {
      console.error(`Failed to send reply ${id}:`, error);
    }
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(platform: SocialPlatform, settings: AutoReplySettings): boolean {
    // Reset hourly counter
    if (Date.now() - this.lastHourReset > 3600000) {
      this.repliesThisHour.clear();
      this.lastHourReset = Date.now();
    }

    const count = this.repliesThisHour.get(platform) || 0;
    const maxReplies = settings.maxRepliesPerHour || 20;

    return count < maxReplies;
  }

  /**
   * Calculate reply confidence
   */
  private calculateConfidence(interaction: SocialInteraction, sentiment: string): number {
    let confidence = 0.7; // Base confidence

    // Higher confidence for positive interactions
    if (sentiment === 'positive') confidence += 0.15;

    // Lower confidence for negative (need human review)
    if (sentiment === 'negative') confidence -= 0.2;

    // Questions need more careful responses
    if (interaction.content.includes('?')) confidence -= 0.1;

    // Longer messages may need more nuanced replies
    if (interaction.content.length > 200) confidence -= 0.1;

    // Keep within bounds
    return Math.max(0.1, Math.min(0.95, confidence));
  }

  /**
   * Get reply statistics
   */
  getStatistics(platform?: SocialPlatform): {
    pending: number;
    approved: number;
    rejected: number;
    sent: number;
    avgConfidence: number;
  } {
    const replies = platform
      ? Array.from(this.pendingReplies.values()).filter(r => r.interaction.platform === platform)
      : Array.from(this.pendingReplies.values());

    const pending = replies.filter(r => r.status === 'pending').length;
    const approved = replies.filter(r => r.status === 'approved').length;
    const rejected = replies.filter(r => r.status === 'rejected').length;
    const sent = replies.filter(r => r.status === 'sent').length;

    const avgConfidence = replies.length > 0
      ? replies.reduce((sum, r) => sum + r.confidence, 0) / replies.length
      : 0;

    return { pending, approved, rejected, sent, avgConfidence };
  }

  /**
   * Clear old replies from memory
   */
  clearOldReplies(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let cleared = 0;

    for (const [id, reply] of this.pendingReplies) {
      if (reply.createdAt < cutoff && reply.status !== 'pending') {
        this.pendingReplies.delete(id);
        cleared++;
      }
    }

    return cleared;
  }
}

/**
 * Create auto-reply service instance
 */
export function createAutoReplyService(config?: AutoReplyConfig): AutoReplyService {
  return new AutoReplyService(config);
}
