import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolValidator,
  ToolValidatorRegistry,
  ToolInputValidationError,
  getToolValidatorRegistry,
  registerToolValidator,
  validateToolInput,
  filePathSchema,
  urlSchema,
  commandSchema,
  identifierSchema,
  textContentSchema,
} from '../../src/validation/index.js';

describe('ToolValidator', () => {
  let validator: ToolValidator;

  beforeEach(() => {
    validator = new ToolValidator({
      name: 'test-tool',
      parameters: [
        { name: 'path', schema: { type: 'string' }, required: true },
        { name: 'count', schema: { type: 'number', default: 10 }, required: false },
      ],
    });
  });

  describe('validate', () => {
    it('should validate valid input', () => {
      const result = validator.validate({
        path: '/home/user/file.txt',
        count: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail on missing required parameters', () => {
      const result = validator.validate({
        count: 5,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.parameter === 'path')).toBe(true);
    });

    it('should fail on wrong parameter type', () => {
      const result = validator.validate({
        path: '/home/user/file.txt',
        count: 'not-a-number',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.parameter === 'count')).toBe(true);
    });
  });
});

describe('Security Pattern Detection', () => {
  describe('path traversal detection', () => {
    it('should detect path traversal attempts', () => {
      const validator = new ToolValidator({
        name: 'file-read',
        parameters: [
          { name: 'path', schema: { type: 'string' }, required: true },
        ],
      });

      const traversalResult = validator.validate({
        path: '../../../etc/passwd',
      });
      expect(traversalResult.valid).toBe(false);

      const nullByteResult = validator.validate({
        path: '/home/user/file.txt\x00.jpg',
      });
      expect(nullByteResult.valid).toBe(false);
    });

    it('should allow safe paths', () => {
      const validator = new ToolValidator({
        name: 'file-read',
        parameters: [
          { name: 'path', schema: { type: 'string', format: 'safe-string' as const }, required: true },
        ],
      });

      const result = validator.validate({
        path: 'documents/file.txt',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('command injection detection', () => {
    it('should detect command injection attempts', () => {
      const validator = new ToolValidator({
        name: 'run-command',
        parameters: [
          { name: 'cmd', schema: { type: 'string' }, required: true },
        ],
      });

      const pipeResult = validator.validate({
        cmd: 'ls | cat /etc/passwd',
      });
      // Pipes are warnings, not blocks
      expect(pipeResult.warnings.length).toBeGreaterThan(0);

      const semicolonResult = validator.validate({
        cmd: 'echo hello; rm -rf /',
      });
      expect(semicolonResult.warnings.length).toBeGreaterThan(0);

      const chainResult = validator.validate({
        cmd: 'echo hello && rm -rf /',
      });
      expect(chainResult.valid).toBe(false);

      const dollarResult = validator.validate({
        cmd: 'echo $(id)',
      });
      expect(dollarResult.valid).toBe(false);
    });
  });

  describe('script injection detection', () => {
    it('should detect XSS attempts', () => {
      const validator = new ToolValidator({
        name: 'save-comment',
        parameters: [
          { name: 'content', schema: { type: 'string' }, required: true },
        ],
      });

      const scriptResult = validator.validate({
        content: '<script>alert("xss")</script>',
      });
      expect(scriptResult.valid).toBe(false);

      const eventResult = validator.validate({
        content: '<img onerror="alert(1)" src="x">',
      });
      expect(eventResult.valid).toBe(false);
    });
  });
});

describe('ToolValidatorRegistry', () => {
  let registry: ToolValidatorRegistry;

  beforeEach(() => {
    registry = new ToolValidatorRegistry();
  });

  it('should register and retrieve validators', () => {
    registry.register({
      name: 'my-tool',
      parameters: [
        { name: 'input', schema: { type: 'string' }, required: true },
      ],
    });

    const validator = registry.get('my-tool');
    expect(validator).toBeDefined();
  });

  it('should validate using registered validator', () => {
    registry.register({
      name: 'my-tool',
      parameters: [
        { name: 'input', schema: { type: 'string' }, required: true },
      ],
    });

    const result = registry.validate('my-tool', { input: 'hello' });
    expect(result.valid).toBe(true);
  });

  it('should return valid with warning for unknown tool', () => {
    const result = registry.validate('unknown-tool', { input: 'hello' });
    // Registry returns valid: true with a warning for unknown tools
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Schema Builders', () => {
  describe('filePathSchema', () => {
    it('should create file path schema', () => {
      const schema = filePathSchema({ maxLength: 255 });
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('file-path');
    });
  });

  describe('urlSchema', () => {
    it('should create URL schema', () => {
      const schema = urlSchema({ maxLength: 2048 });
      expect(schema.type).toBe('string');
      expect(schema.format).toBe('url');
    });
  });

  describe('commandSchema', () => {
    it('should create command schema', () => {
      const schema = commandSchema({ maxLength: 1024 });
      expect(schema.type).toBe('string');
    });
  });

  describe('identifierSchema', () => {
    it('should create identifier schema', () => {
      const schema = identifierSchema({ minLength: 1, maxLength: 64 });
      expect(schema.type).toBe('string');
      expect(schema.pattern).toBeDefined();
    });
  });

  describe('textContentSchema', () => {
    it('should create text content schema', () => {
      const schema = textContentSchema({ maxLength: 10000 });
      expect(schema.type).toBe('string');
      expect(schema.sanitize).toBeDefined();
    });
  });
});
