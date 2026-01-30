/**
 * Content Creator Suite - Podcast Provider
 *
 * Podcast feed parsing and episode metadata extraction.
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { PodcastConfigSchema } from '../../config.js';
import type { ContentProviderResult } from '../../types.js';
import { ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

type PodcastConfig = z.infer<typeof PodcastConfigSchema>;

interface PodcastProviderConfig {
  maxEpisodeDuration: number;
  transcriptionProvider: 'whisper' | 'assemblyai' | 'deepgram';
  speakerDiarization: boolean;
  generateTimestamps: boolean;
  timeout: number;
  rateLimitPerMinute: number;
}

export interface PodcastFeed {
  title: string;
  description: string;
  author: string;
  imageUrl?: string;
  link: string;
  language?: string;
  categories?: string[];
  episodes: PodcastEpisode[];
  lastBuildDate?: string;
}

export interface PodcastEpisode {
  guid: string;
  title: string;
  description: string;
  pubDate: string;
  duration?: number;
  audioUrl: string;
  imageUrl?: string;
  explicit?: boolean;
  season?: number;
  episode?: number;
  episodeType?: 'full' | 'trailer' | 'bonus';
  link?: string;
}

export interface ParsedPodcastRSS {
  channel: {
    title?: string;
    description?: string;
    'itunes:author'?: string;
    'itunes:image'?: { href?: string };
    image?: { url?: string };
    link?: string;
    language?: string;
    'itunes:category'?: Array<{ text?: string }>;
    lastBuildDate?: string;
    item?: Array<RSSItem>;
  };
}

interface RSSItem {
  guid?: string | { '#text': string };
  title?: string;
  description?: string;
  pubDate?: string;
  'itunes:duration'?: string;
  enclosure?: { url?: string; type?: string };
  'itunes:image'?: { href?: string };
  'itunes:explicit'?: string;
  'itunes:season'?: string;
  'itunes:episode'?: string;
  'itunes:episodeType'?: string;
  link?: string;
}

// =============================================================================
// Podcast Provider
// =============================================================================

export class PodcastProvider extends BaseContentProvider<PodcastProviderConfig> {
  constructor(config?: PodcastConfig) {
    const providerConfig: PodcastProviderConfig = {
      maxEpisodeDuration: config?.maxEpisodeDuration ?? 7200, // 2 hours
      transcriptionProvider: config?.transcriptionProvider ?? 'whisper',
      speakerDiarization: config?.speakerDiarization ?? true,
      generateTimestamps: config?.generateTimestamps ?? true,
      timeout: CONTENT_DEFAULTS.API_TIMEOUT * 3, // Longer timeout for audio
      rateLimitPerMinute: 30,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'podcast';
  }

  get type(): string {
    return 'media';
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  // ===========================================================================
  // Feed Operations
  // ===========================================================================

  /**
   * Parse a podcast RSS feed
   */
  async parseFeed(feedUrl: string): Promise<ContentProviderResult<PodcastFeed>> {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'ContentCreator/1.0 Podcast Parser',
          Accept: 'application/rss+xml, application/xml, text/xml',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch feed: ${response.status}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const xmlText = await response.text();
      const feed = this.parseXMLToFeed(xmlText, feedUrl);

      return {
        success: true,
        data: feed,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error parsing feed',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Get a specific episode by GUID
   */
  async getEpisode(feedUrl: string, episodeGuid: string): Promise<ContentProviderResult<PodcastEpisode>> {
    const feedResult = await this.parseFeed(feedUrl);

    if (!feedResult.success) {
      return feedResult as ContentProviderResult<PodcastEpisode>;
    }

    const episode = feedResult.data.episodes.find(ep => ep.guid === episodeGuid);

    if (!episode) {
      return {
        success: false,
        error: 'Episode not found',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    return {
      success: true,
      data: episode,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Get latest episodes from a feed
   */
  async getLatestEpisodes(
    feedUrl: string,
    count: number = 10
  ): Promise<ContentProviderResult<PodcastEpisode[]>> {
    const feedResult = await this.parseFeed(feedUrl);

    if (!feedResult.success) {
      return feedResult as ContentProviderResult<PodcastEpisode[]>;
    }

    const episodes = feedResult.data.episodes.slice(0, count);

    return {
      success: true,
      data: episodes,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Search episodes in a feed
   */
  async searchEpisodes(
    feedUrl: string,
    query: string
  ): Promise<ContentProviderResult<PodcastEpisode[]>> {
    const feedResult = await this.parseFeed(feedUrl);

    if (!feedResult.success) {
      return feedResult as ContentProviderResult<PodcastEpisode[]>;
    }

    const queryLower = query.toLowerCase();
    const episodes = feedResult.data.episodes.filter(ep =>
      ep.title.toLowerCase().includes(queryLower) ||
      ep.description.toLowerCase().includes(queryLower)
    );

    return {
      success: true,
      data: episodes,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Audio Operations
  // ===========================================================================

  /**
   * Download audio file to buffer
   */
  async downloadAudio(audioUrl: string): Promise<ContentProviderResult<ArrayBuffer>> {
    try {
      const response = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'ContentCreator/1.0',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to download audio: ${response.status}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const buffer = await response.arrayBuffer();

      return {
        success: true,
        data: buffer,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error downloading audio',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  /**
   * Get audio duration from URL (by fetching headers)
   */
  async getAudioDuration(audioUrl: string): Promise<ContentProviderResult<number>> {
    // Note: This is an approximation based on file size
    // For accurate duration, the audio would need to be processed
    try {
      const response = await fetch(audioUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'ContentCreator/1.0',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'Failed to get audio info',
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        // Rough estimate: 128kbps = 16KB/s
        const bytes = parseInt(contentLength, 10);
        const estimatedDuration = Math.round(bytes / 16000);

        return {
          success: true,
          data: estimatedDuration,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      return {
        success: false,
        error: 'Could not determine audio duration',
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  // ===========================================================================
  // Parsing Methods
  // ===========================================================================

  /**
   * Parse XML to PodcastFeed
   */
  private parseXMLToFeed(xml: string, feedUrl: string): PodcastFeed {
    // Simple XML parsing without external dependencies
    const getTagContent = (tag: string, text: string): string => {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const match = text.match(regex);
      return match ? this.decodeEntities(match[1].trim()) : '';
    };

    const getAttribute = (tag: string, attr: string, text: string): string => {
      const regex = new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i');
      const match = text.match(regex);
      return match ? match[1] : '';
    };

    // Parse channel info
    const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i);
    const channelContent = channelMatch ? channelMatch[1] : xml;

    const title = getTagContent('title', channelContent) || 'Untitled Podcast';
    const description = getTagContent('description', channelContent) ||
      getTagContent('itunes:summary', channelContent) || '';
    const author = getTagContent('itunes:author', channelContent) || '';
    const link = getTagContent('link', channelContent) || feedUrl;
    const language = getTagContent('language', channelContent);
    const lastBuildDate = getTagContent('lastBuildDate', channelContent);

    // Get image
    let imageUrl = getAttribute('itunes:image', 'href', channelContent);
    if (!imageUrl) {
      const imageTag = channelContent.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
      if (imageTag) {
        imageUrl = getTagContent('url', imageTag[1]);
      }
    }

    // Get categories
    const categories: string[] = [];
    const categoryRegex = /<itunes:category[^>]*text=["']([^"']+)["']/gi;
    let categoryMatch;
    while ((categoryMatch = categoryRegex.exec(channelContent)) !== null) {
      categories.push(categoryMatch[1]);
    }

    // Parse episodes
    const episodes: PodcastEpisode[] = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(channelContent)) !== null) {
      const itemContent = itemMatch[1];

      // Get GUID
      let guid = getTagContent('guid', itemContent);
      if (!guid) {
        guid = getAttribute('enclosure', 'url', itemContent) || `episode-${episodes.length}`;
      }

      const episodeTitle = getTagContent('title', itemContent) || 'Untitled Episode';
      const episodeDescription = getTagContent('description', itemContent) ||
        getTagContent('itunes:summary', itemContent) || '';
      const pubDate = getTagContent('pubDate', itemContent) || '';
      const audioUrl = getAttribute('enclosure', 'url', itemContent);

      if (!audioUrl) continue; // Skip items without audio

      // Parse duration
      let duration: number | undefined;
      const durationStr = getTagContent('itunes:duration', itemContent);
      if (durationStr) {
        duration = this.parseDuration(durationStr);
      }

      // Get episode image
      let episodeImage = getAttribute('itunes:image', 'href', itemContent);

      // Parse season and episode numbers
      const season = parseInt(getTagContent('itunes:season', itemContent), 10) || undefined;
      const episodeNum = parseInt(getTagContent('itunes:episode', itemContent), 10) || undefined;

      // Parse explicit
      const explicit = getTagContent('itunes:explicit', itemContent).toLowerCase() === 'yes';

      // Parse episode type
      const episodeType = getTagContent('itunes:episodeType', itemContent) as PodcastEpisode['episodeType'];

      episodes.push({
        guid,
        title: episodeTitle,
        description: episodeDescription,
        pubDate,
        duration,
        audioUrl,
        imageUrl: episodeImage || undefined,
        explicit,
        season,
        episode: episodeNum,
        episodeType: episodeType || 'full',
        link: getTagContent('link', itemContent) || undefined,
      });
    }

    return {
      title,
      description,
      author,
      imageUrl: imageUrl || undefined,
      link,
      language: language || undefined,
      categories: categories.length > 0 ? categories : undefined,
      episodes,
      lastBuildDate: lastBuildDate || undefined,
    };
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(duration: string): number {
    // Handle formats: "HH:MM:SS", "MM:SS", or just seconds
    const parts = duration.split(':').map(p => parseInt(p, 10));

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else {
      return parseInt(duration, 10) || 0;
    }
  }

  /**
   * Decode HTML entities
   */
  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  }

  /**
   * Format duration to string
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get configuration
   */
  getConfig(): PodcastProviderConfig {
    return this.config;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPodcastProvider(config?: PodcastConfig): PodcastProvider {
  return new PodcastProvider(config);
}
