/**
 * Spawner Module
 * Exports agent spawner and related components
 */

// Agent Spawner
export {
  AgentSpawner,
  createAgentSpawner,
  type SpawnRequest,
  type AgentSpawnerConfig,
  type AgentSpawnerEvents,
} from './agent-spawner.js';

// Agent Lifecycle
export {
  AgentLifecycleManager,
  createAgentLifecycleManager,
  type AgentLifecycleConfig,
  type AgentLifecycleEvents,
} from './agent-lifecycle.js';

// Sub-Agent Factory
export {
  SubAgentFactory,
  createSubAgentFactory,
  type SubAgentRequest,
  type SubAgentResult,
  type SubAgentFactoryConfig,
} from './sub-agent-factory.js';
