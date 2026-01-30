/**
 * Content Creator Suite - YouTube Provider
 *
 * YouTube API integration for fetching video data, transcripts, and metadata.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { YouTubeConfigSchema } from '../../config.js';
import type { ContentProviderResult } from '../../types.js';
import { API_ENDPOINTS, ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

type YouTubeConfig = z.infer<typeof YouTubeConfigSchema>;

interface YouTubeProviderConfig {
  apiKeyEnvVar: string;
  timeout: number;
  rateLimitPerMinute: number;
  maxVideoDuration: number;
  transcriptSource: 'youtube' | 'whisper' | 'assemblyai';
}

export interface YouTubeVideoInfo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnails: {
    default?: { url: string; width: number; height: number };
    medium?: { url: string; width: number; height: number };
    high?: { url: string; width: number; height: number };
    standard?: { url: string; width: number; height: number };
    maxres?: { url: string; width: number; height: number };
  };
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  caption: boolean;
}

export interface YouTubeTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface YouTubeChapter {
  title: string;
  startTime: number;
  endTime?: number;
}

interface YouTubeVideoResponse {
  items: Array<{
    id: string;
    snippet: {
      publishedAt: string;
      channelId: string;
      title: string;
      description: string;
      thumbnails: YouTubeVideoInfo['thumbnails'];
      channelTitle: string;
      tags?: string[];
      categoryId?: string;
      defaultLanguage?: string;
    };
    contentDetails: {
      duration: string;
      caption: string;
    };
    statistics: {
      viewCount: string;
      likeCount: string;
      commentCount: string;
    };
  }>;
}

interface YouTubeCaptionResponse {
  items: Array<{
    id: string;
    snippet: {
      language: string;
      name: string;
      trackKind: string;
    };
  }>;
}

// =============================================================================
// YouTube Provider
// =============================================================================

export class YouTubeProvider extends BaseContentProvider<YouTubeProviderConfig> {
  private youtubeApiKey: string | undefined;

  constructor(config?: YouTubeConfig) {
    const providerConfig: YouTubeProviderConfig = {
      apiKeyEnvVar: config?.apiKeyEnvVar ?? 'YOUTUBE_API_KEY',
      timeout: config?.timeout ?? CONTENT_DEFAULTS.API_TIMEOUT,
      rateLimitPerMinute: 100,
      maxVideoDuration: config?.maxVideoDuration ?? 3600, // 1 hour default
      transcriptSource: config?.transcriptSource ?? 'youtube',
    };
    super(providerConfig);
  }

  get name(): string {
    return 'youtube';
  }

  get type(): string {
    return 'media';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.youtubeApiKey = process.env[this.config.apiKeyEnvVar];

    if (!this.youtubeApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `YouTube API key not found: ${this.config.apiKeyEnvVar}`
      );
    }
  }

  private get apiUrl(): string {
    return API_ENDPOINTS.youtube.base;
  }

  // ===========================================================================
  // Video Operations
  // ===========================================================================

  /**
   * Get video info by ID
   */
  async getVideoInfo(videoId: string): Promise<ContentProviderResult<YouTubeVideoInfo>> {
    const params = new URLSearchParams({
      key: this.youtubeApiKey!,
      id: videoId,
      part: 'snippet,contentDetails,statistics',
    });

    const result = await this.fetchWithRetry<YouTubeVideoResponse>(
      `${this.apiUrl}${API_ENDPOINTS.youtube.videos}?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<YouTubeVideoInfo>;
    }

    const item = result.data.items[0];
    if (!item) {
      return {
        success: false,
        error: 'Video not found',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const duration = this.parseDuration(item.contentDetails.duration);

    return {
      success: true,
      data: {
        id: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration,
        viewCount: parseInt(item.statistics.viewCount, 10),
        likeCount: parseInt(item.statistics.likeCount, 10),
        commentCount: parseInt(item.statistics.commentCount, 10),
        thumbnails: item.snippet.thumbnails,
        tags: item.snippet.tags,
        categoryId: item.snippet.categoryId,
        defaultLanguage: item.snippet.defaultLanguage,
        caption: item.contentDetails.caption === 'true',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get video info from URL
   */
  async getVideoFromUrl(url: string): Promise<ContentProviderResult<YouTubeVideoInfo>> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      return {
        success: false,
        error: 'Invalid YouTube URL',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return this.getVideoInfo(videoId);
  }

  /**
   * Search for videos
   */
  async searchVideos(
    query: string,
    options?: {
      maxResults?: number;
      order?: 'date' | 'rating' | 'relevance' | 'title' | 'viewCount';
      channelId?: string;
      publishedAfter?: string;
      publishedBefore?: string;
    }
  ): Promise<ContentProviderResult<YouTubeVideoInfo[]>> {
    const params = new URLSearchParams({
      key: this.youtubeApiKey!,
      q: query,
      part: 'snippet',
      type: 'video',
      maxResults: String(options?.maxResults ?? 10),
      order: options?.order ?? 'relevance',
    });

    if (options?.channelId) params.set('channelId', options.channelId);
    if (options?.publishedAfter) params.set('publishedAfter', options.publishedAfter);
    if (options?.publishedBefore) params.set('publishedBefore', options.publishedBefore);

    const searchResult = await this.fetchWithRetry<{
      items: Array<{ id: { videoId: string } }>;
    }>(`${this.apiUrl}${API_ENDPOINTS.youtube.search}?${params}`);

    if (!searchResult.success) {
      return searchResult as ContentProviderResult<YouTubeVideoInfo[]>;
    }

    const videoIds = searchResult.data.items.map(item => item.id.videoId);

    if (videoIds.length === 0) {
      return {
        success: true,
        data: [],
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Get full video info
    const videosParams = new URLSearchParams({
      key: this.youtubeApiKey!,
      id: videoIds.join(','),
      part: 'snippet,contentDetails,statistics',
    });

    const videosResult = await this.fetchWithRetry<YouTubeVideoResponse>(
      `${this.apiUrl}${API_ENDPOINTS.youtube.videos}?${videosParams}`
    );

    if (!videosResult.success) {
      return videosResult as ContentProviderResult<YouTubeVideoInfo[]>;
    }

    const videos = videosResult.data.items.map(item => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: this.parseDuration(item.contentDetails.duration),
      viewCount: parseInt(item.statistics.viewCount, 10),
      likeCount: parseInt(item.statistics.likeCount, 10),
      commentCount: parseInt(item.statistics.commentCount, 10),
      thumbnails: item.snippet.thumbnails,
      tags: item.snippet.tags,
      categoryId: item.snippet.categoryId,
      defaultLanguage: item.snippet.defaultLanguage,
      caption: item.contentDetails.caption === 'true',
    }));

    return {
      success: true,
      data: videos,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Transcript Operations
  // ===========================================================================

  /**
   * Get available captions for a video
   */
  async getAvailableCaptions(videoId: string): Promise<ContentProviderResult<Array<{
    id: string;
    language: string;
    name: string;
    type: string;
  }>>> {
    const params = new URLSearchParams({
      key: this.youtubeApiKey!,
      videoId,
      part: 'snippet',
    });

    const result = await this.fetchWithRetry<YouTubeCaptionResponse>(
      `${this.apiUrl}${API_ENDPOINTS.youtube.captions}?${params}`
    );

    if (!result.success) {
      return result as ContentProviderResult<Array<{
        id: string;
        language: string;
        name: string;
        type: string;
      }>>;
    }

    const captions = result.data.items.map(item => ({
      id: item.id,
      language: item.snippet.language,
      name: item.snippet.name,
      type: item.snippet.trackKind,
    }));

    return {
      success: true,
      data: captions,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Fetch transcript using YouTube's transcript service
   * Note: This uses an unofficial endpoint
   */
  async getTranscript(
    videoId: string,
    language?: string
  ): Promise<ContentProviderResult<YouTubeTranscriptSegment[]>> {
    try {
      // Try to fetch from YouTube's transcript service
      const transcriptUrl = `https://www.youtube.com/api/timedtext?lang=${language ?? 'en'}&v=${videoId}&fmt=json3`;

      const response = await fetch(transcriptUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ContentCreator/1.0)',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch transcript: ${response.status}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const data = await response.json() as {
        events?: Array<{
          segs?: Array<{ utf8: string }>;
          tStartMs?: number;
          dDurationMs?: number;
        }>;
      };

      if (!data.events) {
        return {
          success: false,
          error: 'No transcript available',
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const segments: YouTubeTranscriptSegment[] = data.events
        .filter(event => event.segs && event.tStartMs !== undefined)
        .map(event => ({
          text: event.segs?.map(seg => seg.utf8).join('') ?? '',
          start: (event.tStartMs ?? 0) / 1000,
          duration: (event.dDurationMs ?? 0) / 1000,
        }))
        .filter(seg => seg.text.trim().length > 0);

      return {
        success: true,
        data: segments,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching transcript',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Get full transcript as text
   */
  async getTranscriptText(videoId: string, language?: string): Promise<ContentProviderResult<string>> {
    const result = await this.getTranscript(videoId, language);

    if (!result.success) {
      return result as ContentProviderResult<string>;
    }

    const text = result.data.map(seg => seg.text).join(' ');

    return {
      success: true,
      data: text,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Chapter Operations
  // ===========================================================================

  /**
   * Extract chapters from video description
   */
  extractChapters(description: string, duration: number): YouTubeChapter[] {
    const chapters: YouTubeChapter[] = [];

    // Match timestamp patterns like "0:00", "00:00", "1:00:00"
    const timestampRegex = /(?:^|\n)\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\s*[-–:]\s*(.+?)(?=\n|$)/gm;

    let match;
    while ((match = timestampRegex.exec(description)) !== null) {
      const hours = match[1] ? parseInt(match[1].replace(':', ''), 10) : 0;
      const minutes = parseInt(match[2], 10);
      const seconds = parseInt(match[3], 10);
      const title = match[4].trim();

      const startTime = hours * 3600 + minutes * 60 + seconds;

      if (startTime < duration) {
        chapters.push({ title, startTime });
      }
    }

    // Set end times
    for (let i = 0; i < chapters.length; i++) {
      chapters[i].endTime = i < chapters.length - 1
        ? chapters[i + 1].startTime
        : duration;
    }

    return chapters;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Just the ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(iso8601: string): number {
    const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] ?? '0', 10);
    const minutes = parseInt(match[2] ?? '0', 10);
    const seconds = parseInt(match[3] ?? '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format seconds to timestamp
   */
  formatTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get max video duration setting
   */
  getMaxVideoDuration(): number {
    return this.config.maxVideoDuration;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createYouTubeProvider(config?: YouTubeConfig): YouTubeProvider {
  return new YouTubeProvider(config);
}
