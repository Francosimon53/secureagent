/**
 * Content Creator Suite - YouTube Video Summarizer
 *
 * Generates comprehensive summaries from YouTube video transcripts.
 */

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { FetchedVideo, VideoTranscript, VideoChapter } from './video-fetcher.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface SummaryOptions {
  style?: 'brief' | 'detailed' | 'bullet_points' | 'executive';
  maxLength?: number;
  includeTimestamps?: boolean;
  focusTopics?: string[];
  targetAudience?: string;
}

export interface VideoSummary {
  id: string;
  videoId: string;
  videoTitle: string;
  summary: string;
  style: SummaryOptions['style'];
  sections?: SummarySection[];
  wordCount: number;
  generatedAt: number;
}

export interface SummarySection {
  title: string;
  content: string;
  startTime?: number;
  endTime?: number;
}

// =============================================================================
// Summarizer Service
// =============================================================================

export class SummarizerService {
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(private readonly contentGenerator: ContentGeneratorProvider) {}

  /**
   * Generate a summary from a fetched video
   */
  async summarize(
    video: FetchedVideo,
    options?: SummaryOptions
  ): Promise<ServiceResult<VideoSummary>> {
    const opts = {
      style: options?.style ?? 'detailed',
      maxLength: options?.maxLength ?? 500,
      includeTimestamps: options?.includeTimestamps ?? true,
      focusTopics: options?.focusTopics ?? [],
      targetAudience: options?.targetAudience ?? 'general audience',
    };

    if (!video.transcript) {
      return { success: false, error: 'No transcript available for this video' };
    }

    this.emit(CONTENT_EVENTS.YOUTUBE_SUMMARY_STARTED, {
      videoId: video.video.id,
      title: video.video.title,
      style: opts.style,
    });

    try {
      let summary: VideoSummary;

      switch (opts.style) {
        case 'brief':
          summary = await this.generateBriefSummary(video, opts);
          break;
        case 'bullet_points':
          summary = await this.generateBulletPointSummary(video, opts);
          break;
        case 'executive':
          summary = await this.generateExecutiveSummary(video, opts);
          break;
        case 'detailed':
        default:
          summary = await this.generateDetailedSummary(video, opts);
          break;
      }

      this.emit(CONTENT_EVENTS.YOUTUBE_SUMMARY_COMPLETED, {
        videoId: video.video.id,
        title: video.video.title,
        wordCount: summary.wordCount,
      });

      return { success: true, data: summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate summary';
      this.emit(CONTENT_EVENTS.CONTENT_FAILED, {
        videoId: video.video.id,
        error: message,
        source: 'youtube-summary',
      });
      return { success: false, error: message };
    }
  }

  /**
   * Summarize by chapters
   */
  async summarizeByChapters(
    video: FetchedVideo,
    options?: SummaryOptions
  ): Promise<ServiceResult<VideoSummary>> {
    if (!video.transcript) {
      return { success: false, error: 'No transcript available' };
    }

    if (!video.chapters || video.chapters.length === 0) {
      // Fall back to regular summary
      return this.summarize(video, options);
    }

    const opts = {
      style: options?.style ?? 'detailed',
      maxLength: options?.maxLength ?? 800,
      includeTimestamps: options?.includeTimestamps ?? true,
    };

    try {
      const sections: SummarySection[] = [];

      for (const chapter of video.chapters) {
        const chapterTranscript = this.extractChapterTranscript(
          video.transcript,
          chapter.startTime,
          chapter.endTime
        );

        if (chapterTranscript.length > 50) {
          const sectionSummary = await this.summarizeChapter(
            chapter.title,
            chapterTranscript,
            opts
          );

          sections.push({
            title: chapter.title,
            content: sectionSummary,
            startTime: chapter.startTime,
            endTime: chapter.endTime,
          });
        }
      }

      const fullSummary = sections.map(s => `**${s.title}**\n${s.content}`).join('\n\n');

      const summary: VideoSummary = {
        id: crypto.randomUUID(),
        videoId: video.video.id,
        videoTitle: video.video.title,
        summary: fullSummary,
        style: opts.style,
        sections,
        wordCount: this.countWords(fullSummary),
        generatedAt: Date.now(),
      };

      return { success: true, data: summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate chapter summary';
      return { success: false, error: message };
    }
  }

  // ===========================================================================
  // Summary Generation Methods
  // ===========================================================================

  /**
   * Generate a brief summary (1-2 paragraphs)
   */
  private async generateBriefSummary(
    video: FetchedVideo,
    options: Required<Omit<SummaryOptions, 'focusTopics' | 'targetAudience'>> & {
      focusTopics: string[];
      targetAudience: string;
    }
  ): Promise<VideoSummary> {
    const transcript = video.transcript!;
    const focusSection = options.focusTopics.length > 0
      ? `\nFocus on these topics: ${options.focusTopics.join(', ')}`
      : '';

    const prompt = `Summarize this YouTube video in 2-3 sentences:

VIDEO TITLE: ${video.video.title}
CHANNEL: ${video.video.channelTitle}

TRANSCRIPT:
${transcript.text.substring(0, 8000)}${transcript.text.length > 8000 ? '...' : ''}
${focusSection}

Write a concise summary (max ${options.maxLength} words) that captures the main point.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You create concise video summaries.',
      maxTokens: 300,
    });

    const summaryText = result.success ? result.data.content.trim() : 'Summary unavailable.';

    return {
      id: crypto.randomUUID(),
      videoId: video.video.id,
      videoTitle: video.video.title,
      summary: summaryText,
      style: 'brief',
      wordCount: this.countWords(summaryText),
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate a detailed summary (multiple paragraphs)
   */
  private async generateDetailedSummary(
    video: FetchedVideo,
    options: Required<Omit<SummaryOptions, 'focusTopics' | 'targetAudience'>> & {
      focusTopics: string[];
      targetAudience: string;
    }
  ): Promise<VideoSummary> {
    const transcript = video.transcript!;
    const focusSection = options.focusTopics.length > 0
      ? `\nFocus on these topics: ${options.focusTopics.join(', ')}`
      : '';

    const chaptersSection = video.chapters && video.chapters.length > 0
      ? `\nVIDEO CHAPTERS:\n${video.chapters.map(c => `- ${this.formatTime(c.startTime)}: ${c.title}`).join('\n')}`
      : '';

    const prompt = `Create a comprehensive summary of this YouTube video:

VIDEO TITLE: ${video.video.title}
CHANNEL: ${video.video.channelTitle}
DURATION: ${this.formatDuration(video.video.duration)}
${chaptersSection}

TRANSCRIPT:
${transcript.text.substring(0, 10000)}${transcript.text.length > 10000 ? '...' : ''}
${focusSection}

TARGET AUDIENCE: ${options.targetAudience}

Requirements:
1. Start with a brief overview (1-2 sentences)
2. Cover all major topics discussed
3. Highlight key insights and takeaways
4. ${options.includeTimestamps && video.chapters ? 'Include timestamps for major sections' : 'Organize by topic'}
5. Keep it around ${options.maxLength} words

Format the summary with clear sections and paragraphs.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You create detailed, well-organized video summaries.',
      maxTokens: 1000,
    });

    const summaryText = result.success ? result.data.content.trim() : 'Summary unavailable.';

    return {
      id: crypto.randomUUID(),
      videoId: video.video.id,
      videoTitle: video.video.title,
      summary: summaryText,
      style: 'detailed',
      wordCount: this.countWords(summaryText),
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate a bullet point summary
   */
  private async generateBulletPointSummary(
    video: FetchedVideo,
    options: Required<Omit<SummaryOptions, 'focusTopics' | 'targetAudience'>> & {
      focusTopics: string[];
      targetAudience: string;
    }
  ): Promise<VideoSummary> {
    const transcript = video.transcript!;

    const prompt = `Create a bullet-point summary of this YouTube video:

VIDEO TITLE: ${video.video.title}
CHANNEL: ${video.video.channelTitle}

TRANSCRIPT:
${transcript.text.substring(0, 8000)}${transcript.text.length > 8000 ? '...' : ''}

Requirements:
1. 8-12 key points
2. Each point should be 1-2 sentences
3. Cover main topics, insights, and takeaways
4. ${options.includeTimestamps ? 'Include approximate timestamps if identifiable' : 'No timestamps needed'}
5. Order by importance or chronologically

Format:
- [Point 1]
- [Point 2]
...`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You extract key points from video content.',
      maxTokens: 800,
    });

    const summaryText = result.success ? result.data.content.trim() : '- Summary unavailable.';

    return {
      id: crypto.randomUUID(),
      videoId: video.video.id,
      videoTitle: video.video.title,
      summary: summaryText,
      style: 'bullet_points',
      wordCount: this.countWords(summaryText),
      generatedAt: Date.now(),
    };
  }

