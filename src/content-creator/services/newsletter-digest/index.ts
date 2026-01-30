/**
 * Content Creator Suite - Newsletter Digest Service
 *
 * Main entry point for newsletter digest generation, curation, and insight extraction.
 */

export {
  DigestGeneratorService,
  createDigestGenerator,
  type DigestGenerationOptions,
  type DigestContent,
  type DigestSection,
  type DigestSectionItem,
  type GeneratedDigest,
} from './digest-generator.js';

export {
  InsightExtractorService,
  createInsightExtractor,
  type InsightExtractionOptions,
  type ContentItem,
  type ExtractedInsight,
  type TrendAnalysis,
  type InsightReport,
} from './insight-extractor.js';

export {
  CurationEngineService,
  createCurationEngine,
  type CurationOptions,
  type AudienceProfile,
  type CandidateContent,
  type CuratedContent,
  type CurationResult,
  type CurationStats,
} from './curation-engine.js';

import type { ServiceResult, VoiceProfile } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { NewsletterConfig } from '../../config.js';

import {
  createDigestGenerator,
  type DigestGenerationOptions,
  type DigestContent,
  type GeneratedDigest,
} from './digest-generator.js';
import {
  createInsightExtractor,
  type InsightExtractionOptions,
  type ContentItem,
  type InsightReport,
} from './insight-extractor.js';
import {
  createCurationEngine,
  type CurationOptions,
  type CandidateContent,
  type CurationResult,
  type AudienceProfile,
} from './curation-engine.js';

// =============================================================================
// Types
// =============================================================================

export interface NewsletterDigestServiceConfig {
  newsletter?: NewsletterConfig;
}

export interface FullNewsletterResult {
  curation: CurationResult;
  insights: InsightReport;
  digest: GeneratedDigest;
  generatedAt: number;
}

// =============================================================================
// Newsletter Digest Service (Facade)
// =============================================================================

export class NewsletterDigestService {
  public readonly digestGenerator: ReturnType<typeof createDigestGenerator>;
  public readonly insightExtractor: ReturnType<typeof createInsightExtractor>;
  public readonly curationEngine: ReturnType<typeof createCurationEngine>;

  private defaultAudience?: AudienceProfile;

  constructor(
    private readonly contentGenerator: ContentGeneratorProvider,
    config?: NewsletterDigestServiceConfig
  ) {
    // Initialize digest generator
    this.digestGenerator = createDigestGenerator(contentGenerator);

    // Initialize insight extractor
    this.insightExtractor = createInsightExtractor(contentGenerator);

    // Initialize curation engine
    this.curationEngine = createCurationEngine(contentGenerator);

  }

  // ===========================================================================
  // Full Newsletter Generation
  // ===========================================================================

