/**
 * Content Creator Suite
 *
 * A comprehensive suite for AI-powered content creation across multiple platforms.
 * Includes tools for social media, blogs, podcasts, videos, newsletters, and presentations.
 */

// =============================================================================
// Types - Re-export selectively to avoid duplicate RepurposingPipeline
// =============================================================================

export {
  // Voice Profile Types
  type WritingStyle,
  type ContentSample,
  type VoiceProfile,

  // Content Types
  type ContentType,
  type ContentPlatform,
  type ContentStatus,
  type GeneratedContent,
  type ContentMetadata,
  type EngagementMetrics,

  // Twitter/X Types
  type Tweet,
  type Thread,
  type TweetGenerationOptions,
  type ThreadGenerationOptions,

  // LinkedIn Types
  type LinkedInPost,
  type LinkedInArticle,
  type LinkedInEngagementAction,
  type AutomationRule,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationCondition,
  type LinkedInMessage,

  // Content Repurposing Types
  type RepurposingPipeline,
  type PipelineTransformation,
  type TransformationConfig,
  type RepurposingJob,
  type RepurposingError,

  // Trend Monitoring Types
  type TrendSource,
  type TrendItem,
  type TrendAlert,
  type TrendAlertNotification,
  type TrendAggregation,

  // Blog & Publishing Types
  type BlogPost,
  type BlogSEO,
  type BlogPlatformCredentials,

  // SEO Audit Types
  type SEOAuditResult,
  type SEOCategoryScore,
  type SEOIssueSeverity,
  type SEOIssue,
  type SEORecommendation,
  type KeywordAnalysis,

  // Video Script Types
  type VideoScript,
  type ScriptSection,
  type BRollSuggestion,
  type VideoScriptGenerationOptions,

  // Podcast Types
  type PodcastTranscription,
  type TranscriptionSegment,
  type Speaker,
  type ShowNotes,
  type TimestampEntry,
  type Resource,
  type Quote,

  // YouTube Types
  type YouTubeSummary,
  type KeyPoint,
  type VideoChapter,

  // Newsletter Types
  type NewsletterDigest,
  type DigestSection,
  type DigestItem,
  type NewsletterSource,

  // Presentation Types
  type Presentation,
  type PresentationTheme,
  type Slide,
  type SlideType,
  type SlideContent,
  type ChartData,
  type PresentationGenerationOptions,

  // Provider Types
  type ContentProviderConfig,
  type ContentProviderResult,

  // Store Query Types
  type ContentQueryOptions,
  type VoiceProfileQueryOptions,
  type TrendQueryOptions,
  type AnalyticsQueryOptions,

  // Analytics Types
  type ContentAnalytics,
  type HistoricalMetric,
  type AudienceInsights,
  type AnalyticsSummary,

  // Database Adapter Interface
  type DatabaseAdapter,
} from './types.js';

// =============================================================================
// Configuration
// =============================================================================

export {
  ContentCreatorConfigSchema,
  type ContentCreatorConfig,
  type TwitterConfig,
  type LinkedInConfig,
  type TrendMonitoringConfig,
  type BlogPublishingConfig,
  type SEOAuditConfig,
  type ContentRepurposingConfig,
  type MediaConfig,
  type AIGenerationConfig,
  type VoiceProfileConfig,
  type NewsletterConfig,
  type VideoScriptsConfig,
  type PresentationConfig,
} from './config.js';

// =============================================================================
// Constants
// =============================================================================

export {
  CONTENT_EVENTS,
  CONTENT_DEFAULTS,
  ERROR_CODES,
  API_ENDPOINTS,
} from './constants.js';

// =============================================================================
// Base Providers
// =============================================================================

export {
  BaseContentProvider,
  ContentProviderRegistry,
  RateLimiter,
  ContentProviderError,
  getContentProviderRegistry,
  initContentProviderRegistry,
  resetContentProviderRegistry,
} from './providers/base.js';

// Note: ContentProviderResult and ContentProviderConfig are already exported from types.ts above

// =============================================================================
// AI Providers
// =============================================================================

export * from './providers/ai/index.js';

// =============================================================================
// Social Providers
// =============================================================================

