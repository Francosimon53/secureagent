/**
 * Chaining Module
 * Tool chain orchestration and variable management
 */

export {
  VariableRegistry,
  createVariableRegistry,
  type VariableRegistryConfig,
} from './variable-registry.js';

export {
  ToolChainOrchestrator,
  createToolChainOrchestrator,
  type ToolChainOrchestratorConfig,
  type ToolExecutorInterface,
} from './tool-chain.js';

export {
  ChainBuilder,
  ChainStepBuilder,
  buildChain,
  simpleChain,
  createStep,
  createChain,
} from './chain-builder.js';
