/**
 * Social Media Scheduler
 *
 * Schedule posts, manage content calendar, cross-post
 */

import type {
  SocialPost,
  SocialPlatform,
  PostContent,
  PlatformPost,
  ScheduledPost,
  CalendarEvent,
  CrossPostOptions,
  BestTimeSlot,
} from './types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from './types.js';

export interface SchedulerConfig {
  checkInterval?: number; // ms between checks (default: 60000)
  maxRetries?: number;
  timezone?: string;
}

export interface PostCallback {
  (post: SocialPost): Promise<PlatformPost[]>;
}

export class SocialMediaScheduler {
  private scheduledPosts: Map<string, ScheduledPost> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private config: SchedulerConfig;
  private postCallback: PostCallback | null = null;

  constructor(config: SchedulerConfig = {}) {
    this.config = {
      checkInterval: config.checkInterval || 60000,
      maxRetries: config.maxRetries || 3,
      timezone: config.timezone || 'UTC',
    };
  }

  /**
   * Set the callback for posting
   */
  setPostCallback(callback: PostCallback): void {
    this.postCallback = callback;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(
      () => this.checkScheduledPosts(),
      this.config.checkInterval,
    );

    // Initial check
    this.checkScheduledPosts();
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Schedule a post
   */
  schedulePost(post: Omit<SocialPost, 'id' | 'createdAt' | 'updatedAt' | 'status'>, scheduledAt: number): ScheduledPost {
    const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const scheduledPost: ScheduledPost = {
      ...post,
      id,
      status: 'scheduled',
      scheduledAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.scheduledPosts.set(id, scheduledPost);
    return scheduledPost;
  }

  /**
   * Update a scheduled post
   */
  updateScheduledPost(id: string, updates: Partial<Pick<ScheduledPost, 'content' | 'platforms' | 'scheduledAt'>>): ScheduledPost | null {
    const post = this.scheduledPosts.get(id);
    if (!post) {
      return null;
    }

    const updatedPost: ScheduledPost = {
      ...post,
      ...updates,
      updatedAt: Date.now(),
    };

    this.scheduledPosts.set(id, updatedPost);
    return updatedPost;
  }

  /**
   * Cancel a scheduled post
   */
  cancelScheduledPost(id: string): boolean {
    return this.scheduledPosts.delete(id);
  }

  /**
   * Get scheduled post by ID
   */
  getScheduledPost(id: string): ScheduledPost | undefined {
    return this.scheduledPosts.get(id);
  }

  /**
   * Get all scheduled posts
   */
  getScheduledPosts(): ScheduledPost[] {
    return Array.from(this.scheduledPosts.values())
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  /**
   * Get posts scheduled for a date range
   */
  getPostsInRange(startDate: number, endDate: number): ScheduledPost[] {
    return this.getScheduledPosts().filter(
      post => post.scheduledAt >= startDate && post.scheduledAt <= endDate,
    );
  }

  /**
   * Get content calendar events
   */
  getCalendarEvents(startDate: number, endDate: number): CalendarEvent[] {
    return this.getPostsInRange(startDate, endDate).map(post => ({
      id: post.id,
      postId: post.id,
      title: this.getPostTitle(post),
      platforms: post.platforms,
      scheduledAt: post.scheduledAt,
      status: post.status,
      contentPreview: post.content.text.slice(0, 100) + (post.content.text.length > 100 ? '...' : ''),
    }));
  }

  /**
   * Check and publish due posts
   */
  private async checkScheduledPosts(): Promise<void> {
    const now = Date.now();
    const duePosts = Array.from(this.scheduledPosts.values()).filter(
      post => post.scheduledAt <= now && post.status === 'scheduled',
    );

    for (const post of duePosts) {
      await this.publishPost(post);
    }
  }

  /**
   * Publish a scheduled post
   */
  private async publishPost(post: ScheduledPost): Promise<void> {
    if (!this.postCallback) {
      console.error('No post callback set');
      return;
    }

    try {
      const platformPosts = await this.postCallback(post);

      // Update post status
      const updatedPost: ScheduledPost = {
        ...post,
        status: 'scheduled', // Will be removed from scheduled
        platformPosts,
        publishedAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Remove from scheduled
      this.scheduledPosts.delete(post.id);

      // Emit event or store published post
      console.log(`Published post ${post.id} to ${platformPosts.length} platforms`);
    } catch (error) {
      console.error(`Failed to publish post ${post.id}:`, error);

      // Update status to failed
      const failedPost: ScheduledPost = {
        ...post,
        updatedAt: Date.now(),
      };
      this.scheduledPosts.set(post.id, failedPost);
    }
  }

  /**
   * Get suggested post title
   */
  private getPostTitle(post: SocialPost): string {
    const text = post.content.text;
    const firstLine = text.split('\n')[0];
    return firstLine.slice(0, 50) + (firstLine.length > 50 ? '...' : '');
  }

  /**
   * Calculate best times to post
   */
  getBestTimesToPost(platform: SocialPlatform): BestTimeSlot[] {
    // General best times based on industry research
    const bestTimes: Record<SocialPlatform, BestTimeSlot[]> = {
      twitter: [
        { platform: 'twitter', dayOfWeek: 1, hour: 9, engagementScore: 0.9, audienceOnline: 0.8 },
        { platform: 'twitter', dayOfWeek: 2, hour: 9, engagementScore: 0.85, audienceOnline: 0.78 },
        { platform: 'twitter', dayOfWeek: 3, hour: 12, engagementScore: 0.88, audienceOnline: 0.82 },
        { platform: 'twitter', dayOfWeek: 4, hour: 9, engagementScore: 0.87, audienceOnline: 0.8 },
        { platform: 'twitter', dayOfWeek: 5, hour: 9, engagementScore: 0.82, audienceOnline: 0.75 },
      ],
      linkedin: [
        { platform: 'linkedin', dayOfWeek: 1, hour: 10, engagementScore: 0.9, audienceOnline: 0.85 },
        { platform: 'linkedin', dayOfWeek: 2, hour: 10, engagementScore: 0.92, audienceOnline: 0.88 },
        { platform: 'linkedin', dayOfWeek: 3, hour: 10, engagementScore: 0.95, audienceOnline: 0.9 },
        { platform: 'linkedin', dayOfWeek: 4, hour: 10, engagementScore: 0.88, audienceOnline: 0.82 },
        { platform: 'linkedin', dayOfWeek: 5, hour: 10, engagementScore: 0.75, audienceOnline: 0.7 },
      ],
      bluesky: [
        { platform: 'bluesky', dayOfWeek: 1, hour: 11, engagementScore: 0.85, audienceOnline: 0.75 },
        { platform: 'bluesky', dayOfWeek: 2, hour: 14, engagementScore: 0.82, audienceOnline: 0.72 },
        { platform: 'bluesky', dayOfWeek: 3, hour: 11, engagementScore: 0.88, audienceOnline: 0.78 },
        { platform: 'bluesky', dayOfWeek: 4, hour: 14, engagementScore: 0.8, audienceOnline: 0.7 },
        { platform: 'bluesky', dayOfWeek: 5, hour: 11, engagementScore: 0.75, audienceOnline: 0.65 },
      ],
      youtube: [
        { platform: 'youtube', dayOfWeek: 4, hour: 14, engagementScore: 0.95, audienceOnline: 0.9 },
        { platform: 'youtube', dayOfWeek: 5, hour: 15, engagementScore: 0.92, audienceOnline: 0.88 },
        { platform: 'youtube', dayOfWeek: 6, hour: 11, engagementScore: 0.9, audienceOnline: 0.85 },
        { platform: 'youtube', dayOfWeek: 0, hour: 11, engagementScore: 0.88, audienceOnline: 0.82 },
      ],
      instagram: [
        { platform: 'instagram', dayOfWeek: 1, hour: 11, engagementScore: 0.9, audienceOnline: 0.85 },
        { platform: 'instagram', dayOfWeek: 2, hour: 11, engagementScore: 0.92, audienceOnline: 0.88 },
        { platform: 'instagram', dayOfWeek: 3, hour: 11, engagementScore: 0.95, audienceOnline: 0.9 },
        { platform: 'instagram', dayOfWeek: 5, hour: 11, engagementScore: 0.85, audienceOnline: 0.8 },
        { platform: 'instagram', dayOfWeek: 6, hour: 10, engagementScore: 0.88, audienceOnline: 0.82 },
      ],
    };

    return bestTimes[platform] || [];
  }

  /**
   * Get next best time to post
   */
  getNextBestTime(platform: SocialPlatform): Date {
    const bestTimes = this.getBestTimesToPost(platform);
    if (bestTimes.length === 0) {
      // Default to tomorrow at 10am
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      return tomorrow;
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    // Find the next available slot
    for (const slot of bestTimes.sort((a, b) => b.engagementScore - a.engagementScore)) {
      let daysUntil = slot.dayOfWeek - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && slot.hour <= currentHour)) {
        daysUntil += 7;
      }

      const nextTime = new Date(now);
      nextTime.setDate(nextTime.getDate() + daysUntil);
      nextTime.setHours(slot.hour, 0, 0, 0);

      return nextTime;
    }

    // Fallback
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow;
  }
}

/**
 * Cross-poster for publishing to multiple platforms
 */
export class CrossPoster {
  private adapters: Map<SocialPlatform, (content: PostContent) => PostContent> = new Map();

  constructor() {
    this.setupDefaultAdapters();
  }

  /**
   * Setup default content adapters per platform
   */
  private setupDefaultAdapters(): void {
    // Twitter adapter - shorten text, limit hashtags
    this.adapters.set('twitter', (content) => {
      let text = content.text;
      if (text.length > PLATFORM_LIMITS.twitter.maxTextLength) {
        text = text.slice(0, PLATFORM_LIMITS.twitter.maxTextLength - 3) + '...';
      }
      return {
        ...content,
        text,
        hashtags: content.hashtags?.slice(0, 5), // Fewer hashtags on Twitter
      };
    });

    // LinkedIn adapter - more professional tone indicator
    this.adapters.set('linkedin', (content) => ({
      ...content,
      // LinkedIn supports longer text, keep as-is
    }));

    // Bluesky adapter - similar to Twitter
    this.adapters.set('bluesky', (content) => {
      let text = content.text;
      if (text.length > PLATFORM_LIMITS.bluesky.maxTextLength) {
        text = text.slice(0, PLATFORM_LIMITS.bluesky.maxTextLength - 3) + '...';
      }
      return {
        ...content,
        text,
      };
    });

    // YouTube adapter - for community posts
    this.adapters.set('youtube', (content) => ({
      ...content,
      // YouTube community posts support longer text
    }));

    // Instagram adapter - hashtag heavy, image required
    this.adapters.set('instagram', (content) => ({
      ...content,
      // Keep more hashtags for Instagram discovery
    }));
  }

  /**
   * Adapt content for a specific platform
   */
  adaptContent(content: PostContent, platform: SocialPlatform): PostContent {
    const adapter = this.adapters.get(platform);
    return adapter ? adapter(content) : content;
  }

  /**
   * Prepare content for cross-posting
   */
  prepareForCrossPost(
    content: PostContent,
    options: CrossPostOptions,
  ): Map<SocialPlatform, PostContent> {
    const result = new Map<SocialPlatform, PostContent>();

    for (const platform of options.platforms) {
      const adaptedContent = options.adaptContent
        ? this.adaptContent(content, platform)
        : content;

      result.set(platform, adaptedContent);
    }

    return result;
  }

  /**
   * Calculate staggered schedule times
   */
  getStaggeredSchedule(
    baseTime: number,
    platforms: SocialPlatform[],
    intervalMinutes: number,
  ): Map<SocialPlatform, number> {
    const schedule = new Map<SocialPlatform, number>();

    platforms.forEach((platform, index) => {
      schedule.set(platform, baseTime + index * intervalMinutes * 60 * 1000);
    });

    return schedule;
  }
}

/**
 * Create scheduler instance
 */
export function createScheduler(config?: SchedulerConfig): SocialMediaScheduler {
  return new SocialMediaScheduler(config);
}

/**
 * Create cross-poster instance
 */
export function createCrossPoster(): CrossPoster {
  return new CrossPoster();
}
