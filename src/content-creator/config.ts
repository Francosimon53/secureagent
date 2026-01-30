/**
 * Content Creator Suite - Configuration Schemas
 *
 * Zod schemas for runtime validation of content creator configuration.
 */

import { z } from 'zod';

// =============================================================================
// Twitter Configuration
// =============================================================================

export const TwitterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnvVar: z.string().default('TWITTER_API_KEY'),
  apiSecretEnvVar: z.string().default('TWITTER_API_SECRET'),
  accessTokenEnvVar: z.string().default('TWITTER_ACCESS_TOKEN'),
  accessTokenSecretEnvVar: z.string().default('TWITTER_ACCESS_TOKEN_SECRET'),
  bearerTokenEnvVar: z.string().default('TWITTER_BEARER_TOKEN'),
  timeout: z.number().min(1000).max(60000).default(10000),
  rateLimitPerMinute: z.number().min(1).max(300).default(60),
  maxRetries: z.number().min(0).max(5).default(3),
  defaultHashtags: z.array(z.string()).default([]),
  autoThread: z.boolean().default(true),
  maxThreadLength: z.number().min(2).max(25).default(10),
});

export type TwitterConfig = z.infer<typeof TwitterConfigSchema>;

// =============================================================================
// LinkedIn Configuration
// =============================================================================

export const LinkedInConfigSchema = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnvVar: z.string().default('LINKEDIN_CLIENT_ID'),
  apiSecretEnvVar: z.string().default('LINKEDIN_CLIENT_SECRET'),
  accessTokenEnvVar: z.string().default('LINKEDIN_ACCESS_TOKEN'),
  timeout: z.number().min(1000).max(60000).default(10000),
  rateLimitPerMinute: z.number().min(1).max(100).default(30),
  maxRetries: z.number().min(0).max(5).default(3),
  automationRules: z.object({
    enabled: z.boolean().default(false),
    maxActionsPerDay: z.number().min(1).max(100).default(20),
    cooldownMinutes: z.number().min(1).max(1440).default(60),
    allowedActions: z.array(z.enum(['like', 'comment', 'share', 'connect', 'message'])).default(['like', 'comment']),
  }).default({}),
  postDefaults: z.object({
    visibility: z.enum(['public', 'connections', 'logged_in']).default('public'),
    includeHashtags: z.boolean().default(true),
    maxHashtags: z.number().min(0).max(10).default(5),
  }).default({}),
});

export type LinkedInConfig = z.infer<typeof LinkedInConfigSchema>;

// =============================================================================
// Trend Monitoring Configuration
// =============================================================================

export const TrendMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  sources: z.object({
    twitter: z.object({
      enabled: z.boolean().default(true),
      apiKeyEnvVar: z.string().default('TWITTER_BEARER_TOKEN'),
      location: z.string().optional(),
    }).default({}),
    reddit: z.object({
      enabled: z.boolean().default(true),
      clientIdEnvVar: z.string().default('REDDIT_CLIENT_ID'),
      clientSecretEnvVar: z.string().default('REDDIT_CLIENT_SECRET'),
      subreddits: z.array(z.string()).default(['technology', 'programming', 'news']),
    }).default({}),
    hackernews: z.object({
      enabled: z.boolean().default(true),
      minScore: z.number().min(1).max(1000).default(50),
      categories: z.array(z.enum(['top', 'new', 'best', 'ask', 'show'])).default(['top', 'best']),
    }).default({}),
  }).default({}),
  refreshIntervalMinutes: z.number().min(5).max(1440).default(30),
  maxTrendsPerSource: z.number().min(10).max(100).default(25),
  alerting: z.object({
    enabled: z.boolean().default(true),
    channels: z.array(z.enum(['email', 'push', 'webhook'])).default(['push']),
    webhookUrl: z.string().url().optional(),
    minRelevanceScore: z.number().min(0).max(1).default(0.7),
  }).default({}),
  caching: z.object({
    enabled: z.boolean().default(true),
    ttlMinutes: z.number().min(5).max(1440).default(15),
  }).default({}),
});

