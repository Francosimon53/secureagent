/**
 * Content Creator Suite - YouTube Summarizer Service
 *
 * Main entry point for YouTube video summarization, key points extraction, and analysis.
 */

export {
  VideoFetcherService,
  createVideoFetcher,
  type VideoFetchOptions,
  type FetchedVideo,
  type VideoTranscript,
  type TranscriptSegment,
  type VideoChapter,
  type VideoComment,
} from './video-fetcher.js';

export {
  SummarizerService,
  createSummarizer,
  type SummaryOptions,
  type VideoSummary,
  type SummarySection,
} from './summarizer.js';

export {
  KeyPointsExtractorService,
  createKeyPointsExtractor,
  type KeyPointsExtractionOptions,
  type ExtractedKeyPoints,
  type KeyPoint,
  type ExtractedQuote,
  type ActionItem,
  type Insight,
  type Statistic,
  type KeyPointCategory,
} from './key-points-extractor.js';

import type { ServiceResult } from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { YouTubeProvider } from '../../providers/media/youtube.js';
import type { YouTubeConfig } from '../../config.js';

import {
  createVideoFetcher,
  type VideoFetchOptions,
  type FetchedVideo,
} from './video-fetcher.js';
import {
  createSummarizer,
  type SummaryOptions,
  type VideoSummary,
} from './summarizer.js';
import {
  createKeyPointsExtractor,
  type KeyPointsExtractionOptions,
  type ExtractedKeyPoints,
} from './key-points-extractor.js';

// =============================================================================
// Types
// =============================================================================

export interface YouTubeSummarizerServiceConfig {
  youtube?: YouTubeConfig;
}

export interface FullVideoAnalysis {
  video: FetchedVideo;
  summary: VideoSummary;
  keyPoints: ExtractedKeyPoints;
  analyzedAt: number;
}

// =============================================================================
// YouTube Summarizer Service (Facade)
// =============================================================================

export class YouTubeSummarizerService {
  public readonly videoFetcher: ReturnType<typeof createVideoFetcher>;
  public readonly summarizer: ReturnType<typeof createSummarizer>;
  public readonly keyPointsExtractor: ReturnType<typeof createKeyPointsExtractor>;

  constructor(
    private readonly youtubeProvider: YouTubeProvider,
    private readonly contentGenerator: ContentGeneratorProvider,
    config?: YouTubeSummarizerServiceConfig
  ) {
    // Initialize video fetcher
    this.videoFetcher = createVideoFetcher(youtubeProvider);

    // Initialize summarizer
    this.summarizer = createSummarizer(contentGenerator);

    // Initialize key points extractor
    this.keyPointsExtractor = createKeyPointsExtractor(contentGenerator);
  }

  // ===========================================================================
  // Full Analysis
  // ===========================================================================

  /**
   * Perform full analysis on a video (fetch + summarize + extract)
   */
  async analyzeVideo(
    videoIdOrUrl: string,
    options?: {
      fetch?: VideoFetchOptions;
      summary?: SummaryOptions;
      keyPoints?: KeyPointsExtractionOptions;
    }
  ): Promise<ServiceResult<FullVideoAnalysis>> {
    // Extract video ID if URL provided
    const videoId = this.videoFetcher.extractVideoId(videoIdOrUrl) ?? videoIdOrUrl;

    // Fetch video with transcript
    const fetchResult = await this.videoFetcher.fetchVideo(videoId, {
      includeTranscript: true,
      includeChapters: true,
      ...options?.fetch,
    });

    if (!fetchResult.success) {
      return fetchResult;
    }

    const video = fetchResult.data;

    if (!video.transcript) {
      return { success: false, error: 'No transcript available for analysis' };
    }

    // Generate summary and extract key points in parallel
    const [summaryResult, keyPointsResult] = await Promise.all([
      this.summarizer.summarize(video, options?.summary),
      this.keyPointsExtractor.extract(video, options?.keyPoints),
    ]);

    if (!summaryResult.success) {
      return summaryResult;
    }

    if (!keyPointsResult.success) {
      return keyPointsResult;
    }

    const analysis: FullVideoAnalysis = {
      video,
      summary: summaryResult.data,
      keyPoints: keyPointsResult.data,
      analyzedAt: Date.now(),
    };

    return { success: true, data: analysis };
  }

  /**
   * Quick summary - fetch and summarize only
   */
  async quickSummary(
    videoIdOrUrl: string,
    style?: SummaryOptions['style']
  ): Promise<ServiceResult<VideoSummary>> {
    const videoId = this.videoFetcher.extractVideoId(videoIdOrUrl) ?? videoIdOrUrl;

    const fetchResult = await this.videoFetcher.fetchVideo(videoId, {
      includeTranscript: true,
      includeChapters: true,
      includeComments: false,
    });

    if (!fetchResult.success) {
      return fetchResult;
    }

    return this.summarizer.summarize(fetchResult.data, { style });
  }

  // ===========================================================================
  // Individual Operations
  // ===========================================================================

  /**
   * Fetch a video
   */
  async fetchVideo(
    videoIdOrUrl: string,
    options?: VideoFetchOptions
  ): Promise<ServiceResult<FetchedVideo>> {
    const videoId = this.videoFetcher.extractVideoId(videoIdOrUrl) ?? videoIdOrUrl;
    return this.videoFetcher.fetchVideo(videoId, options);
  }

