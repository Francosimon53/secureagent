/**
 * Content Creator Suite - AI Content Generator Provider
 *
 * AI-powered content generation using OpenAI or Anthropic.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { AIGenerationConfig } from '../../config.js';
import type {
  ContentProviderResult,
  ContentProviderConfig,
  VoiceProfile,
  WritingStyle,
} from '../../types.js';
import { API_ENDPOINTS, ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface GenerationRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  voiceProfile?: VoiceProfile;
}

export interface GenerationResponse {
  content: string;
  tokensUsed: number;
  model: string;
  finishReason: string;
}

interface ContentGeneratorConfig extends ContentProviderConfig {
  provider: 'openai' | 'anthropic';
  openaiApiKeyEnvVar: string;
  anthropicApiKeyEnvVar: string;
  model: {
    openai: string;
    anthropic: string;
  };
  temperature: number;
  maxTokens: number;
}

// =============================================================================
// OpenAI Types
// =============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  temperature: number;
}

interface OpenAIResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// Anthropic Types
// =============================================================================

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: {
    role: 'user' | 'assistant';
    content: string;
  }[];
}

interface AnthropicResponse {
  id: string;
  content: {
    type: string;
    text: string;
  }[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// =============================================================================
// Content Generator Provider
// =============================================================================

export class ContentGeneratorProvider extends BaseContentProvider<ContentGeneratorConfig> {
  private openaiApiKey: string | undefined;
  private anthropicApiKey: string | undefined;

  constructor(config: AIGenerationConfig) {
    const providerConfig: ContentGeneratorConfig = {
      provider: config.provider ?? 'openai',
      openaiApiKeyEnvVar: config.openaiApiKeyEnvVar ?? 'OPENAI_API_KEY',
      anthropicApiKeyEnvVar: config.anthropicApiKeyEnvVar ?? 'ANTHROPIC_API_KEY',
      model: config.model ?? { openai: 'gpt-4-turbo-preview', anthropic: 'claude-3-opus-20240229' },
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2000,
      timeout: config.timeout ?? CONTENT_DEFAULTS.AI_GENERATION_TIMEOUT,
      rateLimitPerMinute: config.rateLimitPerMinute ?? CONTENT_DEFAULTS.AI_GENERATION_RATE_LIMIT,
      maxRetries: config.retries ?? 2,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'content-generator';
  }

  get type(): string {
    return 'ai';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.openaiApiKey = process.env[this.config.openaiApiKeyEnvVar];
    this.anthropicApiKey = process.env[this.config.anthropicApiKeyEnvVar];

    const activeProvider = this.config.provider;
    if (activeProvider === 'openai' && !this.openaiApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `OpenAI API key not found: ${this.config.openaiApiKeyEnvVar}`
      );
    }
    if (activeProvider === 'anthropic' && !this.anthropicApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Anthropic API key not found: ${this.config.anthropicApiKeyEnvVar}`
      );
    }
  }

  /**
   * Generate content using the configured AI provider
   */
  async generate(request: GenerationRequest): Promise<ContentProviderResult<GenerationResponse>> {
    const systemPrompt = this.buildSystemPrompt(request);
    const userPrompt = request.prompt;

    if (this.config.provider === 'openai') {
      return this.generateWithOpenAI(systemPrompt, userPrompt, request);
    } else {
      return this.generateWithAnthropic(systemPrompt, userPrompt, request);
    }
  }

  /**
   * Generate content with OpenAI
   */
  private async generateWithOpenAI(
    systemPrompt: string,
    userPrompt: string,
    request: GenerationRequest
  ): Promise<ContentProviderResult<GenerationResponse>> {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const openaiRequest: OpenAIRequest = {
      model: this.config.model.openai,
      messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
    };

    const result = await this.fetchWithRetry<OpenAIResponse>(
      `${API_ENDPOINTS.openai.base}${API_ENDPOINTS.openai.chat}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify(openaiRequest),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<GenerationResponse>;
    }

    const response = result.data;
    const choice = response.choices[0];

    if (!choice || !choice.message.content) {
      return {
        success: false,
        error: 'No content generated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: {
        content: choice.message.content,
        tokensUsed: response.usage.total_tokens,
        model: this.config.model.openai,
        finishReason: choice.finish_reason,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Generate content with Anthropic
   */
  private async generateWithAnthropic(
    systemPrompt: string,
    userPrompt: string,
    request: GenerationRequest
  ): Promise<ContentProviderResult<GenerationResponse>> {
    const anthropicRequest: AnthropicRequest = {
      model: this.config.model.anthropic,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };

    const result = await this.fetchWithRetry<AnthropicResponse>(
      `${API_ENDPOINTS.anthropic.base}${API_ENDPOINTS.anthropic.messages}`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.anthropicApiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicRequest),
      }
    );

    if (!result.success) {
      return result as ContentProviderResult<GenerationResponse>;
    }

    const response = result.data;
    const content = response.content[0];

    if (!content || content.type !== 'text') {
      return {
        success: false,
        error: 'No text content generated',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: {
        content: content.text,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: this.config.model.anthropic,
        finishReason: response.stop_reason,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Build system prompt with optional voice profile
   */
  private buildSystemPrompt(request: GenerationRequest): string {
    let systemPrompt = request.systemPrompt ?? 'You are a professional content creator.';

    if (request.voiceProfile) {
      const voiceInstructions = this.buildVoiceInstructions(request.voiceProfile);
      systemPrompt = `${systemPrompt}\n\n${voiceInstructions}`;
    }

    return systemPrompt;
  }

  /**
   * Build voice instructions from a voice profile
   */
  private buildVoiceInstructions(profile: VoiceProfile): string {
    const { style, patterns } = profile;

    const instructions: string[] = [
      '## Writing Style Guidelines',
      '',
      `Tone: ${style.tone}`,
      `Formality: ${style.formality}`,
      `Vocabulary Level: ${style.vocabulary}`,
      `Sentence Length: ${style.sentenceLength}`,
      `Punctuation Style: ${style.punctuationStyle}`,
      `Emoji Usage: ${style.emojiUsage}`,
      `Hashtag Style: ${style.hashtagStyle}`,
    ];

    if (style.personality.length > 0) {
      instructions.push(`Personality Traits: ${style.personality.join(', ')}`);
    }

    if (patterns.openingPhrases.length > 0) {
      instructions.push('');
      instructions.push('## Preferred Opening Phrases');
      patterns.openingPhrases.forEach(phrase => instructions.push(`- "${phrase}"`));
    }

    if (patterns.closingPhrases.length > 0) {
      instructions.push('');
      instructions.push('## Preferred Closing Phrases');
      patterns.closingPhrases.forEach(phrase => instructions.push(`- "${phrase}"`));
    }

    if (patterns.transitionWords.length > 0) {
      instructions.push('');
      instructions.push(`## Preferred Transition Words: ${patterns.transitionWords.join(', ')}`);
    }

    if (patterns.signaturePhrases.length > 0) {
      instructions.push('');
      instructions.push('## Signature Phrases to Include');
      patterns.signaturePhrases.forEach(phrase => instructions.push(`- "${phrase}"`));
    }

    if (patterns.avoidPhrases.length > 0) {
      instructions.push('');
      instructions.push('## Phrases to AVOID');
      patterns.avoidPhrases.forEach(phrase => instructions.push(`- "${phrase}"`));
    }

    if (profile.topicExpertise.length > 0) {
      instructions.push('');
      instructions.push(`## Topic Expertise: ${profile.topicExpertise.join(', ')}`);
    }

    return instructions.join('\n');
  }

  /**
   * Get the current provider name
   */
  getProvider(): 'openai' | 'anthropic' {
    return this.config.provider;
  }

  /**
   * Get the current model name
   */
  getModel(): string {
    return this.config.provider === 'openai'
      ? this.config.model.openai
      : this.config.model.anthropic;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContentGenerator(config: AIGenerationConfig): ContentGeneratorProvider {
  return new ContentGeneratorProvider(config);
}

// =============================================================================
// Content Generation Prompts
// =============================================================================

export const CONTENT_PROMPTS = {
  tweet: {
    system: `You are an expert social media content creator specializing in Twitter/X.
Your goal is to create engaging, concise tweets that drive engagement.
Keep tweets under 280 characters unless creating a thread.
Use hooks, storytelling, and clear value propositions.`,
    generate: (topic: string, style: Partial<WritingStyle> = {}) => `
Create a tweet about: ${topic}

Requirements:
- Must be under 280 characters
- Should be engaging and encourage interaction
- Tone: ${style.tone ?? 'professional'}
- ${style.emojiUsage !== 'none' ? 'Include relevant emojis' : 'No emojis'}
- ${style.hashtagStyle !== 'none' ? 'Include 1-3 relevant hashtags' : 'No hashtags'}

Return ONLY the tweet text, nothing else.`,
  },

  thread: {
    system: `You are an expert social media content creator specializing in Twitter/X threads.
Your goal is to create compelling, educational threads that keep readers engaged.
Each tweet should flow naturally to the next.
Use hooks, storytelling, and clear takeaways.`,
    generate: (
      topic: string,
      minTweets: number,
      maxTweets: number,
      style: Partial<WritingStyle> = {}
    ) => `
Create a Twitter thread about: ${topic}

Requirements:
- ${minTweets}-${maxTweets} tweets
- First tweet should be a compelling hook
- Each tweet under 280 characters
- Last tweet should have a call-to-action
- Tone: ${style.tone ?? 'professional'}
- ${style.emojiUsage !== 'none' ? 'Include relevant emojis' : 'No emojis'}

Format your response as:
TWEET 1: [content]
TWEET 2: [content]
...`,
  },

  linkedinPost: {
    system: `You are an expert LinkedIn content creator.
Your goal is to create professional, engaging posts that drive conversation and demonstrate expertise.
Use storytelling, personal insights, and clear value propositions.`,
    generate: (topic: string, style: Partial<WritingStyle> = {}) => `
Create a LinkedIn post about: ${topic}

Requirements:
- 1000-1500 characters
- Open with a hook in the first line
- Include personal insights or experiences
- End with a question to encourage engagement
- Tone: ${style.tone ?? 'professional'}
- Include appropriate line breaks for readability
- ${style.emojiUsage !== 'none' ? 'Use emojis sparingly' : 'No emojis'}

Return ONLY the post text, nothing else.`,
  },

  blogPost: {
    system: `You are an expert blog writer and SEO specialist.
Your goal is to create well-structured, informative blog posts that provide value to readers and rank well in search engines.
Use clear headings, scannable content, and actionable insights.`,
    generate: (topic: string, wordCount: number, focusKeyword?: string) => `
Create a blog post about: ${topic}
${focusKeyword ? `Focus keyword: ${focusKeyword}` : ''}

Requirements:
- Target length: ${wordCount} words
- Include an engaging introduction
- Use H2 and H3 headings for structure
- Include bullet points or numbered lists where appropriate
- End with a conclusion and call-to-action
${focusKeyword ? `- Naturally include the focus keyword throughout the content` : ''}

Format the response in Markdown.`,
  },

  videoScript: {
    system: `You are an expert video scriptwriter.
Your goal is to create engaging video scripts that capture and maintain viewer attention.
Include hooks, clear sections, and calls-to-action.`,
    generate: (topic: string, durationMinutes: number, style: string) => `
Create a video script about: ${topic}

Requirements:
- Target duration: ${durationMinutes} minutes (approximately ${durationMinutes * 150} words)
- Style: ${style}
- Include:
  - Opening hook (first 10 seconds)
  - Introduction
  - Main content sections
  - Transition phrases
  - Call-to-action
  - Closing

Format the response with clear section headers and speaker notes in brackets [like this].`,
  },

  newsletterDigest: {
    system: `You are an expert newsletter curator and writer.
Your goal is to create engaging newsletter digests that provide valuable insights and keep readers informed.
Write concise summaries and compelling introductions.`,
    generate: (items: { title: string; summary: string }[], period: string) => `
Create a ${period} newsletter digest from these items:

${items.map((item, i) => `${i + 1}. ${item.title}: ${item.summary}`).join('\n')}

Requirements:
- Write an engaging introduction
- Summarize each item in 2-3 sentences
- Add your unique insights or commentary
- Include a closing paragraph
- Keep the overall tone informative but engaging

Format the response with clear sections for each item.`,
  },

  presentationSlides: {
    system: `You are an expert presentation designer.
Your goal is to create clear, impactful slide content that communicates key messages effectively.
Use concise bullet points and memorable headlines.`,
    generate: (topic: string, slideCount: number, style: string) => `
Create content for a presentation about: ${topic}

Requirements:
- ${slideCount} slides
- Style: ${style}
- Include:
  - Title slide
  - Agenda/Overview slide
  - Main content slides
  - Summary/Conclusion slide
  - Q&A or Thank You slide

For each slide, provide:
- Slide title
- 3-5 bullet points or key content
- Speaker notes (optional)

Format:
SLIDE 1: [Title]
- [bullet point]
- [bullet point]
NOTES: [speaker notes]

SLIDE 2: ...`,
  },
};