export type TrendMonitoringConfig = z.infer<typeof TrendMonitoringConfigSchema>;

// =============================================================================
// Blog Publishing Configuration
// =============================================================================

export const WordPressConfigSchema = z.object({
  enabled: z.boolean().default(false),
  siteUrl: z.string().url(),
  usernameEnvVar: z.string().default('WORDPRESS_USERNAME'),
  applicationPasswordEnvVar: z.string().default('WORDPRESS_APP_PASSWORD'),
  timeout: z.number().min(1000).max(60000).default(15000),
  defaultAuthor: z.string().optional(),
  defaultCategory: z.string().optional(),
  defaultStatus: z.enum(['draft', 'publish', 'pending', 'private']).default('draft'),
});

export const GhostConfigSchema = z.object({
  enabled: z.boolean().default(false),
  siteUrl: z.string().url(),
  adminApiKeyEnvVar: z.string().default('GHOST_ADMIN_API_KEY'),
  contentApiKeyEnvVar: z.string().default('GHOST_CONTENT_API_KEY'),
  timeout: z.number().min(1000).max(60000).default(15000),
  defaultAuthor: z.string().optional(),
  defaultTag: z.string().optional(),
  defaultStatus: z.enum(['draft', 'published', 'scheduled']).default('draft'),
});

export const BearBlogConfigSchema = z.object({
  enabled: z.boolean().default(false),
  siteUrl: z.string().url(),
  apiKeyEnvVar: z.string().default('BEARBLOG_API_KEY'),
  timeout: z.number().min(1000).max(60000).default(15000),
  defaultStatus: z.enum(['draft', 'published']).default('draft'),
});

export const BlogPublishingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  platforms: z.object({
    wordpress: WordPressConfigSchema.optional(),
    ghost: GhostConfigSchema.optional(),
    bearblog: BearBlogConfigSchema.optional(),
  }).default({}),
  defaultPlatform: z.enum(['wordpress', 'ghost', 'bearblog']).optional(),
  crossPost: z.boolean().default(false),
  schedulingEnabled: z.boolean().default(true),
});

export type BlogPublishingConfig = z.infer<typeof BlogPublishingConfigSchema>;

// =============================================================================
// SEO Audit Configuration
// =============================================================================

export const SEOAuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minWordCount: z.number().min(100).max(10000).default(300),
  targetReadabilityScore: z.number().min(0).max(100).default(60),
  keywordDensity: z.object({
    min: z.number().min(0).max(5).default(0.5),
    max: z.number().min(1).max(10).default(2.5),
  }).default({}),
  metaDescription: z.object({
    minLength: z.number().min(50).max(200).default(120),
    maxLength: z.number().min(100).max(320).default(160),
  }).default({}),
  titleTag: z.object({
    minLength: z.number().min(20).max(100).default(30),
    maxLength: z.number().min(40).max(100).default(60),
  }).default({}),
  headingStructure: z.object({
    requireH1: z.boolean().default(true),
    maxH1Count: z.number().min(1).max(3).default(1),
    requireSubheadings: z.boolean().default(true),
  }).default({}),
  links: z.object({
    minInternalLinks: z.number().min(0).max(20).default(2),
    minExternalLinks: z.number().min(0).max(10).default(1),
    checkBrokenLinks: z.boolean().default(false),
  }).default({}),
  images: z.object({
    requireAltText: z.boolean().default(true),
    checkCompression: z.boolean().default(false),
  }).default({}),
});

export type SEOAuditConfig = z.infer<typeof SEOAuditConfigSchema>;

// =============================================================================
// Content Repurposing Configuration
// =============================================================================

