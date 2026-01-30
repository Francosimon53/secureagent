/**
 * Content Creator Suite - Voice Analyzer Service
 *
 * Analyzes writing samples to extract voice characteristics
 * for consistent tweet generation.
 */

import type {
  ContentSample,
  VoiceProfile,
  WritingStyle,
  ContentPlatform,
  ContentType,
} from '../../types.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { VoiceTrainerProvider, VoiceAnalysisResult } from '../../providers/ai/voice-trainer.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface VoiceAnalyzerConfig {
  minSamplesForTraining: number;
  maxSamplesPerProfile: number;
  analysisDepth: 'basic' | 'standard' | 'deep';
  autoRefresh: boolean;
  refreshIntervalDays: number;
}

export interface AddSampleOptions {
  content: string;
  platform: ContentPlatform;
  contentType: ContentType;
  engagementMetrics?: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
    clicks: number;
    engagementRate: number;
    fetchedAt: number;
  };
}

export interface CreateProfileOptions {
  name: string;
  description?: string;
  initialSamples?: AddSampleOptions[];
  defaultStyle?: Partial<WritingStyle>;
}

// =============================================================================
// Voice Analyzer Service
// =============================================================================

export class VoiceAnalyzerService {
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly store: VoiceProfileStore,
    private readonly trainer: VoiceTrainerProvider,
    private readonly config: VoiceAnalyzerConfig
  ) {}

  /**
   * Create a new voice profile
   */
  async createProfile(userId: string, options: CreateProfileOptions): Promise<VoiceProfile> {
    const defaultStyle: WritingStyle = {
      tone: 'professional',
      formality: 'semi-formal',
      vocabulary: 'moderate',
      sentenceLength: 'medium',
      punctuationStyle: 'standard',
      emojiUsage: 'rare',
      hashtagStyle: 'minimal',
      personality: [],
      ...options.defaultStyle,
    };

    const samples: ContentSample[] = [];
    if (options.initialSamples) {
      for (const sample of options.initialSamples) {
        samples.push({
          id: crypto.randomUUID(),
          userId,
          content: sample.content,
          platform: sample.platform,
          contentType: sample.contentType,
          engagementMetrics: sample.engagementMetrics,
          createdAt: Date.now(),
        });
      }
    }

    const profile = await this.store.createProfile({
      userId,
      name: options.name,
      description: options.description,
      style: defaultStyle,
      samples,
      patterns: {
        openingPhrases: [],
        closingPhrases: [],
        transitionWords: [],
        signaturePhrases: [],
        avoidPhrases: [],
      },
      topicExpertise: [],
    });

    this.emit(CONTENT_EVENTS.VOICE_PROFILE_CREATED, { profileId: profile.id, userId });

    // Auto-train if we have enough samples
    if (samples.length >= this.config.minSamplesForTraining) {
      await this.trainProfile(profile.id);
    }

    return profile;
  }

  /**
   * Get a voice profile by ID
   */
  async getProfile(profileId: string): Promise<VoiceProfile | null> {
    return this.store.getProfile(profileId);
  }

  /**
   * Get all profiles for a user
   */
  async getUserProfiles(userId: string): Promise<VoiceProfile[]> {
    return this.store.getProfilesByUser(userId);
  }

  /**
   * Add a content sample to a profile
   */
  async addSample(profileId: string, userId: string, options: AddSampleOptions): Promise<ContentSample> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Check max samples limit
    if (profile.sampleCount >= this.config.maxSamplesPerProfile) {
      // Remove oldest sample
      const oldestSamples = await this.store.getSamplesForProfile(profileId, profile.sampleCount);
      if (oldestSamples.length > 0) {
        const oldest = oldestSamples[oldestSamples.length - 1];
        await this.store.deleteSample(oldest.id);
      }
    }

    const sample = await this.store.addSample(profileId, {
      userId,
      content: options.content,
      platform: options.platform,
      contentType: options.contentType,
      engagementMetrics: options.engagementMetrics,
    });

    this.emit(CONTENT_EVENTS.VOICE_SAMPLE_ADDED, {
      profileId,
      sampleId: sample.id,
      sampleCount: profile.sampleCount + 1,
    });

    // Check if we should auto-retrain
    if (this.config.autoRefresh && this.shouldRefresh(profile)) {
      await this.trainProfile(profileId);
    }

    return sample;
  }

  /**
   * Train a voice profile from its samples
   */
  async trainProfile(profileId: string): Promise<VoiceAnalysisResult | null> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const samples = await this.store.getSamplesForProfile(profileId);
    if (samples.length < this.config.minSamplesForTraining) {
      return null;
    }

    // Perform analysis
    const analysisResult = await this.trainer.analyzeVoice(samples);
    if (!analysisResult.success) {
      throw new Error(`Voice analysis failed: ${analysisResult.error}`);
    }

    const analysis = analysisResult.data;

    // Update profile with analysis results
    await this.store.updateProfile(profileId, {
      style: analysis.style,
      patterns: analysis.patterns,
      topicExpertise: analysis.topicExpertise,
    });

    // Mark as trained
    await this.store.markAsTrained(profileId, analysis.confidence);

    this.emit(CONTENT_EVENTS.VOICE_PROFILE_TRAINED, {
      profileId,
      confidence: analysis.confidence,
      sampleCount: samples.length,
    });

    return analysis;
  }

  /**
   * Update profile settings
   */
  async updateProfile(
    profileId: string,
    updates: {
      name?: string;
      description?: string;
      style?: Partial<WritingStyle>;
      topicExpertise?: string[];
    }
  ): Promise<VoiceProfile | null> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      return null;
    }

    const profileUpdates: Partial<VoiceProfile> = {};

    if (updates.name !== undefined) {
      profileUpdates.name = updates.name;
    }
    if (updates.description !== undefined) {
      profileUpdates.description = updates.description;
    }
    if (updates.style !== undefined) {
      profileUpdates.style = { ...profile.style, ...updates.style };
    }
    if (updates.topicExpertise !== undefined) {
      profileUpdates.topicExpertise = updates.topicExpertise;
    }

    const updated = await this.store.updateProfile(profileId, profileUpdates);

    if (updated) {
      this.emit(CONTENT_EVENTS.VOICE_PROFILE_UPDATED, { profileId, updates });
    }

    return updated;
  }

  /**
   * Delete a voice profile
   */
  async deleteProfile(profileId: string): Promise<boolean> {
    return this.store.deleteProfile(profileId);
  }

  /**
   * Delete a sample from a profile
   */
  async deleteSample(sampleId: string): Promise<boolean> {
    return this.store.deleteSample(sampleId);
  }

  /**
   * Get samples for a profile
   */
  async getProfileSamples(profileId: string, limit?: number): Promise<ContentSample[]> {
    return this.store.getSamplesForProfile(profileId, limit);
  }

  /**
   * Check if a profile should be refreshed
   */
  private shouldRefresh(profile: VoiceProfile): boolean {
    if (!this.config.autoRefresh) {
      return false;
    }

    const daysSinceTraining = (Date.now() - profile.trainedAt) / (1000 * 60 * 60 * 24);
    return daysSinceTraining >= this.config.refreshIntervalDays;
  }

  /**
   * Analyze a piece of content without storing it
   */
  async analyzeContent(content: string): Promise<{
    wordCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    emojiCount: number;
    hashtagCount: number;
    estimatedReadingTime: number;
    suggestedImprovements: string[];
  }> {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const emojis = content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || [];
    const hashtags = content.match(/#\w+/g) || [];

    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const avgSentenceLength = wordCount / Math.max(sentenceCount, 1);
    const estimatedReadingTime = Math.ceil(wordCount / 200); // ~200 words per minute

    const suggestedImprovements: string[] = [];

    // Suggest improvements
    if (avgSentenceLength > 25) {
      suggestedImprovements.push('Consider breaking up long sentences for better readability');
    }
    if (wordCount < 50 && emojis.length === 0) {
      suggestedImprovements.push('Short content could benefit from emojis to add personality');
    }
    if (hashtags.length > 5) {
      suggestedImprovements.push('Too many hashtags may reduce engagement - consider using 2-3 relevant ones');
    }
    if (!content.match(/[!?]/)) {
      suggestedImprovements.push('Consider adding questions or excitement to increase engagement');
    }

    return {
      wordCount,
      sentenceCount,
      avgSentenceLength,
      emojiCount: emojis.length,
      hashtagCount: hashtags.length,
      estimatedReadingTime,
      suggestedImprovements,
    };
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVoiceAnalyzer(
  store: VoiceProfileStore,
  trainer: VoiceTrainerProvider,
  config?: Partial<VoiceAnalyzerConfig>
): VoiceAnalyzerService {
  const defaultConfig: VoiceAnalyzerConfig = {
    minSamplesForTraining: 5,
    maxSamplesPerProfile: 100,
    analysisDepth: 'standard',
    autoRefresh: true,
    refreshIntervalDays: 30,
    ...config,
  };

  return new VoiceAnalyzerService(store, trainer, defaultConfig);
}