export {
  TwitterProvider,
  createTwitterProvider,
} from './providers/social/twitter.js';

// =============================================================================
// Trend Providers
// =============================================================================

export {
  HackerNewsProvider,
  createHackerNewsProvider,
} from './providers/trends/hackernews.js';

// =============================================================================
// Blog Providers
// =============================================================================

export * from './providers/blog/index.js';

// =============================================================================
// Media Providers
// =============================================================================

export * from './providers/media/index.js';

// =============================================================================
// Stores
// =============================================================================

export * from './stores/index.js';

// =============================================================================
// Services
// =============================================================================

export * from './services/index.js';

// =============================================================================
// Formatters
// =============================================================================

export * from './formatters/index.js';

// =============================================================================
// Content Creator Manager
// =============================================================================

import type { ContentCreatorConfig } from './config.js';
import type { DatabaseAdapter } from './types.js';
import type { ContentGeneratorProvider } from './providers/ai/content-generator.js';
import type { TranscriptionProvider } from './providers/ai/transcription.js';
import type { VoiceTrainerProvider } from './providers/ai/voice-trainer.js';
import type { YouTubeProvider } from './providers/media/youtube.js';
import type { PodcastProvider } from './providers/media/podcast.js';
import type { BlogProviderRegistry } from './providers/blog/index.js';

import { createContentStore, type ContentStore } from './stores/content-store.js';
import { createVoiceProfileStore, type VoiceProfileStore } from './stores/voice-profile-store.js';
import { createAnalyticsStore, type AnalyticsStore } from './stores/analytics-store.js';

import { createSEOAuditService, type SEOAuditService } from './services/seo-audit/index.js';
import { createContentRepurposingService, type ContentRepurposingService } from './services/content-repurposing/index.js';
import { createVideoScriptsService, type VideoScriptsService } from './services/video-scripts/index.js';
import { createPodcastTranscriptionService, type PodcastTranscriptionService } from './services/podcast-transcription/index.js';
import { createYouTubeSummarizerService, type YouTubeSummarizerService } from './services/youtube-summarizer/index.js';
import { createNewsletterDigestService, type NewsletterDigestService } from './services/newsletter-digest/index.js';
import { createPresentationGeneratorService, type PresentationGeneratorService } from './services/presentation-generator/index.js';
import { createBlogPublishingService, type BlogPublishingService } from './services/blog-publishing/index.js';

import { createTweetFormatter, type TweetFormatter } from './formatters/tweet-formatter.js';
import { createBlogFormatter, type BlogFormatter } from './formatters/blog-formatter.js';
import { createNewsletterFormatter, type NewsletterFormatter } from './formatters/newsletter-formatter.js';
import { createPresentationFormatter, type PresentationFormatter } from './formatters/presentation-formatter.js';

export interface ContentCreatorManagerConfig {
  config?: ContentCreatorConfig;
  database?: DatabaseAdapter;

  // Required providers
  contentGenerator: ContentGeneratorProvider;

  // Optional providers
  transcriptionProvider?: TranscriptionProvider;
  voiceTrainer?: VoiceTrainerProvider;
  blogProviders?: BlogProviderRegistry;
  youtubeProvider?: YouTubeProvider;
  podcastProvider?: PodcastProvider;
}

/**
 * Content Creator Manager
 *
 * Central manager for all content creation services. Provides a unified interface
 * for accessing all content creation capabilities.
 */
export class ContentCreatorManager {
  // Stores
  public readonly contentStore: ContentStore;
  public readonly voiceProfileStore: VoiceProfileStore;
  public readonly analyticsStore: AnalyticsStore;

  // Services
  public readonly blogPublishing?: BlogPublishingService;
  public readonly seoAudit: SEOAuditService;
  public readonly contentRepurposing: ContentRepurposingService;
  public readonly videoScripts: VideoScriptsService;
  public readonly podcastTranscription?: PodcastTranscriptionService;
  public readonly youtubeSummarizer?: YouTubeSummarizerService;
  public readonly newsletterDigest: NewsletterDigestService;
  public readonly presentationGenerator: PresentationGeneratorService;

  // Formatters
  public readonly tweetFormatter: TweetFormatter;
  public readonly blogFormatter: BlogFormatter;
  public readonly newsletterFormatter: NewsletterFormatter;
  public readonly presentationFormatter: PresentationFormatter;

