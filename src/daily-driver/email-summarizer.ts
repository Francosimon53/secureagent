/**
 * Email Summarizer
 *
 * AI-powered email summarization and categorization
 */

import type {
  Email,
  EmailSummary,
  EmailThread,
  EmailPriority,
  EmailCategory,
  EmailSentiment,
} from './types.js';
import { DailyDriverError } from './types.js';
import {
  DAILY_DRIVER_EVENTS,
  EMAIL_PRIORITY_WEIGHTS,
  EMAIL_CATEGORIZATION_PATTERNS,
  INBOX_ZERO_DEFAULTS,
} from './constants.js';

// =============================================================================
// AI Summarizer Interface
// =============================================================================

export interface AISummarizer {
  summarize(text: string, options?: { maxLength?: number }): Promise<string>;
  extractKeyPoints(text: string): Promise<string[]>;
  extractActionItems(text: string): Promise<string[]>;
  analyzeSentiment(text: string): Promise<EmailSentiment>;
  generateReply(email: Email, tone?: 'formal' | 'friendly' | 'brief'): Promise<string>;
}

// =============================================================================
// Email Summarizer Config
// =============================================================================

export interface EmailSummarizerConfig {
  /** AI summarizer instance */
  aiSummarizer?: AISummarizer;
  /** Maximum summary length */
  maxSummaryLength: number;
  /** Words per minute for read time estimation */
  wordsPerMinute: number;
  /** VIP email addresses for priority boost */
  vipContacts: string[];
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: EmailSummarizerConfig = {
  maxSummaryLength: 200,
  wordsPerMinute: INBOX_ZERO_DEFAULTS.WORDS_PER_MINUTE,
  vipContacts: [],
};

// =============================================================================
// Email Summarizer
// =============================================================================

export class EmailSummarizer {
  private readonly config: EmailSummarizerConfig;
  private readonly cache = new Map<string, EmailSummary>();

  constructor(config?: Partial<EmailSummarizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Summarize a single email
   */
  async summarize(email: Email): Promise<EmailSummary> {
    // Check cache
    const cached = this.cache.get(email.id);
    if (cached) return cached;

    const text = email.bodyPlain ?? this.stripHtml(email.body);

    // Use AI if available, otherwise use extraction-based summarization
    let summary: string;
    let keyPoints: string[];
    let actionItems: string[];
    let sentiment: EmailSentiment;
    let suggestedReply: string | undefined;

    if (this.config.aiSummarizer) {
      [summary, keyPoints, actionItems, sentiment] = await Promise.all([
        this.config.aiSummarizer.summarize(text, { maxLength: this.config.maxSummaryLength }),
        this.config.aiSummarizer.extractKeyPoints(text),
        this.config.aiSummarizer.extractActionItems(text),
        this.config.aiSummarizer.analyzeSentiment(text),
      ]);

      // Generate reply suggestion for action-required emails
      if (actionItems.length > 0) {
        suggestedReply = await this.config.aiSummarizer.generateReply(email, 'friendly');
      }
    } else {
      summary = this.extractSummary(text);
      keyPoints = this.extractKeyPointsSimple(text);
      actionItems = this.extractActionItemsSimple(text);
      sentiment = this.analyzeSentimentSimple(text);
    }

    const priority = this.determinePriority(email, sentiment, actionItems);
    const category = this.categorize(email, actionItems);
    const estimatedReadTime = this.estimateReadTime(text);

    const result: EmailSummary = {
      emailId: email.id,
      summary,
      keyPoints,
      actionItems,
      sentiment,
      priority,
      category,
      suggestedReply,
      estimatedReadTime,
    };

    this.cache.set(email.id, result);
    this.emit(DAILY_DRIVER_EVENTS.EMAIL_SUMMARIZED, { emailId: email.id, summary: result });

    return result;
  }

  /**
   * Summarize multiple emails
   */
  async summarizeMany(emails: Email[]): Promise<EmailSummary[]> {
    return Promise.all(emails.map(email => this.summarize(email)));
  }

  /**
   * Summarize an email thread
   */
  async summarizeThread(thread: EmailThread): Promise<{
    thread: EmailThread;
    summary: string;
    participants: string[];
    timeline: Array<{ from: string; summary: string; date: number }>;
    pendingActions: string[];
  }> {
    const emailSummaries = await this.summarizeMany(thread.emails);

    // Aggregate summaries
    const summaryTexts = emailSummaries.map(s => s.summary);
    const allActions = emailSummaries.flatMap(s => s.actionItems);

    // Generate thread summary
    let threadSummary: string;
    if (this.config.aiSummarizer) {
      threadSummary = await this.config.aiSummarizer.summarize(
        summaryTexts.join('\n\n'),
        { maxLength: this.config.maxSummaryLength * 2 }
      );
    } else {
      threadSummary = `Thread with ${thread.emails.length} messages. ${summaryTexts[summaryTexts.length - 1]}`;
    }

    const participants = [...new Set(thread.emails.map(e => e.from.email))];

    const timeline = thread.emails.map((email, i) => ({
      from: email.from.name ?? email.from.email,
      summary: emailSummaries[i].summary,
      date: email.receivedAt,
    }));

    return {
      thread: { ...thread, summary: threadSummary },
      summary: threadSummary,
      participants,
      timeline,
      pendingActions: [...new Set(allActions)],
    };
  }

  /**
   * Categorize an email
   */
  categorize(email: Email, actionItems?: string[]): EmailCategory {
    const text = (email.subject + ' ' + (email.bodyPlain ?? email.body)).toLowerCase();

    // Check for action required
    if (actionItems && actionItems.length > 0) {
      return 'action_required';
    }

    // Check patterns
    for (const [category, patterns] of Object.entries(EMAIL_CATEGORIZATION_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          this.emit(DAILY_DRIVER_EVENTS.EMAIL_CATEGORIZED, {
            emailId: email.id,
            category: category as EmailCategory,
          });
          return category as EmailCategory;
        }
      }
    }

    // Default category
    return 'fyi';
  }

