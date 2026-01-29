import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Agent,
  AgentRegistry,
  getAgentRegistry,
  createAgent,
  ConversationManager,
  getConversationManager,
  ToolExecutor,
  createToolExecutor,
} from '../../src/agent/index.js';

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      tools: [],
    });
  });

  describe('state management', () => {
    it('should start in idle state', () => {
      expect(agent.getState()).toBe('idle');
    });

    it('should track conversation state', async () => {
      expect(agent.hasActiveConversation()).toBe(false);

      await agent.startConversation('user-123');

      expect(agent.hasActiveConversation()).toBe(true);
    });

    it('should end conversations', async () => {
      await agent.startConversation('user-123');
      await agent.endConversation();

      expect(agent.hasActiveConversation()).toBe(false);
    });
  });

  describe('message handling', () => {
    it('should process messages', async () => {
      await agent.startConversation('user-123');

      const response = await agent.processMessage({
        role: 'user',
        content: 'Hello!',
      });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });

    it('should maintain conversation context', async () => {
      await agent.startConversation('user-123');

      await agent.processMessage({
        role: 'user',
        content: 'My name is Alice.',
      });

      const context = agent.getConversationContext();
      expect(context.messages.length).toBeGreaterThan(0);
    });
  });

  describe('events', () => {
    it('should emit events on state changes', async () => {
      const events: string[] = [];

      agent.on('stateChange', (event) => {
        events.push(event.newState);
      });

      await agent.startConversation('user-123');
      await agent.endConversation();

      expect(events).toContain('idle');
    });

    it('should emit events on messages', async () => {
      const messages: string[] = [];

      agent.on('message', (event) => {
        messages.push(event.message.role);
      });

      await agent.startConversation('user-123');
      await agent.processMessage({
        role: 'user',
        content: 'Test message',
      });

      expect(messages).toContain('user');
    });
  });

  describe('statistics', () => {
    it('should track statistics', async () => {
      await agent.startConversation('user-123');
      await agent.processMessage({ role: 'user', content: 'Hello!' });
      await agent.endConversation();

      const stats = agent.getStats();

      expect(stats.totalConversations).toBeGreaterThan(0);
      expect(stats.totalMessages).toBeGreaterThan(0);
    });
  });
});

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('should register and retrieve agents', () => {
    const agent = registry.create({
      id: 'agent-1',
      name: 'Agent One',
      systemPrompt: 'Test prompt',
      tools: [],
    });

    expect(agent).toBeDefined();
    expect(registry.get('agent-1')).toBe(agent);
  });

  it('should list all agents', () => {
    registry.create({
      id: 'agent-1',
      name: 'Agent One',
      systemPrompt: 'Test',
      tools: [],
    });

    registry.create({
      id: 'agent-2',
      name: 'Agent Two',
      systemPrompt: 'Test',
      tools: [],
    });

    const agents = registry.list();

    expect(agents).toHaveLength(2);
    expect(agents.map(a => a.id)).toContain('agent-1');
    expect(agents.map(a => a.id)).toContain('agent-2');
  });

  it('should remove agents', () => {
    registry.create({
      id: 'agent-1',
      name: 'Agent One',
      systemPrompt: 'Test',
      tools: [],
    });

    registry.remove('agent-1');

    expect(registry.get('agent-1')).toBeUndefined();
  });
});

