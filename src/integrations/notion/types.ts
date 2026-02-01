/**
 * Notion Integration - Types
 */

/**
 * Notion page object
 */
export interface NotionPage {
  id: string;
  createdTime: string;
  lastEditedTime: string;
  archived: boolean;
  icon?: NotionIcon;
  cover?: NotionCover;
  properties: Record<string, NotionProperty>;
  parent: NotionParent;
  url: string;
}

export type NotionIcon =
  | { type: 'emoji'; emoji: string }
  | { type: 'external'; external: { url: string } }
  | { type: 'file'; file: { url: string } };

export type NotionCover =
  | { type: 'external'; external: { url: string } }
  | { type: 'file'; file: { url: string } };

export type NotionParent =
  | { type: 'database_id'; database_id: string }
  | { type: 'page_id'; page_id: string }
  | { type: 'workspace'; workspace: true };

/**
 * Notion database object
 */
export interface NotionDatabase {
  id: string;
  createdTime: string;
  lastEditedTime: string;
  title: NotionRichText[];
  description: NotionRichText[];
  icon?: NotionIcon;
  cover?: NotionCover;
  properties: Record<string, NotionPropertySchema>;
  parent: NotionParent;
  url: string;
  archived: boolean;
  isInline: boolean;
}

/**
 * Notion block object
 */
export interface NotionBlock {
  id: string;
  type: NotionBlockType;
  createdTime: string;
  lastEditedTime: string;
  hasChildren: boolean;
  archived: boolean;
  parent: NotionParent;
  [key: string]: unknown;
}

export type NotionBlockType =
  | 'paragraph'
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'bulleted_list_item'
  | 'numbered_list_item'
  | 'to_do'
  | 'toggle'
  | 'code'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'table_of_contents'
  | 'breadcrumb'
  | 'column_list'
  | 'column'
  | 'image'
  | 'video'
  | 'file'
  | 'pdf'
  | 'bookmark'
  | 'embed'
  | 'equation'
  | 'table'
  | 'table_row'
  | 'synced_block'
  | 'template'
  | 'link_preview'
  | 'unsupported';

/**
 * Notion rich text
 */
export interface NotionRichText {
  type: 'text' | 'mention' | 'equation';
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  mention?: NotionMention;
  equation?: { expression: string };
  annotations: NotionAnnotations;
  plainText: string;
  href?: string | null;
}

export interface NotionAnnotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: string;
}

export type NotionMention =
  | { type: 'user'; user: { id: string } }
  | { type: 'page'; page: { id: string } }
  | { type: 'database'; database: { id: string } }
  | { type: 'date'; date: { start: string; end?: string } };

/**
 * Notion property types
 */
export type NotionProperty =
  | { type: 'title'; title: NotionRichText[] }
  | { type: 'rich_text'; rich_text: NotionRichText[] }
  | { type: 'number'; number: number | null }
  | { type: 'select'; select: { id: string; name: string; color: string } | null }
  | { type: 'multi_select'; multi_select: { id: string; name: string; color: string }[] }
  | { type: 'date'; date: { start: string; end?: string; time_zone?: string } | null }
  | { type: 'checkbox'; checkbox: boolean }
  | { type: 'url'; url: string | null }
  | { type: 'email'; email: string | null }
  | { type: 'phone_number'; phone_number: string | null }
  | { type: 'files'; files: NotionFile[] }
  | { type: 'relation'; relation: { id: string }[] }
  | { type: 'people'; people: { id: string }[] }
  | { type: 'created_time'; created_time: string }
  | { type: 'created_by'; created_by: { id: string } }
  | { type: 'last_edited_time'; last_edited_time: string }
  | { type: 'last_edited_by'; last_edited_by: { id: string } }
  | { type: 'formula'; formula: NotionFormula }
  | { type: 'rollup'; rollup: NotionRollup }
  | { type: 'status'; status: { id: string; name: string; color: string } | null };

export type NotionFile =
  | { type: 'external'; name: string; external: { url: string } }
  | { type: 'file'; name: string; file: { url: string; expiry_time: string } };

export type NotionFormula =
  | { type: 'string'; string: string | null }
  | { type: 'number'; number: number | null }
  | { type: 'boolean'; boolean: boolean | null }
  | { type: 'date'; date: { start: string; end?: string } | null };

export type NotionRollup =
  | { type: 'number'; number: number | null; function: string }
  | { type: 'date'; date: { start: string; end?: string } | null; function: string }
  | { type: 'array'; array: NotionProperty[]; function: string };

/**
 * Notion property schema (for databases)
 */
export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

/**
 * Notion search result
 */
export interface NotionSearchResult {
  object: 'page' | 'database';
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  icon?: NotionIcon;
}

/**
 * Notion query filter
 */
export interface NotionFilter {
  property?: string;
  or?: NotionFilter[];
  and?: NotionFilter[];
  [key: string]: unknown;
}

/**
 * Notion query sort
 */
export interface NotionSort {
  property?: string;
  timestamp?: 'created_time' | 'last_edited_time';
  direction: 'ascending' | 'descending';
}

/**
 * Page content for creating/updating
 */
export interface PageContent {
  title?: string;
  properties?: Record<string, unknown>;
  children?: BlockContent[];
  icon?: NotionIcon;
  cover?: NotionCover;
}

/**
 * Block content for creating
 */
export interface BlockContent {
  type: NotionBlockType;
  [key: string]: unknown;
}

/**
 * Database item for creating
 */
export interface DatabaseItemContent {
  properties: Record<string, unknown>;
  children?: BlockContent[];
  icon?: NotionIcon;
  cover?: NotionCover;
}
