/**
 * Inbox Zero Service
 *
 * Email management and organization service.
 */

import type {
  EmailDigest,
  EmailCategory,
  EmailStats,
  EmailAction,
  InboxZeroServiceConfig,
} from '../types.js';
import type { EmailProvider } from '../providers/email.js';
import {
  categorizeEmail,
  categorizeEmails,
  suggestActions,
  getCategoryDistribution,
  getArchiveCandidates,
  getUnsubscribeCandidates,
} from './categorizer.js';
import {
  scoreEmailPriority,
  scoreEmails,
  getHighPriorityEmails,
  isVIPSender,
  type PriorityScore,
  type PriorityScorerConfig,
} from './priority-scorer.js';

// Re-export utility functions
export {
  categorizeEmail,
  categorizeEmails,
  suggestActions,
  getCategoryDistribution,
  getArchiveCandidates,
  getUnsubscribeCandidates,
  scoreEmailPriority,
  scoreEmails,
  getHighPriorityEmails,
  isVIPSender,
  type PriorityScore,
  type PriorityScorerConfig,
};

/**
 * Processed email with additional analysis
 */
export interface ProcessedEmail {
  email: EmailDigest;
  category: EmailCategory;
  priorityScore: PriorityScore;
  suggestedActions: EmailAction[];
  flags: EmailFlags;
}

export interface EmailFlags {
  isVIP: boolean;
  needsReply: boolean;
  canArchive: boolean;
  canUnsubscribe: boolean;
}

/**
 * Inbox Zero progress
 */
export interface InboxZeroProgress {
  totalEmails: number;
  processedEmails: number;
  archivedEmails: number;
  deletedEmails: number;
  unsubscribedSenders: number;
  progressPercent: number;
  currentStreak: number; // Days with inbox zero achieved
  lastInboxZeroDate: number | null;
}

/**
 * Inbox Zero Service
 */
export class InboxZeroService {
  private readonly maxEmailsToProcess: number;
  private readonly vipSenders: string[];
  private readonly autoArchiveAfterDays: number;

  constructor(
    private readonly emailProvider: EmailProvider,
    config?: Partial<InboxZeroServiceConfig>
  ) {
    this.maxEmailsToProcess = config?.maxEmailsToProcess ?? 100;
    this.vipSenders = config?.vipSenders ?? [];
    this.autoArchiveAfterDays = config?.autoArchiveAfterDays ?? 0;
  }

  /**
   * Process and analyze emails
   */
  async processEmails(): Promise<ProcessedEmail[]> {
    const result = await this.emailProvider.getEmails({
      maxResults: this.maxEmailsToProcess,
      unreadOnly: false,
    });

    if (!result.success || !result.data) {
      return [];
    }

    return result.data.map(email => this.processEmail(email));
  }

  /**
   * Process a single email
   */
  processEmail(email: EmailDigest): ProcessedEmail {
    const category = categorizeEmail(email);
    const priorityScore = scoreEmailPriority(email, { vipSenders: this.vipSenders });
    const suggestedActions = suggestActions(email);

    const flags: EmailFlags = {
      isVIP: isVIPSender(email, this.vipSenders),
      needsReply: this.needsReply(email, priorityScore),
      canArchive: this.canArchive(email, category),
      canUnsubscribe: email.hasUnsubscribeLink && (category === 'promotions' || category === 'social'),
    };

    return {
      email,
      category,
      priorityScore,
      suggestedActions,
      flags,
    };
  }

  /**
   * Get prioritized email list
   */
  async getPrioritizedEmails(limit = 20): Promise<ProcessedEmail[]> {
    const processed = await this.processEmails();

    // Sort by priority score
    processed.sort((a, b) => b.priorityScore.total - a.priorityScore.total);

    return processed.slice(0, limit);
  }

  /**
   * Get emails that need attention
   */
  async getActionableEmails(): Promise<ProcessedEmail[]> {
    const processed = await this.processEmails();

    return processed.filter(p =>
      p.flags.needsReply ||
      p.flags.isVIP ||
      p.priorityScore.total >= 0.7
    );
  }

  /**
   * Get emails by category
   */
  async getEmailsByCategory(): Promise<Map<EmailCategory, ProcessedEmail[]>> {
    const processed = await this.processEmails();
    const grouped = new Map<EmailCategory, ProcessedEmail[]>();

    for (const p of processed) {
      const existing = grouped.get(p.category) ?? [];
      existing.push(p);
      grouped.set(p.category, existing);
    }

    return grouped;
  }

  /**
   * Get archive candidates
   */
  async getArchiveCandidates(): Promise<EmailDigest[]> {
    const result = await this.emailProvider.getEmails({
      maxResults: this.maxEmailsToProcess,
    });

    if (!result.success || !result.data) {
      return [];
    }

    return getArchiveCandidates(result.data, this.autoArchiveAfterDays || 7);
  }

  /**
   * Get unsubscribe candidates
   */
  async getUnsubscribeCandidates(): Promise<EmailDigest[]> {
    const result = await this.emailProvider.getEmails({
      maxResults: this.maxEmailsToProcess,
    });

    if (!result.success || !result.data) {
      return [];
    }

    return getUnsubscribeCandidates(result.data);
  }

