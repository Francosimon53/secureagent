/**
 * Content Creator Suite - Services Index
 *
 * Exports all content creation services.
 */

// Tweet Writer Service
export {
  TweetWriterService,
  createTweetWriterService,
  type TweetWriterServiceConfig,
} from './tweet-writer/index.js';

// Trend Monitoring Service
export {
  TrendMonitoringService,
  createTrendMonitoringService,
  type TrendMonitoringServiceConfig,
} from './trend-monitoring/index.js';

// Blog Publishing Service
export {
  BlogPublishingService,
  createBlogPublishingService,
  type BlogPublishingServiceConfig,
  type PublishOptions,
  type PublishResult,
} from './blog-publishing/index.js';

// SEO Audit Service
export {
  SEOAuditService,
  createSEOAuditService,
  type SEOAuditServiceConfig,
} from './seo-audit/index.js';

// Content Repurposing Service
export {
  ContentRepurposingService,
  createContentRepurposingService,
  type ContentRepurposingServiceConfig,
} from './content-repurposing/index.js';

// Video Scripts Service
export {
  VideoScriptsService,
  createVideoScriptsService,
  type VideoScriptsServiceConfig,
  type GeneratedScript,
  type VideoOutline,
  type VideoHook,
} from './video-scripts/index.js';

// Podcast Transcription Service
export {
  PodcastTranscriptionService,
  createPodcastTranscriptionService,
  type PodcastTranscriptionServiceConfig,
  type TranscriptionJob,
  type GeneratedShowNotes,
  type ExtractedTimestamp,
} from './podcast-transcription/index.js';

// YouTube Summarizer Service
export {
  YouTubeSummarizerService,
  createYouTubeSummarizerService,
  type YouTubeSummarizerServiceConfig,
  type FetchedVideo,
  type VideoSummary,
  type ExtractedKeyPoints,
  type FullVideoAnalysis,
} from './youtube-summarizer/index.js';

// Newsletter Digest Service
export {
  NewsletterDigestService,
  createNewsletterDigestService,
  type NewsletterDigestServiceConfig,
  type GeneratedDigest,
  type InsightReport,
  type CurationResult,
  type FullNewsletterResult,
} from './newsletter-digest/index.js';

// Presentation Generator Service
export {
  PresentationGeneratorService,
  createPresentationGeneratorService,
  type PresentationGeneratorServiceConfig,
  type GeneratedPresentation,
  type GeneratedSlide,
  type SlideVisualPlan,
  type PresentationDesignGuide,
  type FullPresentationResult,
} from './presentation-generator/index.js';
