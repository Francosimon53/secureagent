/**
 * Notion Integration - Tool Definitions
 */

import type { ToolDefinition, ToolParameter } from '../types.js';
import type { NotionApi } from './api.js';
import type { NotionFilter, NotionSort, BlockContent } from './types.js';

/**
 * Create Notion tools
 */
export function createNotionTools(api: NotionApi): ToolDefinition[] {
  return [
    createSearchTool(api),
    createGetPageTool(api),
    createCreatePageTool(api),
    createUpdatePageTool(api),
    createQueryDatabaseTool(api),
    createCreateDatabaseItemTool(api),
  ];
}

/**
 * Search pages and databases
 */
function createSearchTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_search',
    description:
      'Search for pages and databases in Notion. Returns matching items with their titles, URLs, and last edited times.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query text',
        required: false,
      },
      {
        name: 'filter',
        type: 'string',
        description: 'Filter by type: "page" or "database"',
        required: false,
        enum: ['page', 'database'],
      },
      {
        name: 'pageSize',
        type: 'number',
        description: 'Number of results to return (max 100)',
        required: false,
        default: 10,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const filter = params.filter
          ? { property: 'object' as const, value: params.filter as 'page' | 'database' }
          : undefined;

        const results = await api.search({
          query: params.query as string | undefined,
          filter,
          pageSize: (params.pageSize as number) || 10,
        });

        return {
          success: true,
          data: {
            results: results.results,
            hasMore: results.hasMore,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Search failed',
        };
      }
    },
  };
}

/**
 * Get page content
 */
function createGetPageTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_get_page',
    description:
      'Get a Notion page by ID, including its properties and content blocks.',
    parameters: [
      {
        name: 'pageId',
        type: 'string',
        description: 'The ID of the page to retrieve',
        required: true,
      },
      {
        name: 'includeContent',
        type: 'boolean',
        description: 'Whether to include the page content blocks',
        required: false,
        default: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const page = await api.getPage(params.pageId as string);
        let content;

        if (params.includeContent !== false) {
          content = await api.getPageContent(params.pageId as string);
        }

        return {
          success: true,
          data: {
            page,
            content,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get page',
        };
      }
    },
  };
}

/**
 * Create a new page
 */
function createCreatePageTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_create_page',
    description:
      'Create a new page in Notion. Can be created as a child of another page or in a database.',
    parameters: [
      {
        name: 'parentId',
        type: 'string',
        description: 'The ID of the parent page or database',
        required: true,
      },
      {
        name: 'parentType',
        type: 'string',
        description: 'Type of parent: "page" or "database"',
        required: true,
        enum: ['page', 'database'],
      },
      {
        name: 'title',
        type: 'string',
        description: 'Page title (for page parent) or title property (for database)',
        required: false,
      },
      {
        name: 'properties',
        type: 'object',
        description: 'Page properties (for database items)',
        required: false,
      },
      {
        name: 'content',
        type: 'array',
        description: 'Array of block objects for page content',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const page = await api.createPage({
          parentId: params.parentId as string,
          parentType: params.parentType as 'page' | 'database',
          content: {
            title: params.title as string | undefined,
            properties: params.properties as Record<string, unknown> | undefined,
            children: params.content as BlockContent[] | undefined,
          },
        });

        return {
          success: true,
          data: page,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create page',
        };
      }
    },
  };
}

/**
 * Update a page
 */
function createUpdatePageTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_update_page',
    description: 'Update an existing Notion page properties, icon, or cover.',
    parameters: [
      {
        name: 'pageId',
        type: 'string',
        description: 'The ID of the page to update',
        required: true,
      },
      {
        name: 'properties',
        type: 'object',
        description: 'Properties to update',
        required: false,
      },
      {
        name: 'archived',
        type: 'boolean',
        description: 'Set to true to archive the page',
        required: false,
      },
      {
        name: 'icon',
        type: 'object',
        description: 'New icon for the page (emoji or external URL)',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const page = await api.updatePage(params.pageId as string, {
          properties: params.properties as Record<string, unknown> | undefined,
          archived: params.archived as boolean | undefined,
          icon: params.icon as { type: 'emoji'; emoji: string } | undefined,
        });

        return {
          success: true,
          data: page,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update page',
        };
      }
    },
  };
}

/**
 * Query a database
 */
function createQueryDatabaseTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_query_database',
    description:
      'Query a Notion database with optional filters and sorting.',
    parameters: [
      {
        name: 'databaseId',
        type: 'string',
        description: 'The ID of the database to query',
        required: true,
      },
      {
        name: 'filter',
        type: 'object',
        description: 'Filter conditions (Notion filter object)',
        required: false,
      },
      {
        name: 'sorts',
        type: 'array',
        description: 'Sort conditions array',
        required: false,
      },
      {
        name: 'pageSize',
        type: 'number',
        description: 'Number of results to return (max 100)',
        required: false,
        default: 100,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const results = await api.queryDatabase(params.databaseId as string, {
          filter: params.filter as NotionFilter | undefined,
          sorts: params.sorts as NotionSort[] | undefined,
          pageSize: (params.pageSize as number) || 100,
        });

        return {
          success: true,
          data: {
            results: results.results,
            hasMore: results.hasMore,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to query database',
        };
      }
    },
  };
}

/**
 * Create a database item
 */
function createCreateDatabaseItemTool(api: NotionApi): ToolDefinition {
  return {
    name: 'notion_create_database_item',
    description: 'Add a new item (row) to a Notion database.',
    parameters: [
      {
        name: 'databaseId',
        type: 'string',
        description: 'The ID of the database',
        required: true,
      },
      {
        name: 'properties',
        type: 'object',
        description: 'Property values for the new item',
        required: true,
      },
      {
        name: 'content',
        type: 'array',
        description: 'Optional page content blocks',
        required: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const item = await api.createDatabaseItem(params.databaseId as string, {
          properties: params.properties as Record<string, unknown>,
          children: params.content as BlockContent[] | undefined,
        });

        return {
          success: true,
          data: item,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create database item',
        };
      }
    },
  };
}
