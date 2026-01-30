/**
 * Content Creator Suite - Voice Trainer Provider
 *
 * Analyzes content samples to learn and extract a user's unique writing voice.
 */

import { BaseContentProvider } from '../base.js';
import type { ContentProviderConfig, ContentProviderResult, VoiceProfile, WritingStyle, ContentSample } from '../../types.js';
import type { AIGenerationConfig } from '../../config.js';
import { API_ENDPOINTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface VoiceAnalysisResult {
  style: WritingStyle;
  patterns: VoiceProfile['patterns'];
  topicExpertise: string[];
  confidence: number;
  sampleAnalysis: SampleAnalysis[];
}

export interface SampleAnalysis {
  sampleId: string;
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  emojiCount: number;
  hashtagCount: number;
  toneScore: Record<string, number>;
  readabilityScore: number;
}

interface VoiceTrainerConfig extends ContentProviderConfig {
  provider: 'openai' | 'anthropic';
  openaiApiKeyEnvVar: string;
  anthropicApiKeyEnvVar: string;
  model: { openai: string; anthropic: string };
  temperature: number;
}

// =============================================================================
// Voice Trainer Provider
// =============================================================================

export class VoiceTrainerProvider extends BaseContentProvider<VoiceTrainerConfig> {
  private activeApiKey: string | undefined;

  constructor(config: AIGenerationConfig) {
    const providerConfig: VoiceTrainerConfig = {
      provider: config.provider ?? 'openai',
      openaiApiKeyEnvVar: config.openaiApiKeyEnvVar ?? 'OPENAI_API_KEY',
      anthropicApiKeyEnvVar: config.anthropicApiKeyEnvVar ?? 'ANTHROPIC_API_KEY',
      model: config.model ?? { openai: 'gpt-4-turbo-preview', anthropic: 'claude-3-opus-20240229' },
      temperature: 0.3, // Lower temperature for consistent analysis
      timeout: config.timeout ?? CONTENT_DEFAULTS.AI_GENERATION_TIMEOUT,
      rateLimitPerMinute: config.rateLimitPerMinute ?? CONTENT_DEFAULTS.AI_GENERATION_RATE_LIMIT,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'voice-trainer';
  }

  get type(): string {
    return 'ai';
  }

  protected async onInitialize(): Promise<void> {
    if (this.config.provider === 'openai') {
      this.activeApiKey = process.env[this.config.openaiApiKeyEnvVar];
    } else {
      this.activeApiKey = process.env[this.config.anthropicApiKeyEnvVar];
    }
  }

  /**
   * Analyze content samples to extract voice profile
   */
  async analyzeVoice(samples: ContentSample[]): Promise<ContentProviderResult<VoiceAnalysisResult>> {
    if (samples.length < 3) {
      return {
        success: false,
        error: 'At least 3 content samples are required for voice analysis',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // First, perform local analysis
    const sampleAnalysis = samples.map(sample => this.analyzeSample(sample));

    // Then use AI for deeper pattern extraction
    const aiAnalysis = await this.performAIAnalysis(samples);
    if (!aiAnalysis.success) {
      return aiAnalysis as ContentProviderResult<VoiceAnalysisResult>;
    }

    // Combine local and AI analysis
    const combinedResult = this.combineAnalysis(sampleAnalysis, aiAnalysis.data);

    return {
      success: true,
      data: combinedResult,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Perform local statistical analysis on a sample
   */
  private analyzeSample(sample: ContentSample): SampleAnalysis {
    const content = sample.content;
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const emojis = content.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu) || [];
    const hashtags = content.match(/#\w+/g) || [];

    // Simple readability calculation (Flesch-Kincaid approximation)
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    const avgSyllables = this.estimateAvgSyllables(words);
    const readabilityScore = Math.max(0, Math.min(100,
      206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllables
    ));

    // Simple tone scoring based on word patterns
    const toneScore = this.analyzeTone(content);

    return {
      sampleId: sample.id,
      wordCount: words.length,
      sentenceCount: sentences.length,
      avgSentenceLength,
      emojiCount: emojis.length,
      hashtagCount: hashtags.length,
      toneScore,
      readabilityScore,
    };
  }

  /**
   * Estimate average syllables per word
   */
  private estimateAvgSyllables(words: string[]): number {
    let totalSyllables = 0;
    for (const word of words) {
      // Simple syllable estimation
      const vowelGroups = word.toLowerCase().match(/[aeiouy]+/g) || [];
      totalSyllables += Math.max(1, vowelGroups.length);
    }
    return totalSyllables / Math.max(words.length, 1);
  }

  /**
   * Simple tone analysis based on word patterns
   */
  private analyzeTone(content: string): Record<string, number> {
    const lowerContent = content.toLowerCase();

    const tonePatterns: Record<string, RegExp[]> = {
      professional: [/regarding/g, /furthermore/g, /therefore/g, /consequently/g, /accordingly/g],
      casual: [/hey/g, /gonna/g, /wanna/g, /kinda/g, /btw/g, /tbh/g],
      humorous: [/lol/g, /haha/g, /😂/g, /🤣/g, /funny/g, /joke/g],
      authoritative: [/must/g, /should/g, /essential/g, /critical/g, /important/g],
      friendly: [/thanks/g, /appreciate/g, /glad/g, /happy/g, /love/g, /great/g],
      inspirational: [/believe/g, /achieve/g, /dream/g, /possible/g, /success/g, /growth/g],
    };

    const scores: Record<string, number> = {};
    for (const [tone, patterns] of Object.entries(tonePatterns)) {
      let count = 0;
      for (const pattern of patterns) {
        const matches = lowerContent.match(pattern);
        count += matches?.length ?? 0;
      }
      scores[tone] = count;
    }

    // Normalize scores
    const maxScore = Math.max(...Object.values(scores), 1);
    for (const tone of Object.keys(scores)) {
      scores[tone] = scores[tone] / maxScore;
    }

    return scores;
  }

  /**
   * Use AI to perform deeper analysis
   */
  private async performAIAnalysis(
    samples: ContentSample[]
  ): Promise<ContentProviderResult<AIVoiceAnalysis>> {
    const sampleTexts = samples.map((s, i) => `Sample ${i + 1}:\n${s.content}`).join('\n\n---\n\n');

    const prompt = `Analyze the following content samples to extract the writer's unique voice and style patterns.

${sampleTexts}

Provide a detailed analysis in the following JSON format:
{
  "tone": "professional" | "casual" | "humorous" | "authoritative" | "friendly" | "inspirational",
  "formality": "formal" | "semi-formal" | "informal",
  "vocabulary": "simple" | "moderate" | "advanced" | "technical",
  "sentenceLength": "short" | "medium" | "long" | "varied",
  "punctuationStyle": "minimal" | "standard" | "expressive",
  "emojiUsage": "none" | "rare" | "moderate" | "frequent",
  "hashtagStyle": "none" | "minimal" | "moderate" | "heavy",
  "personalityTraits": ["trait1", "trait2", "trait3"],
  "openingPhrases": ["phrase1", "phrase2"],
  "closingPhrases": ["phrase1", "phrase2"],
  "transitionWords": ["word1", "word2", "word3"],
  "signaturePhrases": ["phrase1", "phrase2"],
  "avoidPhrases": ["phrase1"],
  "topicExpertise": ["topic1", "topic2"]
}

Return ONLY the JSON, no other text.`;

    const requestBody = this.config.provider === 'openai'
      ? {
          model: this.config.model.openai,
          messages: [
            { role: 'system', content: 'You are an expert writing style analyst. Analyze content samples and extract voice patterns.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1000,
          temperature: this.config.temperature,
        }
      : {
          model: this.config.model.anthropic,
          max_tokens: 1000,
          system: 'You are an expert writing style analyst. Analyze content samples and extract voice patterns.',
          messages: [{ role: 'user', content: prompt }],
        };

    const endpoint = this.config.provider === 'openai'
      ? `${API_ENDPOINTS.openai.base}${API_ENDPOINTS.openai.chat}`
      : `${API_ENDPOINTS.anthropic.base}${API_ENDPOINTS.anthropic.messages}`;

    const headers: Record<string, string> = this.config.provider === 'openai'
      ? { Authorization: `Bearer ${this.activeApiKey}` }
      : { 'x-api-key': this.activeApiKey!, 'anthropic-version': '2023-06-01' };

    const result = await this.fetchWithRetry<unknown>(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!result.success) {
      return result as ContentProviderResult<AIVoiceAnalysis>;
    }

    try {
      let content: string;
      if (this.config.provider === 'openai') {
        const openaiResponse = result.data as { choices: { message: { content: string } }[] };
        content = openaiResponse.choices[0]?.message?.content ?? '';
      } else {
        const anthropicResponse = result.data as { content: { text: string }[] };
        content = anthropicResponse.content[0]?.text ?? '';
      }

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'Failed to parse AI analysis response',
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const analysis = JSON.parse(jsonMatch[0]) as AIVoiceAnalysis;
      return {
        success: true,
        data: analysis,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Combine local and AI analysis into final result
   */
  private combineAnalysis(
    sampleAnalysis: SampleAnalysis[],
    aiAnalysis: AIVoiceAnalysis
  ): VoiceAnalysisResult {
    // Calculate averages from sample analysis
    const avgEmojiCount = sampleAnalysis.reduce((sum, s) => sum + s.emojiCount, 0) / sampleAnalysis.length;
    const avgHashtagCount = sampleAnalysis.reduce((sum, s) => sum + s.hashtagCount, 0) / sampleAnalysis.length;
    const avgSentenceLength = sampleAnalysis.reduce((sum, s) => sum + s.avgSentenceLength, 0) / sampleAnalysis.length;

    // Determine emoji usage from actual data
    let emojiUsage: WritingStyle['emojiUsage'];
    if (avgEmojiCount === 0) emojiUsage = 'none';
    else if (avgEmojiCount < 1) emojiUsage = 'rare';
    else if (avgEmojiCount < 3) emojiUsage = 'moderate';
    else emojiUsage = 'frequent';

    // Determine hashtag style from actual data
    let hashtagStyle: WritingStyle['hashtagStyle'];
    if (avgHashtagCount === 0) hashtagStyle = 'none';
    else if (avgHashtagCount < 2) hashtagStyle = 'minimal';
    else if (avgHashtagCount < 5) hashtagStyle = 'moderate';
    else hashtagStyle = 'heavy';

    // Determine sentence length from actual data
    let sentenceLength: WritingStyle['sentenceLength'];
    if (avgSentenceLength < 10) sentenceLength = 'short';
    else if (avgSentenceLength < 20) sentenceLength = 'medium';
    else if (avgSentenceLength < 30) sentenceLength = 'long';
    else sentenceLength = 'varied';

    // Calculate confidence based on sample count and consistency
    const confidence = Math.min(0.95, 0.5 + (sampleAnalysis.length * 0.05));

    return {
      style: {
        tone: aiAnalysis.tone ?? 'professional',
        formality: aiAnalysis.formality ?? 'semi-formal',
        vocabulary: aiAnalysis.vocabulary ?? 'moderate',
        sentenceLength: sentenceLength,
        punctuationStyle: aiAnalysis.punctuationStyle ?? 'standard',
        emojiUsage: emojiUsage,
        hashtagStyle: hashtagStyle,
        personality: aiAnalysis.personalityTraits ?? [],
      },
      patterns: {
        openingPhrases: aiAnalysis.openingPhrases ?? [],
        closingPhrases: aiAnalysis.closingPhrases ?? [],
        transitionWords: aiAnalysis.transitionWords ?? [],
        signaturePhrases: aiAnalysis.signaturePhrases ?? [],
        avoidPhrases: aiAnalysis.avoidPhrases ?? [],
      },
      topicExpertise: aiAnalysis.topicExpertise ?? [],
      confidence,
      sampleAnalysis,
    };
  }
}

// =============================================================================
// Types
// =============================================================================

interface AIVoiceAnalysis {
  tone?: WritingStyle['tone'];
  formality?: WritingStyle['formality'];
  vocabulary?: WritingStyle['vocabulary'];
  sentenceLength?: WritingStyle['sentenceLength'];
  punctuationStyle?: WritingStyle['punctuationStyle'];
  emojiUsage?: WritingStyle['emojiUsage'];
  hashtagStyle?: WritingStyle['hashtagStyle'];
  personalityTraits?: string[];
  openingPhrases?: string[];
  closingPhrases?: string[];
  transitionWords?: string[];
  signaturePhrases?: string[];
  avoidPhrases?: string[];
  topicExpertise?: string[];
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVoiceTrainer(config: AIGenerationConfig): VoiceTrainerProvider {
  return new VoiceTrainerProvider(config);
}
