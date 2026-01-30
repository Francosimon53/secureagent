/**
 * Content Creator Suite - Video Hook Writer
 *
 * Specialized service for generating attention-grabbing video hooks.
 */

import type { VoiceProfile } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export type VideoHookType =
  | 'question'
  | 'statistic'
  | 'story'
  | 'controversial'
  | 'curiosity'
  | 'promise'
  | 'challenge'
  | 'quote'
  | 'demonstration'
  | 'pain_point';

export interface VideoHook {
  id: string;
  type: VideoHookType;
  content: string;
  wordCount: number;
  estimatedDuration: number;
  visualSuggestion?: string;
  followUpLine?: string;
}

export interface VideoHookGenerationOptions {
  topic: string;
  hookType?: VideoHookType;
  targetAudience?: string;
  videoStyle?: 'educational' | 'entertainment' | 'tutorial' | 'vlog' | 'promotional';
  maxDuration?: number;
  includeVisualSuggestion?: boolean;
  includeFollowUp?: boolean;
}

export interface HookAnalysis {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  emotionalAppeal: 'high' | 'medium' | 'low';
  curiosityFactor: 'high' | 'medium' | 'low';
}

// =============================================================================
// Hook Writer Service
// =============================================================================

export class HookWriterService {
  private readonly wordsPerMinute: number;

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    wordsPerMinute?: number
  ) {
    this.wordsPerMinute = wordsPerMinute ?? CONTENT_DEFAULTS.VIDEO_SCRIPT_WORDS_PER_MINUTE;
  }

  /**
   * Generate a video hook
   */
  async generateHook(
    options: VideoHookGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<VideoHook> {
    const hookType = options.hookType ?? this.selectBestHookType(options.topic, options.videoStyle);
    const maxWords = options.maxDuration
      ? Math.round((options.maxDuration / 60) * this.wordsPerMinute)
      : 30;

    const prompt = this.buildHookPrompt(hookType, options, maxWords);

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: this.getHookSystemPrompt(hookType),
      maxTokens: 200,
      voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate hook: ${result.error}`);
    }

    const content = this.cleanHookContent(result.data.content);
    const wordCount = this.countWords(content);

    const hook: VideoHook = {
      id: crypto.randomUUID(),
      type: hookType,
      content,
      wordCount,
      estimatedDuration: Math.round((wordCount / this.wordsPerMinute) * 60),
    };

    // Generate visual suggestion if requested
    if (options.includeVisualSuggestion) {
      hook.visualSuggestion = await this.generateVisualSuggestion(content, options.topic);
    }

    // Generate follow-up line if requested
    if (options.includeFollowUp) {
      hook.followUpLine = await this.generateFollowUp(content, options.topic, voiceProfile);
    }

    return hook;
  }

  /**
   * Generate multiple hook variations
   */
  async generateHookVariations(
    options: VideoHookGenerationOptions,
    count: number = 5,
    voiceProfile?: VoiceProfile
  ): Promise<VideoHook[]> {
    const hookTypes: VideoHookType[] = [
      'question',
      'statistic',
      'story',
      'curiosity',
      'promise',
      'pain_point',
    ];

    // Select different hook types for variety
    const selectedTypes = hookTypes.slice(0, count);

    const hooks: VideoHook[] = [];

    for (const hookType of selectedTypes) {
      try {
        const hook = await this.generateHook(
          { ...options, hookType },
          voiceProfile
        );
        hooks.push(hook);
      } catch (error) {
        console.warn(`Failed to generate ${hookType} hook:`, error);
      }
    }

    return hooks;
  }

  /**
   * Analyze a hook's effectiveness
   */
  async analyzeHook(hook: string, topic: string): Promise<HookAnalysis> {
    const prompt = `Analyze this video hook for effectiveness:

TOPIC: ${topic}
HOOK: "${hook}"

Evaluate on:
1. Attention-grabbing quality (does it stop scrolling?)
2. Relevance to topic
3. Emotional appeal
4. Curiosity factor
5. Clarity and conciseness

Provide:
SCORE: [1-10]
STRENGTHS:
- [strength 1]
- [strength 2]
WEAKNESSES:
- [weakness 1]
SUGGESTIONS:
- [improvement 1]
- [improvement 2]
EMOTIONAL_APPEAL: [high/medium/low]
CURIOSITY_FACTOR: [high/medium/low]`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video marketing expert who analyzes hook effectiveness.',
      maxTokens: 400,
    });

    if (!result.success) {
      return {
        score: 5,
        strengths: ['Unable to analyze'],
        weaknesses: ['Analysis failed'],
        suggestions: ['Try regenerating'],
        emotionalAppeal: 'medium',
        curiosityFactor: 'medium',
      };
    }

    const content = result.data.content;

    // Parse score
    const scoreMatch = content.match(/SCORE:\s*(\d+)/i);
    const score = scoreMatch ? Math.min(10, parseInt(scoreMatch[1], 10)) : 5;

    // Parse strengths
    const strengthsMatch = content.match(/STRENGTHS:([\s\S]*?)(?=WEAKNESSES:|$)/i);
    const strengths = strengthsMatch
      ? strengthsMatch[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim())
      : [];

    // Parse weaknesses
    const weaknessesMatch = content.match(/WEAKNESSES:([\s\S]*?)(?=SUGGESTIONS:|$)/i);
    const weaknesses = weaknessesMatch
      ? weaknessesMatch[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim())
      : [];

    // Parse suggestions
    const suggestionsMatch = content.match(/SUGGESTIONS:([\s\S]*?)(?=EMOTIONAL_APPEAL:|$)/i);
    const suggestions = suggestionsMatch
      ? suggestionsMatch[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.replace(/^-\s*/, '').trim())
      : [];

    // Parse emotional appeal
    const emotionalMatch = content.match(/EMOTIONAL_APPEAL:\s*(high|medium|low)/i);
    const emotionalAppeal = (emotionalMatch?.[1]?.toLowerCase() ?? 'medium') as 'high' | 'medium' | 'low';

    // Parse curiosity factor
    const curiosityMatch = content.match(/CURIOSITY_FACTOR:\s*(high|medium|low)/i);
    const curiosityFactor = (curiosityMatch?.[1]?.toLowerCase() ?? 'medium') as 'high' | 'medium' | 'low';

    return {
      score,
      strengths,
      weaknesses,
      suggestions,
      emotionalAppeal,
      curiosityFactor,
    };
  }

  /**
   * Improve an existing hook
   */
  async improveHook(
    hook: string,
    topic: string,
    improvements: ('shorter' | 'more_emotional' | 'more_curious' | 'clearer' | 'stronger_opening')[],
    voiceProfile?: VoiceProfile
  ): Promise<VideoHook> {
    const improvementDescriptions: Record<string, string> = {
      shorter: 'Make it more concise without losing impact',
      more_emotional: 'Add more emotional appeal and connection',
      more_curious: 'Increase the curiosity factor and intrigue',
      clearer: 'Make the message clearer and more direct',
      stronger_opening: 'Start with a more powerful first few words',
    };

    const improvementList = improvements
      .map(i => `- ${improvementDescriptions[i]}`)
      .join('\n');

    const prompt = `Improve this video hook:

ORIGINAL: "${hook}"
TOPIC: ${topic}

IMPROVEMENTS NEEDED:
${improvementList}

Write an improved version that addresses these points while maintaining the core message.
Return ONLY the improved hook.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video hook expert who improves hooks for maximum impact.',
      maxTokens: 100,
      voiceProfile,
    });

    const content = result.success ? this.cleanHookContent(result.data.content) : hook;
    const wordCount = this.countWords(content);

    return {
      id: crypto.randomUUID(),
      type: 'curiosity', // Default type for improved hooks
      content,
      wordCount,
      estimatedDuration: Math.round((wordCount / this.wordsPerMinute) * 60),
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Build hook generation prompt
   */
  private buildHookPrompt(
    hookType: VideoHookType,
    options: VideoHookGenerationOptions,
    maxWords: number
  ): string {
    const typeInstructions: Record<VideoHookType, string> = {
      question: 'Start with a thought-provoking question that makes viewers want to know the answer',
      statistic: 'Open with a surprising or shocking statistic that grabs attention',
      story: 'Begin with a mini-story or anecdote that draws viewers in',
      controversial: 'Start with a bold, slightly controversial statement that sparks interest',
      curiosity: 'Create an information gap that viewers feel compelled to close',
      promise: 'Make a clear promise about what viewers will learn or gain',
      challenge: 'Challenge a common belief or misconception',
      quote: 'Open with a powerful, relevant quote',
      demonstration: 'Tease an impressive result or demonstration',
      pain_point: 'Address a specific pain point or frustration your audience has',
    };

    return `Write a ${hookType} video hook for:

TOPIC: ${options.topic}
${options.targetAudience ? `TARGET AUDIENCE: ${options.targetAudience}` : ''}
${options.videoStyle ? `VIDEO STYLE: ${options.videoStyle}` : ''}

HOOK TYPE: ${hookType}
INSTRUCTION: ${typeInstructions[hookType]}

Requirements:
- Maximum ${maxWords} words
- Must be spoken naturally (write for voice, not text)
- Should make viewers stop scrolling
- Create immediate engagement

Return ONLY the hook text, nothing else.`;
  }

  /**
   * Get system prompt for hook type
   */
  private getHookSystemPrompt(hookType: VideoHookType): string {
    return `You are an expert at writing viral video hooks. You understand what makes people stop scrolling and watch. Your hooks are:
- Immediately attention-grabbing
- Emotionally resonant
- Curiosity-inducing
- Natural when spoken aloud
- Free of cliches and overused phrases

Hook type focus: ${hookType}`;
  }

  /**
   * Select best hook type based on topic and style
   */
  private selectBestHookType(
    topic: string,
    style?: string
  ): VideoHookType {
    const topicLower = topic.toLowerCase();

    // Tutorial/how-to topics
    if (topicLower.includes('how to') || style === 'tutorial') {
      return 'promise';
    }

    // Educational/informative topics
    if (style === 'educational') {
      return Math.random() > 0.5 ? 'statistic' : 'curiosity';
    }

    // Entertainment
    if (style === 'entertainment') {
      return Math.random() > 0.5 ? 'story' : 'curiosity';
    }

    // Promotional
    if (style === 'promotional') {
      return 'pain_point';
    }

    // Default: rotate between effective types
    const effectiveTypes: VideoHookType[] = ['question', 'curiosity', 'promise', 'pain_point'];
    return effectiveTypes[Math.floor(Math.random() * effectiveTypes.length)];
  }

  /**
   * Generate visual suggestion for hook
   */
  private async generateVisualSuggestion(hook: string, topic: string): Promise<string> {
    const prompt = `Suggest a visual for this video hook:

HOOK: "${hook}"
TOPIC: ${topic}

Describe a compelling visual (5-10 seconds) that would accompany this hook.
Return just the visual description in one sentence.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a video editor suggesting impactful visuals.',
      maxTokens: 50,
    });

    return result.success ? result.data.content.trim() : '';
  }

  /**
   * Generate follow-up line after hook
   */
  private async generateFollowUp(
    hook: string,
    topic: string,
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const prompt = `Write a follow-up line (1-2 sentences) that transitions from this hook to the main content:

HOOK: "${hook}"
TOPIC: ${topic}

The follow-up should:
- Maintain momentum from the hook
- Hint at what's coming
- Keep viewers engaged

Return ONLY the follow-up line.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write smooth transitions in video scripts.',
      maxTokens: 60,
      voiceProfile,
    });

    return result.success ? result.data.content.trim() : '';
  }

  /**
   * Clean hook content
   */
  private cleanHookContent(content: string): string {
    return content
      .trim()
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/^(hook|here'?s?\s*(the|a)?\s*hook):?\s*/i, '') // Remove prefixes
      .trim();
  }

  /**
   * Count words
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createHookWriter(
  contentGenerator: ContentGeneratorProvider,
  wordsPerMinute?: number
): HookWriterService {
  return new HookWriterService(contentGenerator, wordsPerMinute);
}
