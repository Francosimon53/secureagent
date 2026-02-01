/**
 * Stores Module
 * Persistence layer for autonomy data
 */

export {
  type ExecutionStore,
  InMemoryExecutionStore,
  DatabaseExecutionStore,
  createExecutionStore,
} from './execution-store.js';

export {
  type PlanStore,
  InMemoryPlanStore,
  DatabasePlanStore,
  createPlanStore,
} from './plan-store.js';

/**
 * Combined store configuration
 */
export interface StoreOptions {
  type: 'memory' | 'database';
  db?: unknown;
  executionTableName?: string;
  checkpointTableName?: string;
  planTableName?: string;
  stepsTableName?: string;
}

/**
 * Create all stores with unified configuration
 */
export function createStores(options: StoreOptions = { type: 'memory' }) {
  const { type, db } = options;

  return {
    execution: type === 'database'
      ? new (require('./execution-store.js').DatabaseExecutionStore)(db, {
          tableName: options.executionTableName,
          checkpointTableName: options.checkpointTableName,
        })
      : new (require('./execution-store.js').InMemoryExecutionStore)(),

    plan: type === 'database'
      ? new (require('./plan-store.js').DatabasePlanStore)(db, {
          tableName: options.planTableName,
          stepsTableName: options.stepsTableName,
        })
      : new (require('./plan-store.js').InMemoryPlanStore)(),
  };
}
