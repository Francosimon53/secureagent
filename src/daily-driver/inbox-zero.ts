/**
 * Inbox Zero
 *
 * Email inbox management and triage automation
 */

import type {
  Email,
  EmailSummary,
  EmailFilter,
  EmailProvider,
  InboxStats,
  InboxZeroAction,
  EmailPriority,
  EmailCategory,
} from './types.js';
import { DailyDriverError } from './types.js';
import type { EmailSummarizer } from './email-summarizer.js';
import {
  DAILY_DRIVER_EVENTS,
  EMAIL_PRIORITY_WEIGHTS,
  INBOX_ZERO_DEFAULTS,
  TIME_CONSTANTS,
} from './constants.js';

// =============================================================================
// Inbox Zero Config
// =============================================================================

export interface InboxZeroConfig {
  /** Email provider */
  provider?: EmailProvider;
  /** Email summarizer */
  summarizer?: EmailSummarizer;
  /** Batch size for processing */
  batchSize: number;
  /** Days after which to auto-archive read emails */
  autoArchiveDays: number;
  /** Labels for organization */
  labels: {
    actionRequired: string;
    followUp: string;
    waitingFor: string;
    someday: string;
    reference: string;
  };
  /** Auto-unsubscribe from newsletters */
  autoUnsubscribe: boolean;
  /** VIP contacts (never archive/auto-process) */
  vipContacts: string[];
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: InboxZeroConfig = {
  batchSize: INBOX_ZERO_DEFAULTS.BATCH_SIZE,
  autoArchiveDays: INBOX_ZERO_DEFAULTS.AUTO_ARCHIVE_DAYS,
  labels: {
    actionRequired: 'Action Required',
    followUp: 'Follow Up',
    waitingFor: 'Waiting For',
    someday: 'Someday/Maybe',
    reference: 'Reference',
  },
  autoUnsubscribe: false,
  vipContacts: [],
};

// =============================================================================
// Triage Decision
// =============================================================================

export interface TriageDecision {
  emailId: string;
  actions: InboxZeroAction[];
  reason: string;
  confidence: number;
  requiresReview: boolean;
}

// =============================================================================
// Inbox Zero Manager
// =============================================================================

export class InboxZeroManager {
  private readonly config: InboxZeroConfig;
  private provider: EmailProvider | null = null;
  private summarizer: EmailSummarizer | null = null;

  constructor(config?: Partial<InboxZeroConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = this.config.provider ?? null;
    this.summarizer = this.config.summarizer ?? null;
  }

  /**
   * Set the email provider
   */
  setProvider(provider: EmailProvider): void {
    this.provider = provider;
  }

  /**
   * Set the email summarizer
   */
  setSummarizer(summarizer: EmailSummarizer): void {
    this.summarizer = summarizer;
  }

  /**
   * Get inbox statistics
   */
  async getStats(filter?: EmailFilter): Promise<InboxStats> {
    this.ensureProvider();

    const emails = await this.provider!.listEmails(
      { isUnread: true, ...filter },
      { limit: 500 }
    );

    const stats: InboxStats = {
      total: emails.length,
      unread: emails.filter(e => !e.isRead).length,
      byPriority: { urgent: 0, high: 0, normal: 0, low: 0 },
      byCategory: {
        action_required: 0,
        follow_up: 0,
        fyi: 0,
        newsletter: 0,
        promotional: 0,
        spam: 0,
      },
      actionRequired: 0,
    };

    if (this.summarizer) {
      const summaries = await this.summarizer.summarizeMany(emails.slice(0, 100));

      for (const summary of summaries) {
        stats.byPriority[summary.priority]++;
        stats.byCategory[summary.category]++;
        if (summary.category === 'action_required') {
          stats.actionRequired++;
        }
      }
    }

    return stats;
  }

