/**
 * Social Media Management - Types
 *
 * Shared types for social media automation
 */

/**
 * Supported social media platforms
 */
export const SOCIAL_PLATFORMS = [
  'twitter',
  'linkedin',
  'bluesky',
  'youtube',
  'instagram',
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/**
 * Post status
 */
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'deleted';

/**
 * Content types
 */
export type ContentType = 'text' | 'image' | 'video' | 'carousel' | 'thread' | 'article';

/**
 * Social media post
 */
export interface SocialPost {
  id: string;
  platforms: SocialPlatform[];
  content: PostContent;
  status: PostStatus;
  scheduledAt?: number;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  authorId: string;
  platformPosts?: PlatformPost[];
  analytics?: PostAnalytics;
  tags?: string[];
  campaignId?: string;
}

/**
 * Post content
 */
export interface PostContent {
  text: string;
  media?: MediaAttachment[];
  thread?: ThreadItem[];
  hashtags?: string[];
  mentions?: string[];
  link?: string;
  linkPreview?: LinkPreview;
  altText?: string;
}

/**
 * Thread item for multi-post threads
 */
export interface ThreadItem {
  text: string;
  media?: MediaAttachment[];
  order: number;
}

/**
 * Media attachment
 */
export interface MediaAttachment {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnailUrl?: string;
  altText?: string;
  width?: number;
  height?: number;
  duration?: number; // for videos
  size?: number;
  mimeType?: string;
}

/**
 * Link preview
 */
export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
}

/**
 * Platform-specific post record
 */
export interface PlatformPost {
  platform: SocialPlatform;
  platformPostId: string;
  url?: string;
  status: PostStatus;
  publishedAt?: number;
  error?: string;
  analytics?: PlatformAnalytics;
}

/**
 * Post analytics
 */
export interface PostAnalytics {
  impressions: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  saves?: number;
  videoViews?: number;
  avgWatchTime?: number;
  updatedAt: number;
}

/**
 * Platform-specific analytics
 */
export interface PlatformAnalytics extends PostAnalytics {
  platform: SocialPlatform;
  platformSpecific?: Record<string, unknown>;
}

/**
 * Scheduled post
 */
export interface ScheduledPost extends SocialPost {
  status: 'scheduled';
  scheduledAt: number;
}

/**
 * Content calendar event
 */
export interface CalendarEvent {
  id: string;
  postId: string;
  title: string;
  platforms: SocialPlatform[];
  scheduledAt: number;
  status: PostStatus;
  contentPreview: string;
}

/**
 * Social account connection
 */
export interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  userId: string;
  platformUserId: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry?: number;
  permissions?: string[];
  metadata?: Record<string, unknown>;
  connectedAt: number;
  lastUsedAt?: number;
}

/**
 * Comment/mention for auto-reply
 */
export interface SocialInteraction {
  id: string;
  platform: SocialPlatform;
  type: 'comment' | 'mention' | 'reply' | 'dm';
  postId?: string;
  platformInteractionId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string;
  authorAvatarUrl?: string;
  content: string;
  createdAt: number;
  replied: boolean;
  repliedAt?: number;
  replyContent?: string;
  approved?: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
}

/**
 * Auto-reply settings
 */
export interface AutoReplySettings {
  enabled: boolean;
  requireApproval: boolean;
  respondToComments: boolean;
  respondToMentions: boolean;
  respondToDMs: boolean;
  excludeKeywords?: string[];
  includeKeywords?: string[];
  maxRepliesPerHour?: number;
  replyDelay?: number; // seconds
  tone?: 'professional' | 'friendly' | 'casual';
  customPrompt?: string;
}

/**
 * Campaign for grouping posts
 */
export interface Campaign {
  id: string;
  name: string;
  description?: string;
  startDate?: number;
  endDate?: number;
  platforms: SocialPlatform[];
  postIds: string[];
  status: 'draft' | 'active' | 'completed' | 'paused';
  goals?: CampaignGoals;
  analytics?: CampaignAnalytics;
  createdAt: number;
  updatedAt: number;
}

/**
 * Campaign goals
 */
export interface CampaignGoals {
  impressions?: number;
  engagement?: number;
  clicks?: number;
  followers?: number;
}

/**
 * Campaign analytics
 */
export interface CampaignAnalytics {
  totalPosts: number;
  totalImpressions: number;
  totalEngagement: number;
  totalClicks: number;
  avgEngagementRate: number;
  topPerformingPost?: string;
  platformBreakdown: Record<SocialPlatform, PostAnalytics>;
}

/**
 * AI content suggestion
 */
export interface ContentSuggestion {
  id: string;
  type: 'caption' | 'hashtags' | 'reply' | 'thread' | 'hook';
  content: string;
  confidence: number;
  platform?: SocialPlatform;
  reasoning?: string;
}

/**
 * Hashtag suggestion
 */
export interface HashtagSuggestion {
  tag: string;
  relevance: number;
  popularity?: 'low' | 'medium' | 'high' | 'trending';
  category?: string;
}

/**
 * Best time to post
 */
export interface BestTimeSlot {
  platform: SocialPlatform;
  dayOfWeek: number; // 0-6
  hour: number; // 0-23
  engagementScore: number;
  audienceOnline: number;
}

/**
 * Cross-post options
 */
export interface CrossPostOptions {
  platforms: SocialPlatform[];
  adaptContent: boolean; // Adjust content per platform
  scheduleStaggered: boolean; // Post at different times
  staggerInterval?: number; // minutes between posts
}

/**
 * Platform limits
 */
export const PLATFORM_LIMITS: Record<SocialPlatform, {
  maxTextLength: number;
  maxImages: number;
  maxVideoLength: number; // seconds
  maxHashtags: number;
  supportedMediaTypes: string[];
}> = {
  twitter: {
    maxTextLength: 280,
    maxImages: 4,
    maxVideoLength: 140,
    maxHashtags: 30,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
  },
  linkedin: {
    maxTextLength: 3000,
    maxImages: 9,
    maxVideoLength: 600,
    maxHashtags: 30,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
  },
  bluesky: {
    maxTextLength: 300,
    maxImages: 4,
    maxVideoLength: 60,
    maxHashtags: 20,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif'],
  },
  youtube: {
    maxTextLength: 5000,
    maxImages: 1,
    maxVideoLength: 43200, // 12 hours
    maxHashtags: 15,
    supportedMediaTypes: ['video/mp4', 'video/webm', 'video/avi'],
  },
  instagram: {
    maxTextLength: 2200,
    maxImages: 10,
    maxVideoLength: 60,
    maxHashtags: 30,
    supportedMediaTypes: ['image/jpeg', 'image/png', 'video/mp4'],
  },
};

/**
 * Error codes
 */
export const SOCIAL_ERROR_CODES = {
  AUTH_FAILED: 'SOCIAL_001',
  RATE_LIMITED: 'SOCIAL_002',
  INVALID_CONTENT: 'SOCIAL_003',
  MEDIA_TOO_LARGE: 'SOCIAL_004',
  PLATFORM_ERROR: 'SOCIAL_005',
  SCHEDULE_FAILED: 'SOCIAL_006',
  NOT_CONNECTED: 'SOCIAL_007',
} as const;

export type SocialErrorCode = (typeof SOCIAL_ERROR_CODES)[keyof typeof SOCIAL_ERROR_CODES];

/**
 * Social media error
 */
export class SocialMediaError extends Error {
  constructor(
    message: string,
    public code: SocialErrorCode,
    public platform?: SocialPlatform,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'SocialMediaError';
  }
}