  /**
   * Get email statistics
   */
  async getStats(): Promise<InboxZeroStats> {
    const result = await this.emailProvider.getEmails({
      maxResults: this.maxEmailsToProcess,
    });

    if (!result.success || !result.data) {
      return this.emptyStats();
    }

    const emails = result.data;
    const processed = emails.map(e => this.processEmail(e));

    const categoryDistribution = getCategoryDistribution(emails);
    const archiveCandidates = getArchiveCandidates(emails);
    const unsubscribeCandidates = getUnsubscribeCandidates(emails);

    return {
      total: emails.length,
      unread: emails.filter(e => !e.isRead).length,
      byCategory: categoryDistribution,
      byPriority: {
        high: processed.filter(p => p.priorityScore.total >= 0.7).length,
        medium: processed.filter(p => p.priorityScore.total >= 0.4 && p.priorityScore.total < 0.7).length,
        low: processed.filter(p => p.priorityScore.total < 0.4).length,
      },
      actionable: processed.filter(p => p.flags.needsReply).length,
      archiveCandidates: archiveCandidates.length,
      unsubscribeCandidates: unsubscribeCandidates.length,
      vipEmails: processed.filter(p => p.flags.isVIP).length,
    };
  }

  /**
   * Generate inbox zero recommendations
   */
  async getRecommendations(): Promise<InboxZeroRecommendation[]> {
    const stats = await this.getStats();
    const recommendations: InboxZeroRecommendation[] = [];

    if (stats.archiveCandidates > 0) {
      recommendations.push({
        type: 'archive',
        count: stats.archiveCandidates,
        description: `Archive ${stats.archiveCandidates} old, read emails to declutter your inbox`,
        priority: 'medium',
      });
    }

    if (stats.unsubscribeCandidates > 0) {
      recommendations.push({
        type: 'unsubscribe',
        count: stats.unsubscribeCandidates,
        description: `Unsubscribe from ${stats.unsubscribeCandidates} mailing lists you rarely engage with`,
        priority: 'low',
      });
    }

    if (stats.byCategory.promotions > stats.total * 0.3) {
      recommendations.push({
        type: 'filter',
        count: stats.byCategory.promotions,
        description: 'Create filters to automatically archive promotional emails',
        priority: 'medium',
      });
    }

    if (stats.actionable > 5) {
      recommendations.push({
        type: 'respond',
        count: stats.actionable,
        description: `${stats.actionable} emails may need your response`,
        priority: 'high',
      });
    }

    if (stats.vipEmails > 0) {
      recommendations.push({
        type: 'priority',
        count: stats.vipEmails,
        description: `${stats.vipEmails} emails from important contacts need attention`,
        priority: 'high',
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Mark email as read
   */
  async markAsRead(emailId: string): Promise<boolean> {
    const result = await this.emailProvider.markAsRead(emailId);
    return result.success;
  }

  /**
   * Archive email
   */
  async archiveEmail(emailId: string): Promise<boolean> {
    const result = await this.emailProvider.archive(emailId);
    return result.success;
  }

  /**
   * Batch archive emails
   */
  async batchArchive(emailIds: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of emailIds) {
      if (await this.archiveEmail(id)) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private needsReply(email: EmailDigest, score: PriorityScore): boolean {
    // High priority + primary category often needs reply
    if (score.total >= 0.7 && email.category === 'primary') {
      return true;
    }

    // Check for question indicators
    const subject = email.subject.toLowerCase();
    const hasQuestion = subject.includes('?') ||
      subject.includes('can you') ||
      subject.includes('could you') ||
      subject.includes('please');

    return hasQuestion && !email.isRead;
  }

  private canArchive(email: EmailDigest, category: EmailCategory): boolean {
    // Already read + not starred + low-priority category
    if (!email.isRead || email.isStarred) {
      return false;
    }

    if (['promotions', 'social', 'updates', 'forums'].includes(category)) {
      return true;
    }

    return false;
  }

  private emptyStats(): InboxZeroStats {
    return {
      total: 0,
      unread: 0,
      byCategory: {
        primary: 0,
        promotions: 0,
        social: 0,
        updates: 0,
        forums: 0,
        spam: 0,
      },
      byPriority: { high: 0, medium: 0, low: 0 },
      actionable: 0,
      archiveCandidates: 0,
      unsubscribeCandidates: 0,
      vipEmails: 0,
    };
  }
}

/**
 * Extended email statistics
 */
export interface InboxZeroStats {
  total: number;
  unread: number;
  byCategory: Record<EmailCategory, number>;
  byPriority: { high: number; medium: number; low: number };
  actionable: number;
  archiveCandidates: number;
  unsubscribeCandidates: number;
  vipEmails: number;
}

/**
 * Inbox zero recommendation
 */
export interface InboxZeroRecommendation {
  type: 'archive' | 'unsubscribe' | 'filter' | 'respond' | 'priority';
  count: number;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

/**
 * Create an inbox zero service
 */
export function createInboxZeroService(
  emailProvider: EmailProvider,
  config?: Partial<InboxZeroServiceConfig>
): InboxZeroService {
  return new InboxZeroService(emailProvider, config);
}
