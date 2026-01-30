/**
 * Content Creator Suite - Blog to Newsletter Transformer
 *
 * Transforms blog posts into newsletter content.
 */

import type {
  GeneratedContent,
  TransformationConfig,
  VoiceProfile,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface BlogToNewsletterConfig extends TransformationConfig {
  newsletterStyle?: 'digest' | 'featured' | 'roundup' | 'educational';
  includePersonalNote?: boolean;
  includeTakeaways?: boolean;
  includeResources?: boolean;
  maxLength?: number;
  greeting?: string;
  signoff?: string;
  voiceProfile?: VoiceProfile;
}

export interface NewsletterContent {
  subject: string;
  preheader: string;
  greeting: string;
  intro: string;
  mainContent: string;
  takeaways?: string[];
  resources?: Array<{ title: string; url?: string; description: string }>;
  signoff: string;
}

// =============================================================================
// Blog to Newsletter Service
// =============================================================================

export class BlogToNewsletterService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Transform blog post to newsletter content
   */
  async transform(
    source: GeneratedContent,
    config: BlogToNewsletterConfig
  ): Promise<GeneratedContent | null> {
    const style = config.newsletterStyle ?? 'featured';
    const newsletter = await this.generateNewsletter(source, config, style);

    const htmlContent = this.formatNewsletterHtml(newsletter, config);

    return {
      id: '',
      userId: source.userId,
      type: 'newsletter',
      platform: 'custom',
      status: 'draft',
      title: newsletter.subject,
      content: htmlContent,
      metadata: {
        wordCount: this.countWords(htmlContent),
        characterCount: htmlContent.length,
        readingTimeMinutes: Math.ceil(this.countWords(htmlContent) / 200),
        sourceContentId: source.id,
        transformationType: 'blog_post:newsletter',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate newsletter content
   */
  private async generateNewsletter(
    source: GeneratedContent,
    config: BlogToNewsletterConfig,
    style: string
  ): Promise<NewsletterContent> {
    const blogTitle = source.title ?? 'Untitled';
    const blogContent = this.stripHtml(source.content);

    // Generate subject line
    const subject = await this.generateSubjectLine(blogTitle, blogContent, style);

    // Generate preheader
    const preheader = await this.generatePreheader(blogTitle, blogContent);

    // Generate intro
    const intro = await this.generateIntro(blogTitle, blogContent, style, config.voiceProfile);

    // Generate main content
    const mainContent = await this.generateMainContent(
      blogTitle,
      blogContent,
      style,
      config.maxLength ?? 1500,
      config.voiceProfile
    );

    // Generate takeaways if requested
    let takeaways: string[] | undefined;
    if (config.includeTakeaways) {
      takeaways = await this.generateTakeaways(blogContent);
    }

    // Generate resources if requested
    let resources: NewsletterContent['resources'];
    if (config.includeResources) {
      resources = await this.generateResources(blogContent);
    }

    return {
      subject,
      preheader,
      greeting: config.greeting ?? 'Hey there,',
      intro,
      mainContent,
      takeaways,
      resources,
      signoff: config.signoff ?? 'Until next time,',
    };
  }

  /**
   * Generate email subject line
   */
  private async generateSubjectLine(title: string, content: string, style: string): Promise<string> {
    const prompt = `Generate an email subject line for a newsletter featuring this blog post:

TITLE: ${title}
CONTENT PREVIEW: ${content.substring(0, 500)}...

Newsletter style: ${style}

Requirements:
- Under 50 characters
- Should be intriguing and encourage opens
- No clickbait
- Should hint at the value inside

Return ONLY the subject line, nothing else.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are an expert email marketer. Create compelling subject lines.',
      maxTokens: 50,
    });

    if (result.success) {
      return result.data.content.trim().replace(/^["']|["']$/g, '');
    }

    return title.substring(0, 50);
  }

  /**
   * Generate preheader text
   */
  private async generatePreheader(title: string, content: string): Promise<string> {
    const prompt = `Generate a preheader for a newsletter email:

TITLE: ${title}
CONTENT PREVIEW: ${content.substring(0, 300)}...

Requirements:
- 50-100 characters
- Complements the subject line
- Provides additional context
- Encourages opening the email

Return ONLY the preheader text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are an expert email marketer.',
      maxTokens: 80,
    });

    if (result.success) {
      return result.data.content.trim().replace(/^["']|["']$/g, '');
    }

    return content.substring(0, 100) + '...';
  }

  /**
   * Generate intro paragraph
   */
  private async generateIntro(
    title: string,
    content: string,
    style: string,
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const prompt = `Write an engaging intro paragraph for a newsletter about:

TITLE: ${title}
CONTENT PREVIEW: ${content.substring(0, 500)}...

Newsletter style: ${style}

Requirements:
- 2-4 sentences
- Personal and conversational
- Set up what the reader will learn
- Create anticipation

Return ONLY the intro paragraph.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a friendly newsletter writer who connects with readers.',
      maxTokens: 200,
      voiceProfile,
    });

    if (result.success) {
      return result.data.content.trim();
    }

    return `This week, I wanted to share something special with you about ${title.toLowerCase()}.`;
  }

  /**
   * Generate main newsletter content
   */
  private async generateMainContent(
    title: string,
    content: string,
    style: string,
    maxLength: number,
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const styleGuides: Record<string, string> = {
      digest: 'Summarize the key points in a scannable format with bullet points',
      featured: 'Provide a comprehensive overview with your personal insights',
      roundup: 'Present it as part of a curated collection of ideas',
      educational: 'Break down the concepts in an easy-to-follow way',
    };

    const prompt = `Transform this blog post into newsletter content:

TITLE: ${title}
CONTENT:
${content.substring(0, 3000)}${content.length > 3000 ? '...' : ''}

Style: ${style}
Style guide: ${styleGuides[style] ?? styleGuides.featured}

Requirements:
- Maximum ${maxLength} characters
- Break into short paragraphs
- Include 2-3 key insights
- Add personal commentary or perspective
- Make it feel exclusive to subscribers

Format the response as plain text with paragraph breaks.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a newsletter writer who provides valuable, personalized content.',
      maxTokens: Math.ceil(maxLength / 3),
      voiceProfile,
    });

    if (result.success) {
      return result.data.content.trim();
    }

    return content.substring(0, maxLength);
  }

  /**
   * Generate key takeaways
   */
  private async generateTakeaways(content: string): Promise<string[]> {
    const prompt = `Extract 3-5 key takeaways from this content:

${content.substring(0, 2000)}

Requirements:
- Each takeaway should be actionable
- Keep each point to 1-2 sentences
- Focus on the most valuable insights

Format as a numbered list.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract valuable insights from content.',
      maxTokens: 400,
    });

    if (result.success) {
      const lines = result.data.content.split('\n');
      return lines
        .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
        .filter(line => line.length > 10);
    }

    return [];
  }

  /**
   * Generate related resources
   */
  private async generateResources(content: string): Promise<NewsletterContent['resources']> {
    const prompt = `Based on this content, suggest 2-3 related resources that readers might find valuable:

${content.substring(0, 1500)}

For each resource, provide:
- A descriptive title
- A brief description (1 sentence)

Format as:
1. [Title]: [Description]
2. [Title]: [Description]
etc.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a curator who suggests relevant resources.',
      maxTokens: 300,
    });

    if (result.success) {
      const lines = result.data.content.split('\n');
      return lines
        .filter(line => line.match(/^\d+[\.\)]/))
        .map(line => {
          const cleaned = line.replace(/^\d+[\.\)]\s*/, '');
          const parts = cleaned.split(':');
          return {
            title: parts[0]?.trim() ?? 'Resource',
            description: parts.slice(1).join(':').trim() || 'Related resource',
          };
        })
        .slice(0, 3);
    }

    return [];
  }

  /**
   * Format newsletter as HTML
   */
  private formatNewsletterHtml(newsletter: NewsletterContent, config: BlogToNewsletterConfig): string {
    const sections: string[] = [];

    // Greeting
    sections.push(`<p class="greeting">${newsletter.greeting}</p>`);

    // Intro
    sections.push(`<div class="intro">${newsletter.intro}</div>`);

    // Main content
    const mainContentHtml = newsletter.mainContent
      .split('\n\n')
      .map(p => `<p>${p.trim()}</p>`)
      .join('\n');
    sections.push(`<div class="main-content">${mainContentHtml}</div>`);

    // Takeaways
    if (newsletter.takeaways && newsletter.takeaways.length > 0) {
      const takeawaysList = newsletter.takeaways
        .map(t => `<li>${t}</li>`)
        .join('\n');
      sections.push(`
        <div class="takeaways">
          <h3>Key Takeaways</h3>
          <ul>${takeawaysList}</ul>
        </div>
      `);
    }

    // Resources
    if (newsletter.resources && newsletter.resources.length > 0) {
      const resourcesList = newsletter.resources
        .map(r => `<li><strong>${r.title}</strong>: ${r.description}</li>`)
        .join('\n');
      sections.push(`
        <div class="resources">
          <h3>Related Resources</h3>
          <ul>${resourcesList}</ul>
        </div>
      `);
    }

    // Signoff
    sections.push(`<p class="signoff">${newsletter.signoff}</p>`);

    return sections.join('\n\n');
  }

  /**
   * Count words in content
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

export function createBlogToNewsletterTransformer(
  contentGenerator: ContentGeneratorProvider
): BlogToNewsletterService {
  return new BlogToNewsletterService(contentGenerator);
}
