/**
 * Content Creator Suite - Show Notes Generator
 *
 * Generates comprehensive show notes from podcast transcriptions.
 */

import type {
  PodcastTranscription,
  ShowNotes,
  TimestampEntry,
  Resource,
  Quote,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface ShowNotesGenerationOptions {
  includeSummary?: boolean;
  includeTakeaways?: boolean;
  includeTimestamps?: boolean;
  includeResources?: boolean;
  includeQuotes?: boolean;
  maxTakeaways?: number;
  maxResources?: number;
  maxQuotes?: number;
}

export interface GeneratedShowNotes extends ShowNotes {
  generatedAt: number;
  wordCount: number;
}

// =============================================================================
// Show Notes Generator Service
// =============================================================================

export class ShowNotesGeneratorService {
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Generate comprehensive show notes
   */
  async generateShowNotes(
    transcription: PodcastTranscription,
    options?: ShowNotesGenerationOptions
  ): Promise<GeneratedShowNotes> {
    const opts = {
      includeSummary: options?.includeSummary ?? true,
      includeTakeaways: options?.includeTakeaways ?? true,
      includeTimestamps: options?.includeTimestamps ?? true,
      includeResources: options?.includeResources ?? true,
      includeQuotes: options?.includeQuotes ?? true,
      maxTakeaways: options?.maxTakeaways ?? 5,
      maxResources: options?.maxResources ?? 5,
      maxQuotes: options?.maxQuotes ?? 5,
    };

    const fullText = transcription.segments.map(s => s.text).join(' ');

    // Generate components in parallel
    const [summary, keyTakeaways, timestamps, resources, quotes] = await Promise.all([
      opts.includeSummary ? this.generateSummary(transcription.episodeTitle, fullText) : Promise.resolve(''),
      opts.includeTakeaways ? this.generateKeyTakeaways(fullText, opts.maxTakeaways) : Promise.resolve([]),
      opts.includeTimestamps ? this.generateTimestamps(transcription) : Promise.resolve([]),
      opts.includeResources ? this.generateResources(fullText, opts.maxResources) : Promise.resolve([]),
      opts.includeQuotes ? this.extractQuotes(transcription, opts.maxQuotes) : Promise.resolve([]),
    ]);

    const showNotes: GeneratedShowNotes = {
      summary,
      keyTakeaways,
      timestamps,
      resources,
      quotes,
      generatedAt: Date.now(),
      wordCount: this.countWords(summary) + keyTakeaways.join(' ').length,
    };

    this.emit(CONTENT_EVENTS.SHOW_NOTES_GENERATED, {
      episodeTitle: transcription.episodeTitle,
      takeawayCount: keyTakeaways.length,
      timestampCount: timestamps.length,
    });

    return showNotes;
  }

  /**
   * Generate episode summary
   */
  private async generateSummary(title: string, content: string): Promise<string> {
    const prompt = `Write a compelling summary for this podcast episode:

TITLE: ${title}

TRANSCRIPT (excerpt):
${content.substring(0, 5000)}${content.length > 5000 ? '...' : ''}

Requirements:
- 2-3 paragraphs
- Highlight the main topic and key discussions
- Mention notable insights or revelations
- Make it engaging for potential listeners

Return ONLY the summary.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You write engaging podcast summaries that entice listeners.',
      maxTokens: 500,
    });

    return result.success ? result.data.content.trim() : '';
  }

  /**
   * Generate key takeaways
   */
  private async generateKeyTakeaways(content: string, maxTakeaways: number): Promise<string[]> {
    const prompt = `Extract the ${maxTakeaways} most important takeaways from this podcast transcript:

${content.substring(0, 6000)}${content.length > 6000 ? '...' : ''}

Requirements:
- Each takeaway should be actionable or insightful
- Keep each point to 1-2 sentences
- Focus on unique value the listener can gain

Format as a numbered list:
1. [takeaway]
2. [takeaway]
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract valuable insights from podcast content.',
      maxTokens: 600,
    });

    if (!result.success) return [];

    const lines = result.data.content.split('\n');
    return lines
      .filter(l => /^\d+[\.\)]/.test(l.trim()))
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 10)
      .slice(0, maxTakeaways);
  }

  /**
   * Generate timestamps from transcription
   */
  private async generateTimestamps(transcription: PodcastTranscription): Promise<TimestampEntry[]> {
    // Group segments by topic/speaker changes
    const timestamps: TimestampEntry[] = [];
    const segments = transcription.segments;

    if (segments.length === 0) return timestamps;

    // Use AI to identify key moments
    const segmentTexts = segments.map((s, i) => ({
      index: i,
      time: s.startTime,
      text: s.text.substring(0, 200),
    }));

    const sampleSegments = segmentTexts.filter((_, i) =>
      i % Math.max(1, Math.floor(segmentTexts.length / 20)) === 0
    ).slice(0, 20);

    const prompt = `Identify key moments in this podcast based on these transcript excerpts:

${sampleSegments.map(s => `[${this.formatTime(s.time)}] ${s.text}`).join('\n\n')}

For each key moment, provide:
- Timestamp
- A short label (3-5 words)
- Optional brief description

Format:
TIME: [MM:SS]
LABEL: [label]
DESCRIPTION: [optional description]

---

Identify 8-12 key moments.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify key moments in podcast episodes for timestamps.',
      maxTokens: 800,
    });

    if (!result.success) return timestamps;

    // Parse the response
    const momentRegex = /TIME:\s*(\d+:\d+)(?::\d+)?\s*\nLABEL:\s*(.+?)(?:\nDESCRIPTION:\s*(.+?))?(?=\n---|$)/gis;
    let match;

    while ((match = momentRegex.exec(result.data.content)) !== null) {
      const timeParts = match[1].split(':').map(p => parseInt(p, 10));
      const time = timeParts.length === 2
        ? timeParts[0] * 60 + timeParts[1]
        : timeParts[0] * 3600 + timeParts[1] * 60 + (timeParts[2] ?? 0);

      timestamps.push({
        time,
        label: match[2].trim(),
        description: match[3]?.trim(),
      });
    }

    return timestamps.sort((a, b) => a.time - b.time);
  }

  /**
   * Generate suggested resources
   */
  private async generateResources(content: string, maxResources: number): Promise<Resource[]> {
    const prompt = `Based on this podcast transcript, suggest ${maxResources} relevant resources that listeners might find valuable:

${content.substring(0, 4000)}${content.length > 4000 ? '...' : ''}

For each resource, provide:
- Title/Name
- Brief description (1 sentence)
- Category (book, tool, website, course, etc.)

Format:
RESOURCE 1:
Title: [title]
Description: [description]
Category: [category]

RESOURCE 2:
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You suggest relevant resources based on podcast content.',
      maxTokens: 600,
    });

    if (!result.success) return [];

    const resources: Resource[] = [];
    const resourceRegex = /RESOURCE\s*\d+:\s*\nTitle:\s*(.+?)\s*\nDescription:\s*(.+?)(?:\s*\nCategory:\s*(.+?))?(?=\nRESOURCE|$)/gis;
    let match;

    while ((match = resourceRegex.exec(result.data.content)) !== null) {
      resources.push({
        title: match[1].trim(),
        description: match[2].trim(),
      });

      if (resources.length >= maxResources) break;
    }

    return resources;
  }

  /**
   * Extract notable quotes from transcription
   */
  private async extractQuotes(
    transcription: PodcastTranscription,
    maxQuotes: number
  ): Promise<Quote[]> {
    const fullText = transcription.segments
      .map(s => `[${s.speakerId}] ${s.text}`)
      .join('\n');

    const prompt = `Extract the ${maxQuotes} most quotable moments from this podcast transcript:

${fullText.substring(0, 5000)}${fullText.length > 5000 ? '...' : ''}

Look for:
- Insightful statements
- Memorable phrases
- Surprising revelations
- Motivational or inspiring moments

Format each quote as:
QUOTE: "[quote text]"
SPEAKER: [speaker if known]

---`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify quotable moments in podcast episodes.',
      maxTokens: 600,
    });

    if (!result.success) return [];

    const quotes: Quote[] = [];
    const quoteRegex = /QUOTE:\s*"(.+?)"\s*\nSPEAKER:\s*(.+?)(?=\n---|$)/gis;
    let match;

    while ((match = quoteRegex.exec(result.data.content)) !== null) {
      // Find the timestamp for this quote
      const quoteText = match[1].trim().toLowerCase();
      const segment = transcription.segments.find(s =>
        s.text.toLowerCase().includes(quoteText.substring(0, 30))
      );

      quotes.push({
        text: match[1].trim(),
        speaker: match[2].trim(),
        timestamp: segment?.startTime ?? 0,
      });

      if (quotes.length >= maxQuotes) break;
    }

    return quotes;
  }

  /**
   * Format show notes as markdown
   */
  formatAsMarkdown(showNotes: GeneratedShowNotes, episodeTitle: string): string {
    const lines: string[] = [
      `# ${episodeTitle}`,
      '',
      '## Summary',
      '',
      showNotes.summary,
      '',
    ];

    if (showNotes.keyTakeaways.length > 0) {
      lines.push('## Key Takeaways', '');
      for (const takeaway of showNotes.keyTakeaways) {
        lines.push(`- ${takeaway}`);
      }
      lines.push('');
    }

    if (showNotes.timestamps.length > 0) {
      lines.push('## Timestamps', '');
      for (const ts of showNotes.timestamps) {
        lines.push(`- **${this.formatTime(ts.time)}** - ${ts.label}${ts.description ? `: ${ts.description}` : ''}`);
      }
      lines.push('');
    }

    if (showNotes.quotes.length > 0) {
      lines.push('## Notable Quotes', '');
      for (const quote of showNotes.quotes) {
        lines.push(`> "${quote.text}"`);
        lines.push(`> — ${quote.speaker}${quote.timestamp ? ` (${this.formatTime(quote.timestamp)})` : ''}`);
        lines.push('');
      }
    }

    if (showNotes.resources.length > 0) {
      lines.push('## Resources Mentioned', '');
      for (const resource of showNotes.resources) {
        lines.push(`- **${resource.title}**: ${resource.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Format time in seconds to MM:SS or HH:MM:SS
   */
  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Count words
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

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

export function createShowNotesGenerator(
  contentGenerator: ContentGeneratorProvider
): ShowNotesGeneratorService {
  return new ShowNotesGeneratorService(contentGenerator);
}
