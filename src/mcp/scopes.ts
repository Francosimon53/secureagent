import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'MCPScopes' });

// ============================================================================
// MCP Scope System
// ============================================================================

/**
 * Scope definition
 */
export interface ScopeDefinition {
  name: string;
  description: string;
  /** Parent scope (inherits all permissions from parent) */
  parent?: string;
  /** Associated tool permissions */
  tools?: string[];
  /** Associated resource permissions */
  resources?: string[];
  /** Risk level for this scope */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Whether this scope requires MFA */
  requiresMfa?: boolean;
}

/**
 * Tool-to-scope mapping
 */
export interface ToolScopeMapping {
  toolName: string;
  /** Required scopes (ANY of these grants access) */
  requiredScopes: string[];
  /** Scopes that explicitly deny access */
  denyScopes?: string[];
}

// ============================================================================
// Predefined Scopes
// ============================================================================

/**
 * Standard MCP scopes following OAuth 2.0 conventions
 */
export const STANDARD_SCOPES: Record<string, ScopeDefinition> = {
  // Read-only scopes
  'read': {
    name: 'read',
    description: 'Read access to resources and tool listings',
    riskLevel: 'low',
  },
  'tools:list': {
    name: 'tools:list',
    description: 'List available tools',
    parent: 'read',
    riskLevel: 'low',
  },
  'resources:read': {
    name: 'resources:read',
    description: 'Read resources',
    parent: 'read',
    riskLevel: 'low',
  },
  'prompts:read': {
    name: 'prompts:read',
    description: 'Read prompt templates',
    parent: 'read',
    riskLevel: 'low',
  },

  // Write scopes
  'write': {
    name: 'write',
    description: 'Write access including tool execution',
    parent: 'read',
    riskLevel: 'medium',
  },
  'resources:write': {
    name: 'resources:write',
    description: 'Write to resources',
    parent: 'write',
    riskLevel: 'medium',
  },

  // Tool execution scopes
  'tools:execute': {
    name: 'tools:execute',
    description: 'Execute any allowed tool',
    parent: 'write',
    riskLevel: 'high',
  },
  'tools:execute:safe': {
    name: 'tools:execute:safe',
    description: 'Execute only safe (low-risk) tools',
    riskLevel: 'low',
    tools: ['file_read', 'file_list', 'file_info', 'http_ping', 'shell_which', 'shell_pwd', 'shell_sysinfo'],
  },
  'tools:execute:file': {
    name: 'tools:execute:file',
    description: 'Execute file-related tools',
    riskLevel: 'medium',
    tools: ['file_read', 'file_write', 'file_list', 'file_delete', 'file_copy', 'file_move', 'file_info', 'file_mkdir', 'file_search'],
  },
  'tools:execute:http': {
    name: 'tools:execute:http',
    description: 'Execute HTTP-related tools',
    riskLevel: 'medium',
    tools: ['http_request', 'http_download', 'http_graphql', 'http_ping', 'http_parse_url', 'http_build_url'],
  },
  'tools:execute:shell': {
    name: 'tools:execute:shell',
    description: 'Execute shell commands (high risk)',
    riskLevel: 'critical',
    requiresMfa: true,
    tools: ['shell_exec', 'shell_script', 'shell_env_get', 'shell_env_list', 'shell_which', 'shell_pwd', 'shell_sysinfo'],
  },
  'tools:execute:data': {
    name: 'tools:execute:data',
    description: 'Execute data transformation tools',
    riskLevel: 'low',
    tools: ['json_parse', 'json_stringify', 'base64_encode', 'base64_decode', 'url_encode', 'url_decode', 'hash', 'uuid', 'timestamp'],
  },

  // Admin scopes
  'admin': {
    name: 'admin',
    description: 'Full administrative access',
    parent: 'tools:execute',
    riskLevel: 'critical',
    requiresMfa: true,
  },
  'admin:clients': {
    name: 'admin:clients',
    description: 'Manage OAuth clients',
    parent: 'admin',
    riskLevel: 'critical',
    requiresMfa: true,
  },
  'admin:users': {
    name: 'admin:users',
    description: 'Manage users',
    parent: 'admin',
    riskLevel: 'critical',
    requiresMfa: true,
  },

  // Special scopes
  'offline_access': {
    name: 'offline_access',
    description: 'Request refresh tokens',
    riskLevel: 'medium',
  },
};

