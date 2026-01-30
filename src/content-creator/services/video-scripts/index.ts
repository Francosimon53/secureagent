/**
 * Content Creator Suite - Video Scripts Service
 *
 * Main entry point for video script generation, outlines, and hooks.
 */

export {
  ScriptGeneratorService,
  createScriptGenerator,
  type ScriptGeneratorConfig,
  type GeneratedScript,
} from './script-generator.js';

export {
  OutlineBuilderService,
  createOutlineBuilder,
  type VideoOutline,
  type OutlineSection,
  type OutlineGenerationOptions,
} from './outline-builder.js';

export {
  HookWriterService,
  createHookWriter,
  type VideoHookType,
  type VideoHook,
  type VideoHookGenerationOptions,
  type HookAnalysis,
} from './hook-writer.js';

import type {
  VideoScript,
  VideoScriptGenerationOptions,
  VoiceProfile,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { VideoScriptsConfig } from '../../config.js';

import { createScriptGenerator, type GeneratedScript } from './script-generator.js';
import { createOutlineBuilder, type VideoOutline, type OutlineGenerationOptions } from './outline-builder.js';
import { createHookWriter, type VideoHook, type VideoHookGenerationOptions, type HookAnalysis } from './hook-writer.js';

// =============================================================================
// Video Scripts Service (Facade)
// =============================================================================

export interface VideoScriptsServiceConfig {
  videoScripts?: VideoScriptsConfig;
}

export class VideoScriptsService {
  public readonly scriptGenerator: ReturnType<typeof createScriptGenerator>;
  public readonly outlineBuilder: ReturnType<typeof createOutlineBuilder>;
  public readonly hookWriter: ReturnType<typeof createHookWriter>;

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    private readonly voiceProfileStore: VoiceProfileStore,
    config?: VideoScriptsServiceConfig
  ) {
    const wordsPerMinute = config?.videoScripts?.wordsPerMinute ?? 150;

    // Initialize script generator
    this.scriptGenerator = createScriptGenerator(contentGenerator, {
      wordsPerMinute,
      includeHooks: config?.videoScripts?.includeHooks ?? true,
      includeBRollSuggestions: config?.videoScripts?.includeBRollSuggestions ?? true,
      includeSpeakerNotes: config?.videoScripts?.includeSpeakerNotes ?? true,
      defaultStyle: config?.videoScripts?.defaultStyle ?? 'educational',
    });

    // Initialize outline builder
    this.outlineBuilder = createOutlineBuilder(contentGenerator, wordsPerMinute);

    // Initialize hook writer
    this.hookWriter = createHookWriter(contentGenerator, wordsPerMinute);
  }

  // ===========================================================================
  // Script Generation
  // ===========================================================================

  /**
   * Generate a complete video script
   */
  async generateScript(
    userId: string,
    options: VideoScriptGenerationOptions
  ): Promise<GeneratedScript> {
    let voiceProfile: VoiceProfile | undefined;

    if (options.voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(options.voiceProfileId) ?? undefined;
    }

    return this.scriptGenerator.generateScript(userId, options, voiceProfile);
  }

  /**
   * Generate a script from an outline
   */
  async generateScriptFromOutline(
    userId: string,
    outline: VideoOutline
  ): Promise<GeneratedScript> {
    const keyPoints = outline.sections.flatMap(s => s.keyPoints);

    return this.scriptGenerator.generateScript(userId, {
      topic: outline.topic,
      targetDuration: outline.targetDuration,
      style: outline.style,
      keyPoints,
      targetAudience: outline.targetAudience,
      includeHook: true,
      includeCTA: true,
    });
  }

  // ===========================================================================
  // Outline Generation
  // ===========================================================================

  /**
   * Generate a video outline
   */
  async generateOutline(
    options: OutlineGenerationOptions,
    voiceProfileId?: string
  ): Promise<VideoOutline> {
    let voiceProfile: VoiceProfile | undefined;

    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    return this.outlineBuilder.generateOutline(options, voiceProfile);
  }

  /**
   * Expand an outline section
   */
  async expandOutlineSection(
    outline: VideoOutline,
    sectionId: string,
    voiceProfileId?: string
  ): Promise<VideoOutline> {
    const section = outline.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    let voiceProfile: VoiceProfile | undefined;
    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    const expandedSection = await this.outlineBuilder.expandSection(
      section,
      { topic: outline.topic, style: outline.style },
      voiceProfile
    );

    return {
      ...outline,
      sections: outline.sections.map(s =>
        s.id === sectionId ? expandedSection : s
      ),
    };
  }

  /**
   * Get improvement suggestions for an outline
   */
  async getOutlineSuggestions(outline: VideoOutline): Promise<string[]> {
    return this.outlineBuilder.suggestImprovements(outline);
  }

  /**
   * Add a section to an outline
   */
  async addOutlineSection(
    outline: VideoOutline,
    position: number,
    sectionTopic: string,
    voiceProfileId?: string
  ): Promise<VideoOutline> {
    let voiceProfile: VoiceProfile | undefined;
    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    return this.outlineBuilder.addSection(outline, position, sectionTopic, voiceProfile);
  }

  /**
   * Remove a section from an outline
   */
  removeOutlineSection(outline: VideoOutline, sectionId: string): VideoOutline {
    return this.outlineBuilder.removeSection(outline, sectionId);
  }

  /**
   * Reorder outline sections
   */
  reorderOutlineSections(outline: VideoOutline, newOrder: string[]): VideoOutline {
    return this.outlineBuilder.reorderSections(outline, newOrder);
  }

  // ===========================================================================
  // Hook Generation
  // ===========================================================================

  /**
   * Generate a video hook
   */
  async generateHook(
    options: VideoHookGenerationOptions,
    voiceProfileId?: string
  ): Promise<VideoHook> {
    let voiceProfile: VoiceProfile | undefined;

    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    return this.hookWriter.generateHook(options, voiceProfile);
  }

  /**
   * Generate multiple hook variations
   */
  async generateHookVariations(
    options: VideoHookGenerationOptions,
    count?: number,
    voiceProfileId?: string
  ): Promise<VideoHook[]> {
    let voiceProfile: VoiceProfile | undefined;

    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    return this.hookWriter.generateHookVariations(options, count, voiceProfile);
  }

  /**
   * Analyze a hook's effectiveness
   */
  async analyzeHook(hook: string, topic: string): Promise<HookAnalysis> {
    return this.hookWriter.analyzeHook(hook, topic);
  }

  /**
   * Improve an existing hook
   */
  async improveHook(
    hook: string,
    topic: string,
    improvements: ('shorter' | 'more_emotional' | 'more_curious' | 'clearer' | 'stronger_opening')[],
    voiceProfileId?: string
  ): Promise<VideoHook> {
    let voiceProfile: VoiceProfile | undefined;

    if (voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(voiceProfileId) ?? undefined;
    }

    return this.hookWriter.improveHook(hook, topic, improvements, voiceProfile);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Estimate script duration from word count
   */
  estimateDuration(wordCount: number, wordsPerMinute?: number): number {
    const wpm = wordsPerMinute ?? 150;
    return Math.round((wordCount / wpm) * 60);
  }

  /**
   * Estimate word count for target duration
   */
  estimateWordCount(targetDurationSeconds: number, wordsPerMinute?: number): number {
    const wpm = wordsPerMinute ?? 150;
    return Math.round((targetDurationSeconds / 60) * wpm);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVideoScriptsService(
  contentGenerator: ContentGeneratorProvider,
  voiceProfileStore: VoiceProfileStore,
  config?: VideoScriptsServiceConfig
): VideoScriptsService {
  return new VideoScriptsService(contentGenerator, voiceProfileStore, config);
}
