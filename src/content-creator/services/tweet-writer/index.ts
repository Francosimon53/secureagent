/**
 * Content Creator Suite - Tweet Writer Service
 *
 * Main entry point for tweet and thread generation with voice training.
 */

export {
  VoiceAnalyzerService,
  createVoiceAnalyzer,
  type VoiceAnalyzerConfig,
  type AddSampleOptions,
  type CreateProfileOptions,
} from './voice-analyzer.js';

export {
  TweetGeneratorService,
  createTweetGenerator,
  type TweetGeneratorConfig,
  type GeneratedTweet,
  type GeneratedThread,
} from './tweet-generator.js';

export {
  HookGeneratorService,
  createHookGenerator,
  type HookType,
  type HookGenerationOptions,
  type GeneratedHook,
} from './hook-generator.js';

import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceTrainerProvider } from '../../providers/ai/voice-trainer.js';
import type { VoiceProfileConfig, TwitterConfig } from '../../config.js';

import { createVoiceAnalyzer, type VoiceAnalyzerConfig } from './voice-analyzer.js';
import { createTweetGenerator, type TweetGeneratorConfig } from './tweet-generator.js';
import { createHookGenerator } from './hook-generator.js';

// =============================================================================
// Tweet Writer Service (Facade)
// =============================================================================

export interface TweetWriterServiceConfig {
  voiceProfile?: VoiceProfileConfig;
  twitter?: TwitterConfig;
}

export class TweetWriterService {
  public readonly voiceAnalyzer: ReturnType<typeof createVoiceAnalyzer>;
  public readonly tweetGenerator: ReturnType<typeof createTweetGenerator>;
  public readonly hookGenerator: ReturnType<typeof createHookGenerator>;

  constructor(
    contentStore: ContentStore,
    voiceProfileStore: VoiceProfileStore,
    contentGenerator: ContentGeneratorProvider,
    voiceTrainer: VoiceTrainerProvider,
    config?: TweetWriterServiceConfig
  ) {
    // Initialize voice analyzer
    const voiceAnalyzerConfig: Partial<VoiceAnalyzerConfig> | undefined = config?.voiceProfile
      ? {
          minSamplesForTraining: config.voiceProfile.minSamplesForTraining,
          maxSamplesPerProfile: config.voiceProfile.maxSamplesPerProfile,
          analysisDepth: config.voiceProfile.analysisDepth,
          autoRefresh: config.voiceProfile.autoRefresh,
          refreshIntervalDays: config.voiceProfile.refreshIntervalDays,
        }
      : undefined;

    this.voiceAnalyzer = createVoiceAnalyzer(
      voiceProfileStore,
      voiceTrainer,
      voiceAnalyzerConfig
    );

    // Initialize tweet generator
    const tweetGeneratorConfig: Partial<TweetGeneratorConfig> | undefined = config?.twitter
      ? {
          maxTweetLength: 280,
          maxThreadLength: config.twitter.maxThreadLength,
          defaultHashtags: config.twitter.defaultHashtags,
          autoThread: config.twitter.autoThread,
        }
      : undefined;

    this.tweetGenerator = createTweetGenerator(
      contentStore,
      voiceProfileStore,
      contentGenerator,
      tweetGeneratorConfig
    );

    // Initialize hook generator
    this.hookGenerator = createHookGenerator(contentGenerator);
  }

  /**
   * Create a new voice profile
   */
  async createVoiceProfile(
    userId: string,
    name: string,
    options?: {
      description?: string;
      initialSamples?: { content: string; platform: 'twitter' }[];
    }
  ) {
    return this.voiceAnalyzer.createProfile(userId, {
      name,
      description: options?.description,
      initialSamples: options?.initialSamples?.map(s => ({
        content: s.content,
        platform: s.platform,
        contentType: 'tweet' as const,
      })),
    });
  }