// ============================================================================
// Scope Manager
// ============================================================================

/**
 * Manages scope definitions and authorization checks
 */
export class ScopeManager {
  private readonly scopes = new Map<string, ScopeDefinition>();
  private readonly toolMappings = new Map<string, ToolScopeMapping>();
  private readonly scopeHierarchy = new Map<string, Set<string>>(); // scope -> all parent scopes

  constructor() {
    // Register standard scopes
    for (const scope of Object.values(STANDARD_SCOPES)) {
      this.registerScope(scope);
    }
  }

  /**
   * Register a scope definition
   */
  registerScope(scope: ScopeDefinition): void {
    this.scopes.set(scope.name, scope);
    this.rebuildHierarchy();

    // Register tool mappings from scope
    if (scope.tools) {
      for (const tool of scope.tools) {
        this.addToolMapping(tool, scope.name);
      }
    }

    logger.debug({ scope: scope.name }, 'Scope registered');
  }

  /**
   * Get a scope definition
   */
  getScope(name: string): ScopeDefinition | undefined {
    return this.scopes.get(name);
  }

  /**
   * Get all scope names
   */
  getAllScopes(): string[] {
    return Array.from(this.scopes.keys());
  }

  /**
   * Register a tool-to-scope mapping
   */
  registerToolMapping(mapping: ToolScopeMapping): void {
    this.toolMappings.set(mapping.toolName, mapping);
  }

  /**
   * Add a single tool-scope association
   */
  addToolMapping(toolName: string, scope: string): void {
    let mapping = this.toolMappings.get(toolName);
    if (!mapping) {
      mapping = { toolName, requiredScopes: [] };
      this.toolMappings.set(toolName, mapping);
    }
    if (!mapping.requiredScopes.includes(scope)) {
      mapping.requiredScopes.push(scope);
    }
  }

  /**
   * Check if a set of scopes grants access to a tool
   */
  canExecuteTool(grantedScopes: string[], toolName: string): {
    allowed: boolean;
    reason?: string;
    matchedScope?: string;
  } {
    // Get all effective scopes (including inherited)
    const effectiveScopes = this.getEffectiveScopes(grantedScopes);

    // Check for admin scope (grants everything)
    if (effectiveScopes.has('admin') || effectiveScopes.has('tools:execute')) {
      return { allowed: true, matchedScope: 'admin' };
    }

    // Check tool-specific mapping
    const mapping = this.toolMappings.get(toolName);
    if (mapping) {
      // Check deny scopes first
      if (mapping.denyScopes) {
        for (const denyScope of mapping.denyScopes) {
          if (effectiveScopes.has(denyScope)) {
            return {
              allowed: false,
              reason: `Scope '${denyScope}' explicitly denies access to tool '${toolName}'`,
            };
          }
        }
      }

      // Check required scopes
      for (const requiredScope of mapping.requiredScopes) {
        if (effectiveScopes.has(requiredScope)) {
          return { allowed: true, matchedScope: requiredScope };
        }
      }

      return {
        allowed: false,
        reason: `None of the required scopes (${mapping.requiredScopes.join(', ')}) were granted for tool '${toolName}'`,
      };
    }

    // No explicit mapping - check for general execute scope
    if (effectiveScopes.has('write')) {
      return { allowed: true, matchedScope: 'write' };
    }

    return {
      allowed: false,
      reason: `No scope grants access to tool '${toolName}'`,
    };
  }

