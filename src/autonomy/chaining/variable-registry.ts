/**
 * Variable Registry
 * Manages variable storage and passing between chain steps
 */

import { EventEmitter } from 'events';
import type { StoredVariable, VariableScope } from '../types.js';
import { AUTONOMY_EVENTS } from '../constants.js';

/**
 * Variable registry configuration
 */
export interface VariableRegistryConfig {
  /** Default expiration in ms (0 = never) */
  defaultExpiration?: number;
  /** Enable persistence */
  persist?: boolean;
  /** Maximum variables per scope */
  maxVariablesPerScope?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<VariableRegistryConfig> = {
  defaultExpiration: 0,
  persist: false,
  maxVariablesPerScope: 1000,
};

/**
 * Variable Registry
 * Stores and retrieves variables across chain steps and executions
 */
export class VariableRegistry extends EventEmitter {
  private readonly config: Required<VariableRegistryConfig>;
  private readonly variables: Map<string, StoredVariable> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config?: VariableRegistryConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start cleanup interval for expired variables
    if (this.config.defaultExpiration > 0) {
      this.startCleanup();
    }
  }

  /**
   * Set a variable
   */
  set(
    name: string,
    value: unknown,
    options: {
      scope?: VariableScope;
      sourceId?: string;
      expiresIn?: number;
    } = {}
  ): void {
    const scope = options.scope ?? 'execution';
    const key = this.makeKey(name, scope, options.sourceId);

    // Check scope limit
    const scopeVariables = this.getByScope(scope, options.sourceId);
    if (scopeVariables.length >= this.config.maxVariablesPerScope) {
      // Remove oldest variable in scope
      const oldest = scopeVariables.sort((a, b) => a.createdAt - b.createdAt)[0];
      if (oldest) {
        this.delete(oldest.name, scope, options.sourceId);
      }
    }

    const expiresAt = options.expiresIn
      ? Date.now() + options.expiresIn
      : this.config.defaultExpiration > 0
        ? Date.now() + this.config.defaultExpiration
        : undefined;

    const variable: StoredVariable = {
      name,
      value,
      scope,
      sourceId: options.sourceId ?? 'global',
      createdAt: Date.now(),
      expiresAt,
    };

    const isUpdate = this.variables.has(key);
    this.variables.set(key, variable);

    this.emit(isUpdate ? AUTONOMY_EVENTS.VARIABLE_UPDATED : AUTONOMY_EVENTS.VARIABLE_SET, {
      name,
      scope,
      sourceId: options.sourceId,
      timestamp: Date.now(),
    });
  }

  /**
   * Get a variable
   */
  get<T = unknown>(
    name: string,
    scope?: VariableScope,
    sourceId?: string
  ): T | undefined {
    // Try exact match first
    if (scope) {
      const key = this.makeKey(name, scope, sourceId);
      const variable = this.variables.get(key);
      if (variable && !this.isExpired(variable)) {
        return variable.value as T;
      }
    }

    // Search through scopes in order of specificity
    const scopes: VariableScope[] = ['step', 'chain', 'execution', 'session'];
    for (const s of scopes) {
      const key = this.makeKey(name, s, sourceId);
      const variable = this.variables.get(key);
      if (variable && !this.isExpired(variable)) {
        return variable.value as T;
      }
    }

    // Try global
    const globalKey = this.makeKey(name, 'execution', 'global');
    const globalVariable = this.variables.get(globalKey);
    if (globalVariable && !this.isExpired(globalVariable)) {
      return globalVariable.value as T;
    }

    return undefined;
  }

  /**
   * Check if a variable exists
   */
  has(name: string, scope?: VariableScope, sourceId?: string): boolean {
    return this.get(name, scope, sourceId) !== undefined;
  }

  /**
   * Delete a variable
   */
  delete(name: string, scope?: VariableScope, sourceId?: string): boolean {
    if (scope) {
      const key = this.makeKey(name, scope, sourceId);
      return this.variables.delete(key);
    }

    // Delete from all scopes
    let deleted = false;
    const scopes: VariableScope[] = ['step', 'chain', 'execution', 'session'];
    for (const s of scopes) {
      const key = this.makeKey(name, s, sourceId);
      if (this.variables.delete(key)) {
        deleted = true;
      }
    }
    return deleted;
  }

