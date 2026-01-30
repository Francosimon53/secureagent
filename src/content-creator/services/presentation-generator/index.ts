/**
 * Content Creator Suite - Presentation Generator Service
 *
 * Main entry point for presentation generation, slide creation, and visual suggestions.
 */

export {
  SlideGeneratorService,
  createSlideGenerator,
  type SlideGenerationOptions,
  type SlideContent,
  type SlideImage,
  type SlideChart,
  type SlideLayout,
  type GeneratedSlide,
} from './slide-generator.js';

export {
  ContentToSlidesService,
  createContentToSlides,
  type ContentToSlidesOptions,
  type ContentSource,
  type ContentSection,
  type GeneratedPresentation,
} from './content-to-slides.js';

export {
  VisualSuggesterService,
  createVisualSuggester,
  type VisualSuggestionOptions,
  type VisualSuggestion,
  type SlideVisualPlan,
  type ColorPalette,
  type PresentationDesignGuide,
  type TypographyGuide,
  type LayoutGuidelines,
} from './visual-suggester.js';

import type { ServiceResult, VoiceProfile, BlogPost } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { VideoOutline } from '../video-scripts/outline-builder.js';
import type { PresentationConfig } from '../../config.js';

import {
  createSlideGenerator,
  type SlideGenerationOptions,
  type GeneratedSlide,
  type SlideLayout,
  type SlideContent,
} from './slide-generator.js';
import {
  createContentToSlides,
  type ContentToSlidesOptions,
  type ContentSource,
  type GeneratedPresentation,
} from './content-to-slides.js';
import {
  createVisualSuggester,
  type VisualSuggestionOptions,
  type SlideVisualPlan,
  type PresentationDesignGuide,
} from './visual-suggester.js';

// =============================================================================
// Types
// =============================================================================

export interface PresentationGeneratorServiceConfig {
  presentation?: PresentationConfig;
}

export interface PresentationGenerationOptions extends ContentToSlidesOptions {
  // Visual options (from VisualSuggestionOptions)
  colorScheme?: 'light' | 'dark' | 'colorful' | 'monochrome';
  includeIcons?: boolean;
  includeImages?: boolean;
  includeCharts?: boolean;
  targetPlatform?: 'powerpoint' | 'keynote' | 'google_slides' | 'web';
  // Additional options
  generateVisuals?: boolean;
  generateDesignGuide?: boolean;
}

export interface FullPresentationResult {
  presentation: GeneratedPresentation;
  visualPlans?: SlideVisualPlan[];
  designGuide?: PresentationDesignGuide;
  generatedAt: number;
}

// =============================================================================
// Presentation Generator Service (Facade)
// =============================================================================

export class PresentationGeneratorService {
  public readonly slideGenerator: ReturnType<typeof createSlideGenerator>;
  public readonly contentToSlides: ReturnType<typeof createContentToSlides>;
  public readonly visualSuggester: ReturnType<typeof createVisualSuggester>;

