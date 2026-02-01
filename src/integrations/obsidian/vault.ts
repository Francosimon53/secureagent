/**
 * Obsidian Integration - Vault Operations
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  ObsidianNote,
  NoteMetadata,
  NoteLink,
  NoteSearchResult,
  SearchMatch,
  CreateNoteInput,
  UpdateNoteInput,
  ParsedNote,
  VaultStats,
  SearchOptions,
  ListFolderOptions,
  BacklinkResult,
} from './types.js';
import { IntegrationError, INTEGRATION_ERROR_CODES } from '../types.js';

/**
 * Obsidian vault operations
 */
export class ObsidianVault {
  private vaultPath: string;
  private ignoredFolders: string[];

  constructor(vaultPath: string, ignoredFolders: string[] = ['.obsidian', '.trash']) {
    this.vaultPath = vaultPath;
    this.ignoredFolders = ignoredFolders;
  }

  /**
   * Verify vault exists
   */
  async verifyVault(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.vaultPath);
      if (!stat.isDirectory()) return false;

      // Check for .obsidian folder (indicates an Obsidian vault)
      const obsidianFolder = path.join(this.vaultPath, '.obsidian');
      try {
        await fs.stat(obsidianFolder);
        return true;
      } catch {
        // Might be a valid folder even without .obsidian
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get full path for a note
   */
  private getFullPath(notePath: string): string {
    // Ensure .md extension
    const normalizedPath = notePath.endsWith('.md') ? notePath : `${notePath}.md`;
    return path.join(this.vaultPath, normalizedPath);
  }

  /**
   * Get relative path from vault root
   */
  private getRelativePath(fullPath: string): string {
    return path.relative(this.vaultPath, fullPath);
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnore(relativePath: string): boolean {
    const parts = relativePath.split(path.sep);
    return parts.some((part) => this.ignoredFolders.includes(part));
  }

  /**
   * Parse note frontmatter
   */
  private parseNote(content: string): ParsedNote {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontmatterMatch) {
      return {
        frontmatter: {},
        content: content,
        raw: content,
      };
    }

    let frontmatter: Record<string, unknown> = {};
    try {
      // Simple YAML parsing (key: value pairs)
      const yamlContent = frontmatterMatch[1];
      for (const line of yamlContent.split('\n')) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
          const [, key, value] = match;
          // Parse arrays
          if (value.startsWith('[') && value.endsWith(']')) {
            frontmatter[key] = value
              .slice(1, -1)
              .split(',')
              .map((v) => v.trim().replace(/^["']|["']$/g, ''));
          } else if (value === 'true') {
            frontmatter[key] = true;
          } else if (value === 'false') {
            frontmatter[key] = false;
          } else if (!isNaN(Number(value)) && value !== '') {
            frontmatter[key] = Number(value);
          } else {
            frontmatter[key] = value.replace(/^["']|["']$/g, '');
          }
        }
      }
    } catch {
      frontmatter = {};
    }

    return {
      frontmatter,
      content: content.slice(frontmatterMatch[0].length),
      raw: content,
    };
  }

  /**
   * Serialize frontmatter to YAML
   */
  private serializeFrontmatter(frontmatter: Record<string, unknown>): string {
    if (Object.keys(frontmatter).length === 0) return '';

    const lines = ['---'];
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`);
      } else if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    lines.push('---\n');
    return lines.join('\n');
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string, frontmatter: Record<string, unknown>): string[] {
    const tags = new Set<string>();

    // Tags from frontmatter
    if (frontmatter.tags) {
      const fmTags = Array.isArray(frontmatter.tags)
        ? frontmatter.tags
        : [frontmatter.tags];
      fmTags.forEach((t: string) => tags.add(t.replace(/^#/, '')));
    }

    // Inline tags (#tag)
    const tagMatches = content.matchAll(/#([a-zA-Z][a-zA-Z0-9_/-]*)/g);
    for (const match of tagMatches) {
      tags.add(match[1]);
    }

    return Array.from(tags);
  }

  /**
   * Extract wiki links from content
   */
  private extractLinks(content: string): NoteLink[] {
    const links: NoteLink[] = [];
    const linkRegex = /(!?)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

    let match;
    let lineNumber = 1;
    let lineStart = 0;

    // Track line numbers
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        lineNumber++;
        lineStart = i + 1;
      }
    }

    // Reset and iterate with line tracking
    lineNumber = 1;
    lineStart = 0;
    const lines = content.split('\n');
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      linkRegex.lastIndex = 0;

      while ((match = linkRegex.exec(line)) !== null) {
        links.push({
          path: match[2],
          displayText: match[3],
          isEmbed: match[1] === '!',
          position: {
            start: offset + match.index,
            end: offset + match.index + match[0].length,
            line: i + 1,
          },
        });
      }

      offset += line.length + 1;
    }

    return links;
  }

  /**
   * Read a note
   */
  async readNote(notePath: string): Promise<ObsidianNote> {
    const fullPath = this.getFullPath(notePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stat = await fs.stat(fullPath);
      const parsed = this.parseNote(content);

      return {
        path: this.getRelativePath(fullPath),
        name: path.basename(fullPath, '.md'),
        extension: '.md',
        content: parsed.content,
        frontmatter: parsed.frontmatter,
        created: stat.birthtime,
        modified: stat.mtime,
        size: stat.size,
        tags: this.extractTags(parsed.content, parsed.frontmatter),
        links: this.extractLinks(parsed.content),
        backlinks: [], // Will be populated separately if needed
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IntegrationError(
          `Note not found: ${notePath}`,
          INTEGRATION_ERROR_CODES.NOT_FOUND,
          'obsidian',
        );
      }
      throw error;
    }
  }

  /**
   * Create a new note
   */
  async createNote(input: CreateNoteInput): Promise<ObsidianNote> {
    const fullPath = this.getFullPath(input.path);

    // Check if exists
    if (!input.overwrite) {
      try {
        await fs.stat(fullPath);
        throw new IntegrationError(
          `Note already exists: ${input.path}`,
          INTEGRATION_ERROR_CODES.VALIDATION_ERROR,
          'obsidian',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Build content with frontmatter
    const frontmatterStr = input.frontmatter
      ? this.serializeFrontmatter(input.frontmatter)
      : '';
    const fullContent = frontmatterStr + input.content;

    await fs.writeFile(fullPath, fullContent, 'utf-8');

    return this.readNote(input.path);
  }

  /**
   * Update a note
   */
  async updateNote(input: UpdateNoteInput): Promise<ObsidianNote> {
    const fullPath = this.getFullPath(input.path);

    // Read existing note
    let existingContent = '';
    let existingFrontmatter: Record<string, unknown> = {};

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const parsed = this.parseNote(content);
      existingContent = parsed.content;
      existingFrontmatter = parsed.frontmatter;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IntegrationError(
          `Note not found: ${input.path}`,
          INTEGRATION_ERROR_CODES.NOT_FOUND,
          'obsidian',
        );
      }
      throw error;
    }

    // Build new content
    let newContent = existingContent;
    if (input.content !== undefined) {
      if (input.append) {
        newContent = existingContent + '\n' + input.content;
      } else if (input.prepend) {
        newContent = input.content + '\n' + existingContent;
      } else {
        newContent = input.content;
      }
    }

    // Merge frontmatter
    const newFrontmatter = input.frontmatter
      ? { ...existingFrontmatter, ...input.frontmatter }
      : existingFrontmatter;

    // Write file
    const frontmatterStr = this.serializeFrontmatter(newFrontmatter);
    const fullContent = frontmatterStr + newContent;

    await fs.writeFile(fullPath, fullContent, 'utf-8');

    return this.readNote(input.path);
  }

  /**
   * Delete a note
   */
  async deleteNote(notePath: string): Promise<void> {
    const fullPath = this.getFullPath(notePath);

    try {
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new IntegrationError(
          `Note not found: ${notePath}`,
          INTEGRATION_ERROR_CODES.NOT_FOUND,
          'obsidian',
        );
      }
      throw error;
    }
  }

  /**
   * Search notes
   */
  async searchNotes(options: SearchOptions): Promise<NoteSearchResult[]> {
    const results: NoteSearchResult[] = [];
    const query = options.caseSensitive
      ? options.query
      : options.query.toLowerCase();

    const searchDir = options.folder
      ? path.join(this.vaultPath, options.folder)
      : this.vaultPath;

    await this.walkDirectory(searchDir, async (filePath) => {
      if (!filePath.endsWith('.md')) return;

      const relativePath = this.getRelativePath(filePath);
      if (this.shouldIgnore(relativePath)) return;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const stat = await fs.stat(filePath);
        const parsed = this.parseNote(content);
        const searchContent = options.caseSensitive
          ? content
          : content.toLowerCase();

        const matches: SearchMatch[] = [];
        let score = 0;

        // Search in filename
        const filename = path.basename(filePath, '.md');
        const searchFilename = options.caseSensitive
          ? filename
          : filename.toLowerCase();
        if (searchFilename.includes(query)) {
          score += 10;
        }

        // Search in content
        if (options.searchContent !== false) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = options.caseSensitive
              ? lines[i]
              : lines[i].toLowerCase();
            const idx = line.indexOf(query);
            if (idx !== -1) {
              matches.push({
                line: i + 1,
                column: idx,
                content: lines[i],
                context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
              });
              score += 1;
            }
          }
        }

        // Search in tags
        if (options.searchTags) {
          const tags = this.extractTags(parsed.content, parsed.frontmatter);
          for (const tag of tags) {
            const searchTag = options.caseSensitive ? tag : tag.toLowerCase();
            if (searchTag.includes(query)) {
              score += 5;
            }
          }
        }

        // Search in frontmatter
        if (options.searchFrontmatter) {
          const fmStr = JSON.stringify(parsed.frontmatter);
          const searchFm = options.caseSensitive ? fmStr : fmStr.toLowerCase();
          if (searchFm.includes(query)) {
            score += 3;
          }
        }

        if (score > 0) {
          results.push({
            note: {
              path: relativePath,
              name: filename,
              created: stat.birthtime,
              modified: stat.mtime,
              size: stat.size,
              tags: this.extractTags(parsed.content, parsed.frontmatter),
              frontmatter: parsed.frontmatter,
            },
            matches,
            score,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    });

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return options.limit ? results.slice(0, options.limit) : results;
  }

  /**
   * List folder contents
   */
  async listFolder(options: ListFolderOptions = {}): Promise<NoteMetadata[]> {
    const folderPath = options.path
      ? path.join(this.vaultPath, options.path)
      : this.vaultPath;

    const notes: NoteMetadata[] = [];

    if (options.recursive) {
      await this.walkDirectory(folderPath, async (filePath) => {
        if (!filePath.endsWith('.md')) return;

        const relativePath = this.getRelativePath(filePath);
        if (this.shouldIgnore(relativePath)) return;
        if (!options.includeHidden && path.basename(filePath).startsWith('.')) return;

        try {
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parseNote(content);

          notes.push({
            path: relativePath,
            name: path.basename(filePath, '.md'),
            created: stat.birthtime,
            modified: stat.mtime,
            size: stat.size,
            tags: this.extractTags(parsed.content, parsed.frontmatter),
            frontmatter: parsed.frontmatter,
          });
        } catch {
          // Skip files that can't be read
        }
      });
    } else {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        if (!options.includeHidden && entry.name.startsWith('.')) continue;

        const filePath = path.join(folderPath, entry.name);
        const relativePath = this.getRelativePath(filePath);
        if (this.shouldIgnore(relativePath)) continue;

        try {
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = this.parseNote(content);

          notes.push({
            path: relativePath,
            name: path.basename(entry.name, '.md'),
            created: stat.birthtime,
            modified: stat.mtime,
            size: stat.size,
            tags: this.extractTags(parsed.content, parsed.frontmatter),
            frontmatter: parsed.frontmatter,
          });
        } catch {
          // Skip
        }
      }
    }

    return notes.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  }

  /**
   * Get backlinks to a note
   */
  async getBacklinks(notePath: string): Promise<BacklinkResult[]> {
    const targetName = path.basename(notePath, '.md');
    const backlinks: BacklinkResult[] = [];

    await this.walkDirectory(this.vaultPath, async (filePath) => {
      if (!filePath.endsWith('.md')) return;

      const relativePath = this.getRelativePath(filePath);
      if (this.shouldIgnore(relativePath)) return;
      if (relativePath === notePath) return;

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

          let match;
          while ((match = linkRegex.exec(line)) !== null) {
            const linkedPath = match[1];
            const linkedName = path.basename(linkedPath, '.md');

            if (
              linkedName.toLowerCase() === targetName.toLowerCase() ||
              linkedPath.toLowerCase() === notePath.toLowerCase()
            ) {
              backlinks.push({
                sourcePath: relativePath,
                targetPath: notePath,
                linkText: match[0],
                context: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
                line: i + 1,
              });
            }
          }
        }
      } catch {
        // Skip
      }
    });

    return backlinks;
  }

  /**
   * Get vault statistics
   */
  async getStats(): Promise<VaultStats> {
    let totalNotes = 0;
    let totalFolders = 0;
    let totalSize = 0;
    const tagCounts: Record<string, number> = {};
    const recentNotes: NoteMetadata[] = [];

    const seenFolders = new Set<string>();

    await this.walkDirectory(this.vaultPath, async (filePath) => {
      const relativePath = this.getRelativePath(filePath);
      if (this.shouldIgnore(relativePath)) return;

      // Count folders
      const dir = path.dirname(relativePath);
      if (dir !== '.' && !seenFolders.has(dir)) {
        seenFolders.add(dir);
        totalFolders++;
      }

      if (!filePath.endsWith('.md')) return;

      try {
        const stat = await fs.stat(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseNote(content);

        totalNotes++;
        totalSize += stat.size;

        // Count tags
        const tags = this.extractTags(parsed.content, parsed.frontmatter);
        for (const tag of tags) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }

        // Track recent notes
        recentNotes.push({
          path: relativePath,
          name: path.basename(filePath, '.md'),
          created: stat.birthtime,
          modified: stat.mtime,
          size: stat.size,
          tags,
          frontmatter: parsed.frontmatter,
        });
      } catch {
        // Skip
      }
    });

    // Sort recent notes
    recentNotes.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    return {
      totalNotes,
      totalFolders,
      totalSize,
      tagCounts,
      recentNotes: recentNotes.slice(0, 10),
    };
  }

  /**
   * Walk directory recursively
   */
  private async walkDirectory(
    dir: string,
    callback: (filePath: string) => Promise<void>,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, callback);
        } else if (entry.isFile()) {
          await callback(fullPath);
        }
      }
    } catch {
      // Skip directories that can't be read
    }
  }
}