  /**
   * Process inbox and generate triage decisions
   */
  async triageInbox(options?: {
    limit?: number;
    autoApply?: boolean;
  }): Promise<TriageDecision[]> {
    this.ensureProvider();

    const limit = options?.limit ?? this.config.batchSize;
    const emails = await this.provider!.listEmails(
      { isUnread: true },
      { limit }
    );

    const decisions: TriageDecision[] = [];

    for (const email of emails) {
      const decision = await this.triageEmail(email);
      decisions.push(decision);

      if (options?.autoApply && !decision.requiresReview) {
        await this.applyActions(decision);
      }
    }

    this.emit(DAILY_DRIVER_EVENTS.INBOX_PROCESSED, {
      processed: emails.length,
      decisions: decisions.length,
      autoApplied: options?.autoApply ? decisions.filter(d => !d.requiresReview).length : 0,
    });

    return decisions;
  }

  /**
   * Triage a single email
   */
  async triageEmail(email: Email): Promise<TriageDecision> {
    const actions: InboxZeroAction[] = [];
    let reason = '';
    let confidence = 0.5;
    let requiresReview = true;

    // Get summary if available
    let summary: EmailSummary | undefined;
    if (this.summarizer) {
      summary = await this.summarizer.summarize(email);
    }

    const isVip = this.config.vipContacts.some(
      vip => email.from.email.toLowerCase() === vip.toLowerCase()
    );

    // VIP emails always require review
    if (isVip) {
      actions.push({ type: 'star', emailId: email.id });
      reason = 'VIP sender - review required';
      return { emailId: email.id, actions, reason, confidence: 1, requiresReview: true };
    }

    // Categorize and decide actions
    const category = summary?.category ?? this.categorizeSimple(email);
    const priority = summary?.priority ?? 'normal';

    switch (category) {
      case 'spam':
        actions.push({ type: 'delete', emailId: email.id });
        reason = 'Detected as spam';
        confidence = 0.9;
        requiresReview = false;
        break;

      case 'promotional':
        actions.push({ type: 'archive', emailId: email.id });
        if (this.config.autoUnsubscribe) {
          actions.push({ type: 'unsubscribe', emailId: email.id });
        }
        reason = 'Promotional email - archived';
        confidence = 0.85;
        requiresReview = false;
        break;

      case 'newsletter':
        actions.push({ type: 'archive', emailId: email.id });
        actions.push({
          type: 'label',
          emailId: email.id,
          params: { label: 'Newsletters' },
        });
        reason = 'Newsletter - archived and labeled';
        confidence = 0.8;
        requiresReview = false;
        break;

      case 'action_required':
        actions.push({
          type: 'label',
          emailId: email.id,
          params: { label: this.config.labels.actionRequired },
        });
        if (priority === 'urgent' || priority === 'high') {
          actions.push({ type: 'star', emailId: email.id });
        }
        reason = 'Action required - labeled for follow-up';
        confidence = 0.7;
        requiresReview = true;
        break;

      case 'follow_up':
        actions.push({
          type: 'label',
          emailId: email.id,
          params: { label: this.config.labels.followUp },
        });
        reason = 'Follow-up needed - labeled';
        confidence = 0.7;
        requiresReview = priority !== 'low';
        break;

      case 'fyi':
        if (priority === 'low') {
          actions.push({ type: 'archive', emailId: email.id });
          reason = 'Low priority FYI - archived';
          confidence = 0.75;
          requiresReview = false;
        } else {
          actions.push({
            type: 'label',
            emailId: email.id,
            params: { label: this.config.labels.reference },
          });
          reason = 'FYI - labeled as reference';
          confidence = 0.6;
          requiresReview = true;
        }
        break;
    }

    return { emailId: email.id, actions, reason, confidence, requiresReview };
  }

  /**
   * Apply triage actions
   */
  async applyActions(decision: TriageDecision): Promise<void> {
    this.ensureProvider();

    for (const action of decision.actions) {
      try {
        await this.executeAction(action);
        this.emit(DAILY_DRIVER_EVENTS.EMAIL_ACTION_TAKEN, {
          emailId: action.emailId,
          action: action.type,
        });
      } catch (error) {
        throw new DailyDriverError(
          'PROVIDER_ERROR',
          `Failed to execute action ${action.type}: ${error}`,
          this.provider!.name
        );
      }
    }
  }