  constructor(managerConfig: ContentCreatorManagerConfig) {
    const { config, database, contentGenerator } = managerConfig;

    // Initialize stores
    const storeType = database ? 'database' : 'memory';
    this.contentStore = createContentStore(storeType, database);
    this.voiceProfileStore = createVoiceProfileStore(storeType, database);
    this.analyticsStore = createAnalyticsStore(storeType, database);

    // Initialize formatters
    this.tweetFormatter = createTweetFormatter();
    this.blogFormatter = createBlogFormatter();
    this.newsletterFormatter = createNewsletterFormatter();
    this.presentationFormatter = createPresentationFormatter();

    // Initialize services

    // Blog Publishing (requires blog providers)
    if (managerConfig.blogProviders) {
      this.blogPublishing = createBlogPublishingService(
        this.contentStore,
        managerConfig.blogProviders,
        { blogPublishing: config?.blogPublishing }
      );
    }

    // SEO Audit (always available)
    this.seoAudit = createSEOAuditService(contentGenerator);

    // Content Repurposing (always available)
    this.contentRepurposing = createContentRepurposingService(
      this.contentStore,
      this.voiceProfileStore,
      contentGenerator,
      { contentRepurposing: config?.contentRepurposing }
    );

    // Video Scripts (always available)
    this.videoScripts = createVideoScriptsService(
      contentGenerator,
      this.voiceProfileStore,
      { videoScripts: config?.videoScripts }
    );

    // Podcast Transcription (requires transcription provider)
    if (managerConfig.transcriptionProvider) {
      this.podcastTranscription = createPodcastTranscriptionService(
        managerConfig.transcriptionProvider,
        contentGenerator,
        managerConfig.podcastProvider,
        { podcast: config?.media?.podcast }
      );
    }

    // YouTube Summarizer (requires YouTube provider)
    if (managerConfig.youtubeProvider) {
      this.youtubeSummarizer = createYouTubeSummarizerService(
        managerConfig.youtubeProvider,
        contentGenerator
      );
    }

    // Newsletter Digest (always available)
    this.newsletterDigest = createNewsletterDigestService(
      contentGenerator
    );

    // Presentation Generator (always available)
    this.presentationGenerator = createPresentationGeneratorService(
      contentGenerator
    );
  }

  // ===========================================================================
  // Quick Access Methods
  // ===========================================================================

  /**
   * Check if a service is available
   */
  hasService(service: string): boolean {
    switch (service) {
      case 'blogPublishing':
        return !!this.blogPublishing;
      case 'podcastTranscription':
        return !!this.podcastTranscription;
      case 'youtubeSummarizer':
        return !!this.youtubeSummarizer;
      case 'seoAudit':
      case 'contentRepurposing':
      case 'videoScripts':
      case 'newsletterDigest':
      case 'presentationGenerator':
        return true;
      default:
        return false;
    }
  }

  /**
   * Get list of available services
   */
  getAvailableServices(): string[] {
    const services = [
      'seoAudit',
      'contentRepurposing',
      'videoScripts',
      'newsletterDigest',
      'presentationGenerator',
    ];

    if (this.blogPublishing) services.push('blogPublishing');
    if (this.podcastTranscription) services.push('podcastTranscription');
    if (this.youtubeSummarizer) services.push('youtubeSummarizer');

    return services;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register global event handler for all services
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    const unsubscribers: (() => void)[] = [];

    if (this.blogPublishing) {
      unsubscribers.push(this.blogPublishing.onEvent(handler));
    }
    if (this.podcastTranscription) {
      unsubscribers.push(this.podcastTranscription.onEvent(handler));
    }
    if (this.youtubeSummarizer) {
      unsubscribers.push(this.youtubeSummarizer.onEvent(handler));
    }
    unsubscribers.push(this.newsletterDigest.onEvent(handler));

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a Content Creator Manager instance
 */
export function createContentCreatorManager(
  config: ContentCreatorManagerConfig
): ContentCreatorManager {
  return new ContentCreatorManager(config);
}

// =============================================================================
// Default Export
// =============================================================================

export default ContentCreatorManager;