  /**
   * Determine email priority
   */
  determinePriority(email: Email, sentiment: EmailSentiment, actionItems: string[]): EmailPriority {
    let score = 0;

    // VIP sender boost
    if (this.config.vipContacts.includes(email.from.email.toLowerCase())) {
      score += 3;
    }

    // Sentiment-based scoring
    if (sentiment === 'urgent') score += 4;
    if (sentiment === 'negative') score += 2;

    // Action items boost
    score += Math.min(actionItems.length * 2, 4);

    // Subject line indicators
    const subject = email.subject.toLowerCase();
    if (/urgent|asap|immediately|critical/i.test(subject)) score += 3;
    if (/important|priority|attention/i.test(subject)) score += 2;
    if (/re:|fwd:/i.test(subject)) score -= 1;

    // Starred emails
    if (email.isStarred) score += 2;

    // Determine priority
    if (score >= 7) return 'urgent';
    if (score >= 5) return 'high';
    if (score >= 2) return 'normal';
    return 'low';
  }

  /**
   * Clear cache for an email
   */
  clearCache(emailId: string): void {
    this.cache.delete(emailId);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private extractSummary(text: string): string {
    // Simple extraction: first paragraph or first N characters
    const cleaned = text.replace(/\s+/g, ' ').trim();
    const firstParagraph = cleaned.split(/\n\n|\r\n\r\n/)[0];

    if (firstParagraph.length <= this.config.maxSummaryLength) {
      return firstParagraph;
    }

    // Find sentence boundary
    const truncated = firstParagraph.substring(0, this.config.maxSummaryLength);
    const lastSentence = truncated.lastIndexOf('. ');
    if (lastSentence > this.config.maxSummaryLength / 2) {
      return truncated.substring(0, lastSentence + 1);
    }

    return truncated + '...';
  }

  private extractKeyPointsSimple(text: string): string[] {
    const points: string[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // Look for bullet points
    const bulletMatch = text.match(/^[\s]*[-•*]\s+(.+)$/gm);
    if (bulletMatch) {
      points.push(...bulletMatch.map(b => b.replace(/^[\s]*[-•*]\s+/, '').trim()));
    }

    // Look for numbered items
    const numberedMatch = text.match(/^[\s]*\d+[.)]\s+(.+)$/gm);
    if (numberedMatch) {
      points.push(...numberedMatch.map(n => n.replace(/^[\s]*\d+[.)]\s+/, '').trim()));
    }

    // If no structured points, extract key sentences
    if (points.length === 0) {
      const keyIndicators = /important|note|please|reminder|update|announce/i;
      for (const sentence of sentences.slice(0, 10)) {
        if (keyIndicators.test(sentence)) {
          points.push(sentence.trim());
        }
      }
    }

    return points.slice(0, 5);
  }

  private extractActionItemsSimple(text: string): string[] {
    const actions: string[] = [];
    const sentences = text.split(/[.!?]+/);

    const actionPatterns = [
      /please ([\w\s]+)/i,
      /could you ([\w\s]+)/i,
      /need you to ([\w\s]+)/i,
      /action required: ([\w\s]+)/i,
      /todo: ([\w\s]+)/i,
      /deadline: ([\w\s]+)/i,
    ];

    for (const sentence of sentences) {
      for (const pattern of actionPatterns) {
        const match = sentence.match(pattern);
        if (match) {
          actions.push(match[1].trim());
          break;
        }
      }
    }

    return [...new Set(actions)].slice(0, 3);
  }

  private analyzeSentimentSimple(text: string): EmailSentiment {
    const lower = text.toLowerCase();

    // Urgent indicators
    if (/urgent|asap|immediately|critical|emergency/i.test(lower)) {
      return 'urgent';
    }

    // Negative indicators
    const negativeWords = ['disappointed', 'frustrated', 'problem', 'issue', 'concern', 'complaint', 'unfortunately', 'sorry'];
    const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
    if (negativeCount >= 2) return 'negative';

    // Positive indicators
    const positiveWords = ['great', 'excellent', 'wonderful', 'thank', 'appreciate', 'congratulations', 'excited', 'happy'];
    const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
    if (positiveCount >= 2) return 'positive';

    return 'neutral';
  }

  private estimateReadTime(text: string): number {
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount / this.config.wordsPerMinute);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEmailSummarizer(config?: Partial<EmailSummarizerConfig>): EmailSummarizer {
  return new EmailSummarizer(config);
}