  private defaultStyle: VisualSuggestionOptions['style'] = 'corporate';
  private defaultColorScheme: VisualSuggestionOptions['colorScheme'] = 'light';

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    config?: PresentationGeneratorServiceConfig
  ) {
    // Initialize slide generator
    this.slideGenerator = createSlideGenerator(contentGenerator);

    // Initialize content to slides converter
    this.contentToSlides = createContentToSlides(contentGenerator);

    // Initialize visual suggester
    this.visualSuggester = createVisualSuggester(contentGenerator);

  }

  // ===========================================================================
  // Full Presentation Generation
  // ===========================================================================

  /**
   * Generate a complete presentation with visuals
   */
  async generatePresentation(
    source: ContentSource,
    options?: PresentationGenerationOptions
  ): Promise<ServiceResult<FullPresentationResult>> {
    const opts = {
      ...options,
      style: options?.style ?? this.defaultStyle,
      colorScheme: options?.colorScheme ?? this.defaultColorScheme,
      generateVisuals: options?.generateVisuals ?? true,
      generateDesignGuide: options?.generateDesignGuide ?? true,
    };

    try {
      // Generate presentation slides
      const presentationResult = await this.contentToSlides.convert(source, opts);
      if (!presentationResult.success) {
        return presentationResult;
      }

      const result: FullPresentationResult = {
        presentation: presentationResult.data,
        generatedAt: Date.now(),
      };

      // Generate visual plans for each slide if requested
      if (opts.generateVisuals) {
        const visualPlans: SlideVisualPlan[] = [];
        for (const slide of presentationResult.data.slides) {
          const visualResult = await this.visualSuggester.suggestForSlide(slide.content, opts);
          if (visualResult.success) {
            visualPlans.push({
              ...visualResult.data,
              slideId: slide.id,
            });
          }
        }
        result.visualPlans = visualPlans;
      }

      // Generate design guide if requested
      if (opts.generateDesignGuide) {
        const guideResult = await this.visualSuggester.generateDesignGuide(source.title, opts);
        if (guideResult.success) {
          result.designGuide = guideResult.data;
        }
      }

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate presentation';
      return { success: false, error: message };
    }
  }

  /**
   * Generate presentation from blog post
   */
  async generateFromBlogPost(
    blog: BlogPost,
    options?: PresentationGenerationOptions
  ): Promise<ServiceResult<FullPresentationResult>> {
    const source: ContentSource = {
      type: 'blog',
      title: blog.title,
      content: blog.content,
      author: blog.author,
    };

    return this.generatePresentation(source, options);
  }

  /**
   * Generate presentation from video outline
   */
  async generateFromVideoOutline(
    outline: VideoOutline,
    options?: PresentationGenerationOptions
  ): Promise<ServiceResult<FullPresentationResult>> {
    const presentationResult = await this.contentToSlides.convertVideoOutline(outline, options);

    if (!presentationResult.success) {
      return presentationResult;
    }

    return {
      success: true,
      data: {
        presentation: presentationResult.data,
        generatedAt: Date.now(),
      },
    };
  }

  /**
   * Generate presentation from markdown
   */
  async generateFromMarkdown(
    markdown: string,
    title: string,
    options?: PresentationGenerationOptions
  ): Promise<ServiceResult<FullPresentationResult>> {
    const source: ContentSource = {
      type: 'markdown',
      title,
      content: markdown,
    };

    return this.generatePresentation(source, options);
  }

  // ===========================================================================
  // Individual Operations
  // ===========================================================================

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
    return this.slideGenerator.generateSlide(topic, layout, context, options, voiceProfile);
  }

  /**
   * Generate slides for a section
   */
  async generateSectionSlides(
    sectionTopic: string,
    keyPoints: string[],
    options?: SlideGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedSlide[]>> {
    return this.slideGenerator.generateSectionSlides(sectionTopic, keyPoints, options, voiceProfile);
  }

  /**
   * Suggest visuals for a slide
   */
  async suggestVisuals(
    content: SlideContent,
    options?: VisualSuggestionOptions
  ): Promise<ServiceResult<SlideVisualPlan>> {
    return this.visualSuggester.suggestForSlide(content, {
      style: this.defaultStyle,
      colorScheme: this.defaultColorScheme,
      ...options,
    });
  }

  /**
   * Generate design guide
   */
  async generateDesignGuide(
    presentationTitle: string,
    options?: VisualSuggestionOptions
  ): Promise<ServiceResult<PresentationDesignGuide>> {
    return this.visualSuggester.generateDesignGuide(presentationTitle, {
      style: this.defaultStyle,
      colorScheme: this.defaultColorScheme,
      ...options,
    });
  }

  // ===========================================================================
  // Quick Operations
  // ===========================================================================

  /**
   * Quick presentation from text
   */
  async quickPresentation(
    text: string,
    title: string,
    maxSlides?: number
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const source: ContentSource = {
      type: 'text',
      title,
      content: text,
    };

    return this.contentToSlides.convert(source, {
      maxSlides: maxSlides ?? 10,
      style: this.defaultStyle,
    });
  }

  /**
   * Quick slide deck from bullet points
   */
  async quickSlideDeck(
    title: string,
    bulletPoints: string[]
  ): Promise<ServiceResult<GeneratedPresentation>> {
    const slides: GeneratedSlide[] = [];

    // Title slide
    const titleResult = await this.slideGenerator.generateTitleSlide(title);
    if (titleResult.success) {
      titleResult.data.slideNumber = 1;
      slides.push(titleResult.data);
    }

    // Content slides
    for (let i = 0; i < bulletPoints.length; i++) {
      const slideResult = await this.slideGenerator.generateSlide(
        bulletPoints[i],
        'bullets',
        `Point ${i + 1} of ${bulletPoints.length}`,
        { style: this.defaultStyle }
      );
      if (slideResult.success) {
        slideResult.data.slideNumber = slides.length + 1;
        slides.push(slideResult.data);
      }
    }

    // Closing slide
    const closingResult = await this.slideGenerator.generateClosingSlide();
    if (closingResult.success) {
      closingResult.data.slideNumber = slides.length + 1;
      slides.push(closingResult.data);
    }

    const presentation: GeneratedPresentation = {
      id: crypto.randomUUID(),
      title,
      slides,
      totalDuration: slides.reduce(
        (sum, s) => sum + this.slideGenerator.estimateDuration(s.content),
        0
      ),
      slideCount: slides.length,
      generatedAt: Date.now(),
    };

    return { success: true, data: presentation };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set default style
   */
  setDefaultStyle(style: VisualSuggestionOptions['style']): void {
    this.defaultStyle = style;
  }

  /**
   * Set default color scheme
   */
  setDefaultColorScheme(colorScheme: VisualSuggestionOptions['colorScheme']): void {
    this.defaultColorScheme = colorScheme;
  }

  // ===========================================================================
  // Formatting
  // ===========================================================================

  /**
   * Format presentation as markdown
   */
  formatAsMarkdown(presentation: GeneratedPresentation): string {
    const lines: string[] = [
      `# ${presentation.title}`,
      '',
      `Slides: ${presentation.slideCount} | Duration: ~${Math.round(presentation.totalDuration / 60)} minutes`,
      '',
      '---',
      '',
    ];

    for (const slide of presentation.slides) {
      lines.push(`## Slide ${slide.slideNumber}: ${slide.content.title}`);
      lines.push('');

      if (slide.content.subtitle) {
        lines.push(`*${slide.content.subtitle}*`);
        lines.push('');
      }

      if (slide.content.bullets) {
        for (const bullet of slide.content.bullets) {
          lines.push(`- ${bullet}`);
        }
        lines.push('');
      }

      if (slide.content.body) {
        lines.push(slide.content.body);
        lines.push('');
      }

      if (slide.content.quote) {
        lines.push(`> "${slide.content.quote.text}"`);
        if (slide.content.quote.attribution) {
          lines.push(`> -- ${slide.content.quote.attribution}`);
        }
        lines.push('');
      }

      if (slide.content.speakerNotes) {
        lines.push('**Speaker Notes:**');
        lines.push(`_${slide.content.speakerNotes}_`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export as JSON for external tools
   */
  exportAsJson(presentation: GeneratedPresentation): string {
    return JSON.stringify({
      id: presentation.id,
      title: presentation.title,
      slides: presentation.slides.map(slide => ({
        number: slide.slideNumber,
        layout: slide.content.layout,
        title: slide.content.title,
        subtitle: slide.content.subtitle,
        bullets: slide.content.bullets,
        body: slide.content.body,
        quote: slide.content.quote,
        speakerNotes: slide.content.speakerNotes,
        visualSuggestions: slide.content.visualSuggestions,
      })),
      metadata: {
        slideCount: presentation.slideCount,
        totalDuration: presentation.totalDuration,
        generatedAt: new Date(presentation.generatedAt).toISOString(),
      },
    }, null, 2);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Estimate presentation duration
   */
  estimateDuration(presentation: GeneratedPresentation): number {
    return presentation.slides.reduce(
      (sum, slide) => sum + this.slideGenerator.estimateDuration(slide.content),
      0
    );
  }

  /**
   * Get slide count by type
   */
  getSlideCountByType(presentation: GeneratedPresentation): Record<SlideLayout, number> {
    const counts: Partial<Record<SlideLayout, number>> = {};

    for (const slide of presentation.slides) {
      const layout = slide.content.layout;
      counts[layout] = (counts[layout] ?? 0) + 1;
    }

    return counts as Record<SlideLayout, number>;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPresentationGeneratorService(
  contentGenerator: ContentGeneratorProvider,
  config?: PresentationGeneratorServiceConfig
): PresentationGeneratorService {
  return new PresentationGeneratorService(contentGenerator, config);
}
