/**
 * Obsidian Integration - Types
 */

/**
 * Obsidian note
 */
export interface ObsidianNote {
  path: string;
  name: string;
  extension: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  created: Date;
  modified: Date;
  size: number;
  tags: string[];
  links: NoteLink[];
  backlinks: NoteLink[];
}

/**
 * Note link (internal wiki link)
 */
export interface NoteLink {
  path: string;
  displayText?: string;
  alias?: string;
  isEmbed: boolean;
  position: {
    start: number;
    end: number;
    line: number;
  };
}

/**
 * Folder in the vault
 */
export interface ObsidianFolder {
  path: string;
  name: string;
  children: (ObsidianNote | ObsidianFolder)[];
}

/**
 * Note metadata (without content)
 */
export interface NoteMetadata {
  path: string;
  name: string;
  created: Date;
  modified: Date;
  size: number;
  tags: string[];
  frontmatter?: Record<string, unknown>;
}

/**
 * Search result
 */
export interface NoteSearchResult {
  note: NoteMetadata;
  matches: SearchMatch[];
  score: number;
}

export interface SearchMatch {
  line: number;
  column: number;
  content: string;
  context: string;
}

/**
 * Note creation input
 */
export interface CreateNoteInput {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  overwrite?: boolean;
}

/**
 * Note update input
 */
export interface UpdateNoteInput {
  path: string;
  content?: string;
  frontmatter?: Record<string, unknown>;
  append?: boolean;
  prepend?: boolean;
}

/**
 * YAML frontmatter parsing result
 */
export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  content: string;
  raw: string;
}

/**
 * Vault statistics
 */
export interface VaultStats {
  totalNotes: number;
  totalFolders: number;
  totalSize: number;
  tagCounts: Record<string, number>;
  recentNotes: NoteMetadata[];
}

/**
 * Search options
 */
export interface SearchOptions {
  query: string;
  searchContent?: boolean;
  searchTags?: boolean;
  searchFrontmatter?: boolean;
  folder?: string;
  limit?: number;
  caseSensitive?: boolean;
}

/**
 * List folder options
 */
export interface ListFolderOptions {
  path?: string;
  recursive?: boolean;
  includeHidden?: boolean;
}

/**
 * Backlink result
 */
export interface BacklinkResult {
  sourcePath: string;
  targetPath: string;
  linkText: string;
  context: string;
  line: number;
}
