/**
 * Content Creator Suite - Visual Suggester
 *
 * Suggests visual elements, images, icons, and design recommendations for slides.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { SlideContent, SlideLayout } from './slide-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface VisualSuggestionOptions {
  style?: 'minimal' | 'corporate' | 'creative' | 'educational';
  colorScheme?: 'light' | 'dark' | 'colorful' | 'monochrome';
  includeIcons?: boolean;
  includeImages?: boolean;
  includeCharts?: boolean;
  targetPlatform?: 'powerpoint' | 'keynote' | 'google_slides' | 'web';
}

export interface VisualSuggestion {
  type: 'image' | 'icon' | 'chart' | 'shape' | 'background' | 'color' | 'typography';
  description: string;
  placement?: string;
  searchTerms?: string[];
  stockImageUrls?: string[];
  iconName?: string;
  colorHex?: string;
  rationale: string;
}

export interface SlideVisualPlan {
  slideId?: string;
  layout: SlideLayout;
  suggestions: VisualSuggestion[];
  colorPalette: ColorPalette;
  overallStyle: string;
}

export interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface PresentationDesignGuide {
  colorPalette: ColorPalette;
  typography: TypographyGuide;
  visualTheme: string;
  slideTemplates: Map<SlideLayout, LayoutGuidelines>;
}

export interface TypographyGuide {
  headingFont: string;
  bodyFont: string;
  headingSize: string;
  bodySize: string;
  lineHeight: number;
}

export interface LayoutGuidelines {
  layout: SlideLayout;
  margins: { top: number; right: number; bottom: number; left: number };
  contentAreas: ContentArea[];
  recommendedVisuals: VisualSuggestion['type'][];
}

export interface ContentArea {
  name: string;
  position: { x: number; y: number; width: number; height: number };
  purpose: string;
}

// =============================================================================
// Visual Suggester Service
// =============================================================================

export class VisualSuggesterService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Suggest visuals for a single slide
   */
  async suggestForSlide(
    content: SlideContent,
    options?: VisualSuggestionOptions
  ): Promise<ServiceResult<SlideVisualPlan>> {
    const opts = {
      style: options?.style ?? 'corporate',
      colorScheme: options?.colorScheme ?? 'light',
      includeIcons: options?.includeIcons ?? true,
      includeImages: options?.includeImages ?? true,
      includeCharts: options?.includeCharts ?? true,
      targetPlatform: options?.targetPlatform ?? 'powerpoint',
    };

    try {
      const suggestions = await this.generateSuggestions(content, opts);
      const colorPalette = this.getColorPalette(opts.style, opts.colorScheme);

      const plan: SlideVisualPlan = {
        layout: content.layout,
        suggestions,
        colorPalette,
        overallStyle: `${opts.style} ${opts.colorScheme}`,
      };

      return { success: true, data: plan };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to suggest visuals';
      return { success: false, error: message };
    }
  }

  /**
   * Generate visual suggestions using AI
   */
  private async generateSuggestions(
    content: SlideContent,
    options: Required<VisualSuggestionOptions>
  ): Promise<VisualSuggestion[]> {
    const contentSummary = this.summarizeSlideContent(content);

    const prompt = `Suggest visual elements for this presentation slide:

SLIDE CONTENT:
Title: ${content.title}
Layout: ${content.layout}
Content: ${contentSummary}

STYLE: ${options.style}
COLOR SCHEME: ${options.colorScheme}

Suggest 2-4 visual elements. For each:
- Type (image/icon/chart/shape/background)
- Description of what it should look like
- Placement on the slide
- Search terms for finding stock images
- Why this visual helps

Format:
VISUAL 1:
Type: [type]
Description: [detailed description]
Placement: [where on slide]
SearchTerms: [term1, term2, term3]
Rationale: [why this visual works]

VISUAL 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You are a presentation design expert suggesting visual elements.',
      maxTokens: 600,
    });

    if (!result.success) {
      return this.getDefaultSuggestions(content, options);
    }

    return this.parseVisualSuggestions(result.data.content);
  }

  /**
   * Parse visual suggestions from AI response
   */
  private parseVisualSuggestions(response: string): VisualSuggestion[] {
    const suggestions: VisualSuggestion[] = [];
    const visualRegex = /VISUAL \d+:\s*\nType:\s*(.+?)\s*\nDescription:\s*(.+?)\s*\nPlacement:\s*(.+?)\s*\nSearchTerms:\s*(.+?)\s*\nRationale:\s*(.+?)(?=\nVISUAL|\n$|$)/gis;
    let match;

    while ((match = visualRegex.exec(response)) !== null) {
      const type = match[1].toLowerCase().trim() as VisualSuggestion['type'];
      const validTypes: VisualSuggestion['type'][] = ['image', 'icon', 'chart', 'shape', 'background', 'color', 'typography'];

      if (validTypes.includes(type)) {
        suggestions.push({
          type,
          description: match[2].trim(),
          placement: match[3].trim(),
          searchTerms: match[4].split(',').map(t => t.trim()),
          rationale: match[5].trim(),
        });
      }
    }

    return suggestions;
  }

  /**
   * Get default suggestions as fallback
   */
  private getDefaultSuggestions(
    content: SlideContent,
    options: Required<VisualSuggestionOptions>
  ): VisualSuggestion[] {
    const suggestions: VisualSuggestion[] = [];

    // Always suggest appropriate background
    suggestions.push({
      type: 'background',
      description: options.colorScheme === 'dark'
        ? 'Dark gradient background with subtle texture'
        : 'Clean white or light gray background',
      rationale: `Matches ${options.colorScheme} color scheme`,
    });

    // Suggest based on layout
    switch (content.layout) {
      case 'bullets':
        if (options.includeIcons) {
          suggestions.push({
            type: 'icon',
            description: 'Small icons next to each bullet point',
            placement: 'Left of each bullet',
            rationale: 'Icons help readers quickly identify point topics',
          });
        }
        break;

      case 'quote':
        suggestions.push({
          type: 'shape',
          description: 'Large quotation marks as design element',
          placement: 'Top left and bottom right of quote',
          rationale: 'Quotation marks visually emphasize the quote',
        });
        break;

      case 'chart':
        if (options.includeCharts) {
          suggestions.push({
            type: 'chart',
            description: 'Clean, minimal chart with brand colors',
            placement: 'Center of slide',
            rationale: 'Data visualization aids understanding',
          });
        }
        break;

      case 'image_left':
      case 'image_right':
      case 'full_image':
        if (options.includeImages) {
          suggestions.push({
            type: 'image',
            description: 'High-quality, relevant photograph',
            placement: content.layout.includes('left') ? 'Left half' : content.layout.includes('right') ? 'Right half' : 'Full background',
            searchTerms: this.extractSearchTerms(content.title),
            rationale: 'Images create emotional connection with audience',
          });
        }
        break;
    }

    return suggestions;
  }

  /**
   * Summarize slide content for AI prompt
   */
  private summarizeSlideContent(content: SlideContent): string {
    const parts: string[] = [];

    if (content.subtitle) parts.push(`Subtitle: ${content.subtitle}`);
    if (content.bullets) parts.push(`Bullets: ${content.bullets.join('; ')}`);
    if (content.body) parts.push(`Body: ${content.body.substring(0, 200)}`);
    if (content.quote) parts.push(`Quote: "${content.quote.text}"`);

    return parts.join('\n') || 'No additional content';
  }

  /**
   * Extract search terms from title
   */
  private extractSearchTerms(title: string): string[] {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are']);
    return title
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 5);
  }

  /**
   * Get color palette for style
   */
  private getColorPalette(style: string, colorScheme: string): ColorPalette {
    const palettes: Record<string, Record<string, ColorPalette>> = {
      corporate: {
        light: {
          primary: '#1a365d',
          secondary: '#2b6cb0',
          accent: '#ed8936',
          background: '#ffffff',
          text: '#1a202c',
        },
        dark: {
          primary: '#90cdf4',
          secondary: '#63b3ed',
          accent: '#fbd38d',
          background: '#1a202c',
          text: '#f7fafc',
        },
      },
      minimal: {
        light: {
          primary: '#2d3748',
          secondary: '#4a5568',
          accent: '#3182ce',
          background: '#ffffff',
          text: '#1a202c',
        },
        dark: {
          primary: '#e2e8f0',
          secondary: '#a0aec0',
          accent: '#63b3ed',
          background: '#171923',
          text: '#f7fafc',
        },
      },
      creative: {
        light: {
          primary: '#553c9a',
          secondary: '#6b46c1',
          accent: '#f56565',
          background: '#fffaf0',
          text: '#1a202c',
        },
        dark: {
          primary: '#b794f4',
          secondary: '#9f7aea',
          accent: '#fc8181',
          background: '#1a202c',
          text: '#f7fafc',
        },
      },
      educational: {
        light: {
          primary: '#234e52',
          secondary: '#285e61',
          accent: '#c05621',
          background: '#f7fafc',
          text: '#1a202c',
        },
        dark: {
          primary: '#81e6d9',
          secondary: '#4fd1c5',
          accent: '#ed8936',
          background: '#1a202c',
          text: '#f7fafc',
        },
      },
    };

    return palettes[style]?.[colorScheme] ?? palettes.corporate.light;
  }

  /**
   * Generate full design guide for presentation
   */
  async generateDesignGuide(
    presentationTitle: string,
    options?: VisualSuggestionOptions
  ): Promise<ServiceResult<PresentationDesignGuide>> {
    const opts = {
      style: options?.style ?? 'corporate',
      colorScheme: options?.colorScheme ?? 'light',
    };

    const colorPalette = this.getColorPalette(opts.style, opts.colorScheme);

    const typography: TypographyGuide = this.getTypographyGuide(opts.style);

    const slideTemplates = this.generateLayoutGuidelines(opts.style);

    const guide: PresentationDesignGuide = {
      colorPalette,
      typography,
      visualTheme: `${opts.style} ${opts.colorScheme}`,
      slideTemplates,
    };

    return { success: true, data: guide };
  }

  /**
   * Get typography guide for style
   */
  private getTypographyGuide(style: string): TypographyGuide {
    const guides: Record<string, TypographyGuide> = {
      corporate: {
        headingFont: 'Arial, Helvetica, sans-serif',
        bodyFont: 'Arial, Helvetica, sans-serif',
        headingSize: '36px',
        bodySize: '18px',
        lineHeight: 1.5,
      },
      minimal: {
        headingFont: 'Helvetica Neue, sans-serif',
        bodyFont: 'Helvetica Neue, sans-serif',
        headingSize: '32px',
        bodySize: '16px',
        lineHeight: 1.6,
      },
      creative: {
        headingFont: 'Georgia, serif',
        bodyFont: 'Arial, sans-serif',
        headingSize: '40px',
        bodySize: '18px',
        lineHeight: 1.5,
      },
      educational: {
        headingFont: 'Times New Roman, serif',
        bodyFont: 'Georgia, serif',
        headingSize: '32px',
        bodySize: '16px',
        lineHeight: 1.6,
      },
    };

    return guides[style] ?? guides.corporate;
  }

  /**
   * Generate layout guidelines for common layouts
   */
  private generateLayoutGuidelines(style: string): Map<SlideLayout, LayoutGuidelines> {
    const guidelines = new Map<SlideLayout, LayoutGuidelines>();

    guidelines.set('title', {
      layout: 'title',
      margins: { top: 40, right: 60, bottom: 40, left: 60 },
      contentAreas: [
        { name: 'title', position: { x: 10, y: 35, width: 80, height: 20 }, purpose: 'Main title' },
        { name: 'subtitle', position: { x: 10, y: 55, width: 80, height: 10 }, purpose: 'Subtitle/tagline' },
      ],
      recommendedVisuals: ['background', 'shape'],
    });

    guidelines.set('bullets', {
      layout: 'bullets',
      margins: { top: 20, right: 40, bottom: 20, left: 40 },
      contentAreas: [
        { name: 'title', position: { x: 5, y: 5, width: 90, height: 15 }, purpose: 'Slide title' },
        { name: 'content', position: { x: 5, y: 25, width: 90, height: 70 }, purpose: 'Bullet points' },
      ],
      recommendedVisuals: ['icon', 'background'],
    });

    guidelines.set('two_column', {
      layout: 'two_column',
      margins: { top: 20, right: 30, bottom: 20, left: 30 },
      contentAreas: [
        { name: 'title', position: { x: 5, y: 5, width: 90, height: 15 }, purpose: 'Slide title' },
        { name: 'left', position: { x: 5, y: 25, width: 42, height: 70 }, purpose: 'Left column' },
        { name: 'right', position: { x: 53, y: 25, width: 42, height: 70 }, purpose: 'Right column' },
      ],
      recommendedVisuals: ['icon', 'shape'],
    });

    guidelines.set('image_right', {
      layout: 'image_right',
      margins: { top: 20, right: 20, bottom: 20, left: 40 },
      contentAreas: [
        { name: 'title', position: { x: 5, y: 5, width: 45, height: 15 }, purpose: 'Slide title' },
        { name: 'content', position: { x: 5, y: 25, width: 45, height: 70 }, purpose: 'Text content' },
        { name: 'image', position: { x: 55, y: 5, width: 40, height: 90 }, purpose: 'Image area' },
      ],
      recommendedVisuals: ['image'],
    });

    guidelines.set('quote', {
      layout: 'quote',
      margins: { top: 30, right: 50, bottom: 30, left: 50 },
      contentAreas: [
        { name: 'quote', position: { x: 10, y: 30, width: 80, height: 30 }, purpose: 'Quote text' },
        { name: 'attribution', position: { x: 10, y: 65, width: 80, height: 10 }, purpose: 'Quote source' },
      ],
      recommendedVisuals: ['shape', 'background'],
    });

    return guidelines;
  }

  /**
   * Suggest image sources
   */
  async suggestImageSources(
    searchTerms: string[],
    count?: number
  ): Promise<string[]> {
    const sources = [
      `https://unsplash.com/s/photos/${searchTerms.join('-')}`,
      `https://www.pexels.com/search/${searchTerms.join('%20')}`,
      `https://pixabay.com/images/search/${searchTerms.join('%20')}`,
    ];

    return sources.slice(0, count ?? 3);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVisualSuggester(
  contentGenerator: ContentGeneratorProvider
): VisualSuggesterService {
  return new VisualSuggesterService(contentGenerator);
}
