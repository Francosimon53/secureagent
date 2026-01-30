/**
 * Content Creator Suite - Video to Blog Transformer
 *
 * Transforms video content (transcripts) into blog posts.
 */

import type {
  GeneratedContent,
  TransformationConfig,
  VoiceProfile,
  BlogSEO,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface VideoToBlogConfig extends TransformationConfig {
  targetWordCount?: number;
  includeTimestamps?: boolean;
  includeQuotes?: boolean;
  generateSEO?: boolean;
  blogStyle?: 'tutorial' | 'summary' | 'listicle' | 'narrative';
  voiceProfile?: VoiceProfile;
}

export interface VideoContent {
  transcript: string;
  title: string;
  description?: string;
  duration?: number;
  chapters?: Array<{
    timestamp: number;
    title: string;
    content?: string;
  }>;
  quotes?: Array<{
    text: string;
    speaker?: string;
    timestamp?: number;
  }>;
}

// =============================================================================
// Video to Blog Service
// =============================================================================

export class VideoToBlogService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Transform video content to blog post
   */
  async transform(
    source: GeneratedContent,
    config: VideoToBlogConfig
  ): Promise<GeneratedContent | null> {
    const videoContent = this.parseVideoContent(source);
    const targetWordCount = config.targetWordCount ?? 1000;
    const blogStyle = config.blogStyle ?? 'summary';

    // Build the transformation prompt
    const prompt = this.buildTransformationPrompt(videoContent, {
      targetWordCount,
      blogStyle,
      includeTimestamps: config.includeTimestamps,
      includeQuotes: config.includeQuotes,
    });

    const systemPrompt = this.buildSystemPrompt(config.voiceProfile, blogStyle);

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt,
      maxTokens: Math.max(2000, targetWordCount * 2),
      voiceProfile: config.voiceProfile,
    });

    if (!result.success) {
      throw new Error(`Failed to generate blog content: ${result.error}`);
    }

    const blogContent = this.formatBlogContent(result.data.content);

    // Generate SEO if requested
    let seo: BlogSEO | undefined;
    if (config.generateSEO) {
      seo = await this.generateSEO(videoContent.title, blogContent);
    }

    return {
      id: '',
      userId: source.userId,
      type: 'blog_post',
      platform: 'custom',
      status: 'draft',
      title: this.generateBlogTitle(videoContent.title, blogStyle),
      content: blogContent,
      metadata: {
        wordCount: this.countWords(blogContent),
        characterCount: blogContent.length,
        readingTimeMinutes: Math.ceil(this.countWords(blogContent) / 200),
        sourceContentId: source.id,
        transformationType: 'video_script:blog_post',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Parse video content from generated content
   */
  private parseVideoContent(source: GeneratedContent): VideoContent {
    // Try to extract structured data if available
    const metadata = source.metadata as unknown as Record<string, unknown>;

    return {
      transcript: source.content,
      title: source.title ?? 'Untitled Video',
      description: metadata?.description as string | undefined,
      duration: metadata?.duration as number | undefined,
      chapters: metadata?.chapters as VideoContent['chapters'],
      quotes: metadata?.quotes as VideoContent['quotes'],
    };
  }

  /**
   * Build transformation prompt
   */
  private buildTransformationPrompt(
    video: VideoContent,
    options: {
      targetWordCount: number;
      blogStyle: string;
      includeTimestamps?: boolean;
      includeQuotes?: boolean;
    }
  ): string {
    let prompt = `Transform this video transcript into a ${options.blogStyle} blog post.

VIDEO TITLE: ${video.title}
${video.description ? `DESCRIPTION: ${video.description}` : ''}
${video.duration ? `DURATION: ${Math.round(video.duration / 60)} minutes` : ''}

TRANSCRIPT:
${video.transcript}
`;

    if (video.chapters && video.chapters.length > 0 && options.includeTimestamps) {
      prompt += `
CHAPTERS:
${video.chapters.map(ch => `- [${this.formatTimestamp(ch.timestamp)}] ${ch.title}`).join('\n')}
`;
    }

    if (video.quotes && video.quotes.length > 0 && options.includeQuotes) {
      prompt += `
KEY QUOTES:
${video.quotes.map(q => `- "${q.text}"${q.speaker ? ` - ${q.speaker}` : ''}`).join('\n')}
`;
    }

    prompt += `
REQUIREMENTS:
- Target length: approximately ${options.targetWordCount} words
- Style: ${options.blogStyle}
- Include proper headings (H2, H3)
- Add an engaging introduction
- Include a conclusion with key takeaways
- Format in HTML`;

    if (options.blogStyle === 'listicle') {
      prompt += '\n- Structure as a numbered list of key points';
    } else if (options.blogStyle === 'tutorial') {
      prompt += '\n- Include step-by-step instructions\n- Add tips and best practices';
    } else if (options.blogStyle === 'narrative') {
      prompt += '\n- Tell a story\n- Include personal insights and examples';
    }

    return prompt;
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(voiceProfile?: VoiceProfile, blogStyle?: string): string {
    let systemPrompt = `You are an expert content writer who transforms video content into engaging blog posts.

Your writing should:
- Be well-structured with clear headings
- Be scannable with short paragraphs
- Include relevant examples and explanations
- Maintain the core message and insights from the video
- Add value beyond a simple transcript`;

    if (blogStyle) {
      const styleGuides: Record<string, string> = {
        tutorial: 'Focus on clear, actionable steps. Use numbered lists for procedures.',
        summary: 'Provide a concise overview of key points. Prioritize the most valuable insights.',
        listicle: 'Create a numbered list format with descriptive points.',
        narrative: 'Tell a compelling story. Use anecdotes and personal touches.',
      };

      if (styleGuides[blogStyle]) {
        systemPrompt += `\n\nStyle Guide: ${styleGuides[blogStyle]}`;
      }
    }

    return systemPrompt;
  }

  /**
   * Format blog content (clean up AI output)
   */
  private formatBlogContent(content: string): string {
    let formatted = content.trim();

    // Ensure proper HTML structure
    if (!formatted.startsWith('<')) {
      // Wrap in paragraph if not HTML
      formatted = formatted
        .split('\n\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .map(p => {
          if (p.startsWith('#')) {
            // Convert markdown headers
            const level = (p.match(/^#+/) ?? [''])[0].length;
            const text = p.replace(/^#+\s*/, '');
            return `<h${Math.min(level, 6)}>${text}</h${Math.min(level, 6)}>`;
          }
          return `<p>${p}</p>`;
        })
        .join('\n');
    }

    return formatted;
  }

  /**
   * Generate blog title from video title
   */
  private generateBlogTitle(videoTitle: string, style: string): string {
    const prefixes: Record<string, string> = {
      tutorial: 'How to: ',
      summary: '',
      listicle: 'Key Takeaways: ',
      narrative: 'The Story of ',
    };

    const prefix = prefixes[style] ?? '';

    // Clean up common video title patterns
    const cleanTitle = videoTitle
      .replace(/^\[.*?\]\s*/, '') // Remove bracketed prefixes
      .replace(/\s*\|.*$/, '') // Remove pipe-separated suffixes
      .replace(/\s*-\s*YouTube$/, '') // Remove YouTube suffix
      .trim();

    return prefix + cleanTitle;
  }

  /**
   * Generate SEO metadata
   */
  private async generateSEO(title: string, content: string): Promise<BlogSEO> {
    const prompt = `Generate SEO metadata for this blog post:

TITLE: ${title}

CONTENT PREVIEW: ${content.substring(0, 1000)}...

Provide:
1. Meta title (50-60 characters)
2. Meta description (150-160 characters)
3. Focus keyword (1-3 words)
4. 3-5 secondary keywords

Format as JSON: { metaTitle, metaDescription, focusKeyword, secondaryKeywords }`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are an SEO expert. Provide concise, optimized metadata.',
      maxTokens: 300,
    });

    if (!result.success) {
      // Return basic SEO if generation fails
      return {
        metaTitle: title.substring(0, 60),
        metaDescription: this.stripHtml(content).substring(0, 160),
      };
    }

    try {
      const jsonMatch = result.data.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          metaTitle: parsed.metaTitle,
          metaDescription: parsed.metaDescription,
          focusKeyword: parsed.focusKeyword,
          secondaryKeywords: parsed.secondaryKeywords,
        };
      }
    } catch {
      // Fall through to basic SEO
    }

    return {
      metaTitle: title.substring(0, 60),
      metaDescription: this.stripHtml(content).substring(0, 160),
    };
  }

  /**
   * Format timestamp
   */
  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Count words
   */
  private countWords(content: string): number {
    return this.stripHtml(content).split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVideoToBlogTransformer(
  contentGenerator: ContentGeneratorProvider
): VideoToBlogService {
  return new VideoToBlogService(contentGenerator);
}