export const ContentRepurposingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxConcurrentJobs: z.number().min(1).max(10).default(3),
  preserveSourceAttribution: z.boolean().default(true),
  defaultTransformations: z.object({
    videoToBlog: z.object({
      enabled: z.boolean().default(true),
      minVideoDuration: z.number().min(60).max(3600).default(120),
      targetWordCount: z.number().min(300).max(5000).default(1000),
    }).default({}),
    blogToTwitterThread: z.object({
      enabled: z.boolean().default(true),
      minBlogWordCount: z.number().min(200).max(2000).default(300),
      maxTweets: z.number().min(3).max(20).default(10),
    }).default({}),
    blogToLinkedIn: z.object({
      enabled: z.boolean().default(true),
      maxCharacters: z.number().min(500).max(3000).default(1300),
    }).default({}),
    blogToNewsletter: z.object({
      enabled: z.boolean().default(true),
      includeSummary: z.boolean().default(true),
    }).default({}),
  }).default({}),
});

export type ContentRepurposingConfig = z.infer<typeof ContentRepurposingConfigSchema>;

// =============================================================================
// Media Configuration
// =============================================================================

export const YouTubeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  apiKeyEnvVar: z.string().default('YOUTUBE_API_KEY'),
  timeout: z.number().min(1000).max(60000).default(15000),
  maxVideoDuration: z.number().min(300).max(14400).default(3600),
  transcriptSource: z.enum(['youtube', 'whisper', 'assemblyai']).default('youtube'),
});

export type YouTubeConfig = z.infer<typeof YouTubeConfigSchema>;

export const PodcastConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxEpisodeDuration: z.number().min(300).max(14400).default(7200),
  transcriptionProvider: z.enum(['whisper', 'assemblyai', 'deepgram']).default('whisper'),
  speakerDiarization: z.boolean().default(true),
  generateTimestamps: z.boolean().default(true),
});

export type PodcastConfig = z.infer<typeof PodcastConfigSchema>;

export const TranscriptionConfigSchema = z.object({
  provider: z.enum(['whisper', 'assemblyai', 'deepgram']).default('whisper'),
  whisperApiKeyEnvVar: z.string().default('OPENAI_API_KEY'),
  assemblyAiApiKeyEnvVar: z.string().default('ASSEMBLYAI_API_KEY'),
  deepgramApiKeyEnvVar: z.string().default('DEEPGRAM_API_KEY'),
  language: z.string().default('en'),
  enableSpeakerDiarization: z.boolean().default(true),
  maxSpeakers: z.number().min(1).max(10).default(5),
  timeout: z.number().min(30000).max(600000).default(300000),
});

export const MediaConfigSchema = z.object({
  youtube: YouTubeConfigSchema.optional(),
  podcast: PodcastConfigSchema.optional(),
  transcription: TranscriptionConfigSchema.optional(),
});

export type MediaConfig = z.infer<typeof MediaConfigSchema>;

// =============================================================================
// AI Generation Configuration
// =============================================================================

export const AIGenerationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  openaiApiKeyEnvVar: z.string().default('OPENAI_API_KEY'),
  anthropicApiKeyEnvVar: z.string().default('ANTHROPIC_API_KEY'),
  model: z.object({
    openai: z.string().default('gpt-4-turbo-preview'),
    anthropic: z.string().default('claude-3-opus-20240229'),
  }).default({}),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(8000).default(2000),
  timeout: z.number().min(10000).max(300000).default(60000),
  retries: z.number().min(0).max(5).default(2),
  rateLimitPerMinute: z.number().min(1).max(1000).default(60),
});

export type AIGenerationConfig = z.infer<typeof AIGenerationConfigSchema>;

// =============================================================================
// Voice Profile Configuration
// =============================================================================

export const VoiceProfileConfigSchema = z.object({
  enabled: z.boolean().default(true),
  minSamplesForTraining: z.number().min(3).max(50).default(5),
  maxSamplesPerProfile: z.number().min(10).max(200).default(100),
  analysisDepth: z.enum(['basic', 'standard', 'deep']).default('standard'),
  autoRefresh: z.boolean().default(true),
  refreshIntervalDays: z.number().min(1).max(90).default(30),
  defaultStyle: z.object({
    tone: z.enum(['professional', 'casual', 'humorous', 'authoritative', 'friendly', 'inspirational']).default('professional'),
    formality: z.enum(['formal', 'semi-formal', 'informal']).default('semi-formal'),
    vocabulary: z.enum(['simple', 'moderate', 'advanced', 'technical']).default('moderate'),
  }).default({}),
});

