/**
 * Docker Sandbox Tests
 *
 * Tests for secure code execution in isolated Docker containers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_IMAGES,
  LANGUAGE_COMMANDS,
  ResourceLimitsSchema,
  SandboxConfigSchema,
  ExecutionRequestSchema,
  SANDBOX_EVENTS,
  SANDBOX_ERROR_CODES,
  SandboxError,
  createAuditLogger,
  createContainerManager,
  createSandboxService,
} from '../../src/sandbox/index.js';

describe('Sandbox Types', () => {
  describe('SUPPORTED_LANGUAGES', () => {
    it('should include python, javascript, and bash', () => {
      expect(SUPPORTED_LANGUAGES).toContain('python');
      expect(SUPPORTED_LANGUAGES).toContain('javascript');
      expect(SUPPORTED_LANGUAGES).toContain('bash');
      expect(SUPPORTED_LANGUAGES).toHaveLength(3);
    });
  });

  describe('LANGUAGE_IMAGES', () => {
    it('should have images for all supported languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(LANGUAGE_IMAGES[lang]).toBeDefined();
        expect(LANGUAGE_IMAGES[lang]).toMatch(/^secureagent\/sandbox-/);
      }
    });
  });

  describe('LANGUAGE_COMMANDS', () => {
    it('should have commands for all supported languages', () => {
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(LANGUAGE_COMMANDS[lang]).toBeDefined();
        expect(Array.isArray(LANGUAGE_COMMANDS[lang])).toBe(true);
      }
    });

    it('should have correct commands for each language', () => {
      expect(LANGUAGE_COMMANDS.python).toEqual(['python3', '-c']);
      expect(LANGUAGE_COMMANDS.javascript).toEqual(['node', '-e']);
      expect(LANGUAGE_COMMANDS.bash).toEqual(['bash', '-c']);
    });
  });
});

describe('Sandbox Schemas', () => {
  describe('ResourceLimitsSchema', () => {
    it('should provide sensible defaults', () => {
      const limits = ResourceLimitsSchema.parse({});

      expect(limits.memoryBytes).toBe(128 * 1024 * 1024); // 128MB
      expect(limits.cpus).toBe(0.5);
      expect(limits.pidsLimit).toBe(64);
      expect(limits.maxOutputBytes).toBe(1024 * 1024); // 1MB
    });

    it('should reject invalid values', () => {
      expect(() => ResourceLimitsSchema.parse({ memoryBytes: -1 })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpus: 10 })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ pidsLimit: 500 })).toThrow();
    });
  });

  describe('SandboxConfigSchema', () => {
    it('should provide secure defaults', () => {
      const config = SandboxConfigSchema.parse({});

      expect(config.timeoutMs).toBe(30000);
      expect(config.readOnlyRootFs).toBe(true);
      expect(config.dropAllCapabilities).toBe(true);
      expect(config.useSeccomp).toBe(true);
      expect(config.runAsNonRoot).toBe(true);
      expect(config.network.enabled).toBe(false);
    });

    it('should allow customizing security settings', () => {
      const config = SandboxConfigSchema.parse({
        network: { enabled: true, allowedHosts: ['api.example.com'] },
        timeoutMs: 60000,
      });

      expect(config.network.enabled).toBe(true);
      expect(config.network.allowedHosts).toContain('api.example.com');
      expect(config.timeoutMs).toBe(60000);
    });
  });

  describe('ExecutionRequestSchema', () => {
    it('should validate valid requests', () => {
      const request = ExecutionRequestSchema.parse({
        language: 'python',
        code: 'print("hello")',
      });

      expect(request.language).toBe('python');
      expect(request.code).toBe('print("hello")');
    });

    it('should reject invalid languages', () => {
      expect(() =>
        ExecutionRequestSchema.parse({
          language: 'ruby',
          code: 'puts "hello"',
        })
      ).toThrow();
    });

    it('should reject empty code', () => {
      expect(() =>
        ExecutionRequestSchema.parse({
          language: 'python',
          code: '',
        })
      ).toThrow();
    });

    it('should reject oversized code', () => {
      const largeCode = 'x'.repeat(100001);
      expect(() =>
        ExecutionRequestSchema.parse({
          language: 'python',
          code: largeCode,
        })
      ).toThrow();
    });
  });
});

describe('SandboxError', () => {
  it('should create errors with code and message', () => {
    const error = new SandboxError(
      SANDBOX_ERROR_CODES.EXECUTION_TIMEOUT,
      'Execution timed out after 30s',
      'exec-123'
    );

    expect(error.code).toBe('SANDBOX_EXECUTION_TIMEOUT');
    expect(error.message).toBe('Execution timed out after 30s');
    expect(error.executionId).toBe('exec-123');
    expect(error.name).toBe('SandboxError');
  });

  it('should support cause chaining', () => {
    const cause = new Error('Docker daemon not running');
    const error = new SandboxError(
      SANDBOX_ERROR_CODES.DOCKER_NOT_AVAILABLE,
      'Docker unavailable',
      undefined,
      cause
    );

    expect(error.cause).toBe(cause);
  });
});

describe('SANDBOX_EVENTS', () => {
  it('should have all execution events', () => {
    expect(SANDBOX_EVENTS.EXECUTION_STARTED).toBe('sandbox:execution:started');
    expect(SANDBOX_EVENTS.EXECUTION_COMPLETED).toBe('sandbox:execution:completed');
    expect(SANDBOX_EVENTS.EXECUTION_FAILED).toBe('sandbox:execution:failed');
    expect(SANDBOX_EVENTS.EXECUTION_TIMEOUT).toBe('sandbox:execution:timeout');
    expect(SANDBOX_EVENTS.EXECUTION_OOM).toBe('sandbox:execution:oom');
  });

  it('should have all container events', () => {
    expect(SANDBOX_EVENTS.CONTAINER_CREATED).toBe('sandbox:container:created');
    expect(SANDBOX_EVENTS.CONTAINER_STARTED).toBe('sandbox:container:started');
    expect(SANDBOX_EVENTS.CONTAINER_STOPPED).toBe('sandbox:container:stopped');
    expect(SANDBOX_EVENTS.CONTAINER_REMOVED).toBe('sandbox:container:removed');
  });
});

describe('Audit Logger', () => {
  it('should create in-memory logger', () => {
    const logger = createAuditLogger();
    expect(logger).toBeDefined();
  });

  it('should log and query entries', async () => {
    const logger = createAuditLogger();
    await logger.initialize();

    const entry = {
      id: 'audit-1',
      executionId: 'exec-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      language: 'python' as const,
      codeHash: 'abc123',
      codeSizeBytes: 100,
      startTime: Date.now(),
      success: true,
      timedOut: false,
      oomKilled: false,
      networkEnabled: false,
      resourceLimits: ResourceLimitsSchema.parse({}),
    };

    await logger.log(entry);

    const entries = await logger.query({ userId: 'user-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0].executionId).toBe('exec-1');

    await logger.shutdown();
  });

  it('should filter by tenant', async () => {
    const logger = createAuditLogger();
    await logger.initialize();

    await logger.log({
      id: 'audit-1',
      executionId: 'exec-1',
      tenantId: 'tenant-a',
      language: 'python' as const,
      codeHash: 'abc',
      codeSizeBytes: 50,
      startTime: Date.now(),
      success: true,
      timedOut: false,
      oomKilled: false,
      networkEnabled: false,
      resourceLimits: ResourceLimitsSchema.parse({}),
    });

    await logger.log({
      id: 'audit-2',
      executionId: 'exec-2',
      tenantId: 'tenant-b',
      language: 'javascript' as const,
      codeHash: 'def',
      codeSizeBytes: 75,
      startTime: Date.now(),
      success: true,
      timedOut: false,
      oomKilled: false,
      networkEnabled: false,
      resourceLimits: ResourceLimitsSchema.parse({}),
    });

    const tenantA = await logger.query({ tenantId: 'tenant-a' });
    expect(tenantA).toHaveLength(1);
    expect(tenantA[0].executionId).toBe('exec-1');

    const tenantB = await logger.query({ tenantId: 'tenant-b' });
    expect(tenantB).toHaveLength(1);
    expect(tenantB[0].executionId).toBe('exec-2');

    await logger.shutdown();
  });
});

describe('Container Manager', () => {
  it('should create container manager', () => {
    const manager = createContainerManager({ debug: false });
    expect(manager).toBeDefined();
  });

  // Note: Docker tests require Docker to be running
  // These tests check the interface, not actual Docker operations
});

describe('Sandbox Service', () => {
  it('should create sandbox service', () => {
    const service = createSandboxService({ debug: false });
    expect(service).toBeDefined();
  });

  it('should have all required methods', () => {
    const service = createSandboxService();

    expect(typeof service.initialize).toBe('function');
    expect(typeof service.shutdown).toBe('function');
    expect(typeof service.execute).toBe('function');
    expect(typeof service.getExecution).toBe('function');
    expect(typeof service.cancelExecution).toBe('function');
    expect(typeof service.getActiveExecutions).toBe('function');
    expect(typeof service.getAuditLog).toBe('function');
  });
});

describe('Security Constraints', () => {
  it('should enforce secure defaults', () => {
    const config = SandboxConfigSchema.parse({});

    // Network isolation
    expect(config.network.enabled).toBe(false);

    // Resource limits
    expect(config.resources.memoryBytes).toBeLessThanOrEqual(256 * 1024 * 1024);
    expect(config.resources.cpus).toBeLessThanOrEqual(4);
    expect(config.resources.pidsLimit).toBeLessThanOrEqual(256);

    // Security features
    expect(config.readOnlyRootFs).toBe(true);
    expect(config.dropAllCapabilities).toBe(true);
    expect(config.useSeccomp).toBe(true);
    expect(config.runAsNonRoot).toBe(true);

    // Timeout
    expect(config.timeoutMs).toBeLessThanOrEqual(300000);
  });

  it('should run as non-root by default', () => {
    const config = SandboxConfigSchema.parse({});

    expect(config.userId).toBe(65534); // nobody
    expect(config.groupId).toBe(65534); // nogroup
  });
});