  /**
   * Generate an executive summary
   */
  private async generateExecutiveSummary(
    video: FetchedVideo,
    options: Required<Omit<SummaryOptions, 'focusTopics' | 'targetAudience'>> & {
      focusTopics: string[];
      targetAudience: string;
    }
  ): Promise<VideoSummary> {
    const transcript = video.transcript!;

    const prompt = `Create an executive summary of this YouTube video:

VIDEO TITLE: ${video.video.title}
CHANNEL: ${video.video.channelTitle}
DURATION: ${this.formatDuration(video.video.duration)}

TRANSCRIPT:
${transcript.text.substring(0, 10000)}${transcript.text.length > 10000 ? '...' : ''}

Create a professional executive summary with these sections:

1. **Overview** (2-3 sentences)
2. **Key Points** (3-5 bullet points)
3. **Main Insights** (2-3 notable insights)
4. **Recommendations/Action Items** (if applicable)
5. **Bottom Line** (1 sentence conclusion)

Keep it concise and actionable, suitable for busy professionals.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You create professional executive summaries.',
      maxTokens: 800,
    });

    const summaryText = result.success ? result.data.content.trim() : 'Summary unavailable.';

    return {
      id: crypto.randomUUID(),
      videoId: video.video.id,
      videoTitle: video.video.title,
      summary: summaryText,
      style: 'executive',
      wordCount: this.countWords(summaryText),
      generatedAt: Date.now(),
    };
  }

  /**
   * Summarize a single chapter
   */
  private async summarizeChapter(
    chapterTitle: string,
    chapterTranscript: string,
    options: { style: SummaryOptions['style']; maxLength: number }
  ): Promise<string> {
    const prompt = `Summarize this section of a video:

SECTION: ${chapterTitle}

TRANSCRIPT:
${chapterTranscript.substring(0, 3000)}

Write a ${options.style === 'brief' ? '1-2 sentence' : '3-4 sentence'} summary.`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You summarize video sections concisely.',
      maxTokens: 200,
    });

    return result.success ? result.data.content.trim() : 'Section summary unavailable.';
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Extract transcript for a specific time range
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

  /**
   * Format time in seconds to MM:SS
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format duration
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
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

export function createSummarizer(
  contentGenerator: ContentGeneratorProvider
): SummarizerService {
  return new SummarizerService(contentGenerator);
}
