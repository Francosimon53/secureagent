/**
 * Content Creator Suite - Event Constants
 *
 * Event definitions for the event bus integration.
 */

// =============================================================================
// Content Events
// =============================================================================

export const CONTENT_EVENTS = {
  // Content lifecycle
  CONTENT_CREATED: 'content-creator.content.created',
  CONTENT_UPDATED: 'content-creator.content.updated',
  CONTENT_DELETED: 'content-creator.content.deleted',
  CONTENT_PUBLISHED: 'content-creator.content.published',
  CONTENT_SCHEDULED: 'content-creator.content.scheduled',
  CONTENT_FAILED: 'content-creator.content.failed',

  // Voice profile
  VOICE_PROFILE_CREATED: 'content-creator.voice.created',
  VOICE_PROFILE_TRAINED: 'content-creator.voice.trained',
  VOICE_PROFILE_UPDATED: 'content-creator.voice.updated',
  VOICE_SAMPLE_ADDED: 'content-creator.voice.sample-added',

  // Tweet/Thread
  TWEET_GENERATED: 'content-creator.tweet.generated',
  THREAD_GENERATED: 'content-creator.thread.generated',
  TWEET_POSTED: 'content-creator.tweet.posted',
  THREAD_POSTED: 'content-creator.thread.posted',

  // LinkedIn
  LINKEDIN_POST_GENERATED: 'content-creator.linkedin.post-generated',
  LINKEDIN_POST_PUBLISHED: 'content-creator.linkedin.post-published',
  LINKEDIN_ENGAGEMENT_ACTION: 'content-creator.linkedin.engagement-action',
  LINKEDIN_MESSAGE_SENT: 'content-creator.linkedin.message-sent',
  LINKEDIN_AUTOMATION_TRIGGERED: 'content-creator.linkedin.automation-triggered',

  // Content Repurposing
  PIPELINE_STARTED: 'content-creator.pipeline.started',
  PIPELINE_STEP_COMPLETED: 'content-creator.pipeline.step-completed',
  PIPELINE_COMPLETED: 'content-creator.pipeline.completed',
  PIPELINE_FAILED: 'content-creator.pipeline.failed',
  TRANSFORMATION_COMPLETED: 'content-creator.transformation.completed',

  // Trend Monitoring
  TRENDS_FETCHED: 'content-creator.trends.fetched',
  TREND_ALERT_TRIGGERED: 'content-creator.trends.alert-triggered',
  TREND_ALERT_CREATED: 'content-creator.trends.alert-created',
  TREND_RELEVANCE_MATCHED: 'content-creator.trends.relevance-matched',

  // Blog Publishing
  BLOG_POST_CREATED: 'content-creator.blog.created',
  BLOG_POST_PUBLISHED: 'content-creator.blog.published',
  BLOG_POST_SCHEDULED: 'content-creator.blog.scheduled',
  BLOG_POST_FAILED: 'content-creator.blog.failed',
  BLOG_DRAFT_SAVED: 'content-creator.blog.draft-saved',

  // SEO
  SEO_AUDIT_STARTED: 'content-creator.seo.audit-started',
  SEO_AUDIT_COMPLETED: 'content-creator.seo.audit-completed',
  SEO_ISSUE_DETECTED: 'content-creator.seo.issue-detected',
  SEO_SCORE_CALCULATED: 'content-creator.seo.score-calculated',

  // Video Scripts
  VIDEO_SCRIPT_GENERATED: 'content-creator.video-script.generated',
  VIDEO_SCRIPT_UPDATED: 'content-creator.video-script.updated',
  BROLL_SUGGESTIONS_GENERATED: 'content-creator.video-script.broll-generated',

  // Podcast
  PODCAST_TRANSCRIPTION_STARTED: 'content-creator.podcast.transcription-started',
  PODCAST_TRANSCRIPTION_COMPLETED: 'content-creator.podcast.transcription-completed',
  PODCAST_TRANSCRIPTION_FAILED: 'content-creator.podcast.transcription-failed',
  SHOW_NOTES_GENERATED: 'content-creator.podcast.show-notes-generated',

  // YouTube
  YOUTUBE_SUMMARY_STARTED: 'content-creator.youtube.summary-started',
  YOUTUBE_SUMMARY_COMPLETED: 'content-creator.youtube.summary-completed',
  YOUTUBE_SUMMARY_FAILED: 'content-creator.youtube.summary-failed',
  YOUTUBE_KEY_POINTS_EXTRACTED: 'content-creator.youtube.key-points-extracted',
  YOUTUBE_FETCH_STARTED: 'content-creator.youtube.fetch-started',
  YOUTUBE_FETCH_COMPLETED: 'content-creator.youtube.fetch-completed',

  // Newsletter
  NEWSLETTER_DIGEST_GENERATED: 'content-creator.newsletter.digest-generated',
  NEWSLETTER_DIGEST_SCHEDULED: 'content-creator.newsletter.digest-scheduled',
  NEWSLETTER_SOURCES_AGGREGATED: 'content-creator.newsletter.sources-aggregated',
  NEWSLETTER_GENERATION_STARTED: 'content-creator.newsletter.generation-started',
  NEWSLETTER_GENERATION_COMPLETED: 'content-creator.newsletter.generation-completed',
  NEWSLETTER_GENERATION_FAILED: 'content-creator.newsletter.generation-failed',

  // Presentation
  PRESENTATION_GENERATED: 'content-creator.presentation.generated',
  SLIDES_CREATED: 'content-creator.presentation.slides-created',
  PRESENTATION_EXPORTED: 'content-creator.presentation.exported',

  // Analytics
  ANALYTICS_UPDATED: 'content-creator.analytics.updated',
  ENGAGEMENT_FETCHED: 'content-creator.analytics.engagement-fetched',
  PERFORMANCE_REPORT_GENERATED: 'content-creator.analytics.report-generated',
} as const;