describe('ConversationManager', () => {
  let manager: ConversationManager;

  beforeEach(() => {
    manager = new ConversationManager();
  });

  describe('conversation lifecycle', () => {
    it('should create conversations', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      expect(context.id).toBeDefined();
      expect(context.userId).toBe('user-123');
    });

    it('should retrieve conversations', () => {
      const created = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      const retrieved = manager.get(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should end conversations', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      manager.end(context.id);

      expect(manager.get(context.id)).toBeUndefined();
    });
  });

  describe('message management', () => {
    it('should add messages to conversation', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      manager.addMessage(context.id, {
        role: 'user',
        content: 'Hello!',
      });

      const updated = manager.get(context.id);
      expect(updated?.messages).toHaveLength(1);
    });

    it('should track turns', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      manager.addMessage(context.id, { role: 'user', content: 'Hi' });
      manager.addMessage(context.id, { role: 'assistant', content: 'Hello!' });

      const updated = manager.get(context.id);
      expect(updated?.turnCount).toBe(1);
    });
  });

  describe('memory', () => {
    it('should store memory entries', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      manager.remember(context.id, 'preference', {
        theme: 'dark',
      });

      const memory = manager.recall(context.id, 'preference');
      expect(memory?.value).toEqual({ theme: 'dark' });
    });

    it('should forget memory entries', () => {
      const context = manager.create({
        userId: 'user-123',
        agentId: 'agent-1',
      });

      manager.remember(context.id, 'temp', { data: 'test' });
      manager.forget(context.id, 'temp');

      const memory = manager.recall(context.id, 'temp');
      expect(memory).toBeUndefined();
    });
  });
});

describe('ToolExecutor', () => {
  let executor: ToolExecutor;

  beforeEach(() => {
    executor = createToolExecutor({
      tools: [
        {
          name: 'echo',
          description: 'Echoes the input',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: ['message'],
          },
          execute: async (params: any) => ({ echoed: params.message }),
        },
        {
          name: 'dangerous',
          description: 'A dangerous tool',
          parameters: { type: 'object', properties: {} },
          requiresApproval: true,
          execute: async () => ({ result: 'done' }),
        },
      ],
    });
  });

  describe('execute', () => {
    it('should execute tools', async () => {
      const result = await executor.execute({
        id: 'call-1',
        name: 'echo',
        parameters: { message: 'Hello!' },
      }, {
        conversationId: 'conv-1',
        userId: 'user-1',
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({ echoed: 'Hello!' });
    });

    it('should reject unknown tools', async () => {
      const result = await executor.execute({
        id: 'call-1',
        name: 'unknown-tool',
        parameters: {},
      }, {
        conversationId: 'conv-1',
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('approval workflow', () => {
    it('should require approval for dangerous tools', async () => {
      const pendingCalls: any[] = [];

      executor.onApprovalRequired((request) => {
        pendingCalls.push(request);
        return Promise.resolve({ approved: true });
      });

      const result = await executor.execute({
        id: 'call-1',
        name: 'dangerous',
        parameters: {},
      }, {
        conversationId: 'conv-1',
        userId: 'user-1',
      });

      expect(pendingCalls).toHaveLength(1);
      expect(result.success).toBe(true);
    });

    it('should reject when approval denied', async () => {
      executor.onApprovalRequired(() => {
        return Promise.resolve({ approved: false, reason: 'Too dangerous' });
      });

      const result = await executor.execute({
        id: 'call-1',
        name: 'dangerous',
        parameters: {},
      }, {
        conversationId: 'conv-1',
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('denied');
    });
  });

  describe('validation', () => {
    it('should validate tool parameters', async () => {
      const result = await executor.execute({
        id: 'call-1',
        name: 'echo',
        parameters: {}, // Missing required 'message'
      }, {
        conversationId: 'conv-1',
        userId: 'user-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('Global Registries', () => {
  it('should provide global agent registry', () => {
    const registry1 = getAgentRegistry();
    const registry2 = getAgentRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should provide global conversation manager', () => {
    const manager1 = getConversationManager();
    const manager2 = getConversationManager();

    expect(manager1).toBe(manager2);
  });
});

describe('createAgent helper', () => {
  it('should create an agent with minimal config', () => {
    const agent = createAgent({
      id: 'helper-agent',
      name: 'Helper Agent',
      systemPrompt: 'You help users.',
      tools: [],
    });

    expect(agent).toBeDefined();
    expect(agent.id).toBe('helper-agent');
  });
});
