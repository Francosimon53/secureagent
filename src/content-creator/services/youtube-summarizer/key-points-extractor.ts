/**
 * Content Creator Suite - Key Points Extractor
 *
 * Extracts key points, insights, quotes, and actionable items from video content.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { FetchedVideo, VideoTranscript, VideoChapter } from './video-fetcher.js';

// =============================================================================
// Types
// =============================================================================

export interface KeyPointsExtractionOptions {
  maxKeyPoints?: number;
  maxQuotes?: number;
  maxActionItems?: number;
  includeInsights?: boolean;
  includeStatistics?: boolean;
  categorize?: boolean;
}

export interface ExtractedKeyPoints {
  id: string;
  videoId: string;
  videoTitle: string;
  keyPoints: KeyPoint[];
  quotes: ExtractedQuote[];
  actionItems: ActionItem[];
  insights: Insight[];
  statistics: Statistic[];
  categories?: KeyPointCategory[];
  extractedAt: number;
}

export interface KeyPoint {
  id: string;
  text: string;
  importance: 'high' | 'medium' | 'low';
  timestamp?: number;
  category?: string;
  context?: string;
}

export interface ExtractedQuote {
  id: string;
  text: string;
  speaker?: string;
  timestamp?: number;
  significance: string;
}

export interface ActionItem {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  category?: string;
  timestamp?: number;
}

export interface Insight {
  id: string;
  text: string;
  type: 'observation' | 'conclusion' | 'prediction' | 'recommendation';
  supporting_point?: string;
}

export interface Statistic {
  id: string;
  value: string;
  context: string;
  timestamp?: number;
}

export interface KeyPointCategory {
  name: string;
  keyPointIds: string[];
}

// =============================================================================
// Key Points Extractor Service
// =============================================================================

export class KeyPointsExtractorService {
  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Extract all key points and related content from a video
   */
  async extract(
    video: FetchedVideo,
    options?: KeyPointsExtractionOptions
  ): Promise<ServiceResult<ExtractedKeyPoints>> {
    const opts = {
      maxKeyPoints: options?.maxKeyPoints ?? 10,
      maxQuotes: options?.maxQuotes ?? 5,
      maxActionItems: options?.maxActionItems ?? 5,
      includeInsights: options?.includeInsights ?? true,
      includeStatistics: options?.includeStatistics ?? true,
      categorize: options?.categorize ?? true,
    };

    if (!video.transcript) {
      return { success: false, error: 'No transcript available for extraction' };
    }

    try {
      // Extract different types of content in parallel
      const [keyPoints, quotes, actionItems, insights, statistics] = await Promise.all([
        this.extractKeyPoints(video, opts.maxKeyPoints),
        this.extractQuotes(video, opts.maxQuotes),
        this.extractActionItems(video, opts.maxActionItems),
        opts.includeInsights ? this.extractInsights(video) : Promise.resolve([]),
        opts.includeStatistics ? this.extractStatistics(video) : Promise.resolve([]),
      ]);

      // Categorize key points if requested
      let categories: KeyPointCategory[] | undefined;
      if (opts.categorize && keyPoints.length > 0) {
        categories = await this.categorizeKeyPoints(keyPoints);
      }

      const result: ExtractedKeyPoints = {
        id: crypto.randomUUID(),
        videoId: video.video.id,
        videoTitle: video.video.title,
        keyPoints,
        quotes,
        actionItems,
        insights,
        statistics,
        categories,
        extractedAt: Date.now(),
      };

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract key points';
      return { success: false, error: message };
    }
  }

  /**
   * Extract only key points
   */
  async extractKeyPoints(
    video: FetchedVideo,
    maxPoints: number = 10
  ): Promise<KeyPoint[]> {
    if (!video.transcript) return [];

    const prompt = `Extract the ${maxPoints} most important key points from this video transcript:

VIDEO TITLE: ${video.video.title}

TRANSCRIPT:
${video.transcript.text.substring(0, 8000)}${video.transcript.text.length > 8000 ? '...' : ''}

For each key point, provide:
- The key point text (clear, concise statement)
- Importance level (high/medium/low)
- Brief context (why this matters)

Format:
KEY POINT 1:
Text: [key point]
Importance: [high/medium/low]
Context: [brief context]

KEY POINT 2:
...

Extract only substantive, valuable points - no filler.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract key points from educational content.',
      maxTokens: 1200,
    });

    if (!result.success) return [];

    return this.parseKeyPoints(result.data.content);
  }

  /**
   * Extract notable quotes
   */
  async extractQuotes(
    video: FetchedVideo,
    maxQuotes: number = 5
  ): Promise<ExtractedQuote[]> {
    if (!video.transcript) return [];

    const prompt = `Extract the ${maxQuotes} most quotable statements from this video:

VIDEO TITLE: ${video.video.title}

TRANSCRIPT:
${video.transcript.text.substring(0, 8000)}${video.transcript.text.length > 8000 ? '...' : ''}

Look for:
- Memorable phrases
- Insightful statements
- Surprising or counterintuitive claims
- Well-articulated ideas

Format:
QUOTE 1:
Text: "[exact quote]"
Speaker: [if identifiable]
Significance: [why this quote matters]

QUOTE 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify quotable moments in content.',
      maxTokens: 800,
    });

    if (!result.success) return [];

    return this.parseQuotes(result.data.content);
  }

  /**
   * Extract action items
   */
  async extractActionItems(
    video: FetchedVideo,
    maxItems: number = 5
  ): Promise<ActionItem[]> {
    if (!video.transcript) return [];

    const prompt = `Extract actionable recommendations from this video:

VIDEO TITLE: ${video.video.title}

TRANSCRIPT:
${video.transcript.text.substring(0, 8000)}${video.transcript.text.length > 8000 ? '...' : ''}

Identify up to ${maxItems} action items the viewer could take based on this content.

Format:
ACTION 1:
Text: [specific action to take]
Priority: [high/medium/low]
Category: [e.g., learning, implementation, research]

ACTION 2:
...

Focus on practical, specific actions.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract actionable takeaways from content.',
      maxTokens: 600,
    });

    if (!result.success) return [];

    return this.parseActionItems(result.data.content);
  }

  /**
   * Extract insights
   */
  async extractInsights(video: FetchedVideo): Promise<Insight[]> {
    if (!video.transcript) return [];

    const prompt = `Identify key insights from this video:

VIDEO TITLE: ${video.video.title}

TRANSCRIPT:
${video.transcript.text.substring(0, 8000)}${video.transcript.text.length > 8000 ? '...' : ''}

Extract 3-5 insights. For each, identify:
- The insight itself
- Type: observation, conclusion, prediction, or recommendation
- Supporting point from the video

Format:
INSIGHT 1:
Text: [insight]
Type: [observation/conclusion/prediction/recommendation]
Supporting: [brief supporting point]

INSIGHT 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify insights and patterns in content.',
      maxTokens: 600,
    });

    if (!result.success) return [];

    return this.parseInsights(result.data.content);
  }

  /**
   * Extract statistics and data points
   */
  async extractStatistics(video: FetchedVideo): Promise<Statistic[]> {
    if (!video.transcript) return [];

    const prompt = `Extract any statistics, numbers, or data points mentioned in this video:

VIDEO TITLE: ${video.video.title}

TRANSCRIPT:
${video.transcript.text.substring(0, 8000)}${video.transcript.text.length > 8000 ? '...' : ''}

Look for:
- Percentages
- Specific numbers
- Research findings
- Comparative data

Format:
STAT 1:
Value: [the statistic/number]
Context: [what this refers to]

STAT 2:
...

Only include actual data points mentioned in the video.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract data and statistics from content.',
      maxTokens: 500,
    });

    if (!result.success) return [];

    return this.parseStatistics(result.data.content);
  }

  /**
   * Categorize key points
   */
  async categorizeKeyPoints(keyPoints: KeyPoint[]): Promise<KeyPointCategory[]> {
    if (keyPoints.length < 3) return [];

    const pointsList = keyPoints.map((p, i) => `${i + 1}. ${p.text}`).join('\n');

    const prompt = `Group these key points into 2-4 logical categories:

${pointsList}

Format:
CATEGORY: [category name]
Points: [comma-separated point numbers, e.g., 1, 3, 5]

CATEGORY: [category name]
Points: [numbers]
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You organize information into logical categories.',
      maxTokens: 300,
    });

    if (!result.success) return [];

    const categories: KeyPointCategory[] = [];
    const categoryRegex = /CATEGORY:\s*(.+?)\s*\nPoints:\s*(.+?)(?=\nCATEGORY:|$)/gis;
    let match;

    while ((match = categoryRegex.exec(result.data.content)) !== null) {
      const name = match[1].trim();
      const pointNumbers = match[2].split(',').map(n => parseInt(n.trim()) - 1);
      const keyPointIds = pointNumbers
        .filter(n => n >= 0 && n < keyPoints.length)
        .map(n => keyPoints[n].id);

      if (keyPointIds.length > 0) {
        categories.push({ name, keyPointIds });
      }
    }

    return categories;
  }

  /**
   * Extract key points for specific chapters
   */
  async extractKeyPointsByChapter(
    video: FetchedVideo
  ): Promise<Map<string, KeyPoint[]>> {
    const result = new Map<string, KeyPoint[]>();

    if (!video.transcript || !video.chapters || video.chapters.length === 0) {
      return result;
    }

    for (const chapter of video.chapters) {
      const chapterTranscript = this.extractChapterTranscript(
        video.transcript,
        chapter.startTime,
        chapter.endTime
      );

      if (chapterTranscript.length > 100) {
        const prompt = `Extract 2-3 key points from this section:

SECTION: ${chapter.title}

TRANSCRIPT:
${chapterTranscript.substring(0, 2000)}

Format:
- [key point 1]
- [key point 2]
...`;

        const aiResult = await this.contentGenerator.generate({
          prompt,
          systemPrompt: 'You extract key points concisely.',
          maxTokens: 200,
        });

        if (aiResult.success) {
          const points = aiResult.data.content
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => ({
              id: crypto.randomUUID(),
              text: line.replace(/^-\s*/, '').trim(),
              importance: 'medium' as const,
              timestamp: chapter.startTime,
            }));

          if (points.length > 0) {
            result.set(chapter.title, points);
          }
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  /**
   * Parse key points from AI response
   */
  private parseKeyPoints(content: string): KeyPoint[] {
    const points: KeyPoint[] = [];
    const pointRegex = /KEY POINT \d+:\s*\nText:\s*(.+?)\s*\nImportance:\s*(high|medium|low)\s*(?:\nContext:\s*(.+?))?(?=\nKEY POINT|\n$|$)/gis;
    let match;

    while ((match = pointRegex.exec(content)) !== null) {
      points.push({
        id: crypto.randomUUID(),
        text: match[1].trim(),
        importance: match[2].toLowerCase() as 'high' | 'medium' | 'low',
        context: match[3]?.trim(),
      });
    }

    return points;
  }

  /**
   * Parse quotes from AI response
   */
  private parseQuotes(content: string): ExtractedQuote[] {
    const quotes: ExtractedQuote[] = [];
    const quoteRegex = /QUOTE \d+:\s*\nText:\s*"?(.+?)"?\s*\n(?:Speaker:\s*(.+?)\s*\n)?Significance:\s*(.+?)(?=\nQUOTE|\n$|$)/gis;
    let match;

    while ((match = quoteRegex.exec(content)) !== null) {
      quotes.push({
        id: crypto.randomUUID(),
        text: match[1].trim().replace(/^"|"$/g, ''),
        speaker: match[2]?.trim(),
        significance: match[3].trim(),
      });
    }

    return quotes;
  }

  /**
   * Parse action items from AI response
   */
  private parseActionItems(content: string): ActionItem[] {
    const items: ActionItem[] = [];
    const actionRegex = /ACTION \d+:\s*\nText:\s*(.+?)\s*\nPriority:\s*(high|medium|low)\s*(?:\nCategory:\s*(.+?))?(?=\nACTION|\n$|$)/gis;
    let match;

    while ((match = actionRegex.exec(content)) !== null) {
      items.push({
        id: crypto.randomUUID(),
        text: match[1].trim(),
        priority: match[2].toLowerCase() as 'high' | 'medium' | 'low',
        category: match[3]?.trim(),
      });
    }

    return items;
  }

  /**
   * Parse insights from AI response
   */
  private parseInsights(content: string): Insight[] {
    const insights: Insight[] = [];
    const insightRegex = /INSIGHT \d+:\s*\nText:\s*(.+?)\s*\nType:\s*(observation|conclusion|prediction|recommendation)\s*(?:\nSupporting:\s*(.+?))?(?=\nINSIGHT|\n$|$)/gis;
    let match;

    while ((match = insightRegex.exec(content)) !== null) {
      insights.push({
        id: crypto.randomUUID(),
        text: match[1].trim(),
        type: match[2].toLowerCase() as Insight['type'],
        supporting_point: match[3]?.trim(),
      });
    }

    return insights;
  }

  /**
   * Parse statistics from AI response
   */
  private parseStatistics(content: string): Statistic[] {
    const stats: Statistic[] = [];
    const statRegex = /STAT \d+:\s*\nValue:\s*(.+?)\s*\nContext:\s*(.+?)(?=\nSTAT|\n$|$)/gis;
    let match;

    while ((match = statRegex.exec(content)) !== null) {
      stats.push({
        id: crypto.randomUUID(),
        value: match[1].trim(),
        context: match[2].trim(),
      });
    }

    return stats;
  }

  /**
   * Extract transcript for a time range
   */
  private extractChapterTranscript(
    transcript: VideoTranscript,
    startTime: number,
    endTime: number
  ): string {
    const segments = transcript.segments.filter(
      s => s.startTime >= startTime && s.startTime < endTime
    );
    return segments.map(s => s.text).join(' ');
  }

  // ===========================================================================
  // Formatting Methods
  // ===========================================================================

  /**
   * Format extracted content as markdown
   */
  formatAsMarkdown(extracted: ExtractedKeyPoints): string {
    const lines: string[] = [
      `# Key Points: ${extracted.videoTitle}`,
      '',
    ];

    // Key Points
    if (extracted.keyPoints.length > 0) {
      lines.push('## Key Points', '');
      for (const point of extracted.keyPoints) {
        const importance = point.importance === 'high' ? '**' : '';
        lines.push(`- ${importance}${point.text}${importance}`);
        if (point.context) {
          lines.push(`  - _${point.context}_`);
        }
      }
      lines.push('');
    }

    // Quotes
    if (extracted.quotes.length > 0) {
      lines.push('## Notable Quotes', '');
      for (const quote of extracted.quotes) {
        lines.push(`> "${quote.text}"`);
        if (quote.speaker) {
          lines.push(`> — ${quote.speaker}`);
        }
        lines.push('');
      }
    }

    // Action Items
    if (extracted.actionItems.length > 0) {
      lines.push('## Action Items', '');
      for (const item of extracted.actionItems) {
        const priority = item.priority === 'high' ? '[!] ' : '';
        lines.push(`- ${priority}${item.text}`);
      }
      lines.push('');
    }

    // Insights
    if (extracted.insights.length > 0) {
      lines.push('## Insights', '');
      for (const insight of extracted.insights) {
        lines.push(`- **${insight.type}**: ${insight.text}`);
      }
      lines.push('');
    }

    // Statistics
    if (extracted.statistics.length > 0) {
      lines.push('## Data Points', '');
      for (const stat of extracted.statistics) {
        lines.push(`- ${stat.value}: ${stat.context}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createKeyPointsExtractor(
  contentGenerator: ContentGeneratorProvider
): KeyPointsExtractorService {
  return new KeyPointsExtractorService(contentGenerator);
}
