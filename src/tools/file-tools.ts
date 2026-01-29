import { z } from 'zod';
import { promises as fs } from 'fs';
import { join, resolve, dirname, basename, extname } from 'path';
import { createHash } from 'crypto';
import { defineTool, CommonSchemas, type ToolDefinition } from './registry.js';
import type { ToolExecutionContext } from '../security/types.js';

// ============================================================================
// File Tools - Sandboxed file system operations
// ============================================================================

/**
 * Read file contents
 * Risk: Medium - Can read potentially sensitive files
 */
export const readFile = defineTool({
  name: 'file_read',
  description: 'Read the contents of a file. Returns text content for text files or base64 for binary files.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath,
    encoding: z.enum(['utf8', 'base64', 'hex']).optional().default('utf8'),
    maxBytes: z.number().int().positive().max(10 * 1024 * 1024).optional().default(1024 * 1024),
  }),
  riskLevel: 'medium',
  requiresApproval: false,
  sandboxed: true,
  timeout: 10000,
  rateLimit: { maxCalls: 100, windowMs: 60000 },
  async execute(params, context) {
    const resolvedPath = resolveSandboxedPath(params.path, context);

    const stats = await fs.stat(resolvedPath);
    const maxBytes = params.maxBytes ?? 1024 * 1024;
    if (stats.size > maxBytes) {
      throw new Error(`File size ${stats.size} exceeds maximum ${maxBytes} bytes`);
    }

    const content = await fs.readFile(resolvedPath);

    if (params.encoding === 'base64') {
      return {
        content: content.toString('base64'),
        encoding: 'base64',
        size: stats.size,
        path: params.path,
      };
    } else if (params.encoding === 'hex') {
      return {
        content: content.toString('hex'),
        encoding: 'hex',
        size: stats.size,
        path: params.path,
      };
    }

    return {
      content: content.toString('utf8'),
      encoding: 'utf8',
      size: stats.size,
      path: params.path,
    };
  },
});

/**
 * Write file contents
 * Risk: High - Can modify/create files
 */
export const writeFile = defineTool({
  name: 'file_write',
  description: 'Write content to a file. Creates the file if it does not exist, or overwrites if it does.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath,
    content: z.string().max(10 * 1024 * 1024),
    encoding: z.enum(['utf8', 'base64', 'hex']).optional().default('utf8'),
    createDirs: z.boolean().optional().default(false),
    append: z.boolean().optional().default(false),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: true,
  timeout: 10000,
  rateLimit: { maxCalls: 50, windowMs: 60000 },
  async execute(params, context) {
    const resolvedPath = resolveSandboxedPath(params.path, context);

    if (params.createDirs) {
      await fs.mkdir(dirname(resolvedPath), { recursive: true });
    }

    let data: Buffer;
    if (params.encoding === 'base64') {
      data = Buffer.from(params.content, 'base64');
    } else if (params.encoding === 'hex') {
      data = Buffer.from(params.content, 'hex');
    } else {
      data = Buffer.from(params.content, 'utf8');
    }

    if (params.append) {
      await fs.appendFile(resolvedPath, data);
    } else {
      await fs.writeFile(resolvedPath, data);
    }

    const stats = await fs.stat(resolvedPath);

    return {
      success: true,
      path: params.path,
      size: stats.size,
      created: !params.append,
    };
  },
});

/**
 * List directory contents
 * Risk: Low - Read-only directory listing
 */
export const listDirectory = defineTool({
  name: 'file_list',
  description: 'List files and directories in a given path. Returns file names, sizes, and types.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath.optional().default('.'),
    recursive: z.boolean().optional().default(false),
    maxDepth: z.number().int().min(1).max(10).optional().default(3),
    includeHidden: z.boolean().optional().default(false),
    pattern: z.string().max(100).optional(),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 30000,
  rateLimit: { maxCalls: 60, windowMs: 60000 },
  async execute(params, context) {
    const path = params.path ?? '.';
    const resolvedPath = resolveSandboxedPath(path, context);

    const entries = await listDirectoryRecursive(
      resolvedPath,
      path,
      params.recursive ? (params.maxDepth ?? 3) : 1,
      params.includeHidden ?? false,
      params.pattern ? new RegExp(params.pattern) : undefined
    );

    return {
      path,
      entries,
      count: entries.length,
    };
  },
});

