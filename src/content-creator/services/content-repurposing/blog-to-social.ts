/**
 * Content Creator Suite - Blog to Social Transformer
 *
 * Transforms blog posts into social media content (tweets, threads, LinkedIn posts).
 */

import type {
  GeneratedContent,
  TransformationConfig,
  VoiceProfile,
  ContentType,
  ContentPlatform,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_DEFAULTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface BlogToSocialConfig extends TransformationConfig {
  targetPlatform: 'twitter' | 'linkedin';
  contentType: 'tweet' | 'thread' | 'linkedin_post';
  maxTweets?: number;
  includeHashtags?: boolean;
  maxHashtags?: number;
  includeEmojis?: boolean;
  includeCTA?: boolean;
  focusOnSection?: string;
  voiceProfile?: VoiceProfile;
}

export interface ExtractedBlogContent {
  title: string;
  excerpt: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
  keyPoints: string[];
  quotes: string[];
}

// =============================================================================
// Blog to Social Service
// =============================================================================

export class BlogToSocialService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Transform blog post to social content
   */
  async transform(
    source: GeneratedContent,
    config: BlogToSocialConfig
  ): Promise<GeneratedContent | null> {
    const blogContent = this.extractBlogContent(source);

    switch (config.contentType) {
      case 'tweet':
        return this.transformToTweet(source, blogContent, config);
      case 'thread':
        return this.transformToThread(source, blogContent, config);
      case 'linkedin_post':
        return this.transformToLinkedInPost(source, blogContent, config);
      default:
        throw new Error(`Unsupported content type: ${config.contentType}`);
    }
  }

  /**
   * Transform to single tweet
   */
  private async transformToTweet(
    source: GeneratedContent,
    blog: ExtractedBlogContent,
    config: BlogToSocialConfig
  ): Promise<GeneratedContent> {
    const prompt = `Create a single engaging tweet from this blog post:

TITLE: ${blog.title}
EXCERPT: ${blog.excerpt}

KEY POINTS:
${blog.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Requirements:
- Maximum 280 characters
- Should be engaging and encourage clicks/engagement
- ${config.includeHashtags ? `Include 1-${config.maxHashtags ?? 3} relevant hashtags` : 'No hashtags'}
- ${config.includeEmojis ? 'Use relevant emojis sparingly' : 'No emojis'}
- ${config.includeCTA ? 'Include a call to action' : 'No explicit CTA'}

Return ONLY the tweet text, nothing else.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: this.getTwitterSystemPrompt(config.voiceProfile),
      maxTokens: 200,
      voiceProfile: config.voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate tweet: ${result.error}`);
    }

    const tweet = this.cleanTweet(result.data.content);

    return {
      id: '',
      userId: source.userId,
      type: 'tweet',
      platform: 'twitter',
      status: 'draft',
      content: tweet,
      metadata: {
        wordCount: tweet.split(/\s+/).length,
        characterCount: tweet.length,
        readingTimeMinutes: 1,
        sourceContentId: source.id,
        transformationType: 'blog_post:tweet',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Transform to Twitter thread
   */
  private async transformToThread(
    source: GeneratedContent,
    blog: ExtractedBlogContent,
    config: BlogToSocialConfig
  ): Promise<GeneratedContent> {
    const maxTweets = config.maxTweets ?? 10;

    const prompt = `Create a Twitter thread from this blog post:

TITLE: ${blog.title}

SECTIONS:
${blog.sections.map(s => `## ${s.heading}\n${s.content.substring(0, 300)}...`).join('\n\n')}

KEY POINTS:
${blog.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Requirements:
- ${Math.min(maxTweets, blog.keyPoints.length + 2)}-${maxTweets} tweets
- First tweet should be a hook that makes people want to read more
- Each tweet must be under 280 characters
- Include tweet numbers (1/, 2/, etc.)
- Last tweet should have a summary or call to action
- ${config.includeHashtags ? 'Include 1-2 hashtags in the first and last tweets only' : 'No hashtags'}
- ${config.includeEmojis ? 'Use relevant emojis' : 'Minimal emojis'}

Format each tweet on a new line starting with "TWEET X:"`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: this.getTwitterSystemPrompt(config.voiceProfile),
      maxTokens: maxTweets * 200,
      voiceProfile: config.voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate thread: ${result.error}`);
    }

    const threadContent = this.formatThread(result.data.content);

    return {
      id: '',
      userId: source.userId,
      type: 'thread',
      platform: 'twitter',
      status: 'draft',
      title: blog.title,
      content: threadContent,
      metadata: {
        wordCount: threadContent.split(/\s+/).length,
        characterCount: threadContent.length,
        readingTimeMinutes: Math.ceil(threadContent.length / 1000),
        sourceContentId: source.id,
        transformationType: 'blog_post:thread',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Transform to LinkedIn post
   */
  private async transformToLinkedInPost(
    source: GeneratedContent,
    blog: ExtractedBlogContent,
    config: BlogToSocialConfig
  ): Promise<GeneratedContent> {
    const prompt = `Create an engaging LinkedIn post from this blog post:

TITLE: ${blog.title}
EXCERPT: ${blog.excerpt}

KEY POINTS:
${blog.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

${blog.quotes.length > 0 ? `NOTABLE QUOTES:\n${blog.quotes.slice(0, 2).map(q => `"${q}"`).join('\n')}` : ''}

Requirements:
- 1000-1500 characters
- Start with a hook (question, bold statement, or story)
- Use line breaks for readability
- Include personal insight or opinion
- End with a question to encourage engagement
- ${config.includeHashtags ? `Include 3-5 relevant hashtags at the end` : 'No hashtags'}
- ${config.includeEmojis ? 'Use emojis sparingly for emphasis' : 'Minimal emojis'}

Return ONLY the LinkedIn post text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: this.getLinkedInSystemPrompt(config.voiceProfile),
      maxTokens: 800,
      voiceProfile: config.voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate LinkedIn post: ${result.error}`);
    }

    const post = this.cleanLinkedInPost(result.data.content);

    return {
      id: '',
      userId: source.userId,
      type: 'linkedin_post',
      platform: 'linkedin',
      status: 'draft',
      content: post,
      metadata: {
        wordCount: post.split(/\s+/).length,
        characterCount: post.length,
        readingTimeMinutes: Math.ceil(post.split(/\s+/).length / 200),
        sourceContentId: source.id,
        transformationType: 'blog_post:linkedin_post',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Extract structured content from blog
   */
  private extractBlogContent(source: GeneratedContent): ExtractedBlogContent {
    const content = source.content;
    const title = source.title ?? 'Untitled';

    // Extract sections
    const sectionRegex = /<h[2-3][^>]*>(.*?)<\/h[2-3]>([\s\S]*?)(?=<h[2-3]|$)/gi;
    const sections: ExtractedBlogContent['sections'] = [];
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
      sections.push({
        heading: this.stripHtml(match[1]),
        content: this.stripHtml(match[2]),
      });
    }

    // Extract key points (look for lists)
    const listItemRegex = /<li[^>]*>(.*?)<\/li>/gi;
    const keyPoints: string[] = [];
    while ((match = listItemRegex.exec(content)) !== null) {
      const point = this.stripHtml(match[1]).trim();
      if (point.length > 10 && point.length < 200) {
        keyPoints.push(point);
      }
    }

    // If no list items, extract from paragraphs
    if (keyPoints.length === 0) {
      const paragraphs = content.match(/<p[^>]*>(.*?)<\/p>/gi) ?? [];
      for (const p of paragraphs.slice(0, 5)) {
        const text = this.stripHtml(p).trim();
        if (text.length > 50) {
          // Extract first sentence as key point
          const sentence = text.match(/^[^.!?]+[.!?]/);
          if (sentence) {
            keyPoints.push(sentence[0]);
          }
        }
      }
    }

    // Extract quotes
    const quoteRegex = /<blockquote[^>]*>(.*?)<\/blockquote>/gi;
    const quotes: string[] = [];
    while ((match = quoteRegex.exec(content)) !== null) {
      quotes.push(this.stripHtml(match[1]).trim());
    }

    // Generate excerpt
    const plainText = this.stripHtml(content);
    const excerpt = plainText.substring(0, 300).trim() + (plainText.length > 300 ? '...' : '');

    return {
      title,
      excerpt,
      sections: sections.slice(0, 10),
      keyPoints: keyPoints.slice(0, 10),
      quotes: quotes.slice(0, 5),
    };
  }

  /**
   * Get Twitter system prompt
   */
  private getTwitterSystemPrompt(voiceProfile?: VoiceProfile): string {
    let prompt = `You are an expert at creating engaging Twitter content.
Your tweets should be:
- Concise and punchy
- Easy to understand at a glance
- Engaging and shareable
- Written to maximize engagement`;

    if (voiceProfile) {
      prompt += `\n\nTone: ${voiceProfile.style.tone}`;
      prompt += `\nFormality: ${voiceProfile.style.formality}`;
    }

    return prompt;
  }

  /**
   * Get LinkedIn system prompt
   */
  private getLinkedInSystemPrompt(voiceProfile?: VoiceProfile): string {
    let prompt = `You are an expert at creating professional LinkedIn content.
Your posts should be:
- Professional but personable
- Provide genuine value
- Tell stories and share insights
- Encourage meaningful discussion`;

    if (voiceProfile) {
      prompt += `\n\nTone: ${voiceProfile.style.tone}`;
      prompt += `\nFormality: ${voiceProfile.style.formality}`;
    }

    return prompt;
  }

  /**
   * Clean tweet content
   */
  private cleanTweet(content: string): string {
    let tweet = content.trim();

    // Remove quotes if the entire content is quoted
    if (tweet.startsWith('"') && tweet.endsWith('"')) {
      tweet = tweet.slice(1, -1);
    }

    // Remove any prefixes like "Tweet:" or "Here's the tweet:"
    tweet = tweet.replace(/^(tweet|here'?s?\s*(the|a|your)?\s*tweet):?\s*/i, '');

    // Ensure under character limit
    if (tweet.length > CONTENT_DEFAULTS.TWEET_MAX_LENGTH) {
      tweet = tweet.substring(0, CONTENT_DEFAULTS.TWEET_MAX_LENGTH - 3) + '...';
    }

    return tweet.trim();
  }

  /**
   * Format thread content
   */
  private formatThread(content: string): string {
    // Parse tweets
    const tweetRegex = /(?:TWEET\s*\d+[:\s]*|^\d+[\/\.\)]\s*)/gim;
    const tweets = content
      .split(tweetRegex)
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // Format as numbered thread
    return tweets
      .map((tweet, index) => {
        const cleaned = this.cleanTweet(tweet);
        const number = `${index + 1}/${tweets.length}`;
        return `${number} ${cleaned}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * Clean LinkedIn post
   */
  private cleanLinkedInPost(content: string): string {
    let post = content.trim();

    // Remove quotes if entirely quoted
    if (post.startsWith('"') && post.endsWith('"')) {
      post = post.slice(1, -1);
    }

    // Ensure proper line breaks
    post = post.replace(/\n{3,}/g, '\n\n');

    // Ensure under character limit
    if (post.length > CONTENT_DEFAULTS.LINKEDIN_POST_MAX_LENGTH) {
      post = post.substring(0, CONTENT_DEFAULTS.LINKEDIN_POST_MAX_LENGTH - 3) + '...';
    }

    return post.trim();
  }

  /**
   * Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createBlogToSocialTransformer(
  contentGenerator: ContentGeneratorProvider
): BlogToSocialService {
  return new BlogToSocialService(contentGenerator);
}