export type ContentEventType = (typeof CONTENT_EVENTS)[keyof typeof CONTENT_EVENTS];

// =============================================================================
// Default Values
// =============================================================================

export const CONTENT_DEFAULTS = {
  // Tweet limits
  TWEET_MAX_LENGTH: 280,
  THREAD_MIN_TWEETS: 2,
  THREAD_MAX_TWEETS: 25,

  // LinkedIn limits
  LINKEDIN_POST_MAX_LENGTH: 3000,
  LINKEDIN_ARTICLE_MAX_LENGTH: 110000,
  LINKEDIN_MAX_HASHTAGS: 5,

  // Blog defaults
  BLOG_MIN_WORD_COUNT: 300,
  BLOG_EXCERPT_LENGTH: 160,
  BLOG_SLUG_MAX_LENGTH: 75,

  // SEO defaults
  META_TITLE_MIN: 30,
  META_TITLE_MAX: 60,
  META_DESCRIPTION_MIN: 120,
  META_DESCRIPTION_MAX: 160,
  KEYWORD_DENSITY_MIN: 0.5,
  KEYWORD_DENSITY_MAX: 2.5,

  // Video defaults
  VIDEO_SCRIPT_WORDS_PER_MINUTE: 150,
  VIDEO_HOOK_MAX_SECONDS: 10,
  VIDEO_MIN_DURATION_SECONDS: 60,

  // Presentation defaults
  PRESENTATION_MIN_SLIDES: 5,
  PRESENTATION_MAX_SLIDES: 50,
  SLIDE_TITLE_MAX_LENGTH: 100,
  SLIDE_BULLET_POINTS_MAX: 6,

  // Newsletter defaults
  NEWSLETTER_MAX_ITEMS_PER_SECTION: 10,
  NEWSLETTER_SUMMARY_MAX_LENGTH: 200,

  // Rate limits (per minute)
  TWITTER_RATE_LIMIT: 60,
  LINKEDIN_RATE_LIMIT: 30,
  AI_GENERATION_RATE_LIMIT: 60,

  // Cache TTL (in minutes)
  TREND_CACHE_TTL: 15,
  ANALYTICS_CACHE_TTL: 60,
  CONTENT_CACHE_TTL: 5,

  // Timeouts (in milliseconds)
  API_TIMEOUT: 10000,
  AI_GENERATION_TIMEOUT: 60000,
  TRANSCRIPTION_TIMEOUT: 300000,
} as const;

