/**
 * Obsidian Integration - Tool Definitions
 */

import type { ToolDefinition } from '../types.js';
import type { ObsidianVault } from './vault.js';

/**
 * Create Obsidian tools
 */
export function createObsidianTools(vault: ObsidianVault): ToolDefinition[] {
  return [
    createSearchTool(vault),
    createReadNoteTool(vault),
    createCreateNoteTool(vault),
    createUpdateNoteTool(vault),
    createDeleteNoteTool(vault),
    createListFolderTool(vault),
    createGetBacklinksTool(vault),
  ];
}

/**
 * Search notes
 */
function createSearchTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_search',
    description:
      'Search for notes in the Obsidian vault by content, title, or tags.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query',
        required: true,
      },
      {
        name: 'searchContent',
        type: 'boolean',
        description: 'Search in note content (default: true)',
        required: false,
        default: true,
      },
      {
        name: 'searchTags',
        type: 'boolean',
        description: 'Search in tags (default: true)',
        required: false,
        default: true,
      },
      {
        name: 'folder',
        type: 'string',
        description: 'Limit search to a specific folder',
        required: false,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results (default: 20)',
        required: false,
        default: 20,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const results = await vault.searchNotes({
          query: params.query as string,
          searchContent: (params.searchContent as boolean) !== false,
          searchTags: (params.searchTags as boolean) !== false,
          folder: params.folder as string | undefined,
          limit: (params.limit as number) || 20,
        });

        return {
          success: true,
          data: {
            results: results.map((r) => ({
              path: r.note.path,
              name: r.note.name,
              modified: r.note.modified.toISOString(),
              tags: r.note.tags,
              score: r.score,
              matchCount: r.matches.length,
              preview: r.matches[0]?.context,
            })),
            total: results.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to search notes',
        };
      }
    },
  };
}

/**
 * Read note content
 */
function createReadNoteTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_read_note',
    description: 'Read the content of a note from the Obsidian vault.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the note (e.g., "folder/note" or "folder/note.md")',
        required: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const note = await vault.readNote(params.path as string);

        return {
          success: true,
          data: {
            path: note.path,
            name: note.name,
            content: note.content,
            frontmatter: note.frontmatter,
            tags: note.tags,
            links: note.links.map((l) => ({
              path: l.path,
              displayText: l.displayText,
              isEmbed: l.isEmbed,
            })),
            created: note.created.toISOString(),
            modified: note.modified.toISOString(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read note',
        };
      }
    },
  };
}

/**
 * Create new note
 */
function createCreateNoteTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_create_note',
    description: 'Create a new note in the Obsidian vault.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path for the new note (e.g., "folder/note")',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Note content (Markdown)',
        required: true,
      },
      {
        name: 'frontmatter',
        type: 'object',
        description: 'YAML frontmatter properties',
        required: false,
      },
      {
        name: 'overwrite',
        type: 'boolean',
        description: 'Overwrite if note exists (default: false)',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const note = await vault.createNote({
          path: params.path as string,
          content: params.content as string,
          frontmatter: params.frontmatter as Record<string, unknown> | undefined,
          overwrite: params.overwrite as boolean,
        });

        return {
          success: true,
          data: {
            path: note.path,
            name: note.name,
            created: note.created.toISOString(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to create note',
        };
      }
    },
  };
}

/**
 * Update note
 */
function createUpdateNoteTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_update_note',
    description: 'Update an existing note in the Obsidian vault.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the note',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'New content (replaces existing unless append/prepend is set)',
        required: false,
      },
      {
        name: 'frontmatter',
        type: 'object',
        description: 'Frontmatter properties to update (merged with existing)',
        required: false,
      },
      {
        name: 'append',
        type: 'boolean',
        description: 'Append content instead of replacing',
        required: false,
        default: false,
      },
      {
        name: 'prepend',
        type: 'boolean',
        description: 'Prepend content instead of replacing',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'medium',
    execute: async (params) => {
      try {
        const note = await vault.updateNote({
          path: params.path as string,
          content: params.content as string | undefined,
          frontmatter: params.frontmatter as Record<string, unknown> | undefined,
          append: params.append as boolean,
          prepend: params.prepend as boolean,
        });

        return {
          success: true,
          data: {
            path: note.path,
            name: note.name,
            modified: note.modified.toISOString(),
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to update note',
        };
      }
    },
  };
}

/**
 * Delete note
 */
function createDeleteNoteTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_delete_note',
    description: 'Delete a note from the Obsidian vault.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the note to delete',
        required: true,
      },
    ],
    riskLevel: 'high',
    execute: async (params) => {
      try {
        await vault.deleteNote(params.path as string);

        return {
          success: true,
          data: { deleted: true, path: params.path },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete note',
        };
      }
    },
  };
}

/**
 * List folder contents
 */
function createListFolderTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_list_folder',
    description: 'List notes in a folder of the Obsidian vault.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Folder path (empty for root)',
        required: false,
      },
      {
        name: 'recursive',
        type: 'boolean',
        description: 'Include subfolders (default: false)',
        required: false,
        default: false,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const notes = await vault.listFolder({
          path: params.path as string | undefined,
          recursive: params.recursive as boolean,
        });

        return {
          success: true,
          data: {
            notes: notes.map((n) => ({
              path: n.path,
              name: n.name,
              tags: n.tags,
              modified: n.modified.toISOString(),
            })),
            total: notes.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to list folder',
        };
      }
    },
  };
}

/**
 * Get backlinks
 */
function createGetBacklinksTool(vault: ObsidianVault): ToolDefinition {
  return {
    name: 'obsidian_get_backlinks',
    description: 'Get all notes that link to a specific note.',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the target note',
        required: true,
      },
    ],
    riskLevel: 'low',
    execute: async (params) => {
      try {
        const backlinks = await vault.getBacklinks(params.path as string);

        return {
          success: true,
          data: {
            backlinks: backlinks.map((b) => ({
              sourcePath: b.sourcePath,
              linkText: b.linkText,
              context: b.context,
              line: b.line,
            })),
            total: backlinks.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to get backlinks',
        };
      }
    },
  };
}
