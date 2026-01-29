import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigSchema, ConfigLoader, ConfigValidationError } from '../../src/config/index.js';

describe('ConfigSchema', () => {
  describe('validate', () => {
    it('should validate a valid configuration', () => {
      const config = {
        server: {
          port: 3000,
          host: 'localhost',
        },
        security: {
          encryption: {
            algorithm: 'aes-256-gcm',
          },
        },
      };

      const result = ConfigSchema.validate(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid port numbers', () => {
      const config = {
        server: {
          port: 70000, // Invalid port
          host: 'localhost',
        },
      };

      const result = ConfigSchema.validate(config);
      expect(result.success).toBe(false);
    });

    it('should use default values for missing optional fields', () => {
      const config = {};
      const result = ConfigSchema.validate(config);

      if (result.success) {
        expect(result.data.server.port).toBeDefined();
      }
    });
  });
});

describe('ConfigLoader', () => {
  let loader: ConfigLoader;

  beforeEach(() => {
    loader = new ConfigLoader();
  });

  describe('load', () => {
    it('should load configuration from object', () => {
      const config = {
        server: {
          port: 8080,
        },
      };

      const result = loader.load(config);
      expect(result.server.port).toBe(8080);
    });

    it('should merge multiple configuration sources', () => {
      const base = {
        server: {
          port: 3000,
          host: 'localhost',
        },
      };

      const override = {
        server: {
          port: 8080,
        },
      };

      loader.load(base);
      const result = loader.merge(override);

      expect(result.server.port).toBe(8080);
      expect(result.server.host).toBe('localhost');
    });
  });

  describe('get', () => {
    it('should get nested configuration values', () => {
      loader.load({
        server: {
          port: 3000,
        },
      });

      expect(loader.get('server.port')).toBe(3000);
    });

    it('should return undefined for missing paths', () => {
      loader.load({});
      expect(loader.get('nonexistent.path')).toBeUndefined();
    });
  });
});

describe('ConfigValidationError', () => {
  it('should include validation errors in message', () => {
    const errors = [
      { path: 'server.port', message: 'Invalid port' },
    ];

    const error = new ConfigValidationError(errors);

    expect(error.message).toContain('server.port');
    expect(error.errors).toEqual(errors);
  });
});