async function listDirectoryRecursive(
  absolutePath: string,
  relativePath: string,
  depth: number,
  includeHidden: boolean,
  pattern?: RegExp
): Promise<Array<{
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
  modified?: number;
}>> {
  if (depth <= 0) return [];

  const entries: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size?: number;
    modified?: number;
  }> = [];

  const dirEntries = await fs.readdir(absolutePath, { withFileTypes: true });

  for (const entry of dirEntries) {
    if (!includeHidden && entry.name.startsWith('.')) continue;
    if (pattern && !pattern.test(entry.name)) continue;

    const entryRelativePath = join(relativePath, entry.name);
    const entryAbsolutePath = join(absolutePath, entry.name);

    let type: 'file' | 'directory' | 'symlink' | 'other' = 'other';
    if (entry.isFile()) type = 'file';
    else if (entry.isDirectory()) type = 'directory';
    else if (entry.isSymbolicLink()) type = 'symlink';

    const item: {
      name: string;
      path: string;
      type: 'file' | 'directory' | 'symlink' | 'other';
      size?: number;
      modified?: number;
    } = {
      name: entry.name,
      path: entryRelativePath,
      type,
    };

    try {
      const stats = await fs.stat(entryAbsolutePath);
      item.size = stats.size;
      item.modified = stats.mtimeMs;
    } catch {
      // Ignore stat errors
    }

    entries.push(item);

    if (entry.isDirectory() && depth > 1) {
      const subEntries = await listDirectoryRecursive(
        entryAbsolutePath,
        entryRelativePath,
        depth - 1,
        includeHidden,
        pattern
      );
      entries.push(...subEntries);
    }
  }

  return entries;
}

/**
 * Delete file or directory
 * Risk: Critical - Can delete files
 */
export const deleteFile = defineTool({
  name: 'file_delete',
  description: 'Delete a file or directory. Use recursive option for directories.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath,
    recursive: z.boolean().optional().default(false),
  }),
  riskLevel: 'critical',
  requiresApproval: true,
  sandboxed: true,
  timeout: 30000,
  rateLimit: { maxCalls: 20, windowMs: 60000 },
  requiredRoles: ['admin', 'operator'],
  async execute(params, context) {
    const resolvedPath = resolveSandboxedPath(params.path, context);

    const stats = await fs.stat(resolvedPath);
    const isDirectory = stats.isDirectory();

    if (isDirectory && !params.recursive) {
      throw new Error('Cannot delete directory without recursive flag');
    }

    await fs.rm(resolvedPath, { recursive: params.recursive, force: false });

    return {
      success: true,
      path: params.path,
      type: isDirectory ? 'directory' : 'file',
    };
  },
});

/**
 * Copy file or directory
 * Risk: High - Can duplicate files
 */
