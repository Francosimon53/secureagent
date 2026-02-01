/**
 * Social Media Management Service
 *
 * Unified interface for all social media operations
 */

import type {
  SocialPlatform,
  SocialPost,
  PostContent,
  PlatformPost,
  SocialAccount,
  SocialInteraction,
  PlatformAnalytics,
  ScheduledPost,
  CrossPostOptions,
  ContentSuggestion,
  HashtagSuggestion,
} from './types.js';
import { SocialMediaError, SOCIAL_ERROR_CODES, PLATFORM_LIMITS } from './types.js';
import { TwitterApi, type TwitterConfig } from './platforms/twitter.js';
import { LinkedInApi, type LinkedInConfig } from './platforms/linkedin.js';
import { BlueskyApi, type BlueskyConfig } from './platforms/bluesky.js';
import { YouTubeApi, type YouTubeConfig } from './platforms/youtube.js';
import { InstagramApi, type InstagramConfig } from './platforms/instagram.js';
import { SocialMediaScheduler, CrossPoster, type SchedulerConfig } from './scheduler.js';
import { AutoReplyService, type AutoReplyConfig, type PendingReply } from './auto-reply.js';
import { AnalyticsService, type AggregatedAnalytics } from './analytics.js';

export interface SocialMediaServiceConfig {
  scheduler?: SchedulerConfig;
  autoReply?: AutoReplyConfig;
}

export interface PlatformClient {
  platform: SocialPlatform;
  client: TwitterApi | LinkedInApi | BlueskyApi | YouTubeApi | InstagramApi;
  account: SocialAccount;
}

export class SocialMediaService {
  private clients: Map<string, PlatformClient> = new Map();
  private scheduler: SocialMediaScheduler;
  private crossPoster: CrossPoster;
  private autoReply: AutoReplyService;
  private analytics: AnalyticsService;

  constructor(config: SocialMediaServiceConfig = {}) {
    this.scheduler = new SocialMediaScheduler(config.scheduler);
    this.crossPoster = new CrossPoster();
    this.autoReply = new AutoReplyService(config.autoReply);
    this.analytics = new AnalyticsService();

    // Set up scheduler callback
    this.scheduler.setPostCallback(async (post) => {
      return this.publishPost(post);
    });
  }

  /**
   * Connect a Twitter account
   */
  async connectTwitter(config: TwitterConfig, accountInfo: Partial<SocialAccount>): Promise<SocialAccount> {
    const client = new TwitterApi(config);

    // Verify credentials
    const user = await client.getMe();

    const account: SocialAccount = {
      id: `twitter_${user.id}`,
      platform: 'twitter',
      userId: accountInfo.userId || user.id,
      platformUserId: user.id,
      username: user.username,
      displayName: user.name,
      avatarUrl: user.profile_image_url,
      accessToken: config.accessToken,
      connectedAt: Date.now(),
    };

    this.clients.set(account.id, { platform: 'twitter', client, account });

    // Set up auto-reply callback
    this.autoReply.setReplyCallback('twitter', async (_, interactionId, text) => {
      await client.replyToTweet(interactionId, text);
    });

    return account;
  }

  /**
   * Connect a LinkedIn account
   */
  async connectLinkedIn(config: LinkedInConfig, accountInfo: Partial<SocialAccount>): Promise<SocialAccount> {
    const client = new LinkedInApi(config);

    // Verify credentials
    const profile = await client.getMe();

    const account: SocialAccount = {
      id: `linkedin_${profile.id}`,
      platform: 'linkedin',
      userId: accountInfo.userId || profile.id,
      platformUserId: profile.id,
      username: `${profile.localizedFirstName} ${profile.localizedLastName}`,
      displayName: `${profile.localizedFirstName} ${profile.localizedLastName}`,
      accessToken: config.accessToken,
      connectedAt: Date.now(),
      metadata: { organizationId: config.organizationId },
    };

    this.clients.set(account.id, { platform: 'linkedin', client, account });

    return account;
  }

