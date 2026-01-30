/**
 * Content Creator Suite - Newsletter Digest Generator
 *
 * Generates comprehensive newsletter digests from curated content.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceProfile } from '../../types.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface DigestGenerationOptions {
  style?: 'casual' | 'professional' | 'newsletter' | 'brief';
  maxSections?: number;
  includeIntro?: boolean;
  includeOutro?: boolean;
  includeTOC?: boolean;
  personalize?: boolean;
  targetWordCount?: number;
}

export interface DigestContent {
  id: string;
  title: string;
  url?: string;
  summary?: string;
  category?: string;
  importance?: 'featured' | 'primary' | 'secondary';
  metadata?: Record<string, unknown>;
}

export interface DigestSection {
  id: string;
  title: string;
  items: DigestSectionItem[];
  intro?: string;
}

export interface DigestSectionItem {
  title: string;
  content: string;
  url?: string;
  callToAction?: string;
}

export interface GeneratedDigest {
  id: string;
  title: string;
  preheader?: string;
  intro?: string;
  sections: DigestSection[];
  outro?: string;
  tableOfContents?: string[];
  wordCount: number;
  generatedAt: number;
}

// =============================================================================
// Digest Generator Service
// =============================================================================

export class DigestGeneratorService {
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Generate a newsletter digest
   */
  async generateDigest(
    contents: DigestContent[],
    title: string,
    options?: DigestGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedDigest>> {
    const opts = {
      style: options?.style ?? 'newsletter',
      maxSections: options?.maxSections ?? 5,
      includeIntro: options?.includeIntro ?? true,
      includeOutro: options?.includeOutro ?? true,
      includeTOC: options?.includeTOC ?? contents.length > 5,
      personalize: options?.personalize ?? true,
      targetWordCount: options?.targetWordCount ?? 800,
    };

    this.emit(CONTENT_EVENTS.NEWSLETTER_GENERATION_STARTED, {
      title,
      contentCount: contents.length,
      style: opts.style,
    });

    try {
      // Group content by category
      const grouped = this.groupContentByCategory(contents);

      // Generate sections
      const sections = await this.generateSections(grouped, opts, voiceProfile);

      // Generate intro if requested
      let intro: string | undefined;
      if (opts.includeIntro) {
        intro = await this.generateIntro(title, contents, opts, voiceProfile);
      }

      // Generate outro if requested
      let outro: string | undefined;
      if (opts.includeOutro) {
        outro = await this.generateOutro(opts, voiceProfile);
      }

      // Generate preheader
      const preheader = await this.generatePreheader(title, contents);

      // Build table of contents
      const tableOfContents = opts.includeTOC
        ? sections.map(s => s.title)
        : undefined;

      // Calculate word count
      const wordCount = this.calculateWordCount(intro, sections, outro);

      const digest: GeneratedDigest = {
        id: crypto.randomUUID(),
        title,
        preheader,
        intro,
        sections,
        outro,
        tableOfContents,
        wordCount,
        generatedAt: Date.now(),
      };

      this.emit(CONTENT_EVENTS.NEWSLETTER_GENERATION_COMPLETED, {
        title,
        sectionCount: sections.length,
        wordCount,
      });

      return { success: true, data: digest };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate digest';
      this.emit(CONTENT_EVENTS.NEWSLETTER_GENERATION_FAILED, { title, error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Generate digest from multiple sources
   */
  async generateDigestFromSources(
    sources: Map<string, DigestContent[]>,
    title: string,
    options?: DigestGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedDigest>> {
    // Flatten and categorize
    const allContents: DigestContent[] = [];

    for (const [category, contents] of sources) {
      for (const content of contents) {
        allContents.push({
          ...content,
          category: content.category ?? category,
        });
      }
    }

    return this.generateDigest(allContents, title, options, voiceProfile);
  }

  // ===========================================================================
  // Generation Methods
  // ===========================================================================

  /**
   * Generate introduction
   */
  private async generateIntro(
    title: string,
    contents: DigestContent[],
    options: Required<Omit<DigestGenerationOptions, 'includeTOC' | 'personalize'>> & {
      includeTOC: boolean;
      personalize: boolean;
    },
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const voiceGuidance = voiceProfile
      ? `\nVOICE STYLE: ${voiceProfile.style.tone}, ${voiceProfile.style.personality.join(', ')}`
      : '';

    const contentPreview = contents
      .filter(c => c.importance === 'featured' || c.importance === 'primary')
      .slice(0, 3)
      .map(c => c.title)
      .join(', ');

    const prompt = `Write an engaging introduction for a newsletter digest:

NEWSLETTER TITLE: ${title}
STYLE: ${options.style}
FEATURED CONTENT: ${contentPreview}
${voiceGuidance}

Requirements:
- 2-3 sentences
- Greet the reader warmly
- Tease the main highlights
- Set the tone for the newsletter
- ${options.style === 'casual' ? 'Keep it friendly and conversational' : 'Maintain professional tone'}

Return ONLY the introduction text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write engaging newsletter introductions.',
      maxTokens: 200,
    });

    return result.success ? result.data.content.trim() : 'Welcome to this week\'s digest!';
  }

  /**
   * Generate sections from grouped content
   */
  private async generateSections(
    grouped: Map<string, DigestContent[]>,
    options: Required<Omit<DigestGenerationOptions, 'includeTOC' | 'personalize'>> & {
      includeTOC: boolean;
      personalize: boolean;
    },
    voiceProfile?: VoiceProfile
  ): Promise<DigestSection[]> {
    const sections: DigestSection[] = [];
    const voiceGuidance = voiceProfile
      ? `\nVOICE: ${voiceProfile.style.tone}`
      : '';

    for (const [category, contents] of grouped) {
      if (sections.length >= options.maxSections) break;

      const sectionItems: DigestSectionItem[] = [];

      for (const content of contents.slice(0, 5)) {
        const itemContent = await this.generateItemContent(content, options, voiceGuidance);
        sectionItems.push(itemContent);
      }

      // Generate section intro
      const sectionIntro = await this.generateSectionIntro(category, contents, voiceGuidance);

      sections.push({
        id: crypto.randomUUID(),
        title: this.formatCategoryTitle(category),
        items: sectionItems,
        intro: sectionIntro,
      });
    }

    return sections;
  }

  /**
   * Generate content for a single item
   */
  private async generateItemContent(
    content: DigestContent,
    options: { style: string },
    voiceGuidance: string
  ): Promise<DigestSectionItem> {
    if (content.summary) {
      // Use provided summary, optionally rephrase
      return {
        title: content.title,
        content: content.summary,
        url: content.url,
      };
    }

    const prompt = `Write a brief summary for this newsletter item:

TITLE: ${content.title}
STYLE: ${options.style}
${voiceGuidance}

Write 1-2 sentences that summarize why this is interesting/valuable.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write concise, engaging content summaries.',
      maxTokens: 100,
    });

    return {
      title: content.title,
      content: result.success ? result.data.content.trim() : content.title,
      url: content.url,
    };
  }

  /**
   * Generate section introduction
   */
  private async generateSectionIntro(
    category: string,
    contents: DigestContent[],
    voiceGuidance: string
  ): Promise<string> {
    const prompt = `Write a brief transition/intro for a newsletter section:

SECTION: ${category}
ITEMS: ${contents.length} items
HIGHLIGHTS: ${contents.slice(0, 2).map(c => c.title).join(', ')}
${voiceGuidance}

Write 1 sentence to introduce this section. Be concise.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write newsletter section transitions.',
      maxTokens: 50,
    });

    return result.success ? result.data.content.trim() : '';
  }

  /**
   * Generate outro/closing
   */
  private async generateOutro(
    options: { style: string },
    voiceProfile?: VoiceProfile
  ): Promise<string> {
    const voiceGuidance = voiceProfile
      ? `\nVOICE: ${voiceProfile.style.tone}, ${voiceProfile.style.personality.join(', ')}`
      : '';

    const prompt = `Write a closing for a newsletter:

STYLE: ${options.style}
${voiceGuidance}

Requirements:
- Thank the reader
- Include a soft call-to-action (share, reply, etc.)
- Sign off appropriately
- 2-3 sentences max

Return ONLY the closing text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write newsletter closings.',
      maxTokens: 100,
    });

    return result.success
      ? result.data.content.trim()
      : 'Thanks for reading! See you next time.';
  }

  /**
   * Generate email preheader
   */
  private async generatePreheader(
    title: string,
    contents: DigestContent[]
  ): Promise<string> {
    const featured = contents.find(c => c.importance === 'featured');
    const teaser = featured?.title ?? contents[0]?.title ?? '';

    const prompt = `Write an email preheader for this newsletter:

TITLE: ${title}
FEATURED: ${teaser}

Requirements:
- Max 100 characters
- Complement (don't repeat) the subject line
- Create curiosity
- Single sentence or phrase

Return ONLY the preheader text.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write email preheaders.',
      maxTokens: 50,
    });

    if (result.success) {
      const preheader = result.data.content.trim();
      return preheader.length > 100 ? preheader.substring(0, 97) + '...' : preheader;
    }

    return `Featuring: ${teaser.substring(0, 80)}...`;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Group content by category
   */
  private groupContentByCategory(contents: DigestContent[]): Map<string, DigestContent[]> {
    const grouped = new Map<string, DigestContent[]>();

    // First, add featured content
    const featured = contents.filter(c => c.importance === 'featured');
    if (featured.length > 0) {
      grouped.set('featured', featured);
    }

    // Group by category
    for (const content of contents) {
      if (content.importance === 'featured') continue;

      const category = content.category ?? 'general';
      const existing = grouped.get(category) ?? [];
      existing.push(content);
      grouped.set(category, existing);
    }

    // Sort items within each category by importance
    for (const [category, items] of grouped) {
      items.sort((a, b) => {
        const importanceOrder = { featured: 0, primary: 1, secondary: 2, undefined: 3 };
        return (importanceOrder[a.importance ?? 'undefined'] ?? 3) -
               (importanceOrder[b.importance ?? 'undefined'] ?? 3);
      });
    }

    return grouped;
  }

  /**
   * Format category title
   */
  private formatCategoryTitle(category: string): string {
    return category
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Calculate total word count
   */
  private calculateWordCount(
    intro: string | undefined,
    sections: DigestSection[],
    outro: string | undefined
  ): number {
    let count = 0;

    if (intro) {
      count += intro.split(/\s+/).length;
    }

    for (const section of sections) {
      if (section.intro) {
        count += section.intro.split(/\s+/).length;
      }
      for (const item of section.items) {
        count += item.title.split(/\s+/).length;
        count += item.content.split(/\s+/).length;
      }
    }

    if (outro) {
      count += outro.split(/\s+/).length;
    }

    return count;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createDigestGenerator(
  contentGenerator: ContentGeneratorProvider
): DigestGeneratorService {
  return new DigestGeneratorService(contentGenerator);
}
