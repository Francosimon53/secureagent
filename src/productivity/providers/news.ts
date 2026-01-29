/**
 * News Providers
 *
 * Implementations for NewsAPI and RSS providers.
 */

import { BaseProvider, ProviderError } from './base.js';
import type {
  NewsItem,
  NewsFeed,
  ProviderResult,
  NewsProviderType,
} from '../types.js';
import type { NewsConfig } from '../config.js';

/**
 * Abstract news provider interface
 */
export abstract class NewsProvider extends BaseProvider<NewsConfig & { name: string; apiKeyEnvVar: string }> {
  abstract get type(): 'news';
  abstract get providerType(): NewsProviderType;

  /**
   * Get top headlines
   */
  abstract getHeadlines(options?: NewsQueryOptions): Promise<ProviderResult<NewsFeed>>;

  /**
   * Search for news
   */
  abstract search(query: string, options?: NewsQueryOptions): Promise<ProviderResult<NewsFeed>>;
}

export interface NewsQueryOptions {
  category?: string;
  sources?: string[];
  maxItems?: number;
  language?: string;
  country?: string;
}

/**
 * NewsAPI provider
 */
export class NewsAPIProvider extends NewsProvider {
  private readonly baseUrl = 'https://newsapi.org/v2';

  get name(): string {
    return 'newsapi';
  }

  get type(): 'news' {
    return 'news';
  }

  get providerType(): NewsProviderType {
    return 'newsapi';
  }