export const copyFile = defineTool({
  name: 'file_copy',
  description: 'Copy a file or directory to a new location.',
  version: '1.0.0',
  parameters: z.object({
    source: CommonSchemas.filePath,
    destination: CommonSchemas.filePath,
    overwrite: z.boolean().optional().default(false),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: true,
  timeout: 60000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  async execute(params, context) {
    const sourcePath = resolveSandboxedPath(params.source, context);
    const destPath = resolveSandboxedPath(params.destination, context);

    // Check if destination exists
    try {
      await fs.access(destPath);
      if (!params.overwrite) {
        throw new Error('Destination already exists. Use overwrite option.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await fs.cp(sourcePath, destPath, { recursive: true });

    const stats = await fs.stat(destPath);

    return {
      success: true,
      source: params.source,
      destination: params.destination,
      size: stats.size,
    };
  },
});

/**
 * Move/rename file
 * Risk: High - Can move/rename files
 */
export const moveFile = defineTool({
  name: 'file_move',
  description: 'Move or rename a file or directory.',
  version: '1.0.0',
  parameters: z.object({
    source: CommonSchemas.filePath,
    destination: CommonSchemas.filePath,
    overwrite: z.boolean().optional().default(false),
  }),
  riskLevel: 'high',
  requiresApproval: true,
  sandboxed: true,
  timeout: 30000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  async execute(params, context) {
    const sourcePath = resolveSandboxedPath(params.source, context);
    const destPath = resolveSandboxedPath(params.destination, context);

    // Check if destination exists
    try {
      await fs.access(destPath);
      if (!params.overwrite) {
        throw new Error('Destination already exists. Use overwrite option.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    await fs.rename(sourcePath, destPath);

    return {
      success: true,
      source: params.source,
      destination: params.destination,
    };
  },
});

/**
 * Get file information
 * Risk: Low - Read-only metadata
 */
export const fileInfo = defineTool({
  name: 'file_info',
  description: 'Get detailed information about a file including size, permissions, and timestamps.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath,
    checksum: z.boolean().optional().default(false),
    checksumAlgorithm: z.enum(['md5', 'sha1', 'sha256', 'sha512']).optional().default('sha256'),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 30000,
  rateLimit: { maxCalls: 100, windowMs: 60000 },
  async execute(params, context) {
    const resolvedPath = resolveSandboxedPath(params.path, context);

    const stats = await fs.stat(resolvedPath);

    const info: Record<string, unknown> = {
      path: params.path,
      name: basename(params.path),
      extension: extname(params.path),
      size: stats.size,
      type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : stats.isSymbolicLink() ? 'symlink' : 'other',
      permissions: {
        readable: true,
        writable: true,
        executable: (stats.mode & 0o111) !== 0,
        mode: stats.mode.toString(8),
      },
      timestamps: {
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
      },
    };

    if (params.checksum && stats.isFile()) {
      const content = await fs.readFile(resolvedPath);
      const checksumAlgorithm = params.checksumAlgorithm ?? 'sha256';
      const hash = createHash(checksumAlgorithm);
      hash.update(content);
      info.checksum = {
        algorithm: checksumAlgorithm,
        value: hash.digest('hex'),
      };
    }

    return info;
  },
});

/**
 * Create directory
 * Risk: Medium - Creates new directories
 */
export const createDirectory = defineTool({
  name: 'file_mkdir',
  description: 'Create a new directory. Can create nested directories with recursive option.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath,
    recursive: z.boolean().optional().default(true),
  }),
  riskLevel: 'medium',
  requiresApproval: false,
  sandboxed: true,
  timeout: 5000,
  rateLimit: { maxCalls: 50, windowMs: 60000 },
  async execute(params, context) {
    const resolvedPath = resolveSandboxedPath(params.path, context);

    await fs.mkdir(resolvedPath, { recursive: params.recursive });

    return {
      success: true,
      path: params.path,
    };
  },
});

/**
 * Search for files
 * Risk: Low - Read-only search
 */
export const searchFiles = defineTool({
  name: 'file_search',
  description: 'Search for files matching a pattern. Supports glob-like patterns.',
  version: '1.0.0',
  parameters: z.object({
    path: CommonSchemas.filePath.optional().default('.'),
    pattern: z.string().min(1).max(100),
    type: z.enum(['file', 'directory', 'all']).optional().default('all'),
    maxResults: z.number().int().min(1).max(1000).optional().default(100),
    maxDepth: z.number().int().min(1).max(20).optional().default(10),
  }),
  riskLevel: 'low',
  requiresApproval: false,
  sandboxed: true,
  timeout: 60000,
  rateLimit: { maxCalls: 30, windowMs: 60000 },
  async execute(params, context) {
    const searchPath = params.path ?? '.';
    const resolvedPath = resolveSandboxedPath(searchPath, context);
    const regex = globToRegex(params.pattern);
    const maxResults = params.maxResults ?? 100;
    const maxDepth = params.maxDepth ?? 10;
    const searchType = params.type ?? 'all';

    const results: Array<{ name: string; path: string; type: string; size?: number }> = [];

    await searchRecursive(
      resolvedPath,
      searchPath,
      regex,
      searchType,
      maxDepth,
      maxResults,
      results
    );

    return {
      pattern: params.pattern,
      results,
      count: results.length,
      truncated: results.length >= maxResults,
    };
  },
});

async function searchRecursive(
  absolutePath: string,
  relativePath: string,
  pattern: RegExp,
  type: 'file' | 'directory' | 'all',
  depth: number,
  maxResults: number,
  results: Array<{ name: string; path: string; type: string; size?: number }>
): Promise<void> {
  if (depth <= 0 || results.length >= maxResults) return;

  try {
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const entryRelativePath = join(relativePath, entry.name);
      const entryAbsolutePath = join(absolutePath, entry.name);

      const isFile = entry.isFile();
      const isDirectory = entry.isDirectory();

      const matchesType = type === 'all' ||
        (type === 'file' && isFile) ||
        (type === 'directory' && isDirectory);

      if (matchesType && pattern.test(entry.name)) {
        const item: { name: string; path: string; type: string; size?: number } = {
          name: entry.name,
          path: entryRelativePath,
          type: isFile ? 'file' : isDirectory ? 'directory' : 'other',
        };

        if (isFile) {
          try {
            const stats = await fs.stat(entryAbsolutePath);
            item.size = stats.size;
          } catch {
            // Ignore stat errors
          }
        }

        results.push(item);
      }

      if (isDirectory) {
        await searchRecursive(
          entryAbsolutePath,
          entryRelativePath,
          pattern,
          type,
          depth - 1,
          maxResults,
          results
        );
      }
    }
  } catch {
    // Ignore directory access errors
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

// ============================================================================
// Helper Functions
// ============================================================================

function resolveSandboxedPath(path: string, context: ToolExecutionContext): string {
  // Get sandbox root from session context or use a default
  const sandboxRoot = (context.session.metadata?.sandboxRoot as string) ?? process.cwd();

  // Resolve the path relative to sandbox root
  const resolved = resolve(sandboxRoot, path);

  // Ensure path stays within sandbox
  if (!resolved.startsWith(sandboxRoot)) {
    throw new Error('Path escapes sandbox boundary');
  }

  return resolved;
}

// ============================================================================
// Export all file tools
// ============================================================================

export const fileTools: ToolDefinition<unknown, unknown>[] = [
  readFile as ToolDefinition<unknown, unknown>,
  writeFile as ToolDefinition<unknown, unknown>,
  listDirectory as ToolDefinition<unknown, unknown>,
  deleteFile as ToolDefinition<unknown, unknown>,
  copyFile as ToolDefinition<unknown, unknown>,
  moveFile as ToolDefinition<unknown, unknown>,
  fileInfo as ToolDefinition<unknown, unknown>,
  createDirectory as ToolDefinition<unknown, unknown>,
  searchFiles as ToolDefinition<unknown, unknown>,
];