  /**
   * Connect a Bluesky account
   */
  async connectBluesky(config: BlueskyConfig, accountInfo: Partial<SocialAccount>): Promise<SocialAccount> {
    const client = new BlueskyApi(config);

    // Create session if needed
    const session = await client.createSession();
    const profile = await client.getProfile();

    const account: SocialAccount = {
      id: `bluesky_${session.did}`,
      platform: 'bluesky',
      userId: accountInfo.userId || session.did,
      platformUserId: session.did,
      username: session.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatar,
      accessToken: session.accessJwt,
      refreshToken: session.refreshJwt,
      connectedAt: Date.now(),
    };

    this.clients.set(account.id, { platform: 'bluesky', client, account });

    // Set up auto-reply callback
    this.autoReply.setReplyCallback('bluesky', async (_, interactionId, text) => {
      // Need to get the post CID for reply
      const post = await client.getPost(interactionId);
      await client.replyToPost(interactionId, post.cid, text);
    });

    return account;
  }

  /**
   * Connect a YouTube account
   */
  async connectYouTube(config: YouTubeConfig, accountInfo: Partial<SocialAccount>): Promise<SocialAccount> {
    const client = new YouTubeApi(config);

    // Verify credentials
    const channel = await client.getMyChannel();

    const account: SocialAccount = {
      id: `youtube_${channel.id}`,
      platform: 'youtube',
      userId: accountInfo.userId || channel.id,
      platformUserId: channel.id,
      username: channel.snippet.customUrl || channel.snippet.title,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails.default.url,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      connectedAt: Date.now(),
    };

    this.clients.set(account.id, { platform: 'youtube', client, account });

    // Set up auto-reply callback
    this.autoReply.setReplyCallback('youtube', async (_, interactionId, text) => {
      await client.replyToComment(interactionId, text);
    });

    return account;
  }

  /**
   * Connect an Instagram account
   */
  async connectInstagram(config: InstagramConfig, accountInfo: Partial<SocialAccount>): Promise<SocialAccount> {
    const client = new InstagramApi(config);

    // Verify credentials
    const igAccount = await client.getAccount();

    const account: SocialAccount = {
      id: `instagram_${igAccount.id}`,
      platform: 'instagram',
      userId: accountInfo.userId || igAccount.id,
      platformUserId: igAccount.id,
      username: igAccount.username,
      displayName: igAccount.name || igAccount.username,
      avatarUrl: igAccount.profile_picture_url,
      accessToken: config.accessToken,
      connectedAt: Date.now(),
      metadata: { businessAccountId: config.businessAccountId },
    };

    this.clients.set(account.id, { platform: 'instagram', client, account });

    // Set up auto-reply callback
    this.autoReply.setReplyCallback('instagram', async (_, interactionId, text) => {
      await client.replyToComment(interactionId, text);
    });

    return account;
  }

  /**
   * Disconnect an account
   */
  disconnectAccount(accountId: string): boolean {
    return this.clients.delete(accountId);
  }

  /**
   * Get connected accounts
   */
  getConnectedAccounts(platform?: SocialPlatform): SocialAccount[] {
    const accounts = Array.from(this.clients.values()).map(c => c.account);
    if (platform) {
      return accounts.filter(a => a.platform === platform);
    }
    return accounts;
  }

  /**
   * Get client for a platform
   */
  private getClient(platform: SocialPlatform): PlatformClient | undefined {
    for (const client of this.clients.values()) {
      if (client.platform === platform) {
        return client;
      }
    }
    return undefined;
  }

