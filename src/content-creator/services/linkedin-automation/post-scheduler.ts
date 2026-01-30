/**
 * Content Creator Suite - LinkedIn Post Scheduler
 *
 * Schedule and manage LinkedIn posts with optimal timing.
 */

import type {
  LinkedInPost,
  GeneratedContent,
  ContentProviderResult,
} from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { LinkedInProvider, PostedLinkedInPost } from '../../providers/social/linkedin.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface ScheduledPost {
  id: string;
  userId: string;
  content: LinkedInPost;
  scheduledAt: number;
  timezone: string;
  status: 'pending' | 'processing' | 'published' | 'failed';
  publishedAt?: number;
  publishedPostId?: string;
  error?: string;
  createdAt: number;
}

export interface ScheduleOptions {
  scheduledAt: number;
  timezone?: string;
}

export interface OptimalTimeSuggestion {
  dayOfWeek: string;
  hour: number;
  score: number;
  reason: string;
}

// =============================================================================
// Post Scheduler Service
// =============================================================================

export class PostSchedulerService {
  private scheduledPosts = new Map<string, ScheduledPost>();
  private timers = new Map<string, NodeJS.Timeout>();
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly provider: LinkedInProvider,
    private readonly contentStore: ContentStore
  ) {}

  /**
   * Schedule a post for future publishing
   */
  async schedulePost(
    userId: string,
    post: LinkedInPost,
    options: ScheduleOptions
  ): Promise<ScheduledPost> {
    const id = crypto.randomUUID();
    const now = Date.now();

    if (options.scheduledAt <= now) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduledPost: ScheduledPost = {
      id,
      userId,
      content: post,
      scheduledAt: options.scheduledAt,
      timezone: options.timezone ?? 'UTC',
      status: 'pending',
      createdAt: now,
    };

    this.scheduledPosts.set(id, scheduledPost);

    // Store in content store
    await this.contentStore.create({
      userId,
      type: 'linkedin_post',
      platform: 'linkedin',
      status: 'scheduled',
      content: post.content,
      metadata: {
        wordCount: post.content.split(/\s+/).length,
        characterCount: post.content.length,
        readingTimeMinutes: 0,
      },
      scheduledAt: options.scheduledAt,
    });

    // Set up timer for publishing
    this.setupPublishTimer(scheduledPost);

    this.emit(CONTENT_EVENTS.LINKEDIN_POST_PUBLISHED, {
      scheduledPostId: id,
      scheduledAt: options.scheduledAt,
    });

    return scheduledPost;
  }

  /**
   * Cancel a scheduled post
   */
  async cancelScheduledPost(postId: string): Promise<boolean> {
    const post = this.scheduledPosts.get(postId);
    if (!post || post.status !== 'pending') {
      return false;
    }

    // Clear timer
    const timer = this.timers.get(postId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(postId);
    }

    this.scheduledPosts.delete(postId);
    return true;
  }

  /**
   * Get scheduled posts for a user
   */
  getScheduledPosts(userId: string): ScheduledPost[] {
    return Array.from(this.scheduledPosts.values())
      .filter(p => p.userId === userId)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  /**
   * Get a specific scheduled post
   */
  getScheduledPost(postId: string): ScheduledPost | undefined {
    return this.scheduledPosts.get(postId);
  }

  /**
   * Reschedule a pending post
   */
  async reschedulePost(
    postId: string,
    newScheduledAt: number
  ): Promise<ScheduledPost | null> {
    const post = this.scheduledPosts.get(postId);
    if (!post || post.status !== 'pending') {
      return null;
    }

    if (newScheduledAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    // Clear existing timer
    const timer = this.timers.get(postId);
    if (timer) {
      clearTimeout(timer);
    }

    // Update scheduled time
    post.scheduledAt = newScheduledAt;
    this.scheduledPosts.set(postId, post);

    // Set up new timer
    this.setupPublishTimer(post);

    return post;
  }

  /**
   * Get optimal posting times based on engagement patterns
   */
  getOptimalPostingTimes(): OptimalTimeSuggestion[] {
    // LinkedIn optimal posting times based on industry research
    return [
      {
        dayOfWeek: 'Tuesday',
        hour: 10,
        score: 95,
        reason: 'Peak professional engagement mid-morning',
      },
      {
        dayOfWeek: 'Wednesday',
        hour: 12,
        score: 90,
        reason: 'Lunch break engagement spike',
      },
      {
        dayOfWeek: 'Thursday',
        hour: 9,
        score: 88,
        reason: 'Start of business day, high visibility',
      },
      {
        dayOfWeek: 'Tuesday',
        hour: 14,
        score: 85,
        reason: 'Post-lunch engagement window',
      },
      {
        dayOfWeek: 'Wednesday',
        hour: 10,
        score: 83,
        reason: 'Mid-week professional activity peak',
      },
      {
        dayOfWeek: 'Thursday',
        hour: 11,
        score: 80,
        reason: 'Pre-lunch engagement',
      },
    ];
  }

  /**
   * Suggest next optimal posting time
   */
  suggestNextOptimalTime(timezone: string = 'UTC'): Date {
    const now = new Date();
    const optimalTimes = this.getOptimalPostingTimes();

    // Find the next optimal time slot
    for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + daysAhead);

      const dayName = checkDate.toLocaleDateString('en-US', { weekday: 'long' });

      for (const slot of optimalTimes) {
        if (slot.dayOfWeek === dayName) {
          const slotDate = new Date(checkDate);
          slotDate.setHours(slot.hour, 0, 0, 0);

          if (slotDate > now) {
            return slotDate;
          }
        }
      }
    }

    // Fallback: next Tuesday at 10 AM
    const nextTuesday = new Date(now);
    nextTuesday.setDate(nextTuesday.getDate() + ((2 - nextTuesday.getDay() + 7) % 7 || 7));
    nextTuesday.setHours(10, 0, 0, 0);
    return nextTuesday;
  }

  /**
   * Publish a post immediately
   */
  async publishNow(
    userId: string,
    post: LinkedInPost
  ): Promise<ContentProviderResult<PostedLinkedInPost>> {
    const result = await this.provider.createPost(post);

    if (result.success) {
      // Store in content store
      await this.contentStore.create({
        userId,
        type: 'linkedin_post',
        platform: 'linkedin',
        status: 'published',
        content: post.content,
        metadata: {
          wordCount: post.content.split(/\s+/).length,
          characterCount: post.content.length,
          readingTimeMinutes: 0,
        },
        publishedAt: Date.now(),
      });

      this.emit(CONTENT_EVENTS.LINKEDIN_POST_PUBLISHED, {
        postId: result.data.id,
        activityUrn: result.data.activityUrn,
      });
    }

    return result;
  }

  /**
   * Set up a timer to publish at the scheduled time
   */
  private setupPublishTimer(post: ScheduledPost): void {
    const delay = post.scheduledAt - Date.now();

    if (delay <= 0) {
      // Publish immediately if time has passed
      this.publishScheduledPost(post.id);
      return;
    }

    const timer = setTimeout(() => {
      this.publishScheduledPost(post.id);
    }, delay);

    this.timers.set(post.id, timer);
  }

  /**
   * Publish a scheduled post
   */
  private async publishScheduledPost(postId: string): Promise<void> {
    const post = this.scheduledPosts.get(postId);
    if (!post || post.status !== 'pending') {
      return;
    }

    post.status = 'processing';
    this.scheduledPosts.set(postId, post);

    try {
      const result = await this.provider.createPost(post.content);

      if (result.success) {
        post.status = 'published';
        post.publishedAt = Date.now();
        post.publishedPostId = result.data.id;

        this.emit(CONTENT_EVENTS.LINKEDIN_POST_PUBLISHED, {
          scheduledPostId: postId,
          postId: result.data.id,
          activityUrn: result.data.activityUrn,
        });
      } else {
        post.status = 'failed';
        post.error = result.error;

        this.emit(CONTENT_EVENTS.CONTENT_FAILED, {
          scheduledPostId: postId,
          error: result.error,
        });
      }
    } catch (error) {
      post.status = 'failed';
      post.error = error instanceof Error ? error.message : 'Unknown error';

      this.emit(CONTENT_EVENTS.CONTENT_FAILED, {
        scheduledPostId: postId,
        error: post.error,
      });
    }

    this.scheduledPosts.set(postId, post);
    this.timers.delete(postId);
  }

  /**
   * Clean up completed posts older than specified days
   */
  cleanup(olderThanDays: number = 30): number {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const [id, post] of this.scheduledPosts) {
      if (
        (post.status === 'published' || post.status === 'failed') &&
        post.createdAt < cutoff
      ) {
        this.scheduledPosts.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Shutdown - cancel all pending timers
   */
  shutdown(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
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

export function createPostScheduler(
  provider: LinkedInProvider,
  contentStore: ContentStore
): PostSchedulerService {
  return new PostSchedulerService(provider, contentStore);
}
