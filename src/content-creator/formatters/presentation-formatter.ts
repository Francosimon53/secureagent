/**
 * Content Creator Suite - Presentation Formatter
 *
 * Formats presentations into various output formats (Markdown, HTML, PPTX JSON, reveal.js).
 */

import type {
  GeneratedSlide,
  SlideContent,
  SlideLayout,
} from '../services/presentation-generator/slide-generator.js';
import type {
  GeneratedPresentation,
} from '../services/presentation-generator/content-to-slides.js';
import type {
  SlideVisualPlan,
  ColorPalette,
  PresentationDesignGuide,
} from '../services/presentation-generator/visual-suggester.js';

// =============================================================================
// Types
// =============================================================================

export interface PresentationFormatOptions {
  theme?: 'default' | 'dark' | 'light' | 'corporate';
  includeNotes?: boolean;
  includeVisualHints?: boolean;
  slideNumbers?: boolean;
  authorName?: string;
  companyName?: string;
  date?: string;
}

export type PresentationFormat = 'markdown' | 'html' | 'revealjs' | 'pptx_json' | 'outline' | 'speaker_notes';

// =============================================================================
// Presentation Formatter Class
// =============================================================================

export class PresentationFormatter {
  private readonly defaultOptions: PresentationFormatOptions = {
    theme: 'default',
    includeNotes: true,
    includeVisualHints: false,
    slideNumbers: true,
  };

  /**
   * Format presentation
   */
  format(
    presentation: GeneratedPresentation,
    format: PresentationFormat,
    options?: PresentationFormatOptions
  ): string {
    const opts = { ...this.defaultOptions, ...options };

    switch (format) {
      case 'markdown':
        return this.formatAsMarkdown(presentation, opts);
      case 'html':
        return this.formatAsHtml(presentation, opts);
      case 'revealjs':
        return this.formatAsRevealJs(presentation, opts);
      case 'pptx_json':
        return this.formatAsPptxJson(presentation, opts);
      case 'outline':
        return this.formatAsOutline(presentation, opts);
      case 'speaker_notes':
        return this.formatAsSpeakerNotes(presentation, opts);
      default:
        return this.formatAsMarkdown(presentation, opts);
    }
  }

