/**
 * Content Creator Suite - LinkedIn Automation Service
 *
 * Main entry point for LinkedIn automation including posting, scheduling,
 * engagement, and messaging.
 */

export {
  PostSchedulerService,
  createPostScheduler,
  type ScheduledPost,
  type ScheduleOptions,
  type OptimalTimeSuggestion,
} from './post-scheduler.js';

export {
  EngagementManagerService,
  createEngagementManager,
  type EngagementManagerConfig,
  type EngagementTarget,
  type EngagementLog,
} from './engagement-manager.js';

export {
  MessageDrafterService,
  createMessageDrafter,
  type MessageType,
  type MessageTemplate,
  type DraftMessageOptions,
  type DraftedMessage,
} from './message-drafter.js';

import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { LinkedInProvider } from '../../providers/social/linkedin.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { LinkedInConfig } from '../../config.js';
import type { LinkedInPost, ContentProviderResult, LinkedInEngagementAction, AutomationTrigger, AutomationAction, AutomationCondition } from '../../types.js';

import { createPostScheduler, type ScheduleOptions, type ScheduledPost } from './post-scheduler.js';
import { createEngagementManager, type EngagementManagerConfig, type EngagementTarget, type EngagementLog } from './engagement-manager.js';
import { createMessageDrafter, type DraftMessageOptions, type DraftedMessage } from './message-drafter.js';
import type { PostedLinkedInPost } from '../../providers/social/linkedin.js';

// =============================================================================
// LinkedIn Automation Service (Facade)
// =============================================================================

export interface LinkedInAutomationServiceConfig {
  linkedin?: LinkedInConfig;
}

export class LinkedInAutomationService {
  public readonly scheduler: ReturnType<typeof createPostScheduler>;
  public readonly engagement: ReturnType<typeof createEngagementManager>;
  public readonly messageDrafter: ReturnType<typeof createMessageDrafter>;

  constructor(
    provider: LinkedInProvider,
    contentStore: ContentStore,
    voiceProfileStore: VoiceProfileStore,
    contentGenerator: ContentGeneratorProvider,
    config?: LinkedInAutomationServiceConfig
  ) {
    // Initialize scheduler
    this.scheduler = createPostScheduler(provider, contentStore);

    // Initialize engagement manager
    const engagementConfig: Partial<EngagementManagerConfig> | undefined = config?.linkedin?.automationRules
      ? {
          enabled: config.linkedin.automationRules.enabled,
          maxActionsPerDay: config.linkedin.automationRules.maxActionsPerDay,
          cooldownMinutes: config.linkedin.automationRules.cooldownMinutes,
          allowedActions: config.linkedin.automationRules.allowedActions as LinkedInEngagementAction[],
        }
      : undefined;

    this.engagement = createEngagementManager(provider, engagementConfig);

    // Initialize message drafter
    this.messageDrafter = createMessageDrafter(contentGenerator, voiceProfileStore);
  }

  // ==========================================================================
  // Post Management
  // ==========================================================================

  /**
   * Create and publish a post immediately
   */
  async publishPost(
    userId: string,
    post: LinkedInPost
  ): Promise<ContentProviderResult<PostedLinkedInPost>> {
    return this.scheduler.publishNow(userId, post);
  }

  /**
   * Schedule a post for later
   */
  async schedulePost(
    userId: string,
    post: LinkedInPost,
    scheduledAt: Date | number,
    timezone?: string
  ): Promise<ScheduledPost> {
    const timestamp = typeof scheduledAt === 'number' ? scheduledAt : scheduledAt.getTime();
    return this.scheduler.schedulePost(userId, post, {
      scheduledAt: timestamp,
      timezone,
    });
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId: string): Promise<boolean> {
    return this.scheduler.cancelScheduledPost(postId);
  }

  /**
   * Get all scheduled posts for a user
   */
  getScheduledPosts(userId: string): ScheduledPost[] {
    return this.scheduler.getScheduledPosts(userId);
  }

  /**
   * Get optimal posting times
   */
  getOptimalPostingTimes() {
    return this.scheduler.getOptimalPostingTimes();
  }

