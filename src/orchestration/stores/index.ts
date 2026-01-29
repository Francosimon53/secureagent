/**
 * Orchestration Stores
 * Exports all store implementations and factory functions
 */

import type { DatabaseAdapter } from '../../persistence/index.js';
import {
  type AgentStore,
  InMemoryAgentStore,
  DatabaseAgentStore,
  createAgentStore,
} from './agent-store.js';
import {
  type SessionStore,
  InMemorySessionStore,
  DatabaseSessionStore,
  createSessionStore,
} from './session-store.js';
import {
  type TaskStore,
  InMemoryTaskStore,
  DatabaseTaskStore,
  createTaskStore,
} from './task-store.js';
import {
  type LearningStore,
  InMemoryLearningStore,
  DatabaseLearningStore,
  createLearningStore,
} from './learning-store.js';

// Re-export everything
export {
  type AgentStore,
  InMemoryAgentStore,
  DatabaseAgentStore,
  createAgentStore,
};

export {
  type SessionStore,
  InMemorySessionStore,
  DatabaseSessionStore,
  createSessionStore,
};

export {
  type TaskStore,
  InMemoryTaskStore,
  DatabaseTaskStore,
  createTaskStore,
};

export {
  type LearningStore,
  InMemoryLearningStore,
  DatabaseLearningStore,
  createLearningStore,
};

/**
 * All orchestration stores
 */
export interface OrchestrationStores {
  agents: AgentStore;
  sessions: SessionStore;
  tasks: TaskStore;
  learning: LearningStore;
}

/**
 * Create all orchestration stores
 */
export function createOrchestrationStores(
  type: 'memory' | 'database',
  dbAdapter?: DatabaseAdapter
): OrchestrationStores {
  return {
    agents: createAgentStore(type, dbAdapter),
    sessions: createSessionStore(type, dbAdapter),
    tasks: createTaskStore(type, dbAdapter),
    learning: createLearningStore(type, dbAdapter),
  };
}

/**
 * Initialize all orchestration stores
 */
export async function initializeOrchestrationStores(
  stores: OrchestrationStores
): Promise<void> {
  await Promise.all([
    stores.agents.initialize(),
    stores.sessions.initialize(),
    stores.tasks.initialize(),
    stores.learning.initialize(),
  ]);
}