  /**
   * Get all variables in a scope
   */
  getByScope(scope: VariableScope, sourceId?: string): StoredVariable[] {
    const result: StoredVariable[] = [];
    for (const variable of this.variables.values()) {
      if (variable.scope === scope) {
        if (!sourceId || variable.sourceId === sourceId) {
          if (!this.isExpired(variable)) {
            result.push(variable);
          }
        }
      }
    }
    return result;
  }

  /**
   * Get all variables
   */
  getAll(): StoredVariable[] {
    return Array.from(this.variables.values()).filter(v => !this.isExpired(v));
  }

  /**
   * Clear variables by scope
   */
  clearScope(scope: VariableScope, sourceId?: string): number {
    let count = 0;
    for (const [key, variable] of this.variables.entries()) {
      if (variable.scope === scope) {
        if (!sourceId || variable.sourceId === sourceId) {
          this.variables.delete(key);
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Clear all variables
   */
  clear(): void {
    this.variables.clear();
  }

  /**
   * Resolve a template string with variables
   * Supports {{variableName}} and {{previous.path}} syntax
   */
  resolveTemplate(
    template: string,
    additionalContext?: Record<string, unknown>
  ): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const trimmedPath = path.trim();

      // Check additional context first
      if (additionalContext) {
        const value = this.resolvePath(additionalContext, trimmedPath);
        if (value !== undefined) {
          return String(value);
        }
      }

      // Check variables
      const value = this.get(trimmedPath);
      if (value !== undefined) {
        return String(value);
      }

      // Check for nested path in variables
      const parts = trimmedPath.split('.');
      if (parts.length > 1) {
        const varName = parts[0];
        const varValue = this.get(varName);
        if (varValue && typeof varValue === 'object') {
          const nestedValue = this.resolvePath(varValue as Record<string, unknown>, parts.slice(1).join('.'));
          if (nestedValue !== undefined) {
            return String(nestedValue);
          }
        }
      }

      // Return original if not found
      return match;
    });
  }

  /**
   * Resolve arguments with variable substitution
   */
  resolveArguments(
    args: Record<string, unknown>,
    additionalContext?: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        resolved[key] = this.resolveTemplate(value, additionalContext);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(item =>
          typeof item === 'string'
            ? this.resolveTemplate(item, additionalContext)
            : item
        );
      } else if (value && typeof value === 'object') {
        resolved[key] = this.resolveArguments(
          value as Record<string, unknown>,
          additionalContext
        );
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Export variables to a plain object
   */
  export(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const variable of this.variables.values()) {
      if (!this.isExpired(variable)) {
        result[variable.name] = variable.value;
      }
    }
    return result;
  }

  /**
   * Import variables from a plain object
   */
  import(
    data: Record<string, unknown>,
    options?: { scope?: VariableScope; sourceId?: string }
  ): void {
    for (const [name, value] of Object.entries(data)) {
      this.set(name, value, options);
    }
  }

  /**
   * Stop the registry and clean up
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.variables.clear();
  }

  /**
   * Make a key for the variable map
   */
  private makeKey(name: string, scope: VariableScope, sourceId?: string): string {
    return `${scope}:${sourceId ?? 'global'}:${name}`;
  }

  /**
   * Check if a variable is expired
   */
  private isExpired(variable: StoredVariable): boolean {
    if (!variable.expiresAt) return false;
    return Date.now() > variable.expiresAt;
  }

  /**
   * Resolve a dot-separated path in an object
   */
  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, variable] of this.variables.entries()) {
        if (variable.expiresAt && now > variable.expiresAt) {
          this.variables.delete(key);
          this.emit(AUTONOMY_EVENTS.VARIABLE_EXPIRED, {
            name: variable.name,
            scope: variable.scope,
            sourceId: variable.sourceId,
            timestamp: now,
          });
        }
      }
    }, 60000); // Check every minute
  }
}

/**
 * Create a variable registry
 */
export function createVariableRegistry(config?: VariableRegistryConfig): VariableRegistry {
  return new VariableRegistry(config);
}