  /**
   * Get the next optimal posting time
   */
  getNextOptimalPostingTime(timezone?: string): Date {
    return this.scheduler.suggestNextOptimalTime(timezone);
  }

  // ==========================================================================
  // Engagement
  // ==========================================================================

  /**
   * Like a post
   */
  async likePost(postUrn: string) {
    return this.engagement.performAction('like', postUrn);
  }

  /**
   * Comment on a post
   */
  async commentOnPost(postUrn: string, comment: string) {
    return this.engagement.performAction('comment', postUrn, comment);
  }

  /**
   * Share a post
   */
  async sharePost(postUrn: string, commentary?: string) {
    return this.engagement.performAction('share', postUrn, commentary);
  }

  /**
   * Create an automation rule
   */
  createAutomationRule(
    userId: string,
    rule: {
      name: string;
      enabled: boolean;
      trigger: { type: 'new_post' | 'mention' | 'keyword'; keywords?: string[] };
      action: { type: 'like' | 'comment'; template?: string };
      conditions?: { field: string; operator: string; value: string | number }[];
      cooldownMinutes?: number;
      maxActionsPerDay?: number;
    }
  ) {
    return this.engagement.createRule(userId, {
      userId,
      name: rule.name,
      enabled: rule.enabled,
      trigger: rule.trigger as AutomationTrigger,
      action: rule.action as AutomationAction,
      conditions: (rule.conditions ?? []) as AutomationCondition[],
      cooldownMinutes: rule.cooldownMinutes ?? 60,
      maxActionsPerDay: rule.maxActionsPerDay ?? 10,
    });
  }

  /**
   * Get automation rules for a user
   */
  getAutomationRules(userId: string) {
    return this.engagement.getUserRules(userId);
  }

  /**
   * Delete an automation rule
   */
  deleteAutomationRule(ruleId: string): boolean {
    return this.engagement.deleteRule(ruleId);
  }

  /**
   * Process a target against automation rules
   */
  async processAutomation(userId: string, target: EngagementTarget): Promise<EngagementLog[]> {
    return this.engagement.processTarget(userId, target);
  }

  /**
   * Get engagement statistics
   */
  getEngagementStats() {
    return this.engagement.getStats();
  }

  /**
   * Get engagement logs
   */
  getEngagementLogs(options?: {
    action?: 'like' | 'comment' | 'share' | 'connect' | 'message';
    success?: boolean;
    limit?: number;
    fromDate?: number;
  }) {
    return this.engagement.getLogs(options);
  }

  // ==========================================================================
  // Messaging
  // ==========================================================================

  /**
   * Draft a message
   */
  async draftMessage(options: DraftMessageOptions): Promise<ContentProviderResult<DraftedMessage>> {
    return this.messageDrafter.draftMessage(options);
  }

  /**
   * Generate message variations
   */
  async generateMessageVariations(
    options: DraftMessageOptions,
    count?: number
  ): Promise<ContentProviderResult<DraftedMessage[]>> {
    return this.messageDrafter.generateVariations(options, count);
  }

  /**
   * Use a template to create a message
   */
  useMessageTemplate(templateId: string, variables: Record<string, string>): string | null {
    return this.messageDrafter.useTemplate(templateId, variables);
  }

  /**
   * Get available message templates
   */
  getMessageTemplates(type?: DraftMessageOptions['type']) {
    return this.messageDrafter.getTemplates(type);
  }

  /**
   * Personalize a message
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
  ) {
    return this.messageDrafter.personalizeMessage(baseMessage, recipientDetails);
  }

  /**
   * Improve a message
   */
  async improveMessage(
    message: string,
    improvements: ('professionalism' | 'warmth' | 'brevity' | 'call_to_action')[]
  ) {
    return this.messageDrafter.improveMessage(message, improvements);
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Shutdown the service
   */
  shutdown(): void {
    this.scheduler.shutdown();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createLinkedInAutomationService(
  provider: LinkedInProvider,
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  contentGenerator: ContentGeneratorProvider,
  config?: LinkedInAutomationServiceConfig
): LinkedInAutomationService {
  return new LinkedInAutomationService(
    provider,
    contentStore,
    voiceProfileStore,
    contentGenerator,
    config
  );
}
