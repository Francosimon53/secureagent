import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaValidator,
  ValidationSchemaError,
  getValidator,
  validate,
  assertValid,
  sanitizeString,
  coerceValue,
} from '../../src/validation/index.js';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('validate', () => {
    it('should validate string types', () => {
      const schema = { type: 'string' as const };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(123, schema).valid).toBe(false);
    });

    it('should validate number types', () => {
      const schema = { type: 'number' as const };

      expect(validator.validate(123, schema).valid).toBe(true);
      expect(validator.validate('123', schema).valid).toBe(false);
    });

    it('should validate boolean types', () => {
      const schema = { type: 'boolean' as const };

      expect(validator.validate(true, schema).valid).toBe(true);
      expect(validator.validate('true', schema).valid).toBe(false);
    });

    it('should validate arrays', () => {
      const schema = {
        type: 'array' as const,
        items: { type: 'number' as const },
      };

      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
      expect(validator.validate(['a', 'b'], schema).valid).toBe(false);
    });

    it('should validate objects', () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          age: { type: 'number' as const },
        },
        required: ['name'],
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John' }, schema).valid).toBe(true);
      expect(validator.validate({ age: 30 }, schema).valid).toBe(false);
    });

    it('should validate string minLength and maxLength', () => {
      const schema = {
        type: 'string' as const,
        minLength: 2,
        maxLength: 10,
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('a', schema).valid).toBe(false);
      expect(validator.validate('a'.repeat(20), schema).valid).toBe(false);
    });

    it('should validate string patterns', () => {
      const schema = {
        type: 'string' as const,
        pattern: '^[a-z]+$',
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('Hello', schema).valid).toBe(false);
      expect(validator.validate('hello123', schema).valid).toBe(false);
    });

    it('should validate number minimum and maximum', () => {
      const schema = {
        type: 'number' as const,
        minimum: 0,
        maximum: 100,
      };

      expect(validator.validate(50, schema).valid).toBe(true);
      expect(validator.validate(-1, schema).valid).toBe(false);
      expect(validator.validate(101, schema).valid).toBe(false);
    });

    it('should validate array minItems and maxItems', () => {
      const schema = {
        type: 'array' as const,
        items: { type: 'number' as const },
        minItems: 1,
        maxItems: 3,
      };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([], schema).valid).toBe(false);
      expect(validator.validate([1, 2, 3, 4], schema).valid).toBe(false);
    });

    it('should validate enum values', () => {
      const schema = {
        type: 'string' as const,
        enum: ['red', 'green', 'blue'],
      };

      expect(validator.validate('red', schema).valid).toBe(true);
      expect(validator.validate('yellow', schema).valid).toBe(false);
    });

    it('should validate nullable values', () => {
      const schema = {
        type: 'string' as const,
        nullable: true,
      };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate(null, schema).valid).toBe(true);
    });
  });

  describe('string formats', () => {
    it('should validate email format', () => {
      const schema = { type: 'string' as const, format: 'email' as const };

      expect(validator.validate('user@example.com', schema).valid).toBe(true);
      expect(validator.validate('invalid-email', schema).valid).toBe(false);
    });

    it('should validate uri format', () => {
      const schema = { type: 'string' as const, format: 'uri' as const };

      expect(validator.validate('https://example.com', schema).valid).toBe(true);
      expect(validator.validate('not-a-url', schema).valid).toBe(false);
    });

    it('should validate uuid format', () => {
      const schema = { type: 'string' as const, format: 'uuid' as const };

      expect(validator.validate('550e8400-e29b-41d4-a716-446655440000', schema).valid).toBe(true);
      expect(validator.validate('not-a-uuid', schema).valid).toBe(false);
    });

    it('should validate date-time format', () => {
      const schema = { type: 'string' as const, format: 'date-time' as const };

      expect(validator.validate('2023-01-15T10:30:00Z', schema).valid).toBe(true);
      expect(validator.validate('not-a-date', schema).valid).toBe(false);
    });
  });
});

describe('validate helper', () => {
  it('should validate using global validator', () => {
    const result = validate('hello', { type: 'string' as const });
    expect(result.valid).toBe(true);
  });
});

describe('assertValid', () => {
  it('should not throw for valid data', () => {
    expect(() => assertValid('hello', { type: 'string' as const })).not.toThrow();
  });

  it('should throw ValidationSchemaError for invalid data', () => {
    expect(() => assertValid(123, { type: 'string' as const })).toThrow(
      ValidationSchemaError
    );
  });
});

describe('sanitizeString', () => {
  it('should trim whitespace', () => {
    expect(sanitizeString('  hello  ', { trim: true })).toBe('hello');
  });

  it('should convert to lowercase', () => {
    expect(sanitizeString('HELLO', { lowercase: true })).toBe('hello');
  });

  it('should strip HTML tags', () => {
    expect(sanitizeString('<script>alert("xss")</script>', { stripHtml: true })).toBe(
      'alert("xss")'
    );
  });

  it('should escape HTML entities', () => {
    const result = sanitizeString('<div>test</div>', { escapeHtml: true });
    expect(result).not.toContain('<div>');
    expect(result).toContain('&lt;');
  });

  it('should apply multiple sanitizations', () => {
    const result = sanitizeString('  <b>HELLO</b>  ', {
      trim: true,
      lowercase: true,
      stripHtml: true,
    });
    expect(result).toBe('hello');
  });

  it('should strip null bytes', () => {
    const result = sanitizeString('hello\0world', { stripNullBytes: true });
    expect(result).toBe('helloworld');
  });

  it('should strip control characters', () => {
    const result = sanitizeString('hello\x00\x1Fworld', { stripControlChars: true });
    expect(result).toBe('helloworld');
  });
});

describe('coerceValue', () => {
  it('should coerce string to number', () => {
    expect(coerceValue('123', 'number')).toBe(123);
    expect(coerceValue('12.5', 'number')).toBe(12.5);
  });

  it('should coerce string to boolean', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
    expect(coerceValue('false', 'boolean')).toBe(false);
    expect(coerceValue('1', 'boolean')).toBe(true);
    expect(coerceValue('0', 'boolean')).toBe(false);
  });

  it('should coerce number to string', () => {
    expect(coerceValue(123, 'string')).toBe('123');
  });

  it('should coerce boolean to string', () => {
    expect(coerceValue(true, 'string')).toBe('true');
  });

  it('should return original value for invalid coercion', () => {
    // coerceValue returns the parsed value (NaN becomes the original string)
    const result = coerceValue('not-a-number', 'number');
    expect(result).toBe('not-a-number');
  });
});
