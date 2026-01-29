import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SandboxExecutor,
  SandboxPool,
  executeInSandbox,
  detectRuntimes,
} from '../../src/security/sandbox/index.js';
import { SandboxError } from '../../src/security/types.js';

describe('Sandbox', () => {
  describe('detectRuntimes', () => {
    it('should detect available sandbox runtimes', async () => {
      const runtimes = await detectRuntimes();

      expect(Array.isArray(runtimes)).toBe(true);
      // At minimum, the mock runtime should be available for testing
    });
  });

  describe('SandboxExecutor', () => {
    let executor: SandboxExecutor;

    beforeEach(() => {
      executor = new SandboxExecutor({
        runtime: 'mock', // Use mock runtime for testing
        timeout: 5000,
        memoryLimit: 128 * 1024 * 1024, // 128MB
        networkAccess: false,
      });
    });

    describe('execute', () => {
      it('should execute code in sandbox', async () => {
        const result = await executor.execute({
          code: 'console.log("Hello from sandbox")',
          language: 'javascript',
        });

        expect(result.success).toBe(true);
        expect(result.output).toContain('Hello from sandbox');
      });

      it('should capture stdout and stderr', async () => {
        const result = await executor.execute({
          code: `
            console.log("stdout message");
            console.error("stderr message");
          `,
          language: 'javascript',
        });

        expect(result.stdout).toContain('stdout message');
        expect(result.stderr).toContain('stderr message');
      });

      it('should enforce timeout', async () => {
        const shortExecutor = new SandboxExecutor({
          runtime: 'mock',
          timeout: 100,
          memoryLimit: 128 * 1024 * 1024,
        });

        const result = await shortExecutor.execute({
          code: 'while(true) {}', // Infinite loop
          language: 'javascript',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('timeout');
      });

      it('should isolate execution environment', async () => {
        const result = await executor.execute({
          code: `
            try {
              require('fs').readFileSync('/etc/passwd');
              console.log('SECURITY_BREACH');
            } catch (e) {
              console.log('PROPERLY_ISOLATED');
            }
          `,
          language: 'javascript',
        });

        expect(result.output).toContain('PROPERLY_ISOLATED');
        expect(result.output).not.toContain('SECURITY_BREACH');
      });

      it('should support environment variables', async () => {
        const result = await executor.execute({
          code: 'console.log(process.env.TEST_VAR)',
          language: 'javascript',
          env: { TEST_VAR: 'test-value' },
        });

        expect(result.output).toContain('test-value');
      });
    });

    describe('executeWithFiles', () => {
      it('should execute with virtual files', async () => {
        const result = await executor.execute({
          code: `
            const data = require('fs').readFileSync('/workspace/data.txt', 'utf-8');
            console.log(data);
          `,
          language: 'javascript',
          files: {
            '/workspace/data.txt': 'file content here',
          },
        });

        expect(result.output).toContain('file content here');
      });
    });
  });

  describe('SandboxPool', () => {
    let pool: SandboxPool;

    beforeEach(() => {
      pool = new SandboxPool({
        runtime: 'mock',
        poolSize: 3,
        timeout: 5000,
        memoryLimit: 128 * 1024 * 1024,
      });
    });

    afterEach(async () => {
      await pool.destroy();
    });

    it('should manage a pool of sandbox instances', async () => {
      const stats = pool.getStats();
      expect(stats.total).toBe(3);
      expect(stats.available).toBe(3);
    });

    it('should execute code using pooled instance', async () => {
      const result = await pool.execute({
        code: 'console.log("pooled execution")',
        language: 'javascript',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('pooled execution');
    });

    it('should handle concurrent executions', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        pool.execute({
          code: `console.log("execution ${i}")`,
          language: 'javascript',
        })
      );

      const results = await Promise.all(promises);

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.output).toContain(`execution ${i}`);
      });
    });
  });

  describe('executeInSandbox', () => {
    it('should provide a simple execution interface', async () => {
      const result = await executeInSandbox(
        'console.log("simple interface")',
        'javascript'
      );

      expect(result.success).toBe(true);
      expect(result.output).toContain('simple interface');
    });
  });
});
