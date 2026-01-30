import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Validation' });

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Supported schema types
 */
export type SchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'any';

/**
 * String format types
 */
export type StringFormat =
  | 'email'
  | 'uri'
  | 'url'
  | 'uuid'
  | 'date'
  | 'date-time'
  | 'time'
  | 'ipv4'
  | 'ipv6'
  | 'hostname'
  | 'regex'
  | 'json-pointer'
  | 'relative-json-pointer'
  | 'slug'
  | 'alphanumeric'
  | 'alpha'
  | 'numeric'
  | 'hex'
  | 'base64'
  | 'jwt'
  | 'semver'
  | 'phone'
  | 'credit-card'
  | 'file-path'
  | 'safe-string';

/**
 * Schema definition (JSON Schema compatible subset)
 */
export interface Schema {
  /** Schema type */
  type?: SchemaType | SchemaType[];
  /** For nullable types */
  nullable?: boolean;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: StringFormat;

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array constraints
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: Schema;

  // Object constraints
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  minProperties?: number;
  maxProperties?: number;
  propertyNames?: Schema;
  patternProperties?: Record<string, Schema>;

  // Enum constraint
  enum?: unknown[];
  const?: unknown;

  // Composition
  allOf?: Schema[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  not?: Schema;

  // Conditional
  if?: Schema;
  then?: Schema;
  else?: Schema;

  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  // Custom extensions
  $ref?: string;
  sanitize?: SanitizeOptions;
  coerce?: boolean;
  transform?: string;
  customValidator?: string;
}

/**
 * Sanitization options
 */
export interface SanitizeOptions {
  /** Trim whitespace */
  trim?: boolean;
  /** Convert to lowercase */
  lowercase?: boolean;
  /** Convert to uppercase */
  uppercase?: boolean;
  /** Remove HTML tags */
  stripHtml?: boolean;
  /** Escape HTML entities */
  escapeHtml?: boolean;
  /** Remove control characters */
  stripControlChars?: boolean;
  /** Normalize unicode */
  normalizeUnicode?: boolean;
  /** Remove null bytes */
  stripNullBytes?: boolean;
  /** Custom sanitizer function name */
  custom?: string;
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
  value?: unknown;
}

/**
 * Validation result
 */
export interface ValidationResult<T = unknown> {
  valid: boolean;
  value: T;
  errors: ValidationError[];
}

// ============================================================================
// Format Validators
// ============================================================================

const FORMAT_VALIDATORS: Record<StringFormat, (value: string) => boolean> = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  url: (v) => {
    try {
      const url = new URL(v);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  },
  uuid: (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
  date: (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)),
  'date-time': (v) => !isNaN(Date.parse(v)),
  time: (v) => /^\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(v),
  ipv4: (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every(n => parseInt(n) <= 255),
  ipv6: (v) => /^([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$/i.test(v) ||
               /^([0-9a-f]{1,4}:){1,7}:$/i.test(v) ||
               /^:(:([0-9a-f]{1,4})){1,7}$/i.test(v),
  hostname: (v) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(v),
  regex: (v) => {
    try {
      new RegExp(v);
      return true;
    } catch {
      return false;
    }
  },
  'json-pointer': (v) => /^(\/([^/~]|~[01])*)*$/.test(v),
  'relative-json-pointer': (v) => /^\d+(#|(\/([^/~]|~[01])*)*)$/.test(v),
  slug: (v) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v),
  alphanumeric: (v) => /^[a-zA-Z0-9]+$/.test(v),
  alpha: (v) => /^[a-zA-Z]+$/.test(v),
  numeric: (v) => /^\d+$/.test(v),
  hex: (v) => /^[0-9a-fA-F]+$/.test(v),
  base64: (v) => /^[A-Za-z0-9+/]*={0,2}$/.test(v),
  jwt: (v) => /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(v),
  semver: (v) => /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(v),
  phone: (v) => /^\+?[\d\s()-]{7,}$/.test(v),
  'credit-card': (v) => /^\d{13,19}$/.test(v.replace(/[\s-]/g, '')),
  'file-path': (v) => !v.includes('\0') && !/\.\./.test(v),
  'safe-string': (v) => !/[<>"'`;&|$(){}[\]\\]/.test(v),
};

// ============================================================================
// Sanitizers
// ============================================================================

/**
 * Sanitize a string value
 */
export function sanitizeString(value: string, options: SanitizeOptions): string {
  let result = value;

  if (options.stripNullBytes) {
    result = result.replace(/\0/g, '');
  }

  if (options.stripControlChars) {
     
    result = result.replace(/[\x00-\x1F\x7F]/g, '');
  }

  if (options.trim) {
    result = result.trim();
  }

  if (options.stripHtml) {
    result = result.replace(/<[^>]*>/g, '');
  }

  if (options.escapeHtml) {
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  if (options.normalizeUnicode) {
    result = result.normalize('NFC');
  }

  if (options.lowercase) {
    result = result.toLowerCase();
  }

  if (options.uppercase) {
    result = result.toUpperCase();
  }

  return result;
}

// ============================================================================
// Type Coercion
// ============================================================================

/**
 * Coerce value to target type
 */
export function coerceValue(value: unknown, targetType: SchemaType): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  switch (targetType) {
    case 'string':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (value instanceof Date) return value.toISOString();
      return String(value);

    case 'number':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      }
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;

    case 'integer':
      if (typeof value === 'number') return Math.trunc(value);
      if (typeof value === 'string') {
        const num = parseInt(value, 10);
        return isNaN(num) ? value : num;
      }
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;

    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (['true', '1', 'yes', 'on'].includes(value.toLowerCase())) return true;
        if (['false', '0', 'no', 'off'].includes(value.toLowerCase())) return false;
      }
      if (typeof value === 'number') return value !== 0;
      return value;

    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [value];
        } catch {
          return [value];
        }
      }
      return [value];

    case 'object':
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : value;
        } catch {
          return value;
        }
      }
      return value;