  /**
   * Summarize a fetched video
   */
  async summarize(
    video: FetchedVideo,
    options?: SummaryOptions
  ): Promise<ServiceResult<VideoSummary>> {
    return this.summarizer.summarize(video, options);
  }

  /**
   * Summarize by chapters
   */
  async summarizeByChapters(
    video: FetchedVideo,
    options?: SummaryOptions
  ): Promise<ServiceResult<VideoSummary>> {
    return this.summarizer.summarizeByChapters(video, options);
  }

  /**
   * Extract key points
   */
  async extractKeyPoints(
    video: FetchedVideo,
    options?: KeyPointsExtractionOptions
  ): Promise<ServiceResult<ExtractedKeyPoints>> {
    return this.keyPointsExtractor.extract(video, options);
  }

  // ===========================================================================
  // Batch Operations
  // ===========================================================================

  /**
   * Analyze multiple videos
   */
  async analyzeVideos(
    videoIdsOrUrls: string[],
    options?: {
      fetch?: VideoFetchOptions;
      summary?: SummaryOptions;
      keyPoints?: KeyPointsExtractionOptions;
    }
  ): Promise<Map<string, ServiceResult<FullVideoAnalysis>>> {
    const results = new Map<string, ServiceResult<FullVideoAnalysis>>();

    // Process sequentially to avoid rate limiting
    for (const videoIdOrUrl of videoIdsOrUrls) {
      const videoId = this.videoFetcher.extractVideoId(videoIdOrUrl) ?? videoIdOrUrl;
      const result = await this.analyzeVideo(videoId, options);
      results.set(videoId, result);

      // Small delay between videos
      if (videoIdsOrUrls.indexOf(videoIdOrUrl) < videoIdsOrUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Quick summaries for multiple videos
   */
  async quickSummaries(
    videoIdsOrUrls: string[],
    style?: SummaryOptions['style']
  ): Promise<Map<string, ServiceResult<VideoSummary>>> {
    const results = new Map<string, ServiceResult<VideoSummary>>();

    for (const videoIdOrUrl of videoIdsOrUrls) {
      const videoId = this.videoFetcher.extractVideoId(videoIdOrUrl) ?? videoIdOrUrl;
      const result = await this.quickSummary(videoId, style);
      results.set(videoId, result);

      if (videoIdsOrUrls.indexOf(videoIdOrUrl) < videoIdsOrUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // ===========================================================================
  // Formatting
  // ===========================================================================

  /**
   * Format analysis as markdown
   */
  formatAnalysisAsMarkdown(analysis: FullVideoAnalysis): string {
    const lines: string[] = [
      `# Video Analysis: ${analysis.video.video.title}`,
      '',
      `**Channel:** ${analysis.video.video.channelTitle}`,
      `**Duration:** ${this.formatDuration(analysis.video.video.duration)}`,
      `**Published:** ${new Date(analysis.video.video.publishedAt).toLocaleDateString()}`,
      '',
      '---',
      '',
      '## Summary',
      '',
      analysis.summary.summary,
      '',
      '---',
      '',
      this.keyPointsExtractor.formatAsMarkdown(analysis.keyPoints),
    ];

    // Add chapters if available
    if (analysis.video.chapters && analysis.video.chapters.length > 0) {
      lines.push('---', '', '## Chapters', '');
      for (const chapter of analysis.video.chapters) {
        lines.push(`- **${this.formatTime(chapter.startTime)}** - ${chapter.title}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format as JSON for export
   */
  formatAnalysisAsJson(analysis: FullVideoAnalysis): string {
    return JSON.stringify({
      video: {
        id: analysis.video.video.id,
        title: analysis.video.video.title,
        channel: analysis.video.video.channelTitle,
        duration: analysis.video.video.duration,
        publishedAt: analysis.video.video.publishedAt,
        url: `https://youtube.com/watch?v=${analysis.video.video.id}`,
      },
      summary: {
        text: analysis.summary.summary,
        style: analysis.summary.style,
        wordCount: analysis.summary.wordCount,
      },
      keyPoints: analysis.keyPoints.keyPoints.map(kp => ({
        text: kp.text,
        importance: kp.importance,
      })),
      quotes: analysis.keyPoints.quotes.map(q => ({
        text: q.text,
        speaker: q.speaker,
      })),
      actionItems: analysis.keyPoints.actionItems.map(ai => ({
        text: ai.text,
        priority: ai.priority,
      })),
      insights: analysis.keyPoints.insights.map(i => ({
        text: i.text,
        type: i.type,
      })),
      analyzedAt: new Date(analysis.analyzedAt).toISOString(),
    }, null, 2);
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Extract video ID from URL
   */
  extractVideoId(url: string): string | null {
    return this.videoFetcher.extractVideoId(url);
  }

  /**
   * Clear video cache
   */
  clearCache(): void {
    this.videoFetcher.clearCache();
  }

  /**
   * Format time
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

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    const unsubFetcher = this.videoFetcher.onEvent(handler);
    const unsubSummarizer = this.summarizer.onEvent(handler);

    return () => {
      unsubFetcher();
      unsubSummarizer();
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createYouTubeSummarizerService(
  youtubeProvider: YouTubeProvider,
  contentGenerator: ContentGeneratorProvider,
  config?: YouTubeSummarizerServiceConfig
): YouTubeSummarizerService {
  return new YouTubeSummarizerService(youtubeProvider, contentGenerator, config);
}