  /**
   * Check if scopes require MFA
   */
  requiresMfa(scopes: string[]): boolean {
    for (const scopeName of scopes) {
      const scope = this.scopes.get(scopeName);
      if (scope?.requiresMfa) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the highest risk level among scopes
   */
  getMaxRiskLevel(scopes: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const riskOrder = ['low', 'medium', 'high', 'critical'];
    let maxRisk = 0;

    for (const scopeName of scopes) {
      const scope = this.scopes.get(scopeName);
      if (scope) {
        const riskIndex = riskOrder.indexOf(scope.riskLevel);
        if (riskIndex > maxRisk) {
          maxRisk = riskIndex;
        }
      }
    }

    return riskOrder[maxRisk] as 'low' | 'medium' | 'high' | 'critical';
  }

  /**
   * Get all effective scopes (including parent scopes)
   */
  getEffectiveScopes(scopes: string[]): Set<string> {
    const effective = new Set<string>();

    for (const scope of scopes) {
      effective.add(scope);

      // Add all parent scopes
      const parents = this.scopeHierarchy.get(scope);
      if (parents) {
        for (const parent of parents) {
          effective.add(parent);
        }
      }
    }

    return effective;
  }

  /**
   * Validate requested scopes against allowed scopes
   */
  validateScopes(
    requestedScopes: string[],
    allowedScopes: string[]
  ): { valid: string[]; invalid: string[] } {
    const allowedSet = new Set(allowedScopes);
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const scope of requestedScopes) {
      if (allowedSet.has(scope)) {
        valid.push(scope);
      } else {
        invalid.push(scope);
      }
    }

    return { valid, invalid };
  }

  /**
   * Get tools accessible with given scopes
   */
  getAccessibleTools(scopes: string[]): string[] {
    const effectiveScopes = this.getEffectiveScopes(scopes);
    const tools: string[] = [];

    // If has admin or tools:execute, all tools are accessible
    if (effectiveScopes.has('admin') || effectiveScopes.has('tools:execute')) {
      for (const [toolName] of this.toolMappings) {
        tools.push(toolName);
      }
      return tools;
    }

    // Check each tool mapping
    for (const [toolName, mapping] of this.toolMappings) {
      // Skip if denied
      if (mapping.denyScopes?.some(s => effectiveScopes.has(s))) {
        continue;
      }

      // Check if any required scope is granted
      if (mapping.requiredScopes.some(s => effectiveScopes.has(s))) {
        tools.push(toolName);
      }
    }

    return tools;
  }

  /**
   * Parse scope string into array
   */
  static parseScopes(scopeString: string): string[] {
    return scopeString.split(/\s+/).filter(Boolean);
  }

  /**
   * Join scopes into string
   */
  static joinScopes(scopes: string[]): string {
    return scopes.join(' ');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private rebuildHierarchy(): void {
    this.scopeHierarchy.clear();

    for (const [name, scope] of this.scopes) {
      const parents = new Set<string>();
      this.collectParents(scope, parents);
      this.scopeHierarchy.set(name, parents);
    }
  }

  private collectParents(scope: ScopeDefinition, parents: Set<string>): void {
    if (scope.parent) {
      parents.add(scope.parent);
      const parentScope = this.scopes.get(scope.parent);
      if (parentScope) {
        this.collectParents(parentScope, parents);
      }
    }
  }
}

// ============================================================================
// Scope Checking Utilities
// ============================================================================

/**
 * Check if a scope string contains a required scope
 */
export function hasScope(grantedScopes: string | string[], requiredScope: string): boolean {
  const scopes = Array.isArray(grantedScopes)
    ? grantedScopes
    : ScopeManager.parseScopes(grantedScopes);
  return scopes.includes(requiredScope);
}

/**
 * Check if a scope string contains any of the required scopes
 */
export function hasAnyScope(grantedScopes: string | string[], requiredScopes: string[]): boolean {
  const scopes = Array.isArray(grantedScopes)
    ? grantedScopes
    : ScopeManager.parseScopes(grantedScopes);
  return requiredScopes.some(s => scopes.includes(s));
}

/**
 * Check if a scope string contains all required scopes
 */
export function hasAllScopes(grantedScopes: string | string[], requiredScopes: string[]): boolean {
  const scopes = Array.isArray(grantedScopes)
    ? grantedScopes
    : ScopeManager.parseScopes(grantedScopes);
  return requiredScopes.every(s => scopes.includes(s));
}

/**
 * Create a scope manager with default configuration
 */
export function createScopeManager(): ScopeManager {
  return new ScopeManager();
}
