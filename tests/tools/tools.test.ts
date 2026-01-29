import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  ToolRegistry,
  getToolRegistry,
  defineTool,
  createToolRegistry,
  getToolByName,
  getAllToolNames,
  allTools,
} from '../../src/tools/index.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    // Create registry with specific tools allowed
    registry = new ToolRegistry(['test_tool', 'calculator', 'removable', 'tool_a', 'tool_b']);
  });

  describe('register', () => {
    it('should register a tool', () => {
      const result = registry.register({
        name: 'test_tool',
        description: 'A test tool',
        version: '1.0.0',
        parameters: z.object({
          input: z.string(),
        }),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async (params) => ({ result: params.input }),
      });

      expect(result).toBe(true);
      expect(registry.get('test_tool')).toBeDefined();
    });

    it('should reject tools not in allowlist', () => {
      const result = registry.register({
        name: 'not_allowed',
        description: 'Not allowed',
        version: '1.0.0',
        parameters: z.object({}),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async () => ({}),
      });

      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should retrieve registered tools', () => {
      registry.register({
        name: 'test_tool',
        description: 'My tool',
        version: '1.0.0',
        parameters: z.object({}),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async () => ({}),
      });

      const tool = registry.get('test_tool');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('test_tool');
    });

    it('should return undefined for unknown tools', () => {
      const tool = registry.get('unknown');
      expect(tool).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should list all registered tools', () => {
      registry.register({
        name: 'tool_a',
        description: 'Tool A',
        version: '1.0.0',
        parameters: z.object({}),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async () => ({}),
      });

      registry.register({
        name: 'tool_b',
        description: 'Tool B',
        version: '1.0.0',
        parameters: z.object({}),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async () => ({}),
      });

      const tools = registry.list();

      expect(tools).toHaveLength(2);
      expect(tools.map(t => t.name)).toContain('tool_a');
      expect(tools.map(t => t.name)).toContain('tool_b');
    });
  });

  describe('unregister', () => {
    it('should remove tools', () => {
      registry.register({
        name: 'removable',
        description: 'Removable tool',
        version: '1.0.0',
        parameters: z.object({}),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async () => ({}),
      });

      expect(registry.get('removable')).toBeDefined();

      registry.unregister('removable');

      expect(registry.get('removable')).toBeUndefined();
    });
  });

  describe('validateCall', () => {
    it('should validate tool parameters', () => {
      registry.register({
        name: 'calculator',
        description: 'Adds two numbers',
        version: '1.0.0',
        parameters: z.object({
          a: z.number(),
          b: z.number(),
        }),
        riskLevel: 'low',
        requiresApproval: false,
        sandboxed: false,
        timeout: 5000,
        execute: async (params) => ({
          sum: params.a + params.b,
        }),
      });

      const validResult = registry.validateCall('calculator', { a: 2, b: 3 });
      expect(validResult.valid).toBe(true);

      const invalidResult = registry.validateCall('calculator', { a: 'not a number', b: 3 });
      expect(invalidResult.valid).toBe(false);
    });

    it('should return error for unknown tools', () => {
      const result = registry.validateCall('unknown', {});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tool not found: unknown');
    });
  });
});

describe('defineTool', () => {
  it('should create a tool definition', () => {
    const tool = defineTool({
      name: 'helper_tool',
      description: 'Helps with things',
      version: '1.0.0',
      parameters: z.object({
        query: z.string(),
      }),
      riskLevel: 'low',
      requiresApproval: false,
      sandboxed: false,
      timeout: 5000,
      execute: async (params) => ({
        answer: `Response to: ${params.query}`,
      }),
    });

    expect(tool.name).toBe('helper_tool');
    expect(tool.description).toBe('Helps with things');
    expect(typeof tool.execute).toBe('function');
  });
});

describe('Global Tool Registry', () => {
  it('should return the same instance', () => {
    const registry1 = getToolRegistry();
    const registry2 = getToolRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should have built-in tools registered', () => {
    const registry = getToolRegistry();
    const tools = registry.list();

    // Should have some built-in tools
    expect(tools.length).toBeGreaterThan(0);
  });
});

describe('Tool Helpers', () => {
  it('should get tool by name', () => {
    const tool = getToolByName('file_read');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('file_read');
  });

  it('should get all tool names', () => {
    const names = getAllToolNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain('file_read');
  });

  it('should have tools in allTools array', () => {
    expect(allTools.length).toBeGreaterThan(0);
    const fileRead = allTools.find(t => t.name === 'file_read');
    expect(fileRead).toBeDefined();
  });
});

describe('createToolRegistry', () => {
  it('should create registry with specific categories', () => {
    const registry = createToolRegistry({ categories: ['data'] });
    const tools = registry.list();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.name.startsWith('data_'))).toBe(true);
  });

  it('should create registry with specific risk levels', () => {
    const registry = createToolRegistry({ riskLevels: ['low'] });
    const tools = registry.list();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every(t => t.riskLevel === 'low')).toBe(true);
  });

  it('should create registry with specific tools', () => {
    const registry = createToolRegistry({ tools: ['file_read', 'file_write'] });
    const tools = registry.list();

    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toContain('file_read');
    expect(tools.map(t => t.name)).toContain('file_write');
  });
});