  /**
   * Format as Markdown
   */
  private formatAsMarkdown(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const lines: string[] = [];

    // Title page info
    lines.push(`# ${presentation.title}`);
    lines.push('');
    if (options.authorName) lines.push(`**Author:** ${options.authorName}`);
    if (options.companyName) lines.push(`**Organization:** ${options.companyName}`);
    if (options.date) lines.push(`**Date:** ${options.date}`);
    lines.push(`**Slides:** ${presentation.slideCount} | **Duration:** ~${Math.round(presentation.totalDuration / 60)} min`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Slides
    for (const slide of presentation.slides) {
      lines.push(this.formatSlideMarkdown(slide, options));
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format single slide as Markdown
   */
  private formatSlideMarkdown(slide: GeneratedSlide, options: PresentationFormatOptions): string {
    const lines: string[] = [];
    const content = slide.content;

    // Slide header
    if (options.slideNumbers) {
      lines.push(`## Slide ${slide.slideNumber}: ${content.title}`);
    } else {
      lines.push(`## ${content.title}`);
    }
    lines.push('');

    // Layout indicator
    lines.push(`*Layout: ${content.layout.replace('_', ' ')}*`);
    lines.push('');

    // Subtitle
    if (content.subtitle) {
      lines.push(`### ${content.subtitle}`);
      lines.push('');
    }

    // Bullets
    if (content.bullets && content.bullets.length > 0) {
      for (const bullet of content.bullets) {
        lines.push(`- ${bullet}`);
      }
      lines.push('');
    }

    // Body
    if (content.body) {
      lines.push(content.body);
      lines.push('');
    }

    // Quote
    if (content.quote) {
      lines.push(`> "${content.quote.text}"`);
      if (content.quote.attribution) {
        lines.push(`> -- ${content.quote.attribution}`);
      }
      lines.push('');
    }

    // Image placeholder
    if (content.image) {
      lines.push(`**[Image: ${content.image.description}]**`);
      lines.push(`*Alt: ${content.image.altText}*`);
      lines.push('');
    }

    // Chart placeholder
    if (content.chart) {
      lines.push(`**[${content.chart.type.toUpperCase()} Chart: ${content.chart.description}]**`);
      lines.push('');
    }

    // Visual suggestions
    if (options.includeVisualHints && content.visualSuggestions) {
      lines.push('**Visual Suggestions:**');
      for (const suggestion of content.visualSuggestions) {
        lines.push(`- ${suggestion}`);
      }
      lines.push('');
    }

    // Speaker notes
    if (options.includeNotes && content.speakerNotes) {
      lines.push('**Speaker Notes:**');
      lines.push(`_${content.speakerNotes}_`);
    }

    return lines.join('\n');
  }

  /**
   * Format as HTML presentation
   */
  private formatAsHtml(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const theme = this.getThemeStyles(options.theme ?? 'default');

    const slides = presentation.slides.map((slide: GeneratedSlide, index: number) =>
      this.formatSlideHtml(slide, options, index === 0)
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(presentation.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: ${theme.background};
      color: ${theme.text};
    }
    .slide {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 60px;
      page-break-after: always;
      position: relative;
    }
    .slide-number {
      position: absolute;
      bottom: 20px;
      right: 30px;
      font-size: 14px;
      color: ${theme.secondary};
    }
    h1 {
      font-size: 48px;
      color: ${theme.primary};
      margin-bottom: 20px;
      text-align: center;
    }
    h2 {
      font-size: 36px;
      color: ${theme.primary};
      margin-bottom: 30px;
    }
    h3 {
      font-size: 24px;
      color: ${theme.secondary};
      margin-bottom: 20px;
    }
    .subtitle {
      font-size: 24px;
      color: ${theme.secondary};
      margin-bottom: 40px;
      text-align: center;
    }
    ul {
      list-style: none;
      text-align: left;
      max-width: 800px;
    }
    li {
      font-size: 24px;
      margin-bottom: 20px;
      padding-left: 30px;
      position: relative;
    }
    li::before {
      content: '•';
      position: absolute;
      left: 0;
      color: ${theme.accent};
      font-size: 28px;
    }
    .body-text {
      font-size: 20px;
      max-width: 700px;
      line-height: 1.6;
      text-align: center;
    }
    blockquote {
      font-size: 28px;
      font-style: italic;
      max-width: 800px;
      text-align: center;
      padding: 40px;
      border-left: 4px solid ${theme.accent};
      background: ${theme.background === '#ffffff' ? '#f9f9f9' : 'rgba(255,255,255,0.05)'};
    }
    .attribution {
      font-size: 18px;
      color: ${theme.secondary};
      margin-top: 20px;
    }
    .image-placeholder {
      width: 400px;
      height: 300px;
      background: ${theme.background === '#ffffff' ? '#eee' : '#333'};
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      color: ${theme.secondary};
      margin: 20px;
    }
    .speaker-notes {
      position: absolute;
      bottom: 50px;
      left: 30px;
      font-size: 12px;
      color: ${theme.secondary};
      max-width: 400px;
      opacity: 0.7;
    }
    .section-header {
      background: ${theme.primary};
      color: ${theme.background};
    }
    .section-header h2 {
      color: ${theme.background};
      font-size: 48px;
    }
    @media print {
      .slide { page-break-after: always; }
      .speaker-notes { display: none; }
    }
  </style>
</head>
<body>
${slides}
</body>
</html>`;
  }

  /**
   * Format single slide as HTML
   */
  private formatSlideHtml(slide: GeneratedSlide, options: PresentationFormatOptions, isFirst: boolean): string {
    const content = slide.content;
    const sectionClass = content.layout === 'section_header' ? ' section-header' : '';

    let innerHtml = '';

    // Title
    if (isFirst && content.layout === 'title') {
      innerHtml = `
        <h1>${this.escapeHtml(content.title)}</h1>
        ${content.subtitle ? `<p class="subtitle">${this.escapeHtml(content.subtitle)}</p>` : ''}
        ${options.authorName ? `<p class="attribution">${this.escapeHtml(options.authorName)}</p>` : ''}
      `;
    } else {
      innerHtml = `<h2>${this.escapeHtml(content.title)}</h2>`;

      if (content.subtitle) {
        innerHtml += `<h3>${this.escapeHtml(content.subtitle)}</h3>`;
      }

      if (content.bullets && content.bullets.length > 0) {
        innerHtml += '<ul>' + content.bullets.map(b => `<li>${this.escapeHtml(b)}</li>`).join('') + '</ul>';
      }

      if (content.body) {
        innerHtml += `<p class="body-text">${this.escapeHtml(content.body)}</p>`;
      }

      if (content.quote) {
        innerHtml += `
          <blockquote>
            "${this.escapeHtml(content.quote.text)}"
            ${content.quote.attribution ? `<p class="attribution">— ${this.escapeHtml(content.quote.attribution)}</p>` : ''}
          </blockquote>
        `;
      }

      if (content.image) {
        innerHtml += `<div class="image-placeholder">[${this.escapeHtml(content.image.description)}]</div>`;
      }
    }

    // Speaker notes
    if (options.includeNotes && content.speakerNotes) {
      innerHtml += `<div class="speaker-notes">${this.escapeHtml(content.speakerNotes)}</div>`;
    }

    // Slide number
    if (options.slideNumbers) {
      innerHtml += `<div class="slide-number">${slide.slideNumber}</div>`;
    }

    return `<div class="slide${sectionClass}">${innerHtml}</div>`;
  }

  /**
   * Format as reveal.js presentation
   */
  private formatAsRevealJs(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const theme = options.theme === 'dark' ? 'black' : options.theme === 'corporate' ? 'white' : 'simple';

    const slides = presentation.slides.map((slide: GeneratedSlide) =>
      this.formatSlideRevealJs(slide, options)
    ).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(presentation.title)}</title>
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4/dist/reset.css">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4/dist/reveal.css">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js@4/dist/theme/${theme}.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
${slides}
    </div>
  </div>
  <script src="https://unpkg.com/reveal.js@4/dist/reveal.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      slideNumber: ${options.slideNumbers ? 'true' : 'false'},
      showNotes: ${options.includeNotes ? 'true' : 'false'},
    });
  </script>
</body>
</html>`;
  }

  /**
   * Format single slide for reveal.js
   */
  private formatSlideRevealJs(slide: GeneratedSlide, options: PresentationFormatOptions): string {
    const content = slide.content;
    let innerHtml = '';

    if (content.layout === 'title' || content.layout === 'title_subtitle') {
      innerHtml = `
        <h1>${this.escapeHtml(content.title)}</h1>
        ${content.subtitle ? `<p>${this.escapeHtml(content.subtitle)}</p>` : ''}
      `;
    } else if (content.layout === 'section_header') {
      innerHtml = `<h2>${this.escapeHtml(content.title)}</h2>`;
    } else {
      innerHtml = `<h2>${this.escapeHtml(content.title)}</h2>`;

      if (content.bullets && content.bullets.length > 0) {
        innerHtml += '<ul>' + content.bullets.map(b => `<li class="fragment">${this.escapeHtml(b)}</li>`).join('') + '</ul>';
      }

      if (content.body) {
        innerHtml += `<p>${this.escapeHtml(content.body)}</p>`;
      }

      if (content.quote) {
        innerHtml += `<blockquote>"${this.escapeHtml(content.quote.text)}"</blockquote>`;
        if (content.quote.attribution) {
          innerHtml += `<p><small>— ${this.escapeHtml(content.quote.attribution)}</small></p>`;
        }
      }
    }

    const notes = content.speakerNotes
      ? `<aside class="notes">${this.escapeHtml(content.speakerNotes)}</aside>`
      : '';

    return `      <section>
${innerHtml}
${notes}
      </section>`;
  }

  /**
   * Format as PowerPoint-compatible JSON
   */
  private formatAsPptxJson(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const pptxData = {
      title: presentation.title,
      author: options.authorName,
      company: options.companyName,
      created: new Date().toISOString(),
      slides: presentation.slides.map((slide: GeneratedSlide) => ({
        number: slide.slideNumber,
        layout: this.mapLayoutToPptx(slide.content.layout),
        content: {
          title: slide.content.title,
          subtitle: slide.content.subtitle,
          body: slide.content.body,
          bullets: slide.content.bullets,
          quote: slide.content.quote,
          notes: slide.content.speakerNotes,
        },
        placeholders: this.getPlaceholders(slide.content),
      })),
      theme: {
        name: options.theme ?? 'default',
        colors: this.getThemeColors(options.theme ?? 'default'),
      },
    };

    return JSON.stringify(pptxData, null, 2);
  }

  /**
   * Format as outline only
   */
  private formatAsOutline(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const lines: string[] = [
      `PRESENTATION OUTLINE: ${presentation.title}`,
      `Total Slides: ${presentation.slideCount}`,
      `Estimated Duration: ${Math.round(presentation.totalDuration / 60)} minutes`,
      '',
      '='.repeat(60),
      '',
    ];

    let currentSection = '';

    for (const slide of presentation.slides) {
      if (slide.section && slide.section !== currentSection) {
        currentSection = slide.section;
        lines.push(`\n[SECTION: ${currentSection}]`);
      }

      lines.push(`${slide.slideNumber}. ${slide.content.title}`);

      if (slide.content.bullets) {
        for (const bullet of slide.content.bullets) {
          lines.push(`   - ${bullet}`);
        }
      }

      if (slide.content.body) {
        lines.push(`   > ${slide.content.body.substring(0, 100)}...`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format speaker notes only
   */
  private formatAsSpeakerNotes(presentation: GeneratedPresentation, options: PresentationFormatOptions): string {
    const lines: string[] = [
      `SPEAKER NOTES: ${presentation.title}`,
      '',
      '='.repeat(60),
      '',
    ];

    for (const slide of presentation.slides) {
      lines.push(`--- Slide ${slide.slideNumber}: ${slide.content.title} ---`);
      lines.push('');

      if (slide.content.speakerNotes) {
        lines.push(slide.content.speakerNotes);
      } else {
        lines.push('[No speaker notes]');
      }

      lines.push('');
      lines.push(`Estimated time: ${Math.round(slide.content.duration ?? 120)} seconds`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get theme styles
   */
  private getThemeStyles(theme: string): { primary: string; secondary: string; accent: string; background: string; text: string } {
    const themes: Record<string, { primary: string; secondary: string; accent: string; background: string; text: string }> = {
      default: {
        primary: '#2563eb',
        secondary: '#64748b',
        accent: '#f59e0b',
        background: '#ffffff',
        text: '#1e293b',
      },
      dark: {
        primary: '#60a5fa',
        secondary: '#94a3b8',
        accent: '#fbbf24',
        background: '#0f172a',
        text: '#f1f5f9',
      },
      light: {
        primary: '#1e40af',
        secondary: '#475569',
        accent: '#ea580c',
        background: '#f8fafc',
        text: '#0f172a',
      },
      corporate: {
        primary: '#1e3a5f',
        secondary: '#64748b',
        accent: '#0891b2',
        background: '#ffffff',
        text: '#1e293b',
      },
    };

    return themes[theme] ?? themes.default;
  }

  /**
   * Get theme colors for PPTX
   */
  private getThemeColors(theme: string): Record<string, string> {
    const styles = this.getThemeStyles(theme);
    return {
      primary: styles.primary,
      secondary: styles.secondary,
      accent: styles.accent,
      background: styles.background,
      text: styles.text,
    };
  }

  /**
   * Map layout to PowerPoint layout name
   */
  private mapLayoutToPptx(layout: SlideLayout): string {
    const mapping: Record<SlideLayout, string> = {
      title: 'Title Slide',
      title_subtitle: 'Title and Content',
      bullets: 'Title and Content',
      two_column: 'Two Content',
      image_left: 'Content with Caption',
      image_right: 'Picture with Caption',
      full_image: 'Picture',
      quote: 'Quote',
      chart: 'Title and Chart',
      comparison: 'Comparison',
      section_header: 'Section Header',
      blank: 'Blank',
    };

    return mapping[layout] ?? 'Title and Content';
  }

  /**
   * Get placeholders for PPTX
   */
  private getPlaceholders(content: SlideContent): Record<string, unknown>[] {
    const placeholders: Record<string, unknown>[] = [];

    if (content.image) {
      placeholders.push({
        type: 'picture',
        description: content.image.description,
        altText: content.image.altText,
        position: content.image.position,
      });
    }

    if (content.chart) {
      placeholders.push({
        type: 'chart',
        chartType: content.chart.type,
        description: content.chart.description,
      });
    }

    return placeholders;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPresentationFormatter(): PresentationFormatter {
  return new PresentationFormatter();
}