  /**
   * Publish a post to specified platforms
   */
  async publishPost(post: SocialPost): Promise<PlatformPost[]> {
    const results: PlatformPost[] = [];

    for (const platform of post.platforms) {
      const platformClient = this.getClient(platform);
      if (!platformClient) {
        results.push({
          platform,
          platformPostId: '',
          status: 'failed',
          error: 'Account not connected',
        });
        continue;
      }

      try {
        const result = await this.publishToPlatform(platformClient, post.content);
        results.push(result);
      } catch (error) {
        results.push({
          platform,
          platformPostId: '',
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Publish to a specific platform
   */
  private async publishToPlatform(
    platformClient: PlatformClient,
    content: PostContent,
  ): Promise<PlatformPost> {
    const { platform, client } = platformClient;

    switch (platform) {
      case 'twitter': {
        const twitterClient = client as TwitterApi;
        if (content.thread && content.thread.length > 0) {
          const posts = await twitterClient.postThread(content);
          return posts[0];
        }
        return twitterClient.postTweet(content);
      }

      case 'linkedin': {
        const linkedinClient = client as LinkedInApi;
        return linkedinClient.createPost(content);
      }

      case 'bluesky': {
        const bskyClient = client as BlueskyApi;
        return bskyClient.createPost(content);
      }

      case 'youtube': {
        // YouTube requires video upload, not regular posts
        throw new SocialMediaError(
          'YouTube requires video upload',
          SOCIAL_ERROR_CODES.INVALID_CONTENT,
          'youtube',
        );
      }

      case 'instagram': {
        const igClient = client as InstagramApi;
        return igClient.createPost(content);
      }

      default:
        throw new SocialMediaError(
          `Unsupported platform: ${platform}`,
          SOCIAL_ERROR_CODES.PLATFORM_ERROR,
          platform,
        );
    }
  }

  /**
   * Schedule a post
   */
  schedulePost(
    content: PostContent,
    platforms: SocialPlatform[],
    scheduledAt: number,
    authorId: string,
  ): ScheduledPost {
    return this.scheduler.schedulePost(
      { content, platforms, authorId },
      scheduledAt,
    );
  }

  /**
   * Cross-post content to multiple platforms
   */
  async crossPost(
    content: PostContent,
    options: CrossPostOptions,
  ): Promise<PlatformPost[]> {
    const adaptedContent = this.crossPoster.prepareForCrossPost(content, options);
    const results: PlatformPost[] = [];

    if (options.scheduleStaggered && options.staggerInterval) {
      const schedule = this.crossPoster.getStaggeredSchedule(
        Date.now(),
        options.platforms,
        options.staggerInterval,
      );

      for (const [platform, time] of schedule) {
        const platformContent = adaptedContent.get(platform);
        if (platformContent) {
          const scheduled = this.schedulePost(
            platformContent,
            [platform],
            time,
            'system',
          );
          results.push({
            platform,
            platformPostId: scheduled.id,
            status: 'scheduled',
          });
        }
      }
    } else {
      for (const [platform, platformContent] of adaptedContent) {
        const platformClient = this.getClient(platform);
        if (platformClient) {
          try {
            const result = await this.publishToPlatform(platformClient, platformContent);
            results.push(result);
          } catch (error) {
            results.push({
              platform,
              platformPostId: '',
              status: 'failed',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Get interactions (mentions, comments) for a platform
   */
  async getInteractions(platform: SocialPlatform, options?: { since?: string }): Promise<SocialInteraction[]> {
    const platformClient = this.getClient(platform);
    if (!platformClient) {
      throw new SocialMediaError(
        'Account not connected',
        SOCIAL_ERROR_CODES.NOT_CONNECTED,
        platform,
      );
    }

    const { client, account } = platformClient;

    switch (platform) {
      case 'twitter': {
        const twitterClient = client as TwitterApi;
        return twitterClient.getMentions(account.platformUserId, options?.since);
      }

      case 'bluesky': {
        const bskyClient = client as BlueskyApi;
        return bskyClient.getNotifications();
      }

      case 'youtube': {
        // YouTube comments need a specific video ID
        return [];
      }

      case 'instagram': {
        // Instagram comments need a specific media ID
        return [];
      }

      default:
        return [];
    }
  }

  /**
   * Process incoming interactions for auto-reply
   */
  async processInteractionsForReply(platform: SocialPlatform): Promise<PendingReply[]> {
    const interactions = await this.getInteractions(platform);
    const results: PendingReply[] = [];

    for (const interaction of interactions) {
      const pendingReply = await this.autoReply.processInteraction(interaction);
      if (pendingReply) {
        results.push(pendingReply);
      }
    }

    return results;
  }

  /**
   * Get pending auto-replies
   */
  getPendingReplies(platform?: SocialPlatform): PendingReply[] {
    return this.autoReply.getPendingReplies(platform);
  }

  /**
   * Approve an auto-reply
   */
  async approveReply(replyId: string, editedText?: string): Promise<PendingReply | null> {
    return this.autoReply.approveReply(replyId, editedText);
  }

  /**
   * Reject an auto-reply
   */
  rejectReply(replyId: string): PendingReply | null {
    return this.autoReply.rejectReply(replyId);
  }

  /**
   * Get analytics for a post
   */
  async getPostAnalytics(
    platform: SocialPlatform,
    postId: string,
  ): Promise<PlatformAnalytics> {
    const platformClient = this.getClient(platform);
    if (!platformClient) {
      throw new SocialMediaError(
        'Account not connected',
        SOCIAL_ERROR_CODES.NOT_CONNECTED,
        platform,
      );
    }

    const { client } = platformClient;

    let analytics: PlatformAnalytics;

    switch (platform) {
      case 'twitter': {
        const twitterClient = client as TwitterApi;
        analytics = await twitterClient.getTweetAnalytics(postId);
        break;
      }

      case 'linkedin': {
        const linkedinClient = client as LinkedInApi;
        analytics = await linkedinClient.getPostAnalytics(postId);
        break;
      }

      case 'bluesky': {
        const bskyClient = client as BlueskyApi;
        analytics = await bskyClient.getPostAnalytics(postId);
        break;
      }

      case 'youtube': {
        const youtubeClient = client as YouTubeApi;
        analytics = await youtubeClient.getVideoAnalytics(postId);
        break;
      }

      case 'instagram': {
        const igClient = client as InstagramApi;
        analytics = await igClient.getMediaInsights(postId);
        break;
      }

      default:
        throw new SocialMediaError(
          `Unsupported platform: ${platform}`,
          SOCIAL_ERROR_CODES.PLATFORM_ERROR,
          platform,
        );
    }

    // Store in analytics service
    this.analytics.storeAnalytics(postId, platform, analytics);

    return analytics;
  }

  /**
   * Get aggregated analytics
   */
  getAggregatedAnalytics(
    posts: Array<{ postId: string; platform: SocialPlatform }>,
  ): AggregatedAnalytics {
    return this.analytics.aggregateAnalytics(posts);
  }

  /**
   * Get content calendar events
   */
  getCalendarEvents(startDate: number, endDate: number) {
    return this.scheduler.getCalendarEvents(startDate, endDate);
  }

  /**
   * Get scheduled posts
   */
  getScheduledPosts(): ScheduledPost[] {
    return this.scheduler.getScheduledPosts();
  }

  /**
   * Cancel a scheduled post
   */
  cancelScheduledPost(postId: string): boolean {
    return this.scheduler.cancelScheduledPost(postId);
  }

  /**
   * Get best time to post
   */
  getBestTimeToPost(platform: SocialPlatform): Date {
    return this.scheduler.getNextBestTime(platform);
  }

  /**
   * Generate content suggestions
   */
  generateCaptionSuggestions(topic: string, platform: SocialPlatform): ContentSuggestion[] {
    // Simple template-based suggestions
    // In production, integrate with AI
    const maxLength = PLATFORM_LIMITS[platform].maxTextLength;

    const templates = [
      `🔥 ${topic} - Here's what you need to know...`,
      `New insights on ${topic}! Thread 🧵`,
      `The truth about ${topic} that nobody talks about...`,
      `Why ${topic} matters more than ever in 2024`,
      `A quick guide to ${topic} for beginners`,
    ];

    return templates.map((content, i) => ({
      id: `suggestion_${i}`,
      type: 'caption' as const,
      content: content.slice(0, maxLength),
      confidence: 0.7 + Math.random() * 0.2,
      platform,
      reasoning: 'Template-based suggestion',
    }));
  }

  /**
   * Generate hashtag suggestions
   */
  generateHashtagSuggestions(content: string, platform: SocialPlatform): HashtagSuggestion[] {
    // Extract key terms and generate hashtags
    const words = content.toLowerCase().split(/\s+/);
    const commonWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'at', 'with']);

    const hashtags = words
      .filter(w => w.length > 3 && !commonWords.has(w) && /^[a-z]+$/.test(w))
      .slice(0, 10)
      .map(word => ({
        tag: word,
        relevance: 0.5 + Math.random() * 0.4,
        popularity: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as 'low' | 'medium' | 'high',
      }));

    return hashtags;
  }

  /**
   * Start the scheduler
   */
  startScheduler(): void {
    this.scheduler.start();
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    this.scheduler.stop();
  }
}

/**
 * Create social media service instance
 */
export function createSocialMediaService(config?: SocialMediaServiceConfig): SocialMediaService {
  return new SocialMediaService(config);
}
