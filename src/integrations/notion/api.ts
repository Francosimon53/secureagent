/**
 * Notion Integration - API Wrapper
 */

import type {
  NotionPage,
  NotionDatabase,
  NotionBlock,
  NotionSearchResult,
  NotionFilter,
  NotionSort,
  PageContent,
  BlockContent,
  DatabaseItemContent,
} from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

const NOTION_API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export interface NotionApiConfig {
  apiKey: string;
}

/**
 * Notion API client
 */
export class NotionApi {
  private apiKey: string;

  constructor(config: NotionApiConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Make authenticated request to Notion API
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${NOTION_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const message = (error as { message?: string }).message || response.statusText;

      if (response.status === 401) {
        throw new IntegrationError(
          'Notion authentication failed',
          INTEGRATION_ERROR_CODES.AUTHENTICATION_FAILED,
          'notion',
        );
      }

      if (response.status === 429) {
        throw new IntegrationError(
          'Notion rate limit exceeded',
          INTEGRATION_ERROR_CODES.RATE_LIMITED,
          'notion',
        );
      }

      throw new IntegrationError(
        `Notion API error: ${message}`,
        INTEGRATION_ERROR_CODES.API_ERROR,
        'notion',
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * Search pages and databases
   */
  async search(params: {
    query?: string;
    filter?: { property: 'object'; value: 'page' | 'database' };
    sort?: { direction: 'ascending' | 'descending'; timestamp: 'last_edited_time' };
    startCursor?: string;
    pageSize?: number;
  }): Promise<{
    results: NotionSearchResult[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const response = await this.request<{
      results: Array<{
        object: 'page' | 'database';
        id: string;
        url: string;
        last_edited_time: string;
        icon?: NotionPage['icon'];
        properties?: Record<string, unknown>;
        title?: Array<{ plain_text: string }>;
      }>;
      next_cursor?: string;
      has_more: boolean;
    }>('POST', '/search', {
      query: params.query,
      filter: params.filter,
      sort: params.sort,
      start_cursor: params.startCursor,
      page_size: params.pageSize ?? 10,
    });

    return {
      results: response.results.map((item) => ({
        object: item.object,
        id: item.id,
        title: this.extractTitle(item),
        url: item.url,
        lastEditedTime: item.last_edited_time,
        icon: item.icon,
      })),
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Get a page by ID
   */
  async getPage(pageId: string): Promise<NotionPage> {
    const response = await this.request<{
      id: string;
      created_time: string;
      last_edited_time: string;
      archived: boolean;
      icon?: NotionPage['icon'];
      cover?: NotionPage['cover'];
      properties: Record<string, NotionPage['properties'][string]>;
      parent: NotionPage['parent'];
      url: string;
    }>('GET', `/pages/${pageId}`);

    return {
      id: response.id,
      createdTime: response.created_time,
      lastEditedTime: response.last_edited_time,
      archived: response.archived,
      icon: response.icon,
      cover: response.cover,
      properties: response.properties,
      parent: response.parent,
      url: response.url,
    };
  }

  /**
   * Get page content (blocks)
   */
  async getPageContent(pageId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.request<{
        results: Array<{
          id: string;
          type: NotionBlock['type'];
          created_time: string;
          last_edited_time: string;
          has_children: boolean;
          archived: boolean;
          parent: NotionBlock['parent'];
          [key: string]: unknown;
        }>;
        next_cursor?: string;
        has_more: boolean;
      }>('GET', `/blocks/${pageId}/children${cursor ? `?start_cursor=${cursor}` : ''}`);

      for (const block of response.results) {
        const { id, type, created_time, last_edited_time, has_children, archived, parent, ...rest } = block;
        blocks.push({
          id,
          type,
          createdTime: created_time,
          lastEditedTime: last_edited_time,
          hasChildren: has_children,
          archived,
          parent,
          ...rest,
        });
      }

      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    return blocks;
  }

  /**
   * Create a new page
   */
  async createPage(params: {
    parentId: string;
    parentType: 'database' | 'page';
    content: PageContent;
  }): Promise<NotionPage> {
    const parent =
      params.parentType === 'database'
        ? { database_id: params.parentId }
        : { page_id: params.parentId };

    const properties =
      params.parentType === 'database'
        ? params.content.properties ?? {}
        : {
            title: {
              title: [{ text: { content: params.content.title ?? 'Untitled' } }],
            },
          };

    const response = await this.request<{
      id: string;
      created_time: string;
      last_edited_time: string;
      archived: boolean;
      icon?: NotionPage['icon'];
      cover?: NotionPage['cover'];
      properties: Record<string, NotionPage['properties'][string]>;
      parent: NotionPage['parent'];
      url: string;
    }>('POST', '/pages', {
      parent,
      properties,
      children: params.content.children,
      icon: params.content.icon,
      cover: params.content.cover,
    });

    return {
      id: response.id,
      createdTime: response.created_time,
      lastEditedTime: response.last_edited_time,
      archived: response.archived,
      icon: response.icon,
      cover: response.cover,
      properties: response.properties,
      parent: response.parent,
      url: response.url,
    };
  }

  /**
   * Update a page
   */
  async updatePage(
    pageId: string,
    updates: {
      properties?: Record<string, unknown>;
      icon?: NotionPage['icon'];
      cover?: NotionPage['cover'];
      archived?: boolean;
    },
  ): Promise<NotionPage> {
    const response = await this.request<{
      id: string;
      created_time: string;
      last_edited_time: string;
      archived: boolean;
      icon?: NotionPage['icon'];
      cover?: NotionPage['cover'];
      properties: Record<string, NotionPage['properties'][string]>;
      parent: NotionPage['parent'];
      url: string;
    }>('PATCH', `/pages/${pageId}`, updates);

    return {
      id: response.id,
      createdTime: response.created_time,
      lastEditedTime: response.last_edited_time,
      archived: response.archived,
      icon: response.icon,
      cover: response.cover,
      properties: response.properties,
      parent: response.parent,
      url: response.url,
    };
  }

  /**
   * Get a database by ID
   */
  async getDatabase(databaseId: string): Promise<NotionDatabase> {
    const response = await this.request<{
      id: string;
      created_time: string;
      last_edited_time: string;
      title: NotionDatabase['title'];
      description: NotionDatabase['description'];
      icon?: NotionDatabase['icon'];
      cover?: NotionDatabase['cover'];
      properties: Record<string, NotionDatabase['properties'][string]>;
      parent: NotionDatabase['parent'];
      url: string;
      archived: boolean;
      is_inline: boolean;
    }>('GET', `/databases/${databaseId}`);

    return {
      id: response.id,
      createdTime: response.created_time,
      lastEditedTime: response.last_edited_time,
      title: response.title,
      description: response.description,
      icon: response.icon,
      cover: response.cover,
      properties: response.properties,
      parent: response.parent,
      url: response.url,
      archived: response.archived,
      isInline: response.is_inline,
    };
  }

  /**
   * Query a database
   */
  async queryDatabase(
    databaseId: string,
    params?: {
      filter?: NotionFilter;
      sorts?: NotionSort[];
      startCursor?: string;
      pageSize?: number;
    },
  ): Promise<{
    results: NotionPage[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    const response = await this.request<{
      results: Array<{
        id: string;
        created_time: string;
        last_edited_time: string;
        archived: boolean;
        icon?: NotionPage['icon'];
        cover?: NotionPage['cover'];
        properties: Record<string, NotionPage['properties'][string]>;
        parent: NotionPage['parent'];
        url: string;
      }>;
      next_cursor?: string;
      has_more: boolean;
    }>('POST', `/databases/${databaseId}/query`, {
      filter: params?.filter,
      sorts: params?.sorts,
      start_cursor: params?.startCursor,
      page_size: params?.pageSize ?? 100,
    });

    return {
      results: response.results.map((page) => ({
        id: page.id,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        archived: page.archived,
        icon: page.icon,
        cover: page.cover,
        properties: page.properties,
        parent: page.parent,
        url: page.url,
      })),
      nextCursor: response.next_cursor,
      hasMore: response.has_more,
    };
  }

  /**
   * Create a database item (page in a database)
   */
  async createDatabaseItem(
    databaseId: string,
    content: DatabaseItemContent,
  ): Promise<NotionPage> {
    return this.createPage({
      parentId: databaseId,
      parentType: 'database',
      content: {
        properties: content.properties,
        children: content.children,
        icon: content.icon,
        cover: content.cover,
      },
    });
  }

  /**
   * Append blocks to a page
   */
  async appendBlocks(
    pageId: string,
    blocks: BlockContent[],
  ): Promise<NotionBlock[]> {
    const response = await this.request<{
      results: Array<{
        id: string;
        type: NotionBlock['type'];
        created_time: string;
        last_edited_time: string;
        has_children: boolean;
        archived: boolean;
        parent: NotionBlock['parent'];
        [key: string]: unknown;
      }>;
    }>('PATCH', `/blocks/${pageId}/children`, {
      children: blocks,
    });

    return response.results.map((block) => {
      const { id, type, created_time, last_edited_time, has_children, archived, parent, ...rest } = block;
      return {
        id,
        type,
        createdTime: created_time,
        lastEditedTime: last_edited_time,
        hasChildren: has_children,
        archived,
        parent,
        ...rest,
      };
    });
  }

  /**
   * Verify API key is valid
   */
  async verifyCredentials(): Promise<boolean> {
    try {
      await this.request('GET', '/users/me');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract title from search result
   */
  private extractTitle(item: {
    object: 'page' | 'database';
    properties?: Record<string, unknown>;
    title?: Array<{ plain_text: string }>;
  }): string {
    if (item.object === 'database' && item.title) {
      return item.title.map((t) => t.plain_text).join('') || 'Untitled';
    }

    if (item.object === 'page' && item.properties) {
      // Find the title property
      for (const prop of Object.values(item.properties)) {
        const typedProp = prop as { type?: string; title?: Array<{ plain_text: string }> };
        if (typedProp.type === 'title' && typedProp.title) {
          return typedProp.title.map((t) => t.plain_text).join('') || 'Untitled';
        }
      }
    }

    return 'Untitled';
  }
}