  /**
   * Generate a tweet with optional voice profile
   */
  async generateTweet(
    userId: string,
    topic: string,
    options?: {
      voiceProfileId?: string;
      includeHashtags?: boolean;
      includeCTA?: boolean;
      targetAudience?: string;
    }
  ) {
    return this.tweetGenerator.generateTweet(userId, {
      topic,
      voiceProfileId: options?.voiceProfileId,
      includeHashtags: options?.includeHashtags,
      includeCTA: options?.includeCTA,
      targetAudience: options?.targetAudience,
    });
  }

  /**
   * Generate a Twitter thread with optional voice profile
   */
  async generateThread(
    userId: string,
    topic: string,
    options?: {
      voiceProfileId?: string;
      minTweets?: number;
      maxTweets?: number;
      includeHook?: boolean;
      includeCTA?: boolean;
      targetAudience?: string;
    }
  ) {
    return this.tweetGenerator.generateThread(userId, {
      topic,
      voiceProfileId: options?.voiceProfileId,
      minTweets: options?.minTweets,
      maxTweets: options?.maxTweets,
      includeHook: options?.includeHook,
      includeCTA: options?.includeCTA,
      targetAudience: options?.targetAudience,
    });
  }

  /**
   * Generate an engaging hook for a topic
   */
  async generateHook(
    topic: string,
    options?: {
      hookType?: 'question' | 'statistic' | 'story' | 'controversial' | 'curiosity' | 'promise' | 'challenge' | 'quote';
      maxLength?: number;
      targetAudience?: string;
    }
  ) {
    return this.hookGenerator.generateHook({
      topic,
      hookType: options?.hookType,
      maxLength: options?.maxLength,
      targetAudience: options?.targetAudience,
    });
  }

  /**
   * Add a sample to train a voice profile
   */
  async addVoiceSample(
    profileId: string,
    userId: string,
    content: string,
    engagementMetrics?: {
      likes: number;
      comments: number;
      shares: number;
      impressions: number;
    }
  ) {
    return this.voiceAnalyzer.addSample(profileId, userId, {
      content,
      platform: 'twitter',
      contentType: 'tweet',
      engagementMetrics: engagementMetrics
        ? {
            ...engagementMetrics,
            clicks: 0,
            engagementRate:
              (engagementMetrics.likes + engagementMetrics.comments + engagementMetrics.shares) /
              Math.max(engagementMetrics.impressions, 1),
            fetchedAt: Date.now(),
          }
        : undefined,
    });
  }

  /**
   * Train a voice profile from its samples
   */
  async trainVoiceProfile(profileId: string) {
    return this.voiceAnalyzer.trainProfile(profileId);
  }

  /**
   * Get all voice profiles for a user
   */
  async getUserVoiceProfiles(userId: string) {
    return this.voiceAnalyzer.getUserProfiles(userId);
  }

  /**
   * Generate variations of a tweet
   */
  async generateTweetVariations(userId: string, originalTweet: string, count?: number) {
    return this.tweetGenerator.generateVariations(userId, originalTweet, count);
  }

  /**
   * Improve an existing tweet
   */
  async improveTweet(
    tweet: string,
    improvements: ('engagement' | 'clarity' | 'humor' | 'professionalism')[]
  ) {
    return this.tweetGenerator.improveTweet(tweet, improvements);
  }

  /**
   * Analyze a hook's effectiveness
   */
  async analyzeHook(hook: string) {
    return this.hookGenerator.analyzeHook(hook);
  }

  /**
   * Generate multiple hook variations
   */
  async generateHookVariations(
    topic: string,
    count?: number,
    options?: {
      targetAudience?: string;
      maxLength?: number;
    }
  ) {
    return this.hookGenerator.generateHookVariations(
      {
        topic,
        targetAudience: options?.targetAudience,
        maxLength: options?.maxLength,
      },
      count
    );
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTweetWriterService(
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  contentGenerator: ContentGeneratorProvider,
  voiceTrainer: VoiceTrainerProvider,
  config?: TweetWriterServiceConfig
): TweetWriterService {
  return new TweetWriterService(
    contentStore,
    voiceProfileStore,
    contentGenerator,
    voiceTrainer,
    config
  );
}
