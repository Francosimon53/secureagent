/**
 * Content Creator Suite - Providers Index
 *
 * Exports for all content providers.
 */

// Base provider
export {
  BaseContentProvider,
  ContentProviderError,
  ContentProviderRegistry,
  RateLimiter,
  getContentProviderRegistry,
  initContentProviderRegistry,
  resetContentProviderRegistry,
} from './base.js';

// Social providers
export {
  TwitterProvider,
  createTwitterProvider,
  LinkedInProvider,
  createLinkedInProvider,
  type PostedTweet,
  type PostedLinkedInPost,
} from './social/index.js';

// AI providers (will be exported when ai/index.ts is created)
export {
  ContentGeneratorProvider,
  createContentGenerator,
  CONTENT_PROMPTS,
  type GenerationRequest,
  type GenerationResponse,
} from './ai/content-generator.js';

export {
  VoiceTrainerProvider,
  createVoiceTrainer,
  type VoiceAnalysisResult,
  type SampleAnalysis,
} from './ai/voice-trainer.js';
