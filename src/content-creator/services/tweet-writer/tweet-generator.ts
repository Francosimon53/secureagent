/**
 * Content Creator Suite - Tweet Generator Service
 *
 * Generates tweets and threads using AI with optional voice profile matching.
 */

import type {
  Tweet,
  Thread,
  TweetGenerationOptions,
  ThreadGenerationOptions,
  VoiceProfile,
  GeneratedContent,
  ContentProviderResult,
} from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { ContentGeneratorProvider, GenerationResponse } from '../../providers/ai/content-generator.js';
import { CONTENT_PROMPTS } from '../../providers/ai/content-generator.js';
import { CONTENT_EVENTS, CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface TweetGeneratorConfig {
  maxTweetLength: number;
  maxThreadLength: number;
  defaultHashtags: string[];
  autoThread: boolean;
}

export interface GeneratedTweet extends Tweet {
  generatedAt: number;
  voiceProfileId?: string;
  tokensUsed: number;
}

export interface GeneratedThread extends Thread {
  generatedAt: number;
  voiceProfileId?: string;
  tokensUsed: number;
}

// =============================================================================
// Tweet Generator Service
// =============================================================================

export class TweetGeneratorService {
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly contentStore: ContentStore,
    private readonly voiceProfileStore: VoiceProfileStore,
    private readonly generator: ContentGeneratorProvider,
    private readonly config: TweetGeneratorConfig
  ) {}

  /**
   * Generate a single tweet
   */
  async generateTweet(
    userId: string,
    options: TweetGenerationOptions
  ): Promise<ContentProviderResult<GeneratedTweet>> {
    // Get voice profile if specified
    let voiceProfile: VoiceProfile | null = null;
    if (options.voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(options.voiceProfileId);
    }

    const style = {
      ...voiceProfile?.style,
      ...options.style,
    };

    const systemPrompt = CONTENT_PROMPTS.tweet.system;
    const userPrompt = CONTENT_PROMPTS.tweet.generate(options.topic, style);

    const result = await this.generator.generate({
      prompt: userPrompt,
      systemPrompt,
      voiceProfile: voiceProfile ?? undefined,
      temperature: 0.8,
      maxTokens: 150,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedTweet>;
    }

    let content = result.data.content.trim();

    // Clean up any quotes or extra formatting
    content = content.replace(/^["']|["']$/g, '').trim();

    // Handle character limit
    if (content.length > this.config.maxTweetLength) {
      // Try to truncate at a natural break point
      content = this.truncateTweet(content, this.config.maxTweetLength);
    }

    // Add hashtags if needed
    if (options.includeHashtags && !content.includes('#')) {
      const hashtags = this.config.defaultHashtags.slice(0, options.maxHashtags ?? 3);
      if (hashtags.length > 0) {
        const hashtagString = hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ');
        if (content.length + hashtagString.length + 2 <= this.config.maxTweetLength) {
          content = `${content}\n\n${hashtagString}`;
        }
      }
    }

    const tweet: GeneratedTweet = {
      content,
      characterCount: content.length,
      generatedAt: Date.now(),
      voiceProfileId: options.voiceProfileId,
      tokensUsed: result.data.tokensUsed,
    };

    // Store the generated content
    await this.contentStore.create({
      userId,
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: tweet.content,
      metadata: {
        wordCount: tweet.content.split(/\s+/).length,
        characterCount: tweet.characterCount,
        readingTimeMinutes: 0,
        hashtags: this.extractHashtags(tweet.content),
        mentions: this.extractMentions(tweet.content),
      },
      voiceProfileId: options.voiceProfileId,
    });

    this.emit(CONTENT_EVENTS.TWEET_GENERATED, {
      userId,
      topic: options.topic,
      characterCount: tweet.characterCount,
      voiceProfileId: options.voiceProfileId,
    });

    return {
      success: true,
      data: tweet,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Generate a Twitter thread
   */
  async generateThread(
    userId: string,
    options: ThreadGenerationOptions
  ): Promise<ContentProviderResult<GeneratedThread>> {
    // Get voice profile if specified
    let voiceProfile: VoiceProfile | null = null;
    if (options.voiceProfileId) {
      voiceProfile = await this.voiceProfileStore.getProfile(options.voiceProfileId);
    }

    const style = {
      ...voiceProfile?.style,
      ...options.style,
    };

    const minTweets = options.minTweets ?? 3;
    const maxTweets = Math.min(options.maxTweets ?? 10, this.config.maxThreadLength);

    const systemPrompt = CONTENT_PROMPTS.thread.system;
    const userPrompt = CONTENT_PROMPTS.thread.generate(options.topic, minTweets, maxTweets, style);

    const result = await this.generator.generate({
      prompt: userPrompt,
      systemPrompt,
      voiceProfile: voiceProfile ?? undefined,
      temperature: 0.8,
      maxTokens: maxTweets * 150,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedThread>;
    }

    // Parse the thread from the response
    const tweets = this.parseThreadResponse(result.data.content);

    if (tweets.length < minTweets) {
      return {
        success: false,
        error: `Generated thread has only ${tweets.length} tweets, minimum required: ${minTweets}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Calculate total characters and reading time
    const totalCharacters = tweets.reduce((sum, t) => sum + t.characterCount, 0);
    const wordCount = tweets.reduce((sum, t) => sum + t.content.split(/\s+/).length, 0);
    const estimatedReadTime = Math.ceil(wordCount / 200);

    const thread: GeneratedThread = {
      id: crypto.randomUUID(),
      tweets,
      topic: options.topic,
      hook: tweets[0]?.content ?? '',
      callToAction: options.includeCTA ? tweets[tweets.length - 1]?.content : undefined,
      totalCharacters,
      estimatedReadTime,
      generatedAt: Date.now(),
      voiceProfileId: options.voiceProfileId,
      tokensUsed: result.data.tokensUsed,
    };

    // Store the thread as content
    await this.contentStore.create({
      userId,
      type: 'thread',
      platform: 'twitter',
      status: 'draft',
      title: options.topic,
      content: tweets.map((t, i) => `${i + 1}/${tweets.length} ${t.content}`).join('\n\n'),
      metadata: {
        wordCount,
        characterCount: totalCharacters,
        readingTimeMinutes: estimatedReadTime,
        hashtags: tweets.flatMap(t => this.extractHashtags(t.content)),
        mentions: tweets.flatMap(t => this.extractMentions(t.content)),
      },
      voiceProfileId: options.voiceProfileId,
    });

    this.emit(CONTENT_EVENTS.THREAD_GENERATED, {
      userId,
      topic: options.topic,
      tweetCount: tweets.length,
      totalCharacters,
      voiceProfileId: options.voiceProfileId,
    });

    return {
      success: true,
      data: thread,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Parse a thread from AI response
   */
  private parseThreadResponse(response: string): Tweet[] {
    const tweets: Tweet[] = [];

    // Try to parse "TWEET N:" format
    const tweetPattern = /TWEET\s*\d+:\s*(.+?)(?=TWEET\s*\d+:|$)/gis;
    let match;

    while ((match = tweetPattern.exec(response)) !== null) {
      const content = match[1].trim();
      if (content) {
        tweets.push(this.createTweet(content));
      }
    }

    // If no matches, try splitting by numbered list
    if (tweets.length === 0) {
      const numberedPattern = /^\d+[.)]\s*(.+)$/gm;
      while ((match = numberedPattern.exec(response)) !== null) {
        const content = match[1].trim();
        if (content) {
          tweets.push(this.createTweet(content));
        }
      }
    }

    // If still no matches, try splitting by double newlines
    if (tweets.length === 0) {
      const paragraphs = response.split(/\n\n+/).filter(p => p.trim().length > 0);
      for (const paragraph of paragraphs) {
        const content = paragraph.trim();
        if (content && content.length <= this.config.maxTweetLength * 1.5) {
          tweets.push(this.createTweet(content));
        }
      }
    }

    // Ensure each tweet is within character limit
    return tweets.map(tweet => {
      if (tweet.content.length > this.config.maxTweetLength) {
        return this.createTweet(this.truncateTweet(tweet.content, this.config.maxTweetLength));
      }
      return tweet;
    });
  }

  /**
   * Create a Tweet object from content
   */
  private createTweet(content: string): Tweet {
    const cleaned = content.replace(/^["']|["']$/g, '').trim();
    return {
      content: cleaned,
      characterCount: cleaned.length,
    };
  }

  /**
   * Truncate a tweet to fit character limit
   */
  private truncateTweet(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a sentence boundary
    const truncated = content.substring(0, maxLength - 3);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclaim = truncated.lastIndexOf('!');

    const lastSentence = Math.max(lastPeriod, lastQuestion, lastExclaim);

    if (lastSentence > maxLength * 0.5) {
      return content.substring(0, lastSentence + 1);
    }

    // Try to truncate at a word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return content.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Extract hashtags from content
   */
  private extractHashtags(content: string): string[] {
    const matches = content.match(/#\w+/g);
    return matches?.map(h => h.toLowerCase()) ?? [];
  }

  /**
   * Extract mentions from content
   */
  private extractMentions(content: string): string[] {
    const matches = content.match(/@\w+/g);
    return matches?.map(m => m.toLowerCase()) ?? [];
  }

  /**
   * Generate variations of a tweet
   */
  async generateVariations(
    userId: string,
    originalTweet: string,
    count: number = 3
  ): Promise<ContentProviderResult<GeneratedTweet[]>> {
    const prompt = `Generate ${count} variations of this tweet while maintaining the same message and tone:

Original: "${originalTweet}"

Requirements:
- Each variation should be unique but convey the same message
- Keep each under 280 characters
- Maintain similar style and tone

Format:
VARIATION 1: [tweet]
VARIATION 2: [tweet]
...`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: CONTENT_PROMPTS.tweet.system,
      maxTokens: count * 150,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedTweet[]>;
    }

    const variations: GeneratedTweet[] = [];
    const variationPattern = /VARIATION\s*\d+:\s*(.+?)(?=VARIATION\s*\d+:|$)/gis;
    let match;

    while ((match = variationPattern.exec(result.data.content)) !== null) {
      const content = match[1].trim().replace(/^["']|["']$/g, '');
      if (content) {
        variations.push({
          content,
          characterCount: content.length,
          generatedAt: Date.now(),
          tokensUsed: Math.floor(result.data.tokensUsed / count),
        });
      }
    }

    return {
      success: true,
      data: variations,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Improve an existing tweet
   */
  async improveTweet(
    tweet: string,
    improvements: ('engagement' | 'clarity' | 'humor' | 'professionalism')[]
  ): Promise<ContentProviderResult<GeneratedTweet>> {
    const improvementInstructions = improvements.map(imp => {
      switch (imp) {
        case 'engagement':
          return 'Make it more engaging with a hook or question';
        case 'clarity':
          return 'Improve clarity and readability';
        case 'humor':
          return 'Add subtle humor or wit';
        case 'professionalism':
          return 'Make it more professional and polished';
        default:
          return '';
      }
    }).filter(Boolean).join('\n- ');

    const prompt = `Improve this tweet:

"${tweet}"

Improvements to make:
- ${improvementInstructions}

Keep it under 280 characters. Return ONLY the improved tweet, nothing else.`;

    const result = await this.generator.generate({
      prompt,
      systemPrompt: CONTENT_PROMPTS.tweet.system,
      maxTokens: 150,
    });

    if (!result.success) {
      return result as ContentProviderResult<GeneratedTweet>;
    }

    const content = result.data.content.trim().replace(/^["']|["']$/g, '');

    return {
      success: true,
      data: {
        content,
        characterCount: content.length,
        generatedAt: Date.now(),
        tokensUsed: result.data.tokensUsed,
      },
      cached: false,
      fetchedAt: Date.now(),
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

export function createTweetGenerator(
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  generator: ContentGeneratorProvider,
  config?: Partial<TweetGeneratorConfig>
): TweetGeneratorService {
  const defaultConfig: TweetGeneratorConfig = {
    maxTweetLength: CONTENT_DEFAULTS.TWEET_MAX_LENGTH,
    maxThreadLength: CONTENT_DEFAULTS.THREAD_MAX_TWEETS,
    defaultHashtags: [],
    autoThread: true,
    ...config,
  };

  return new TweetGeneratorService(contentStore, voiceProfileStore, generator, defaultConfig);
}
