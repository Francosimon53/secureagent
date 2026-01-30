// Core registry exports
export {
  ToolRegistry,
  defineTool,
  CommonSchemas,
  type ToolDefinition,
  type RiskLevel,
} from './registry.js';

// File tools
export {
  readFile,
  writeFile,
  listDirectory,
  deleteFile,
  copyFile,
  moveFile,
  fileInfo,
  createDirectory,
  searchFiles,
  fileTools,
} from './file-tools.js';

// HTTP tools
export {
  httpRequest,
  httpDownload,
  graphqlRequest,
  httpPing,
  parseUrl,
  buildUrl,
  httpTools,
} from './http-tools.js';

// Shell tools
export {
  shellExec,
  shellScript,
  getEnv,
  listEnv,
  commandExists,
  getCwd,
  systemInfo,
  shellTools,
} from './shell-tools.js';

// Data tools
export {
  jsonParse,
  jsonStringify,
  jsonQuery,
  base64Encode,
  base64Decode,
  hexEncode,
  hexDecode,
  urlEncode,
  urlDecode,
  computeHash,
  computeHmac,
  generateRandom,
  generateUuid,
  getTimestamp,
  parseDate,
  textOps,
  regexOps,
  dataTools,
} from './data-tools.js';

// Browser tools
export {
  BrowserTools,
  BrowserManager,
  createBrowserTools,
  getBrowserTools,
  type BrowserToolConfig,
  type BrowserSession,
  type NavigateResult,
  type ScreenshotResult,
  type ClickResult,
  type TypeResult,
  type ExtractResult,
  type QueryResult,
  type ElementInfo,
  BrowserNavigateSchema,
  BrowserScreenshotSchema,
  BrowserClickSchema,
  BrowserTypeSchema,
  BrowserExtractSchema,
  BrowserQuerySchema,
  BrowserEvalSchema,
  BrowserWaitSchema,
} from './browser-tools.js';

// Import tool arrays for aggregation
import { fileTools } from './file-tools.js';
import { httpTools } from './http-tools.js';
import { shellTools } from './shell-tools.js';
import { dataTools } from './data-tools.js';
import { ToolRegistry, type ToolDefinition } from './registry.js';

// ============================================================================
// Tool Collections
// ============================================================================

/**
 * All available tools grouped by category
 */
export const toolsByCategory = {
  file: fileTools,
  http: httpTools,
  shell: shellTools,
  data: dataTools,
} as const;

/**
 * All tools as a flat array
 */
export const allTools: ToolDefinition<unknown, unknown>[] = [
  ...fileTools,
  ...httpTools,
  ...shellTools,
  ...dataTools,
];

/**
 * Tool names by risk level
 */
export const toolsByRiskLevel = {
  low: allTools.filter(t => t.riskLevel === 'low').map(t => t.name),
  medium: allTools.filter(t => t.riskLevel === 'medium').map(t => t.name),
  high: allTools.filter(t => t.riskLevel === 'high').map(t => t.name),
  critical: allTools.filter(t => t.riskLevel === 'critical').map(t => t.name),
} as const;

/**
 * Tool names that require sandbox execution
 */
export const sandboxedToolNames = allTools
  .filter(t => t.sandboxed)
  .map(t => t.name);

/**
 * Tool names that require approval
 */
export const approvalRequiredToolNames = allTools
  .filter(t => t.requiresApproval)
  .map(t => t.name);

// ============================================================================
// Registry Helpers
// ============================================================================

/**
 * Create a pre-configured tool registry with specified tool categories
 */
export function createToolRegistry(options: {
  categories?: Array<'file' | 'http' | 'shell' | 'data'>;
  tools?: string[];
  riskLevels?: Array<'low' | 'medium' | 'high' | 'critical'>;
  allowSandboxed?: boolean;
  allowApprovalRequired?: boolean;
}): ToolRegistry {
  const {
    categories,
    tools: specificTools,
    riskLevels,
    allowSandboxed = true,
    allowApprovalRequired = true,
  } = options;

  // Determine which tools to allow
  let toolsToRegister: ToolDefinition<unknown, unknown>[];

  if (specificTools && specificTools.length > 0) {
    // Filter to specific tools
    toolsToRegister = allTools.filter(t => specificTools.includes(t.name));
  } else if (categories && categories.length > 0) {
    // Filter by categories
    toolsToRegister = categories.flatMap(cat => toolsByCategory[cat]);
  } else {
    // All tools
    toolsToRegister = [...allTools];
  }

  // Filter by risk level
  if (riskLevels && riskLevels.length > 0) {
    toolsToRegister = toolsToRegister.filter(t => riskLevels.includes(t.riskLevel));
  }

  // Filter by sandbox requirement
  if (!allowSandboxed) {
    toolsToRegister = toolsToRegister.filter(t => !t.sandboxed);
  }

  // Filter by approval requirement
  if (!allowApprovalRequired) {
    toolsToRegister = toolsToRegister.filter(t => !t.requiresApproval);
  }

  // Create allowlist
  const allowlist = toolsToRegister.map(t => t.name);

  // Create registry and register tools
  const registry = new ToolRegistry(allowlist);

  for (const tool of toolsToRegister) {
    registry.register(tool);
  }

  return registry;
}

/**
 * Create a minimal tool registry with only safe, non-approval-required tools
 */
export function createSafeToolRegistry(): ToolRegistry {
  return createToolRegistry({
    riskLevels: ['low'],
    allowApprovalRequired: false,
  });
}

/**
 * Create a full tool registry with all available tools
 */
export function createFullToolRegistry(): ToolRegistry {
  return createToolRegistry({});
}

/**
 * Get tool definition by name
 */
export function getToolByName(name: string): ToolDefinition<unknown, unknown> | undefined {
  return allTools.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
  return allTools.map(t => t.name);
}

/**
 * Get tool metadata for documentation/introspection
 */
export function getToolMetadata(): Array<{
  name: string;
  description: string;
  version: string;
  riskLevel: string;
  requiresApproval: boolean;
  sandboxed: boolean;
  timeout: number;
  category: string;
}> {
  const categoryMap = new Map<string, string>();

  for (const [category, tools] of Object.entries(toolsByCategory)) {
    for (const tool of tools) {
      categoryMap.set(tool.name, category);
    }
  }

  return allTools.map(t => ({
    name: t.name,
    description: t.description,
    version: t.version,
    riskLevel: t.riskLevel,
    requiresApproval: t.requiresApproval,
    sandboxed: t.sandboxed,
    timeout: t.timeout,
    category: categoryMap.get(t.name) ?? 'unknown',
  }));
}

// ============================================================================
// Global Registry Singleton
// ============================================================================

let globalToolRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalToolRegistry) {
    globalToolRegistry = createFullToolRegistry();
  }
  return globalToolRegistry;
}

/**
 * Set the global tool registry instance
 */
export function setToolRegistry(registry: ToolRegistry): void {
  globalToolRegistry = registry;
}