export type VoiceProfileConfig = z.infer<typeof VoiceProfileConfigSchema>;

// =============================================================================
// Newsletter Configuration
// =============================================================================

export const NewsletterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxSourcesPerDigest: z.number().min(5).max(50).default(20),
  maxItemsPerSection: z.number().min(3).max(20).default(5),
  defaultFrequency: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
  includeImages: z.boolean().default(true),
  includeSummaries: z.boolean().default(true),
  minRelevanceScore: z.number().min(0).max(1).default(0.5),
});

export type NewsletterConfig = z.infer<typeof NewsletterConfigSchema>;

// =============================================================================
// Video Scripts Configuration
// =============================================================================

export const VideoScriptsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultDuration: z.number().min(60).max(3600).default(600),
  wordsPerMinute: z.number().min(100).max(200).default(150),
  includeHooks: z.boolean().default(true),
  includeBRollSuggestions: z.boolean().default(true),
  includeSpeakerNotes: z.boolean().default(true),
  defaultStyle: z.enum(['educational', 'entertainment', 'tutorial', 'vlog', 'promotional']).default('educational'),
});

export type VideoScriptsConfig = z.infer<typeof VideoScriptsConfigSchema>;

// =============================================================================
// Presentation Configuration
// =============================================================================

export const PresentationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultSlideCount: z.number().min(5).max(50).default(12),
  defaultStyle: z.enum(['professional', 'creative', 'minimal', 'bold']).default('professional'),
  includeSpeakerNotes: z.boolean().default(true),
  includeCharts: z.boolean().default(true),
  theme: z.object({
    primaryColor: z.string().default('#1a73e8'),
    secondaryColor: z.string().default('#34a853'),
    fontFamily: z.string().default('Inter'),
    backgroundColor: z.string().default('#ffffff'),
  }).default({}),
});

export type PresentationConfig = z.infer<typeof PresentationConfigSchema>;

// =============================================================================
// Main Content Creator Configuration
// =============================================================================

export const ContentCreatorConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowedApiDomains: z.array(z.string()).default([
    'api.twitter.com',
    'api.linkedin.com',
    'api.openai.com',
    'api.anthropic.com',
    'www.googleapis.com',
    'api.assemblyai.com',
    'api.deepgram.com',
    'hacker-news.firebaseio.com',
    'oauth.reddit.com',
    'www.reddit.com',
  ]),

  // Platform configurations
  twitter: TwitterConfigSchema.optional(),
  linkedin: LinkedInConfigSchema.optional(),

  // Feature configurations
  trendMonitoring: TrendMonitoringConfigSchema.optional(),
  blogPublishing: BlogPublishingConfigSchema.optional(),
  seoAudit: SEOAuditConfigSchema.optional(),
  contentRepurposing: ContentRepurposingConfigSchema.optional(),
  media: MediaConfigSchema.optional(),
  newsletter: NewsletterConfigSchema.optional(),
  videoScripts: VideoScriptsConfigSchema.optional(),
  presentation: PresentationConfigSchema.optional(),

  // AI and voice
  aiGeneration: AIGenerationConfigSchema.optional(),
  voiceProfile: VoiceProfileConfigSchema.optional(),

  // Storage
  storeType: z.enum(['memory', 'database']).default('database'),
});

export type ContentCreatorConfig = z.infer<typeof ContentCreatorConfigSchema>;

// =============================================================================
// Config Validation Helper
// =============================================================================

export function validateContentCreatorConfig(config: unknown): ContentCreatorConfig {
  const result = ContentCreatorConfigSchema.safeParse(config ?? {});
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Invalid content creator config: ${errors}`);
  }
  return result.data;
}
