/**
 * Content Creator Suite - Slide Generator
 *
 * Generates presentation slides with content, layouts, and speaker notes.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VoiceProfile } from '../../types.js';

// =============================================================================
// Types
// =============================================================================

export interface SlideGenerationOptions {
  style?: 'minimal' | 'corporate' | 'creative' | 'educational';
  maxBulletsPerSlide?: number;
  includeTitle?: boolean;
  includeSpeakerNotes?: boolean;
  includeVisualSuggestions?: boolean;
  targetDuration?: number; // minutes per slide
}

export interface SlideContent {
  title: string;
  subtitle?: string;
  bullets?: string[];
  body?: string;
  quote?: { text: string; attribution?: string };
  image?: SlideImage;
  chart?: SlideChart;
  speakerNotes?: string;
  visualSuggestions?: string[];
  layout: SlideLayout;
  duration?: number; // estimated seconds
}

export interface SlideImage {
  description: string;
  suggestedSource?: string;
  altText: string;
  position?: 'left' | 'right' | 'full' | 'background';
}

export interface SlideChart {
  type: 'bar' | 'line' | 'pie' | 'comparison';
  title?: string;
  data?: unknown;
  description: string;
}

export type SlideLayout =
  | 'title'
  | 'title_subtitle'
  | 'bullets'
  | 'two_column'
  | 'image_left'
  | 'image_right'
  | 'full_image'
  | 'quote'
  | 'chart'
  | 'comparison'
  | 'section_header'
  | 'blank';

export interface GeneratedSlide {
  id: string;
  slideNumber: number;
  content: SlideContent;
  section?: string;
}

// =============================================================================
// Slide Generator Service
// =============================================================================

export class SlideGeneratorService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Generate a single slide
   */
  async generateSlide(
    topic: string,
    layout: SlideLayout,
    context?: string,
    options?: SlideGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedSlide>> {
    const opts = {
      style: options?.style ?? 'corporate',
      maxBulletsPerSlide: options?.maxBulletsPerSlide ?? 5,
      includeSpeakerNotes: options?.includeSpeakerNotes ?? true,
      includeVisualSuggestions: options?.includeVisualSuggestions ?? true,
      targetDuration: options?.targetDuration ?? 2,
    };

    try {
      const content = await this.generateSlideContent(topic, layout, context, opts, voiceProfile);

      const slide: GeneratedSlide = {
        id: crypto.randomUUID(),
        slideNumber: 1,
        content,
      };

      return { success: true, data: slide };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate slide';
      return { success: false, error: message };
    }
  }

  /**
   * Generate multiple slides for a section
   */
  async generateSectionSlides(
    sectionTopic: string,
    keyPoints: string[],
    options?: SlideGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedSlide[]>> {
    const opts = {
      style: options?.style ?? 'corporate',
      maxBulletsPerSlide: options?.maxBulletsPerSlide ?? 5,
      includeSpeakerNotes: options?.includeSpeakerNotes ?? true,
      includeVisualSuggestions: options?.includeVisualSuggestions ?? true,
      targetDuration: options?.targetDuration ?? 2,
    };

    try {
      const slides: GeneratedSlide[] = [];

      // Section header slide
      const headerContent = await this.generateSlideContent(
        sectionTopic,
        'section_header',
        undefined,
        opts,
        voiceProfile
      );

      slides.push({
        id: crypto.randomUUID(),
        slideNumber: 1,
        content: headerContent,
        section: sectionTopic,
      });

      // Content slides for key points
      for (let i = 0; i < keyPoints.length; i++) {
        const layout = this.selectLayoutForContent(keyPoints[i]);
        const content = await this.generateSlideContent(
          keyPoints[i],
          layout,
          `Section: ${sectionTopic}\nPoint ${i + 1} of ${keyPoints.length}`,
          opts,
          voiceProfile
        );

        slides.push({
          id: crypto.randomUUID(),
          slideNumber: slides.length + 1,
          content,
          section: sectionTopic,
        });
      }

      return { success: true, data: slides };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate section slides';
      return { success: false, error: message };
    }
  }

  /**
   * Generate slide content
   */
  private async generateSlideContent(
    topic: string,
    layout: SlideLayout,
    context: string | undefined,
    options: {
      style: string;
      maxBulletsPerSlide: number;
      includeSpeakerNotes: boolean;
      includeVisualSuggestions: boolean;
      targetDuration: number;
    },
    voiceProfile?: VoiceProfile
  ): Promise<SlideContent> {
    const voiceGuidance = voiceProfile
      ? `\nVOICE STYLE: ${voiceProfile.style.tone}, ${voiceProfile.style.personality.join(', ')}`
      : '';

    const contextSection = context ? `\nCONTEXT: ${context}` : '';

    const prompt = this.buildPromptForLayout(topic, layout, options, voiceGuidance, contextSection);

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: `You create professional presentation slide content in ${options.style} style.`,
      maxTokens: 600,
    });

    if (!result.success) {
      return this.createDefaultSlideContent(topic, layout);
    }

    return this.parseSlideContent(result.data.content, layout, options);
  }

  /**
   * Build prompt based on layout type
   */
  private buildPromptForLayout(
    topic: string,
    layout: SlideLayout,
    options: {
      style: string;
      maxBulletsPerSlide: number;
      includeSpeakerNotes: boolean;
      includeVisualSuggestions: boolean;
      targetDuration: number;
    },
    voiceGuidance: string,
    contextSection: string
  ): string {
    const basePrompt = `Create content for a ${layout.replace('_', ' ')} presentation slide:

TOPIC: ${topic}
STYLE: ${options.style}
TARGET DURATION: ${options.targetDuration} minutes
${contextSection}
${voiceGuidance}

`;

    switch (layout) {
      case 'title':
      case 'title_subtitle':
        return basePrompt + `Provide:
TITLE: [main title]
SUBTITLE: [subtitle/tagline]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [opening remarks, 2-3 sentences]' : ''}`;

      case 'bullets':
        return basePrompt + `Provide:
TITLE: [slide title]
BULLETS:
- [point 1]
- [point 2]
... (max ${options.maxBulletsPerSlide} points)
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [talking points, 3-4 sentences]' : ''}
${options.includeVisualSuggestions ? 'VISUAL: [suggested visual element]' : ''}`;

      case 'two_column':
        return basePrompt + `Provide:
TITLE: [slide title]
LEFT_COLUMN:
- [point 1]
- [point 2]
RIGHT_COLUMN:
- [point 1]
- [point 2]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [talking points comparing both sides]' : ''}`;

      case 'image_left':
      case 'image_right':
      case 'full_image':
        return basePrompt + `Provide:
TITLE: [slide title]
BODY: [1-2 sentences of supporting text]
IMAGE_DESC: [detailed description of ideal image]
IMAGE_ALT: [alt text for accessibility]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [talking points]' : ''}`;

      case 'quote':
        return basePrompt + `Provide:
QUOTE: "[relevant quote]"
ATTRIBUTION: [source/speaker]
CONTEXT: [why this quote matters, 1 sentence]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [talking points about the quote]' : ''}`;

      case 'chart':
        return basePrompt + `Provide:
TITLE: [slide title]
CHART_TYPE: [bar/line/pie/comparison]
CHART_DESC: [what the chart shows]
KEY_INSIGHT: [main takeaway from the data]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [how to explain the chart]' : ''}`;

      case 'comparison':
        return basePrompt + `Provide:
TITLE: [slide title]
OPTION_A: [first option/approach]
POINTS_A:
- [pro/con 1]
- [pro/con 2]
OPTION_B: [second option/approach]
POINTS_B:
- [pro/con 1]
- [pro/con 2]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [how to present the comparison]' : ''}`;

      case 'section_header':
        return basePrompt + `Provide:
TITLE: [section title]
SUBTITLE: [brief description of what this section covers]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [transition/introduction for this section]' : ''}`;

      default:
        return basePrompt + `Provide:
TITLE: [slide title]
BODY: [main content]
${options.includeSpeakerNotes ? 'SPEAKER_NOTES: [talking points]' : ''}`;
    }
  }

  /**
   * Parse AI response into slide content
   */
  private parseSlideContent(
    response: string,
    layout: SlideLayout,
    options: { includeVisualSuggestions: boolean }
  ): SlideContent {
    const content: SlideContent = {
      title: '',
      layout,
    };

    // Parse title
    const titleMatch = response.match(/TITLE:\s*(.+?)(?=\n|$)/i);
    if (titleMatch) {
      content.title = titleMatch[1].trim();
    }

    // Parse subtitle
    const subtitleMatch = response.match(/SUBTITLE:\s*(.+?)(?=\n|$)/i);
    if (subtitleMatch) {
      content.subtitle = subtitleMatch[1].trim();
    }

    // Parse bullets
    const bulletsMatch = response.match(/BULLETS:\s*([\s\S]*?)(?=SPEAKER_NOTES|VISUAL|$)/i);
    if (bulletsMatch) {
      content.bullets = bulletsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    // Parse body
    const bodyMatch = response.match(/BODY:\s*(.+?)(?=\n[A-Z_]+:|$)/is);
    if (bodyMatch) {
      content.body = bodyMatch[1].trim();
    }

    // Parse quote
    const quoteMatch = response.match(/QUOTE:\s*"?(.+?)"?\s*\nATTRIBUTION:\s*(.+?)(?=\n|$)/is);
    if (quoteMatch) {
      content.quote = {
        text: quoteMatch[1].trim(),
        attribution: quoteMatch[2].trim(),
      };
    }

    // Parse image
    const imageDescMatch = response.match(/IMAGE_DESC:\s*(.+?)(?=\n|$)/i);
    const imageAltMatch = response.match(/IMAGE_ALT:\s*(.+?)(?=\n|$)/i);
    if (imageDescMatch) {
      content.image = {
        description: imageDescMatch[1].trim(),
        altText: imageAltMatch?.[1]?.trim() ?? 'Slide image',
        position: layout === 'image_left' ? 'left' : layout === 'image_right' ? 'right' : 'full',
      };
    }

    // Parse chart
    const chartTypeMatch = response.match(/CHART_TYPE:\s*(bar|line|pie|comparison)/i);
    const chartDescMatch = response.match(/CHART_DESC:\s*(.+?)(?=\n|$)/i);
    if (chartTypeMatch && chartDescMatch) {
      content.chart = {
        type: chartTypeMatch[1].toLowerCase() as SlideChart['type'],
        description: chartDescMatch[1].trim(),
      };
    }

    // Parse speaker notes
    const notesMatch = response.match(/SPEAKER_NOTES:\s*(.+?)(?=\n[A-Z_]+:|$)/is);
    if (notesMatch) {
      content.speakerNotes = notesMatch[1].trim();
    }

    // Parse visual suggestions
    if (options.includeVisualSuggestions) {
      const visualMatch = response.match(/VISUAL:\s*(.+?)(?=\n|$)/i);
      if (visualMatch) {
        content.visualSuggestions = [visualMatch[1].trim()];
      }
    }

    return content;
  }

  /**
   * Create default slide content as fallback
   */
  private createDefaultSlideContent(topic: string, layout: SlideLayout): SlideContent {
    return {
      title: topic,
      layout,
      body: 'Content to be added.',
    };
  }

  /**
   * Select appropriate layout based on content
   */
  private selectLayoutForContent(content: string): SlideLayout {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('compare') || lowerContent.includes('vs') || lowerContent.includes('versus')) {
      return 'comparison';
    }

    if (lowerContent.includes('data') || lowerContent.includes('chart') || lowerContent.includes('graph') || lowerContent.includes('%')) {
      return 'chart';
    }

    if (lowerContent.includes('quote') || lowerContent.includes('said') || lowerContent.includes('"')) {
      return 'quote';
    }

    if (lowerContent.includes('image') || lowerContent.includes('visual') || lowerContent.includes('photo')) {
      return 'image_right';
    }

    // Default to bullets for most content
    return 'bullets';
  }

  /**
   * Estimate slide duration based on content
   */
  estimateDuration(content: SlideContent): number {
    let seconds = 30; // Base time for any slide

    if (content.bullets) {
      seconds += content.bullets.length * 15;
    }

    if (content.body) {
      const words = content.body.split(/\s+/).length;
      seconds += words * 0.5;
    }

    if (content.speakerNotes) {
      const words = content.speakerNotes.split(/\s+/).length;
      seconds += words * 0.3;
    }

    if (content.chart) {
      seconds += 30; // Extra time to explain charts
    }

    return Math.round(seconds);
  }

  /**
   * Generate title slide
   */
  async generateTitleSlide(
    presentationTitle: string,
    subtitle?: string,
    author?: string,
    options?: SlideGenerationOptions
  ): Promise<ServiceResult<GeneratedSlide>> {
    const content: SlideContent = {
      title: presentationTitle,
      subtitle: subtitle,
      layout: 'title',
      speakerNotes: author ? `Presented by ${author}` : undefined,
    };

    const slide: GeneratedSlide = {
      id: crypto.randomUUID(),
      slideNumber: 1,
      content,
    };

    return { success: true, data: slide };
  }

  /**
   * Generate closing slide
   */
  async generateClosingSlide(
    title?: string,
    callToAction?: string,
    contactInfo?: string,
    options?: SlideGenerationOptions
  ): Promise<ServiceResult<GeneratedSlide>> {
    const content: SlideContent = {
      title: title ?? 'Thank You',
      subtitle: callToAction ?? 'Questions?',
      body: contactInfo,
      layout: 'title_subtitle',
      speakerNotes: 'Thank the audience and open for Q&A.',
    };

    const slide: GeneratedSlide = {
      id: crypto.randomUUID(),
      slideNumber: 1,
      content,
    };

    return { success: true, data: slide };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSlideGenerator(
  contentGenerator: ContentGeneratorProvider
): SlideGeneratorService {
  return new SlideGeneratorService(contentGenerator);
}