  /**
   * Generate a complete newsletter from raw content
   */
  async generateFullNewsletter(
    candidates: CandidateContent[],
    title: string,
    options?: {
      curation?: CurationOptions;
      insights?: InsightExtractionOptions;
      digest?: DigestGenerationOptions;
      voiceProfileId?: string;
    },
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<FullNewsletterResult>> {
    try {
      // Step 1: Curate content
      const curationResult = await this.curationEngine.curateContent(candidates, {
        audienceProfile: this.defaultAudience,
        ...options?.curation,
      });

      if (!curationResult.success) {
        return curationResult;
      }

      // Step 2: Extract insights from curated content
      const contentItems: ContentItem[] = curationResult.data.curated.map(c => ({
        id: c.id,
        title: c.title,
        content: c.content,
        url: c.url,
        source: c.source,
        publishedAt: c.publishedAt,
        category: c.category,
        tags: c.tags,
      }));

      const insightsResult = await this.insightExtractor.extractInsights(
        contentItems,
        options?.insights
      );

      if (!insightsResult.success) {
        return insightsResult;
      }

      // Step 3: Generate digest
      const digestContents: DigestContent[] = curationResult.data.curated.map(c => ({
        id: c.id,
        title: c.title,
        url: c.url,
        summary: c.curationReason,
        category: c.category,
        importance: c.suggestedPosition,
      }));

      const digestResult = await this.digestGenerator.generateDigest(
        digestContents,
        title,
        options?.digest,
        voiceProfile
      );

      if (!digestResult.success) {
        return digestResult;
      }

      const result: FullNewsletterResult = {
        curation: curationResult.data,
        insights: insightsResult.data,
        digest: digestResult.data,
        generatedAt: Date.now(),
      };

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate newsletter';
      return { success: false, error: message };
    }
  }

  // ===========================================================================
  // Individual Operations
  // ===========================================================================

  /**
   * Curate content for newsletter
   */
  async curateContent(
    candidates: CandidateContent[],
    options?: CurationOptions
  ): Promise<ServiceResult<CurationResult>> {
    return this.curationEngine.curateContent(candidates, {
      audienceProfile: this.defaultAudience,
      ...options,
    });
  }

  /**
   * Extract insights from content
   */
  async extractInsights(
    items: ContentItem[],
    options?: InsightExtractionOptions
  ): Promise<ServiceResult<InsightReport>> {
    return this.insightExtractor.extractInsights(items, options);
  }

  /**
   * Generate digest from curated content
   */
  async generateDigest(
    contents: DigestContent[],
    title: string,
    options?: DigestGenerationOptions,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedDigest>> {
    return this.digestGenerator.generateDigest(contents, title, options, voiceProfile);
  }

  // ===========================================================================
  // Quick Operations
  // ===========================================================================

  /**
   * Quick digest - curate and generate in one step
   */
  async quickDigest(
    candidates: CandidateContent[],
    title: string,
    maxItems?: number,
    voiceProfile?: VoiceProfile
  ): Promise<ServiceResult<GeneratedDigest>> {
    // Curate first
    const curationResult = await this.curateContent(candidates, {
      maxItems: maxItems ?? 10,
    });

    if (!curationResult.success) {
      return curationResult;
    }

    // Convert to digest content
    const contents: DigestContent[] = curationResult.data.curated.map(c => ({
      id: c.id,
      title: c.title,
      url: c.url,
      summary: c.curationReason,
      category: c.category,
      importance: c.suggestedPosition,
    }));

    return this.generateDigest(contents, title, { style: 'newsletter' }, voiceProfile);
  }

  /**
   * Quick insights - extract key insights from content
   */
  async quickInsights(
    items: ContentItem[],
    maxInsights?: number
  ): Promise<ServiceResult<InsightReport>> {
    return this.extractInsights(items, {
      maxInsights: maxInsights ?? 5,
      timeframe: 'weekly',
    });
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Set default audience profile
   */
  setDefaultAudience(audience: AudienceProfile): void {
    this.defaultAudience = audience;
  }

  /**
   * Get default audience profile
   */
  getDefaultAudience(): AudienceProfile | undefined {
    return this.defaultAudience;
  }

  // ===========================================================================
  // Formatting
  // ===========================================================================

  /**
   * Format newsletter as markdown
   */
  formatAsMarkdown(result: FullNewsletterResult): string {
    const lines: string[] = [
      `# ${result.digest.title}`,
      '',
    ];

    if (result.digest.preheader) {
      lines.push(`*${result.digest.preheader}*`, '');
    }

    if (result.digest.intro) {
      lines.push(result.digest.intro, '');
    }

    // Table of contents
    if (result.digest.tableOfContents && result.digest.tableOfContents.length > 0) {
      lines.push('## In This Issue', '');
      for (const item of result.digest.tableOfContents) {
        lines.push(`- ${item}`);
      }
      lines.push('');
    }

    lines.push('---', '');

    // Key insights
    if (result.insights.insights.length > 0) {
      lines.push('## Key Insights', '');
      for (const insight of result.insights.insights.slice(0, 3)) {
        lines.push(`### ${insight.title}`, '');
        lines.push(insight.summary, '');
      }
      lines.push('---', '');
    }

    // Sections
    for (const section of result.digest.sections) {
      lines.push(`## ${section.title}`, '');
      if (section.intro) {
        lines.push(section.intro, '');
      }
      for (const item of section.items) {
        lines.push(`### ${item.title}`, '');
        lines.push(item.content, '');
        if (item.url) {
          lines.push(`[Read more](${item.url})`, '');
        }
      }
    }

    // Trends
    if (result.insights.trends.length > 0) {
      lines.push('---', '', '## Trending', '');
      for (const trend of result.insights.trends.slice(0, 3)) {
        const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
        lines.push(`- ${arrow} **${trend.trend}**`);
      }
      lines.push('');
    }

    // Outro
    if (result.digest.outro) {
      lines.push('---', '', result.digest.outro);
    }

    return lines.join('\n');
  }

  /**
   * Format for email HTML
   */
  formatAsEmailHtml(result: FullNewsletterResult): string {
    const markdown = this.formatAsMarkdown(result);
    // Simple markdown to HTML conversion
    return this.markdownToHtml(markdown);
  }

  /**
   * Simple markdown to HTML conversion
   */
  private markdownToHtml(markdown: string): string {
    return markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
      .replace(/<p><\/p>/g, '');
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    const unsub = this.digestGenerator.onEvent(handler);
    return unsub;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createNewsletterDigestService(
  contentGenerator: ContentGeneratorProvider,
  config?: NewsletterDigestServiceConfig
): NewsletterDigestService {
  return new NewsletterDigestService(contentGenerator, config);
}