    case 'null':
      if (value === null) return null;
      if (value === 'null' || value === '') return null;
      return value;

    default:
      return value;
  }
}

// ============================================================================
// Schema Validator
// ============================================================================

/**
 * Schema validator class
 */
export class SchemaValidator {
  private readonly schemas = new Map<string, Schema>();
  private readonly customValidators = new Map<string, (value: unknown, schema: Schema) => ValidationError[]>();
  private readonly customSanitizers = new Map<string, (value: string) => string>();
  private readonly customTransformers = new Map<string, (value: unknown) => unknown>();

  /**
   * Register a schema by reference
   */
  registerSchema(ref: string, schema: Schema): void {
    this.schemas.set(ref, schema);
  }

  /**
   * Register a custom validator
   */
  registerValidator(name: string, validator: (value: unknown, schema: Schema) => ValidationError[]): void {
    this.customValidators.set(name, validator);
  }

  /**
   * Register a custom sanitizer
   */
  registerSanitizer(name: string, sanitizer: (value: string) => string): void {
    this.customSanitizers.set(name, sanitizer);
  }

  /**
   * Register a custom transformer
   */
  registerTransformer(name: string, transformer: (value: unknown) => unknown): void {
    this.customTransformers.set(name, transformer);
  }

  /**
   * Validate a value against a schema
   */
  validate<T = unknown>(value: unknown, schema: Schema, path = ''): ValidationResult<T> {
    const errors: ValidationError[] = [];
    let processedValue = value;

    // Handle $ref
    if (schema.$ref) {
      const refSchema = this.schemas.get(schema.$ref);
      if (!refSchema) {
        errors.push({
          path,
          message: `Unknown schema reference: ${schema.$ref}`,
          keyword: '$ref',
        });
        return { valid: false, value: processedValue as T, errors };
      }
      return this.validate<T>(value, refSchema, path);
    }

    // Apply coercion
    if (schema.coerce && schema.type && !Array.isArray(schema.type)) {
      processedValue = coerceValue(processedValue, schema.type);
    }

    // Apply transformation
    if (schema.transform && this.customTransformers.has(schema.transform)) {
      processedValue = this.customTransformers.get(schema.transform)!(processedValue);
    }

    // Apply sanitization for strings
    if (typeof processedValue === 'string' && schema.sanitize) {
      processedValue = this.sanitize(processedValue, schema.sanitize);
    }

    // Handle null
    if (processedValue === null) {
      if (schema.nullable || schema.type === 'null' ||
          (Array.isArray(schema.type) && schema.type.includes('null'))) {
        return { valid: true, value: processedValue as T, errors };
      }
      errors.push({
        path,
        message: 'Value cannot be null',
        keyword: 'nullable',
        value: processedValue,
      });
      return { valid: false, value: processedValue as T, errors };
    }

    // Handle undefined with default
    if (processedValue === undefined && schema.default !== undefined) {
      processedValue = schema.default;
    }

    // Validate type
    if (schema.type) {
      const typeErrors = this.validateType(processedValue, schema.type, path);
      errors.push(...typeErrors);
    }

    // Validate const
    if (schema.const !== undefined && processedValue !== schema.const) {
      errors.push({
        path,
        message: `Value must be ${JSON.stringify(schema.const)}`,
        keyword: 'const',
        params: { const: schema.const },
        value: processedValue,
      });
    }

    // Validate enum
    if (schema.enum && !schema.enum.includes(processedValue)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`,
        keyword: 'enum',
        params: { enum: schema.enum },
        value: processedValue,
      });
    }

    // Type-specific validation
    if (typeof processedValue === 'string') {
      errors.push(...this.validateString(processedValue, schema, path));
    } else if (typeof processedValue === 'number') {
      errors.push(...this.validateNumber(processedValue, schema, path));
    } else if (Array.isArray(processedValue)) {
      const arrayResult = this.validateArray(processedValue, schema, path);
      errors.push(...arrayResult.errors);
      processedValue = arrayResult.value;
    } else if (typeof processedValue === 'object' && processedValue !== null) {
      const objectResult = this.validateObject(processedValue as Record<string, unknown>, schema, path);
      errors.push(...objectResult.errors);
      processedValue = objectResult.value;
    }

    // Composition validation
    errors.push(...this.validateComposition(processedValue, schema, path));

    // Conditional validation
    errors.push(...this.validateConditional(processedValue, schema, path));

    // Custom validator
    if (schema.customValidator && this.customValidators.has(schema.customValidator)) {
      const customErrors = this.customValidators.get(schema.customValidator)!(processedValue, schema);
      errors.push(...customErrors.map(e => ({ ...e, path: path ? `${path}.${e.path}` : e.path })));
    }

    return {
      valid: errors.length === 0,
      value: processedValue as T,
      errors,
    };
  }

  /**
   * Sanitize a string value
   */
  private sanitize(value: string, options: SanitizeOptions): string {
    let result = sanitizeString(value, options);

    if (options.custom && this.customSanitizers.has(options.custom)) {
      result = this.customSanitizers.get(options.custom)!(result);
    }

    return result;
  }

  /**
   * Validate type constraint
   */
  private validateType(value: unknown, type: SchemaType | SchemaType[], path: string): ValidationError[] {
    const types = Array.isArray(type) ? type : [type];
    const actualType = this.getType(value);

    for (const t of types) {
      if (t === 'any') return [];
      if (t === actualType) return [];
      if (t === 'integer' && actualType === 'number' && Number.isInteger(value)) return [];
    }

    return [{
      path,
      message: `Expected ${types.join(' | ')}, got ${actualType}`,
      keyword: 'type',
      params: { expected: types, actual: actualType },
      value,
    }];
  }

  /**
   * Get the type of a value
   */
  private getType(value: unknown): SchemaType {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value as SchemaType;
  }

  /**
   * Validate string constraints
   */
  private validateString(value: string, schema: Schema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        keyword: 'minLength',
        params: { minLength: schema.minLength, actual: value.length },
        value,
      });
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        keyword: 'maxLength',
        params: { maxLength: schema.maxLength, actual: value.length },
        value,
      });
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path,
          message: `String must match pattern: ${schema.pattern}`,
          keyword: 'pattern',
          params: { pattern: schema.pattern },
          value,
        });
      }
    }

    if (schema.format) {
      const validator = FORMAT_VALIDATORS[schema.format];
      if (validator && !validator(value)) {
        errors.push({
          path,
          message: `String must be a valid ${schema.format}`,
          keyword: 'format',
          params: { format: schema.format },
          value,
        });
      }
    }

    return errors;
  }

  /**
   * Validate number constraints
   */
  private validateNumber(value: number, schema: Schema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Number must be >= ${schema.minimum}`,
        keyword: 'minimum',
        params: { minimum: schema.minimum },
        value,
      });
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Number must be <= ${schema.maximum}`,
        keyword: 'maximum',
        params: { maximum: schema.maximum },
        value,
      });
    }

    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      errors.push({
        path,
        message: `Number must be > ${schema.exclusiveMinimum}`,
        keyword: 'exclusiveMinimum',
        params: { exclusiveMinimum: schema.exclusiveMinimum },
        value,
      });
    }

    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      errors.push({
        path,
        message: `Number must be < ${schema.exclusiveMaximum}`,
        keyword: 'exclusiveMaximum',
        params: { exclusiveMaximum: schema.exclusiveMaximum },
        value,
      });
    }

    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      errors.push({
        path,
        message: `Number must be a multiple of ${schema.multipleOf}`,
        keyword: 'multipleOf',
        params: { multipleOf: schema.multipleOf },
        value,
      });
    }

    return errors;
  }

  /**
   * Validate array constraints
   */
  private validateArray(
    value: unknown[],
    schema: Schema,
    path: string
  ): { value: unknown[]; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const processedValue = [...value];

    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        keyword: 'minItems',
        params: { minItems: schema.minItems, actual: value.length },
      });
    }

    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        keyword: 'maxItems',
        params: { maxItems: schema.maxItems, actual: value.length },
      });
    }

    if (schema.uniqueItems) {
      const seen = new Set();
      const duplicates: number[] = [];
      for (let i = 0; i < value.length; i++) {
        const key = JSON.stringify(value[i]);
        if (seen.has(key)) {
          duplicates.push(i);
        }
        seen.add(key);
      }
      if (duplicates.length > 0) {
        errors.push({
          path,
          message: 'Array items must be unique',
          keyword: 'uniqueItems',
          params: { duplicateIndices: duplicates },
        });
      }
    }

    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemResult = this.validate(value[i], schema.items, `${path}[${i}]`);
        errors.push(...itemResult.errors);
        processedValue[i] = itemResult.value;
      }
    }

    if (schema.contains) {
      const containsMatch = value.some((item, i) => {
        const result = this.validate(item, schema.contains!, `${path}[${i}]`);
        return result.valid;
      });
      if (!containsMatch) {
        errors.push({
          path,
          message: 'Array must contain at least one matching item',
          keyword: 'contains',
        });
      }
    }

    return { value: processedValue, errors };
  }

  /**
   * Validate object constraints
   */
  private validateObject(
    value: Record<string, unknown>,
    schema: Schema,
    path: string
  ): { value: Record<string, unknown>; errors: ValidationError[] } {
    const errors: ValidationError[] = [];
    const processedValue: Record<string, unknown> = {};
    const keys = Object.keys(value);

    // Check required properties
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Required property '${key}' is missing`,
            keyword: 'required',
            params: { missingProperty: key },
          });
        }
      }
    }

    // Check property count
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      errors.push({
        path,
        message: `Object must have at least ${schema.minProperties} properties`,
        keyword: 'minProperties',
        params: { minProperties: schema.minProperties, actual: keys.length },
      });
    }

    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      errors.push({
        path,
        message: `Object must have at most ${schema.maxProperties} properties`,
        keyword: 'maxProperties',
        params: { maxProperties: schema.maxProperties, actual: keys.length },
      });
    }

    // Validate properties
    for (const key of keys) {
      const propPath = path ? `${path}.${key}` : key;
      let propSchema: Schema | undefined;

      // Check defined properties
      if (schema.properties && key in schema.properties) {
        propSchema = schema.properties[key];
      }
      // Check pattern properties
      else if (schema.patternProperties) {
        for (const pattern of Object.keys(schema.patternProperties)) {
          if (new RegExp(pattern).test(key)) {
            propSchema = schema.patternProperties[pattern];
            break;
          }
        }
      }

      // Check additional properties
      if (!propSchema) {
        if (schema.additionalProperties === false) {
          errors.push({
            path: propPath,
            message: `Additional property '${key}' is not allowed`,
            keyword: 'additionalProperties',
            params: { additionalProperty: key },
          });
          continue;
        } else if (typeof schema.additionalProperties === 'object') {
          propSchema = schema.additionalProperties;
        }
      }

      // Validate property name
      if (schema.propertyNames) {
        const nameResult = this.validate(key, schema.propertyNames, propPath);
        if (!nameResult.valid) {
          errors.push({
            path: propPath,
            message: `Property name '${key}' is invalid`,
            keyword: 'propertyNames',
          });
        }
      }

      // Validate property value
      if (propSchema) {
        const result = this.validate(value[key], propSchema, propPath);
        errors.push(...result.errors);
        processedValue[key] = result.value;
      } else {
        processedValue[key] = value[key];
      }
    }

    // Apply defaults for missing properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (!(key in processedValue) && propSchema.default !== undefined) {
          processedValue[key] = propSchema.default;
        }
      }
    }

    return { value: processedValue, errors };
  }

  /**
   * Validate composition keywords (allOf, anyOf, oneOf, not)
   */
  private validateComposition(value: unknown, schema: Schema, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    if (schema.allOf) {
      for (const subSchema of schema.allOf) {
        const result = this.validate(value, subSchema, path);
        errors.push(...result.errors);
      }
    }

    if (schema.anyOf) {
      const results = schema.anyOf.map(s => this.validate(value, s, path));
      const hasValid = results.some(r => r.valid);
      if (!hasValid) {
        errors.push({
          path,
          message: 'Value must match at least one schema in anyOf',
          keyword: 'anyOf',
        });
      }
    }

    if (schema.oneOf) {
      const results = schema.oneOf.map(s => this.validate(value, s, path));
      const validCount = results.filter(r => r.valid).length;
      if (validCount !== 1) {
        errors.push({
          path,
          message: `Value must match exactly one schema in oneOf (matched ${validCount})`,
          keyword: 'oneOf',
          params: { matchCount: validCount },
        });
      }
    }

    if (schema.not) {
      const result = this.validate(value, schema.not, path);
      if (result.valid) {
        errors.push({
          path,
          message: 'Value must not match the schema in not',
          keyword: 'not',
        });
      }
    }

    return errors;
  }

  /**
   * Validate conditional keywords (if/then/else)
   */
  private validateConditional(value: unknown, schema: Schema, path: string): ValidationError[] {
    if (!schema.if) return [];

    const ifResult = this.validate(value, schema.if, path);

    if (ifResult.valid && schema.then) {
      const thenResult = this.validate(value, schema.then, path);
      return thenResult.errors;
    } else if (!ifResult.valid && schema.else) {
      const elseResult = this.validate(value, schema.else, path);
      return elseResult.errors;
    }

    return [];
  }
}

// ============================================================================
// Singleton and Helpers
// ============================================================================

let defaultValidator: SchemaValidator | null = null;

/**
 * Get the default schema validator
 */
export function getValidator(): SchemaValidator {
  if (!defaultValidator) {
    defaultValidator = new SchemaValidator();
  }
  return defaultValidator;
}

/**
 * Validate a value against a schema using the default validator
 */
export function validate<T = unknown>(value: unknown, schema: Schema): ValidationResult<T> {
  return getValidator().validate<T>(value, schema);
}

/**
 * Quick validation check (throws on invalid)
 */
export function assertValid<T = unknown>(value: unknown, schema: Schema, message?: string): T {
  const result = validate<T>(value, schema);
  if (!result.valid) {
    const errorMsg = message || `Validation failed: ${result.errors.map(e => e.message).join(', ')}`;
    throw new ValidationSchemaError(errorMsg, result.errors);
  }
  return result.value;
}

/**
 * Validation error with details
 */
export class ValidationSchemaError extends Error {
  readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[]) {
    super(message);
    this.name = 'ValidationSchemaError';
    this.errors = errors;
  }
}
