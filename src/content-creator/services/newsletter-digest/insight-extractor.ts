/**
 * Content Creator Suite - Newsletter Insight Extractor
 *
 * Extracts insights, trends, and highlights from curated content for newsletters.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface InsightExtractionOptions {
  maxInsights?: number;
  categories?: string[];
  focusAreas?: string[];
  timeframe?: 'daily' | 'weekly' | 'monthly';
  audienceLevel?: 'beginner' | 'intermediate' | 'expert';
}

export interface ContentItem {
  id: string;
  title: string;
  content: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  category?: string;
  tags?: string[];
}

export interface ExtractedInsight {
  id: string;
  title: string;
  summary: string;
  significance: string;
  type: 'trend' | 'breakthrough' | 'analysis' | 'prediction' | 'opinion';
  relevance: number; // 0-1
  sources: string[];
  tags: string[];
}

export interface TrendAnalysis {
  trend: string;
  direction: 'rising' | 'stable' | 'declining';
  confidence: number;
  evidence: string[];
  implications: string[];
}

export interface InsightReport {
  id: string;
  title: string;
  insights: ExtractedInsight[];
  trends: TrendAnalysis[];
  highlights: string[];
  summary: string;
  generatedAt: number;
}

// =============================================================================
// Insight Extractor Service
// =============================================================================

export class InsightExtractorService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Extract insights from content items
   */
  async extractInsights(
    items: ContentItem[],
    options?: InsightExtractionOptions
  ): Promise<ServiceResult<InsightReport>> {
    const opts = {
      maxInsights: options?.maxInsights ?? 10,
      categories: options?.categories ?? [],
      focusAreas: options?.focusAreas ?? [],
      timeframe: options?.timeframe ?? 'weekly',
      audienceLevel: options?.audienceLevel ?? 'intermediate',
    };

    try {
      // Extract insights, trends, and highlights in parallel
      const [insights, trends, highlights] = await Promise.all([
        this.extractMainInsights(items, opts),
        this.analyzeTrends(items, opts),
        this.extractHighlights(items, opts),
      ]);

      // Generate summary
      const summary = await this.generateSummary(insights, trends, opts);

      const report: InsightReport = {
        id: crypto.randomUUID(),
        title: `Insights Report - ${this.formatTimeframe(opts.timeframe)}`,
        insights,
        trends,
        highlights,
        summary,
        generatedAt: Date.now(),
      };

      return { success: true, data: report };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract insights';
      return { success: false, error: message };
    }
  }

  /**
   * Extract main insights from content
   */
  async extractMainInsights(
    items: ContentItem[],
    options: {
      maxInsights: number;
      focusAreas: string[];
      audienceLevel: string;
    }
  ): Promise<ExtractedInsight[]> {
    const contentSummary = items
      .slice(0, 20)
      .map(item => `TITLE: ${item.title}\nCONTENT: ${item.content.substring(0, 500)}`)
      .join('\n\n---\n\n');

    const focusSection = options.focusAreas.length > 0
      ? `\nFOCUS AREAS: ${options.focusAreas.join(', ')}`
      : '';

    const prompt = `Extract the ${options.maxInsights} most valuable insights from these articles:

${contentSummary}
${focusSection}

AUDIENCE LEVEL: ${options.audienceLevel}

For each insight, provide:
- Title: [concise title]
- Summary: [2-3 sentence explanation]
- Significance: [why this matters]
- Type: [trend/breakthrough/analysis/prediction/opinion]
- Relevance: [0.0-1.0 score]
- Tags: [2-3 relevant tags]

Format:
INSIGHT 1:
Title: [title]
Summary: [summary]
Significance: [significance]
Type: [type]
Relevance: [score]
Tags: [tag1, tag2]

INSIGHT 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract valuable insights from content for newsletter readers.',
      maxTokens: 1500,
    });

    if (!result.success) return [];

    return this.parseInsights(result.data.content, items);
  }

  /**
   * Analyze trends across content
   */
  async analyzeTrends(
    items: ContentItem[],
    options: { timeframe: string; focusAreas: string[] }
  ): Promise<TrendAnalysis[]> {
    const contentSummary = items
      .slice(0, 15)
      .map(item => item.title + ': ' + item.content.substring(0, 200))
      .join('\n');

    const prompt = `Identify emerging trends from this ${options.timeframe} content:

${contentSummary}

Identify 3-5 trends. For each:
- Trend name
- Direction (rising/stable/declining)
- Confidence (0.0-1.0)
- Evidence (2-3 supporting points)
- Implications (what this means for readers)

Format:
TREND 1:
Name: [trend name]
Direction: [rising/stable/declining]
Confidence: [score]
Evidence: [point 1]; [point 2]
Implications: [implication 1]; [implication 2]

TREND 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify and analyze trends in content.',
      maxTokens: 800,
    });

    if (!result.success) return [];

    return this.parseTrends(result.data.content);
  }

  /**
   * Extract highlights/quotable content
   */
  async extractHighlights(
    items: ContentItem[],
    options: { maxInsights: number }
  ): Promise<string[]> {
    const contentSummary = items
      .slice(0, 10)
      .map(item => item.content.substring(0, 300))
      .join('\n\n');

    const prompt = `Extract ${Math.min(5, options.maxInsights)} notable highlights or quotable statements from this content:

${contentSummary}

Return a list of highlights that would be valuable to share or remember.

Format:
- [highlight 1]
- [highlight 2]
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify memorable highlights from content.',
      maxTokens: 400,
    });

    if (!result.success) return [];

    return result.data.content
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .map(line => line.replace(/^-\s*/, '').trim())
      .filter(line => line.length > 10);
  }

  /**
   * Generate summary of insights
   */
  async generateSummary(
    insights: ExtractedInsight[],
    trends: TrendAnalysis[],
    options: { timeframe: string; audienceLevel: string }
  ): Promise<string> {
    const topInsights = insights.slice(0, 3).map(i => i.title).join(', ');
    const topTrends = trends.slice(0, 2).map(t => t.trend).join(', ');

    const prompt = `Write a brief executive summary of this ${options.timeframe} insight report:

TOP INSIGHTS: ${topInsights}
KEY TRENDS: ${topTrends}
AUDIENCE: ${options.audienceLevel}

Requirements:
- 3-4 sentences
- Highlight the most important takeaway
- Mention key trends
- End with forward-looking statement

Return ONLY the summary.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write concise executive summaries.',
      maxTokens: 200,
    });

    return result.success
      ? result.data.content.trim()
      : 'This report highlights key insights and emerging trends from recent content.';
  }

  /**
   * Extract insights for specific category
   */
  async extractCategoryInsights(
    items: ContentItem[],
    category: string
  ): Promise<ExtractedInsight[]> {
    const categoryItems = items.filter(
      item => item.category?.toLowerCase() === category.toLowerCase() ||
              item.tags?.some(t => t.toLowerCase() === category.toLowerCase())
    );

    if (categoryItems.length === 0) {
      return [];
    }

    return this.extractMainInsights(categoryItems, {
      maxInsights: 5,
      focusAreas: [category],
      audienceLevel: 'intermediate',
    });
  }

  /**
   * Compare insights across time periods
   */
  async compareInsights(
    currentInsights: ExtractedInsight[],
    previousInsights: ExtractedInsight[]
  ): Promise<{
    new: ExtractedInsight[];
    continued: ExtractedInsight[];
    resolved: ExtractedInsight[];
  }> {
    const previousTitles = new Set(previousInsights.map(i => i.title.toLowerCase()));
    const currentTitles = new Set(currentInsights.map(i => i.title.toLowerCase()));

    return {
      new: currentInsights.filter(i => !previousTitles.has(i.title.toLowerCase())),
      continued: currentInsights.filter(i => previousTitles.has(i.title.toLowerCase())),
      resolved: previousInsights.filter(i => !currentTitles.has(i.title.toLowerCase())),
    };
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  /**
   * Parse insights from AI response
   */
  private parseInsights(content: string, sourceItems: ContentItem[]): ExtractedInsight[] {
    const insights: ExtractedInsight[] = [];
    const insightRegex = /INSIGHT \d+:\s*\nTitle:\s*(.+?)\s*\nSummary:\s*(.+?)\s*\nSignificance:\s*(.+?)\s*\nType:\s*(trend|breakthrough|analysis|prediction|opinion)\s*\nRelevance:\s*([\d.]+)\s*\nTags:\s*(.+?)(?=\nINSIGHT|\n$|$)/gis;
    let match: RegExpExecArray | null;

    while ((match = insightRegex.exec(content)) !== null) {
      const currentMatch = match;
      const tags = currentMatch[6].split(',').map(t => t.trim()).filter(t => t.length > 0);

      // Find source items that might relate to this insight
      const sources = sourceItems
        .filter(item =>
          item.title.toLowerCase().includes(currentMatch[1].toLowerCase().split(' ')[0]) ||
          tags.some(tag => item.tags?.includes(tag))
        )
        .map(item => item.source ?? item.url ?? item.title)
        .slice(0, 3);

      insights.push({
        id: crypto.randomUUID(),
        title: currentMatch[1].trim(),
        summary: currentMatch[2].trim(),
        significance: currentMatch[3].trim(),
        type: currentMatch[4].toLowerCase() as ExtractedInsight['type'],
        relevance: parseFloat(currentMatch[5]) || 0.5,
        sources: sources.length > 0 ? sources : ['Curated content'],
        tags,
      });
    }

    return insights;
  }

  /**
   * Parse trends from AI response
   */
  private parseTrends(content: string): TrendAnalysis[] {
    const trends: TrendAnalysis[] = [];
    const trendRegex = /TREND \d+:\s*\nName:\s*(.+?)\s*\nDirection:\s*(rising|stable|declining)\s*\nConfidence:\s*([\d.]+)\s*\nEvidence:\s*(.+?)\s*\nImplications:\s*(.+?)(?=\nTREND|\n$|$)/gis;
    let match;

    while ((match = trendRegex.exec(content)) !== null) {
      trends.push({
        trend: match[1].trim(),
        direction: match[2].toLowerCase() as TrendAnalysis['direction'],
        confidence: parseFloat(match[3]) || 0.5,
        evidence: match[4].split(';').map(e => e.trim()).filter(e => e.length > 0),
        implications: match[5].split(';').map(i => i.trim()).filter(i => i.length > 0),
      });
    }

    return trends;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Format timeframe for display
   */
  private formatTimeframe(timeframe: string): string {
    const now = new Date();
    switch (timeframe) {
      case 'daily':
        return now.toLocaleDateString();
      case 'weekly':
        return `Week of ${now.toLocaleDateString()}`;
      case 'monthly':
        return now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      default:
        return now.toLocaleDateString();
    }
  }

  /**
   * Format insights as markdown
   */
  formatAsMarkdown(report: InsightReport): string {
    const lines: string[] = [
      `# ${report.title}`,
      '',
      '## Executive Summary',
      '',
      report.summary,
      '',
    ];

    if (report.insights.length > 0) {
      lines.push('## Key Insights', '');
      for (const insight of report.insights) {
        lines.push(`### ${insight.title}`);
        lines.push('');
        lines.push(insight.summary);
        lines.push('');
        lines.push(`**Why it matters:** ${insight.significance}`);
        lines.push('');
        lines.push(`_Type: ${insight.type} | Relevance: ${(insight.relevance * 100).toFixed(0)}%_`);
        lines.push('');
      }
    }

    if (report.trends.length > 0) {
      lines.push('## Emerging Trends', '');
      for (const trend of report.trends) {
        const arrow = trend.direction === 'rising' ? '↑' : trend.direction === 'declining' ? '↓' : '→';
        lines.push(`### ${arrow} ${trend.trend}`);
        lines.push('');
        lines.push(`**Evidence:**`);
        for (const evidence of trend.evidence) {
          lines.push(`- ${evidence}`);
        }
        lines.push('');
        lines.push(`**Implications:**`);
        for (const implication of trend.implications) {
          lines.push(`- ${implication}`);
        }
        lines.push('');
      }
    }

    if (report.highlights.length > 0) {
      lines.push('## Highlights', '');
      for (const highlight of report.highlights) {
        lines.push(`> ${highlight}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createInsightExtractor(
  contentGenerator: ContentGeneratorProvider
): InsightExtractorService {
  return new InsightExtractorService(contentGenerator);
}
