/**
 * Social Media Management Module
 *
 * Unified social media automation for SecureAgent
 *
 * Features:
 * - Multi-platform posting (Twitter, LinkedIn, Bluesky, YouTube, Instagram)
 * - Content scheduling with calendar view
 * - Cross-posting with platform-specific adaptations
 * - AI-powered auto-reply with approval workflow
 * - Analytics aggregation and insights
 */

// Types
export type {
  SocialPlatform,
  PostStatus,
  ContentType,
  SocialPost,
  PostContent,
  ThreadItem,
  MediaAttachment,
  LinkPreview,
  PlatformPost,
  PostAnalytics,
  PlatformAnalytics,
  ScheduledPost,
  CalendarEvent,
  SocialAccount,
  SocialInteraction,
  AutoReplySettings,
  Campaign,
  CampaignGoals,
  CampaignAnalytics,
  ContentSuggestion,
  HashtagSuggestion,
  BestTimeSlot,
  CrossPostOptions,
  SocialErrorCode,
} from './types.js';

export {
  SOCIAL_PLATFORMS,
  PLATFORM_LIMITS,
  SOCIAL_ERROR_CODES,
  SocialMediaError,
} from './types.js';

// Platform APIs
export { TwitterApi, createTwitterApi } from './platforms/twitter.js';
export type { TwitterConfig, TwitterUser, TwitterTweet } from './platforms/twitter.js';

export { LinkedInApi, createLinkedInApi } from './platforms/linkedin.js';
export type { LinkedInConfig, LinkedInProfile, LinkedInOrganization, LinkedInPost } from './platforms/linkedin.js';

export { BlueskyApi, createBlueskyApi } from './platforms/bluesky.js';
export type { BlueskyConfig, BlueskyProfile, BlueskyPost, BlueskySession } from './platforms/bluesky.js';

export { YouTubeApi, createYouTubeApi } from './platforms/youtube.js';
export type { YouTubeConfig, YouTubeChannel, YouTubeVideo, YouTubeComment } from './platforms/youtube.js';

export { InstagramApi, createInstagramApi } from './platforms/instagram.js';
export type { InstagramConfig, InstagramAccount, InstagramMedia, InstagramComment, InstagramInsights } from './platforms/instagram.js';

// Scheduler
export {
  SocialMediaScheduler,
  CrossPoster,
  createScheduler,
  createCrossPoster,
} from './scheduler.js';
export type { SchedulerConfig, PostCallback } from './scheduler.js';

// Auto-Reply
export {
  AutoReplyService,
  DefaultAiReplyProvider,
  createAutoReplyService,
} from './auto-reply.js';
export type {
  AutoReplyConfig,
  AiReplyProvider,
  PendingReply,
  ReplyCallback,
} from './auto-reply.js';

// Analytics
export {
  AnalyticsService,
  createAnalyticsService,
} from './analytics.js';
export type {
  AnalyticsTimeRange,
  AggregatedAnalytics,
  GrowthMetrics,
  PostPerformance,
} from './analytics.js';

// Main Service
export {
  SocialMediaService,
  createSocialMediaService,
} from './service.js';
export type { SocialMediaServiceConfig, PlatformClient } from './service.js';
