import {
  Schema,
  SchemaValidator,
  ValidationResult,
  ValidationError,
  ValidationSchemaError,
  getValidator,
  sanitizeString,
} from './schema.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'ToolValidator' });

// ============================================================================
// Tool Validation Types
// ============================================================================

/**
 * Tool parameter definition with validation
 */
export interface ToolParameter {
  name: string;
  schema: Schema;
  required?: boolean;
  sensitive?: boolean;
  description?: string;
}

/**
 * Tool validation configuration
 */
export interface ToolValidationConfig {
  /** Tool name */
  name: string;
  /** Tool parameters */
  parameters: ToolParameter[];
  /** Strict mode - reject unknown parameters */
  strict?: boolean;
  /** Apply default sanitization to all strings */
  defaultSanitization?: boolean;
  /** Maximum input size in bytes */
  maxInputSize?: number;
  /** Custom pre-validation hook */
  preValidate?: (input: Record<string, unknown>) => Record<string, unknown>;
  /** Custom post-validation hook */
  postValidate?: (input: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Tool parameter validation error details
 */
export interface ToolParameterError extends ValidationError {
  parameter: string;
  sensitive?: boolean;
}

/**
 * Tool validation result
 */
export interface ToolValidationResult {
  valid: boolean;
  input: Record<string, unknown>;
  errors: ToolParameterError[];
  warnings: string[];
  sanitized: boolean;
}

// ============================================================================
// Security Patterns
// ============================================================================

/**
 * Dangerous patterns to check in string inputs
 */
const DANGEROUS_PATTERNS: Array<{ name: string; pattern: RegExp; severity: 'warn' | 'block' }> = [
  // Command injection
  { name: 'shell_metachar', pattern: /[;&|`$(){}[\]<>]/, severity: 'warn' },
  { name: 'command_chain', pattern: /&&|\|\|/, severity: 'block' },
  { name: 'command_subst', pattern: /\$\(|\`/, severity: 'block' },

  // Path traversal
  { name: 'path_traversal', pattern: /\.\.[/\\]/, severity: 'block' },
  { name: 'absolute_path', pattern: /^[/\\]|^[a-zA-Z]:/, severity: 'warn' },

  // SQL injection
  { name: 'sql_union', pattern: /\bUNION\b.*\bSELECT\b/i, severity: 'block' },
  { name: 'sql_comment', pattern: /--\s|\/\*/, severity: 'warn' },
  { name: 'sql_quote', pattern: /'.*(?:OR|AND).*'/i, severity: 'warn' },

  // Script injection
  { name: 'script_tag', pattern: /<script\b/i, severity: 'block' },
  { name: 'event_handler', pattern: /\bon\w+\s*=/i, severity: 'block' },
  { name: 'javascript_uri', pattern: /javascript:/i, severity: 'block' },

  // Template injection
  { name: 'template_expr', pattern: /\{\{|\}\}|\${/, severity: 'warn' },
  { name: 'ejs_tag', pattern: /<%|%>/, severity: 'warn' },

  // Null byte injection
  { name: 'null_byte', pattern: /\x00|%00/, severity: 'block' },
];

/**
 * Check for dangerous patterns in a string
 */
function checkDangerousPatterns(
  value: string,
  paramName: string
): { blocked: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let blocked = false;

  for (const { name, pattern, severity } of DANGEROUS_PATTERNS) {
    if (pattern.test(value)) {
      const msg = `Potentially dangerous pattern '${name}' detected in parameter '${paramName}'`;
      if (severity === 'block') {
        blocked = true;
        logger.warn({ parameter: paramName, pattern: name }, msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  return { blocked, warnings };
}

// ============================================================================
// Tool Validator
// ============================================================================

/**
 * Tool input validator
 */
export class ToolValidator {
  private readonly config: Required<ToolValidationConfig>;
  private readonly schemaValidator: SchemaValidator;
  private readonly parameterMap: Map<string, ToolParameter>;

  constructor(config: ToolValidationConfig) {
    this.config = {
      name: config.name,
      parameters: config.parameters,
      strict: config.strict ?? true,
      defaultSanitization: config.defaultSanitization ?? true,
      maxInputSize: config.maxInputSize ?? 1024 * 1024, // 1MB default
      preValidate: config.preValidate ?? ((input) => input),
      postValidate: config.postValidate ?? ((input) => input),
    };

    this.schemaValidator = getValidator();
    this.parameterMap = new Map(
      config.parameters.map(p => [p.name, p])
    );
  }

  /**
   * Validate tool input
   */
  validate(input: Record<string, unknown>): ToolValidationResult {
    const errors: ToolParameterError[] = [];
    const warnings: string[] = [];
    let processedInput = { ...input };
    let sanitized = false;

    // Check input size
    const inputSize = JSON.stringify(input).length;
    if (inputSize > this.config.maxInputSize) {
      errors.push({
        parameter: '',
        path: '',
        message: `Input size ${inputSize} exceeds maximum ${this.config.maxInputSize} bytes`,
        keyword: 'maxInputSize',
      });
      return { valid: false, input: processedInput, errors, warnings, sanitized };
    }

    // Apply pre-validation hook
    try {
      processedInput = this.config.preValidate(processedInput);
    } catch (error) {
      errors.push({
        parameter: '',
        path: '',
        message: `Pre-validation hook failed: ${error instanceof Error ? error.message : String(error)}`,
        keyword: 'preValidate',
      });
      return { valid: false, input: processedInput, errors, warnings, sanitized };
    }

    // Check for unknown parameters in strict mode
    if (this.config.strict) {
      for (const key of Object.keys(processedInput)) {
        if (!this.parameterMap.has(key)) {
          errors.push({
            parameter: key,
            path: key,
            message: `Unknown parameter '${key}'`,
            keyword: 'additionalProperties',
          });
        }
      }
    }

    // Validate each parameter
    for (const param of this.config.parameters) {
      const value = processedInput[param.name];

      // Check required
      if (param.required && (value === undefined || value === null)) {
        errors.push({
          parameter: param.name,
          path: param.name,
          message: `Required parameter '${param.name}' is missing`,
          keyword: 'required',
          sensitive: param.sensitive,
        });
        continue;
      }

      // Skip if not provided and not required
      if (value === undefined) {
        continue;
      }

      // Apply default sanitization for strings
      if (typeof value === 'string' && this.config.defaultSanitization) {
        const sanitizedValue = sanitizeString(value, {
          stripNullBytes: true,
          stripControlChars: true,
          trim: true,
        });
        if (sanitizedValue !== value) {
          processedInput[param.name] = sanitizedValue;
          sanitized = true;
        }
      }

      // Check dangerous patterns for strings (unless marked as safe)
      if (typeof value === 'string' && param.schema.format !== 'safe-string') {
        const patternCheck = checkDangerousPatterns(value, param.name);
        warnings.push(...patternCheck.warnings);
        if (patternCheck.blocked) {
          errors.push({
            parameter: param.name,
            path: param.name,
            message: 'Input contains potentially dangerous patterns',
            keyword: 'security',
            sensitive: param.sensitive,
            value: param.sensitive ? '[REDACTED]' : value,
          });
        }
      }

      // Validate against schema
      const result = this.schemaValidator.validate(
        processedInput[param.name],
        param.schema,
        param.name
      );

      if (!result.valid) {
        for (const error of result.errors) {
          errors.push({
            ...error,
            parameter: param.name,
            sensitive: param.sensitive,
            value: param.sensitive ? '[REDACTED]' : error.value,
          });
        }
      } else {
        // Use processed value from validation (may have been coerced/sanitized)
        processedInput[param.name] = result.value;
        if (result.value !== value) {
          sanitized = true;
        }
      }
    }

    // Apply post-validation hook
    if (errors.length === 0) {
      try {
        processedInput = this.config.postValidate(processedInput);
      } catch (error) {
        errors.push({
          parameter: '',
          path: '',
          message: `Post-validation hook failed: ${error instanceof Error ? error.message : String(error)}`,
          keyword: 'postValidate',
        });
      }
    }

    return {
      valid: errors.length === 0,
      input: processedInput,
      errors,
      warnings,
      sanitized,
    };
  }

  /**
   * Validate and throw on error
   */
  validateOrThrow(input: Record<string, unknown>): Record<string, unknown> {
    const result = this.validate(input);
    if (!result.valid) {
      throw new ToolInputValidationError(
        `Validation failed for tool '${this.config.name}': ${result.errors.map(e => e.message).join(', ')}`,
        result.errors
      );
    }
    return result.input;
  }

  /**
   * Get parameter schema
   */
  getParameterSchema(name: string): Schema | undefined {
    return this.parameterMap.get(name)?.schema;
  }

  /**
   * Get all parameter names
   */
  getParameterNames(): string[] {
    return Array.from(this.parameterMap.keys());
  }

  /**
   * Get required parameter names
   */
  getRequiredParameters(): string[] {
    return this.config.parameters
      .filter(p => p.required)
      .map(p => p.name);
  }

  /**
   * Generate JSON Schema for the tool
   */
  toJSONSchema(): Schema {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];

    for (const param of this.config.parameters) {
      properties[param.name] = {
        ...param.schema,
        description: param.description || param.schema.description,
      };
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: !this.config.strict,
    };
  }
}

/**
 * Tool input validation error (thrown when validation fails)
 */
export class ToolInputValidationError extends Error {
  readonly errors: ToolParameterError[];

  constructor(message: string, errors: ToolParameterError[]) {
    super(message);
    this.name = 'ToolInputValidationError';
    this.errors = errors;
  }
}

// ============================================================================
// Validator Registry
// ============================================================================

/**
 * Registry for tool validators
 */
export class ToolValidatorRegistry {
  private readonly validators = new Map<string, ToolValidator>();

  /**
   * Register a tool validator
   */
  register(config: ToolValidationConfig): ToolValidator {
    const validator = new ToolValidator(config);
    this.validators.set(config.name, validator);
    return validator;
  }

  /**
   * Get a tool validator
   */
  get(toolName: string): ToolValidator | undefined {
    return this.validators.get(toolName);
  }

  /**
   * Check if a validator exists
   */
  has(toolName: string): boolean {
    return this.validators.has(toolName);
  }

  /**
   * Remove a tool validator
   */
  remove(toolName: string): boolean {
    return this.validators.delete(toolName);
  }

  /**
   * Validate tool input
   */
  validate(toolName: string, input: Record<string, unknown>): ToolValidationResult {
    const validator = this.validators.get(toolName);
    if (!validator) {
      return {
        valid: true,
        input,
        errors: [],
        warnings: [`No validator registered for tool '${toolName}'`],
        sanitized: false,
      };
    }
    return validator.validate(input);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.validators.keys());
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let globalRegistry: ToolValidatorRegistry | null = null;

/**
 * Get the global tool validator registry
 */
export function getToolValidatorRegistry(): ToolValidatorRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolValidatorRegistry();
  }
  return globalRegistry;
}

/**
 * Register a tool validator
 */
export function registerToolValidator(config: ToolValidationConfig): ToolValidator {
  return getToolValidatorRegistry().register(config);
}

/**
 * Validate tool input using the global registry
 */
export function validateToolInput(
  toolName: string,
  input: Record<string, unknown>
): ToolValidationResult {
  return getToolValidatorRegistry().validate(toolName, input);
}

// ============================================================================
// Common Schema Builders
// ============================================================================

/**
 * Create a file path parameter schema
 */
export function filePathSchema(options: {
  allowAbsolute?: boolean;
  allowedExtensions?: string[];
  maxLength?: number;
} = {}): Schema {
  const patterns: string[] = [];

  if (!options.allowAbsolute) {
    patterns.push('^(?![/\\\\]|[a-zA-Z]:)'); // Disallow absolute paths
  }

  if (options.allowedExtensions) {
    const extPattern = options.allowedExtensions.map(e => e.replace('.', '\\.')).join('|');
    patterns.push(`(${extPattern})$`);
  }

  return {
    type: 'string',
    format: 'file-path',
    maxLength: options.maxLength ?? 255,
    pattern: patterns.length > 0 ? patterns.join('') : undefined,
    sanitize: {
      trim: true,
      stripNullBytes: true,
    },
  };
}

/**
 * Create a URL parameter schema
 */
export function urlSchema(options: {
  protocols?: string[];
  allowLocalhost?: boolean;
  maxLength?: number;
} = {}): Schema {
  return {
    type: 'string',
    format: 'url',
    maxLength: options.maxLength ?? 2048,
    sanitize: {
      trim: true,
    },
  };
}

/**
 * Create a command parameter schema (restricted)
 */
export function commandSchema(options: {
  allowedCommands?: string[];
  maxLength?: number;
} = {}): Schema {
  return {
    type: 'string',
    maxLength: options.maxLength ?? 1024,
    enum: options.allowedCommands,
    sanitize: {
      trim: true,
      stripControlChars: true,
    },
  };
}

/**
 * Create an identifier schema (alphanumeric with underscores/hyphens)
 */
export function identifierSchema(options: {
  minLength?: number;
  maxLength?: number;
  allowHyphens?: boolean;
} = {}): Schema {
  const pattern = options.allowHyphens
    ? '^[a-zA-Z][a-zA-Z0-9_-]*$'
    : '^[a-zA-Z][a-zA-Z0-9_]*$';

  return {
    type: 'string',
    minLength: options.minLength ?? 1,
    maxLength: options.maxLength ?? 64,
    pattern,
    sanitize: {
      trim: true,
    },
  };
}

/**
 * Create a text content schema with sanitization
 */
export function textContentSchema(options: {
  minLength?: number;
  maxLength?: number;
  stripHtml?: boolean;
  escapeHtml?: boolean;
} = {}): Schema {
  return {
    type: 'string',
    minLength: options.minLength,
    maxLength: options.maxLength ?? 10000,
    sanitize: {
      trim: true,
      stripNullBytes: true,
      stripControlChars: true,
      stripHtml: options.stripHtml ?? true,
      escapeHtml: options.escapeHtml,
      normalizeUnicode: true,
    },
  };
}