  async getHeadlines(options: NewsQueryOptions = {}): Promise<ProviderResult<NewsFeed>> {
    const params = new URLSearchParams({
      apiKey: this.apiKey ?? '',
      pageSize: String(options.maxItems ?? this.config.maxItems),
    });

    if (options.category) {
      params.set('category', options.category);
    }

    if (options.sources && options.sources.length > 0) {
      params.set('sources', options.sources.join(','));
    } else if (options.country) {
      params.set('country', options.country);
    } else {
      params.set('country', 'us'); // Default to US
    }

    if (options.language) {
      params.set('language', options.language);
    }

    const url = `${this.baseUrl}/top-headlines?${params}`;
    const result = await this.fetch<NewsAPIResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to fetch headlines',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const items = result.data.articles.map((article, index) => this.mapNewsAPIArticle(article, index));

    return {
      success: true,
      data: {
        items,
        fetchedAt: Date.now(),
        source: 'newsapi',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async search(query: string, options: NewsQueryOptions = {}): Promise<ProviderResult<NewsFeed>> {
    const params = new URLSearchParams({
      apiKey: this.apiKey ?? '',
      q: query,
      pageSize: String(options.maxItems ?? this.config.maxItems),
      sortBy: 'relevancy',
    });

    if (options.sources && options.sources.length > 0) {
      params.set('sources', options.sources.join(','));
    }

    if (options.language) {
      params.set('language', options.language);
    }

    const url = `${this.baseUrl}/everything?${params}`;
    const result = await this.fetch<NewsAPIResponse>(url);

    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error ?? 'Failed to search news',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const items = result.data.articles.map((article, index) => this.mapNewsAPIArticle(article, index));

    return {
      success: true,
      data: {
        items,
        fetchedAt: Date.now(),
        source: 'newsapi',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private mapNewsAPIArticle(article: NewsAPIArticle, index: number): NewsItem {
    return {
      id: `newsapi-${Date.now()}-${index}`,
      title: article.title ?? 'Untitled',
      description: article.description ?? '',
      url: article.url,
      source: article.source?.name ?? 'Unknown',
      author: article.author ?? undefined,
      publishedAt: new Date(article.publishedAt).getTime(),
      imageUrl: article.urlToImage ?? undefined,
    };
  }
}

/**
 * RSS Feed provider
 */
export class RSSProvider extends NewsProvider {
  private feedUrls: string[] = [];

  get name(): string {
    return 'rss';
  }

  get type(): 'news' {
    return 'news';
  }

  get providerType(): NewsProviderType {
    return 'rss';
  }

  protected override requiresApiKey(): boolean {
    return false;
  }

  protected override async onInitialize(): Promise<void> {
    // Get feed URLs from config
    this.feedUrls = this.config.sources;
  }

  async getHeadlines(options: NewsQueryOptions = {}): Promise<ProviderResult<NewsFeed>> {
    const sources = options.sources ?? this.feedUrls;
    const maxItems = options.maxItems ?? this.config.maxItems;

    if (sources.length === 0) {
      return {
        success: false,
        error: 'No RSS feed URLs configured',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const allItems: NewsItem[] = [];

    for (const feedUrl of sources) {
      try {
        const feedResult = await this.fetchFeed(feedUrl);
        if (feedResult.success && feedResult.data) {
          allItems.push(...feedResult.data);
        }
      } catch {
        // Continue with other feeds if one fails
      }
    }

    // Sort by date and limit
    allItems.sort((a, b) => b.publishedAt - a.publishedAt);
    const limitedItems = allItems.slice(0, maxItems);

    return {
      success: true,
      data: {
        items: limitedItems,
        fetchedAt: Date.now(),
        source: 'rss',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  async search(query: string, options: NewsQueryOptions = {}): Promise<ProviderResult<NewsFeed>> {
    // RSS doesn't support search, so filter locally
    const result = await this.getHeadlines(options);

    if (!result.success || !result.data) {
      return result;
    }

    const queryLower = query.toLowerCase();
    const filteredItems = result.data.items.filter(item =>
      item.title.toLowerCase().includes(queryLower) ||
      item.description.toLowerCase().includes(queryLower)
    );

    return {
      success: true,
      data: {
        items: filteredItems,
        fetchedAt: Date.now(),
        source: 'rss',
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  private async fetchFeed(feedUrl: string): Promise<ProviderResult<NewsItem[]>> {
    const result = await this.fetch<string>(feedUrl, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    try {
      // Simple XML parsing for RSS feeds
      const items = this.parseRSSXML(result.data as unknown as string, feedUrl);
      return {
        success: true,
        data: items,
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to parse RSS feed',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  private parseRSSXML(xml: string, sourceUrl: string): NewsItem[] {
    const items: NewsItem[] = [];

    // Extract source name from URL
    const sourceName = new URL(sourceUrl).hostname.replace('www.', '');

    // Simple regex-based parsing (in production, use a proper XML parser)
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    let index = 0;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];

      const title = this.extractXMLValue(itemXml, 'title');
      const description = this.extractXMLValue(itemXml, 'description');
      const link = this.extractXMLValue(itemXml, 'link');
      const pubDate = this.extractXMLValue(itemXml, 'pubDate');
      const author = this.extractXMLValue(itemXml, 'author') || this.extractXMLValue(itemXml, 'dc:creator');

      if (title && link) {
        items.push({
          id: `rss-${Date.now()}-${index}`,
          title: this.decodeHTMLEntities(title),
          description: this.decodeHTMLEntities(description ?? ''),
          url: link,
          source: sourceName,
          author: author ?? undefined,
          publishedAt: pubDate ? new Date(pubDate).getTime() : Date.now(),
        });
        index++;
      }
    }

    return items;
  }

  private extractXMLValue(xml: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>|<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
    const match = xml.match(regex);
    return match ? (match[1] ?? match[2])?.trim() ?? null : null;
  }

  private decodeHTMLEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]*>/g, ''); // Strip HTML tags
  }
}

// =============================================================================
// API Response Types
// =============================================================================

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

interface NewsAPIArticle {
  source?: {
    id?: string;
    name?: string;
  };
  author?: string;
  title?: string;
  description?: string;
  url: string;
  urlToImage?: string;
  publishedAt: string;
  content?: string;
}

/**
 * Create a news provider based on type
 */
export function createNewsProvider(
  type: NewsProviderType,
  config: NewsConfig
): NewsProvider {
  const providerConfig = {
    ...config,
    name: type,
    apiKeyEnvVar: config.apiKeyEnvVar,
  };

  switch (type) {
    case 'newsapi':
      return new NewsAPIProvider(providerConfig);
    case 'rss':
      return new RSSProvider(providerConfig);
    default:
      throw new ProviderError('news', `Unknown news provider type: ${type}`);
  }
}