// =============================================================================
// Platform API Endpoints
// =============================================================================

export const API_ENDPOINTS = {
  twitter: {
    base: 'https://api.twitter.com/2',
    tweets: '/tweets',
    users: '/users',
    trends: '/trends/place',
    media: '/media/upload',
  },
  linkedin: {
    base: 'https://api.linkedin.com/v2',
    posts: '/ugcPosts',
    shares: '/shares',
    me: '/me',
    connections: '/connections',
  },
  hackernews: {
    base: 'https://hacker-news.firebaseio.com/v0',
    topStories: '/topstories.json',
    newStories: '/newstories.json',
    bestStories: '/beststories.json',
    askStories: '/askstories.json',
    showStories: '/showstories.json',
    item: '/item',
  },
  reddit: {
    base: 'https://oauth.reddit.com',
    hot: '/r/{subreddit}/hot.json',
    top: '/r/{subreddit}/top.json',
    new: '/r/{subreddit}/new.json',
  },
  youtube: {
    base: 'https://www.googleapis.com/youtube/v3',
    videos: '/videos',
    search: '/search',
    captions: '/captions',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    chat: '/chat/completions',
    transcription: '/audio/transcriptions',
  },
  anthropic: {
    base: 'https://api.anthropic.com/v1',
    messages: '/messages',
  },
  assemblyai: {
    base: 'https://api.assemblyai.com/v2',
    transcript: '/transcript',
    upload: '/upload',
  },
} as const;

// =============================================================================
// Error Codes
// =============================================================================

export const ERROR_CODES = {
  // General
  INVALID_CONFIG: 'CONTENT_INVALID_CONFIG',
  NOT_INITIALIZED: 'CONTENT_NOT_INITIALIZED',
  STORE_ERROR: 'CONTENT_STORE_ERROR',

  // Provider errors
  PROVIDER_NOT_FOUND: 'CONTENT_PROVIDER_NOT_FOUND',
  PROVIDER_AUTH_FAILED: 'CONTENT_PROVIDER_AUTH_FAILED',
  PROVIDER_RATE_LIMITED: 'CONTENT_PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT: 'CONTENT_PROVIDER_TIMEOUT',
  PROVIDER_API_ERROR: 'CONTENT_PROVIDER_API_ERROR',

  // Content errors
  CONTENT_NOT_FOUND: 'CONTENT_NOT_FOUND',
  CONTENT_VALIDATION_FAILED: 'CONTENT_VALIDATION_FAILED',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  CONTENT_GENERATION_FAILED: 'CONTENT_GENERATION_FAILED',

  // Voice profile errors
  VOICE_PROFILE_NOT_FOUND: 'VOICE_PROFILE_NOT_FOUND',
  VOICE_INSUFFICIENT_SAMPLES: 'VOICE_INSUFFICIENT_SAMPLES',
  VOICE_TRAINING_FAILED: 'VOICE_TRAINING_FAILED',

  // Pipeline errors
  PIPELINE_NOT_FOUND: 'PIPELINE_NOT_FOUND',
  PIPELINE_EXECUTION_FAILED: 'PIPELINE_EXECUTION_FAILED',
  TRANSFORMATION_FAILED: 'TRANSFORMATION_FAILED',

  // Platform errors
  TWITTER_API_ERROR: 'TWITTER_API_ERROR',
  LINKEDIN_API_ERROR: 'LINKEDIN_API_ERROR',
  WORDPRESS_API_ERROR: 'WORDPRESS_API_ERROR',
  GHOST_API_ERROR: 'GHOST_API_ERROR',
  YOUTUBE_API_ERROR: 'YOUTUBE_API_ERROR',

  // Transcription errors
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
  AUDIO_TOO_LONG: 'AUDIO_TOO_LONG',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',

  // SEO errors
  SEO_AUDIT_FAILED: 'SEO_AUDIT_FAILED',
  INVALID_URL: 'INVALID_URL',

  // Trend errors
  TREND_FETCH_FAILED: 'TREND_FETCH_FAILED',
  ALERT_CREATION_FAILED: 'ALERT_CREATION_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