  /**
   * Execute a single action
   */
  async executeAction(action: InboxZeroAction): Promise<void> {
    this.ensureProvider();

    switch (action.type) {
      case 'archive':
        await this.provider!.archive([action.emailId]);
        break;

      case 'delete':
        await this.provider!.trash([action.emailId]);
        break;

      case 'label':
        if (action.params?.label) {
          await this.provider!.label([action.emailId], action.params.label);
        }
        break;

      case 'star':
        await this.provider!.star([action.emailId]);
        break;

      case 'snooze':
        // Snooze implementation depends on provider support
        // For now, label and archive, then create reminder
        await this.provider!.label([action.emailId], 'Snoozed');
        await this.provider!.archive([action.emailId]);
        break;

      case 'unsubscribe':
        // This would need to parse the email for unsubscribe links
        // For now, just mark it
        await this.provider!.label([action.emailId], 'Unsubscribed');
        break;

      default:
        throw new DailyDriverError(
          'INVALID_REQUEST',
          `Unknown action type: ${action.type}`
        );
    }
  }

  /**
   * Get suggested quick actions for an email
   */
  async getSuggestedActions(email: Email): Promise<InboxZeroAction[]> {
    const decision = await this.triageEmail(email);
    return decision.actions;
  }

  /**
   * Archive old read emails
   */
  async archiveOldEmails(daysOld?: number): Promise<number> {
    this.ensureProvider();

    const cutoffDate = Date.now() - (daysOld ?? this.config.autoArchiveDays) * TIME_CONSTANTS.DAY_MS;

    const oldEmails = await this.provider!.listEmails({
      isUnread: false,
      receivedBefore: cutoffDate,
      excludeLabels: [
        this.config.labels.actionRequired,
        this.config.labels.waitingFor,
        'STARRED',
      ],
    });

    if (oldEmails.length > 0) {
      await this.provider!.archive(oldEmails.map(e => e.id));
    }

    return oldEmails.length;
  }

  /**
   * Get unread count by priority
   */
  async getUnreadByPriority(): Promise<Record<EmailPriority, Email[]>> {
    this.ensureProvider();

    const unread = await this.provider!.listEmails({ isUnread: true }, { limit: 100 });

    const result: Record<EmailPriority, Email[]> = {
      urgent: [],
      high: [],
      normal: [],
      low: [],
    };

    if (!this.summarizer) {
      // Without summarizer, put all in normal
      result.normal = unread;
      return result;
    }

    const summaries = await this.summarizer.summarizeMany(unread);
    for (let i = 0; i < unread.length; i++) {
      result[summaries[i].priority].push(unread[i]);
    }

    return result;
  }

  /**
   * Get emails requiring action
   */
  async getActionRequired(): Promise<Array<{ email: Email; summary?: EmailSummary }>> {
    this.ensureProvider();

    const emails = await this.provider!.listEmails({
      isUnread: true,
      labels: [this.config.labels.actionRequired],
    });

    const results: Array<{ email: Email; summary?: EmailSummary }> = [];

    for (const email of emails) {
      const summary = this.summarizer
        ? await this.summarizer.summarize(email)
        : undefined;
      results.push({ email, summary });
    }

    return results;
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private ensureProvider(): void {
    if (!this.provider) {
      throw new DailyDriverError(
        'CONFIGURATION_ERROR',
        'Email provider not configured'
      );
    }
  }

  private categorizeSimple(email: Email): EmailCategory {
    const text = (email.subject + ' ' + (email.bodyPlain ?? email.body)).toLowerCase();

    // Simple pattern matching
    if (/unsubscribe|newsletter|weekly digest/i.test(text)) return 'newsletter';
    if (/% off|sale|discount|special offer|limited time/i.test(text)) return 'promotional';
    if (/please (respond|reply|confirm|approve)/i.test(text)) return 'action_required';
    if (/follow(ing)? up|checking in/i.test(text)) return 'follow_up';

    return 'fyi';
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createInboxZeroManager(config?: Partial<InboxZeroConfig>): InboxZeroManager {
  return new InboxZeroManager(config);
}
