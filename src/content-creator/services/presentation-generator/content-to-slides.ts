/**
 * Content Creator Suite - Content to Slides Converter
 *
 * Converts various content formats (blog posts, documents, outlines) into presentations.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceProfile, BlogPost } from '../../types.js';
import type { VideoOutline } from '../video-scripts/outline-builder.js';
import {
  createSlideGenerator,
  type SlideGenerationOptions,
  type GeneratedSlide,
  type SlideLayout,
  type SlideContent,
} from './slide-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface ContentToSlidesOptions extends SlideGenerationOptions {
  maxSlides?: number;
  includeTitle?: boolean;
  includeAgenda?: boolean;
  includeClosing?: boolean;
  preserveStructure?: boolean;
}

export interface ContentSource {
  type: 'blog' | 'document' | 'outline' | 'markdown' | 'text';
  title: string;
  content: string;
  sections?: ContentSection[];
  author?: string;
  metadata?: Record<string, unknown>;
}

export interface ContentSection {
  title: string;
  content: string;
  level: number;
  subsections?: ContentSection[];
}

export interface GeneratedPresentation {
  id: string;
  title: string;
  slides: GeneratedSlide[];
  totalDuration: number;
  slideCount: number;
  generatedAt: number;
}

// =============================================================================
// Content to Slides Service
// =============================================================================

export class ContentToSlidesService {
  private readonly slideGenerator: ReturnType<typeof createSlideGenerator>;

  constructor(private readonly contentGenerator: ContentGeneratorProvider) {
    this.slideGenerator = createSlideGenerator(contentGenerator);
  }

  /**
   * Convert any content source to slides
   */
  async convert(
    source: ContentSource,
    options?: ContentToSlidesOptions
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const opts = {
      maxSlides: options?.maxSlides ?? 15,
      includeTitle: options?.includeTitle ?? true,
      includeAgenda: options?.includeAgenda ?? true,
      includeClosing: options?.includeClosing ?? true,
      preserveStructure: options?.preserveStructure ?? true,
      style: options?.style ?? 'corporate',
      includeSpeakerNotes: options?.includeSpeakerNotes ?? true,
      includeVisualSuggestions: options?.includeVisualSuggestions ?? true,
      maxBulletsPerSlide: options?.maxBulletsPerSlide ?? 6,
      targetDuration: options?.targetDuration ?? 2, // minutes per slide
    };

    try {
      // Parse content into sections if not already provided
      const sections = source.sections ?? await this.parseContentIntoSections(source);

      // Generate slides
      const slides = await this.generateSlidesFromSections(
        source.title,
        sections,
        opts,
        source.author
      );

      // Calculate total duration
      const totalDuration = slides.reduce(
        (sum, slide) => sum + (slide.content.duration ?? this.slideGenerator.estimateDuration(slide.content)),
        0
      );

      const presentation: GeneratedPresentation = {
        id: crypto.randomUUID(),
        title: source.title,
        slides,
        totalDuration,
        slideCount: slides.length,
        generatedAt: Date.now(),
      };

      return { success: true, data: presentation };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to convert content to slides';
      return { success: false, error: message };
    }
  }

  /**
   * Convert a blog post to slides
   */
  async convertBlogPost(
    blog: BlogPost,
    options?: ContentToSlidesOptions
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const source: ContentSource = {
      type: 'blog',
      title: blog.title,
      content: blog.content,
      author: blog.author,
      metadata: {
        tags: blog.tags,
        publishedAt: blog.publishedAt,
      },
    };

    return this.convert(source, options);
  }

  /**
   * Convert a video outline to slides
   */
  async convertVideoOutline(
    outline: VideoOutline,
    options?: ContentToSlidesOptions
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const sections: ContentSection[] = outline.sections.map(section => ({
      title: section.title,
      content: section.keyPoints.join('\n'),
      level: 1,
    }));

    const source: ContentSource = {
      type: 'outline',
      title: outline.topic,
      content: outline.sections.map(s => s.title).join('\n'),
      sections,
    };

    return this.convert(source, options);
  }

  /**
   * Convert markdown to slides
   */
  async convertMarkdown(
    markdown: string,
    title: string,
    options?: ContentToSlidesOptions
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const sections = this.parseMarkdownSections(markdown);

    const source: ContentSource = {
      type: 'markdown',
      title,
      content: markdown,
      sections,
    };

    return this.convert(source, options);
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  /**
   * Parse content into sections using AI
   */
  private async parseContentIntoSections(source: ContentSource): Promise<ContentSection[]> {
    const prompt = `Analyze this ${source.type} content and divide it into logical presentation sections:

TITLE: ${source.title}

CONTENT:
${source.content.substring(0, 6000)}

Identify 4-8 main sections that would work as presentation topics.

Format:
SECTION 1:
Title: [section title]
Content: [key points for this section, 2-4 sentences]

SECTION 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You structure content for presentations.',
      maxTokens: 1000,
    });

    if (!result.success) {
      // Fallback: simple split by paragraphs
      return this.simpleSectionSplit(source.content, source.title);
    }

    return this.parseSectionsFromAI(result.data.content);
  }

  /**
   * Parse markdown into sections
   */
  private parseMarkdownSections(markdown: string): ContentSection[] {
    const sections: ContentSection[] = [];
    const lines = markdown.split('\n');

    let currentSection: ContentSection | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      const h2Match = line.match(/^##\s+(.+)$/);
      const h3Match = line.match(/^###\s+(.+)$/);

      if (h1Match || h2Match || h3Match) {
        // Save previous section
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }

        const level = h1Match ? 1 : h2Match ? 2 : 3;
        const title = (h1Match ?? h2Match ?? h3Match)![1];

        currentSection = { title, content: '', level };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Parse sections from AI response
   */
  private parseSectionsFromAI(response: string): ContentSection[] {
    const sections: ContentSection[] = [];
    const sectionRegex = /SECTION \d+:\s*\nTitle:\s*(.+?)\s*\nContent:\s*(.+?)(?=\nSECTION|\n$|$)/gis;
    let match;

    while ((match = sectionRegex.exec(response)) !== null) {
      sections.push({
        title: match[1].trim(),
        content: match[2].trim(),
        level: 1,
      });
    }

    return sections;
  }

  /**
   * Simple fallback section split
   */
  private simpleSectionSplit(content: string, title: string): ContentSection[] {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 50);
    const sections: ContentSection[] = [];

    // Create sections from paragraphs, grouping 2-3 paragraphs per section
    for (let i = 0; i < paragraphs.length; i += 2) {
      const sectionContent = paragraphs.slice(i, i + 2).join('\n\n');
      sections.push({
        title: `Section ${sections.length + 1}`,
        content: sectionContent,
        level: 1,
      });
    }

    return sections;
  }

  // ===========================================================================
  // Slide Generation
  // ===========================================================================

  /**
   * Generate slides from parsed sections
   */
  private async generateSlidesFromSections(
    title: string,
    sections: ContentSection[],
    options: Required<ContentToSlidesOptions>,
    author?: string
  ): Promise<GeneratedSlide[]> {
    const slides: GeneratedSlide[] = [];
    let slideNumber = 1;

    // Title slide
    if (options.includeTitle) {
      const titleSlideResult = await this.slideGenerator.generateTitleSlide(
        title,
        undefined,
        author,
        options
      );
      if (titleSlideResult.success) {
        titleSlideResult.data.slideNumber = slideNumber++;
        slides.push(titleSlideResult.data);
      }
    }

    // Agenda/Overview slide
    if (options.includeAgenda && sections.length > 2) {
      const agendaSlide = this.createAgendaSlide(sections, slideNumber++);
      slides.push(agendaSlide);
    }

    // Content slides
    const maxContentSlides = options.maxSlides - (options.includeTitle ? 1 : 0) -
                             (options.includeAgenda ? 1 : 0) -
                             (options.includeClosing ? 1 : 0);

    const slidesPerSection = Math.max(1, Math.floor(maxContentSlides / sections.length));

    for (const section of sections) {
      if (slides.length >= options.maxSlides - (options.includeClosing ? 1 : 0)) {
        break;
      }

      // Section header if we have multiple sections
      if (sections.length > 1) {
        const headerSlide = this.createSectionHeaderSlide(section.title, slideNumber++);
        slides.push(headerSlide);
      }

      // Content slides for this section
      const contentSlides = await this.generateContentSlides(
        section,
        slidesPerSection - 1,
        options
      );

      for (const slide of contentSlides) {
        if (slides.length >= options.maxSlides - (options.includeClosing ? 1 : 0)) {
          break;
        }
        slide.slideNumber = slideNumber++;
        slide.section = section.title;
        slides.push(slide);
      }
    }

    // Closing slide
    if (options.includeClosing) {
      const closingResult = await this.slideGenerator.generateClosingSlide(
        'Thank You',
        'Questions?',
        undefined,
        options
      );
      if (closingResult.success) {
        closingResult.data.slideNumber = slideNumber++;
        slides.push(closingResult.data);
      }
    }

    return slides;
  }

  /**
   * Generate content slides for a section
   */
  private async generateContentSlides(
    section: ContentSection,
    maxSlides: number,
    options: SlideGenerationOptions
  ): Promise<GeneratedSlide[]> {
    // Determine key points from content
    const keyPoints = await this.extractKeyPoints(section.content, maxSlides);

    const slides: GeneratedSlide[] = [];

    for (const point of keyPoints) {
      const layout = this.determineLayout(point);
      const slideResult = await this.slideGenerator.generateSlide(
        point,
        layout,
        `Section: ${section.title}`,
        options
      );

      if (slideResult.success) {
        slides.push(slideResult.data);
      }
    }

    return slides;
  }

  /**
   * Extract key points from content
   */
  private async extractKeyPoints(content: string, maxPoints: number): Promise<string[]> {
    const prompt = `Extract ${maxPoints} key points from this content that would work as slide topics:

${content}

Return as a simple list:
1. [point 1]
2. [point 2]
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract key points for presentations.',
      maxTokens: 300,
    });

    if (!result.success) {
      // Fallback: split by sentences and take first few
      return content
        .split(/[.!?]+/)
        .filter(s => s.trim().length > 20)
        .slice(0, maxPoints)
        .map(s => s.trim());
    }

    return result.data.content
      .split('\n')
      .filter(line => /^\d+[\.\)]/.test(line.trim()))
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .slice(0, maxPoints);
  }

  /**
   * Determine best layout for content
   */
  private determineLayout(content: string): SlideLayout {
    const lower = content.toLowerCase();

    if (lower.includes('compare') || lower.includes(' vs ')) {
      return 'comparison';
    }
    if (lower.includes('step') || lower.includes('process')) {
      return 'bullets';
    }
    if (lower.includes('quote') || content.includes('"')) {
      return 'quote';
    }
    if (lower.includes('data') || lower.includes('chart') || lower.includes('%')) {
      return 'chart';
    }
    if (lower.includes('example') || lower.includes('case study')) {
      return 'image_right';
    }

    return 'bullets';
  }

  /**
   * Create agenda slide
   */
  private createAgendaSlide(sections: ContentSection[], slideNumber: number): GeneratedSlide {
    return {
      id: crypto.randomUUID(),
      slideNumber,
      content: {
        title: 'Agenda',
        bullets: sections.map(s => s.title),
        layout: 'bullets',
        speakerNotes: 'Walk through what we will cover today.',
      },
    };
  }

  /**
   * Create section header slide
   */
  private createSectionHeaderSlide(title: string, slideNumber: number): GeneratedSlide {
    return {
      id: crypto.randomUUID(),
      slideNumber,
      content: {
        title,
        layout: 'section_header',
        speakerNotes: `Transitioning to: ${title}`,
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContentToSlides(
  contentGenerator: ContentGeneratorProvider
): ContentToSlidesService {
  return new ContentToSlidesService(contentGenerator);
}
