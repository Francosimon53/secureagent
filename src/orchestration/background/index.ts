/**
 * Background Processing Module
 * Exports background task processing components
 */

// Task Queue
export {
  TaskQueue,
  createTaskQueue,
  type CreateTaskOptions,
  type TaskQueueConfig,
  type TaskHandler,
  type TaskContext,
  type TaskResult,
  type TaskQueueEvents,
} from './task-queue.js';

// Checkpoint Manager
export {
  CheckpointManager,
  createCheckpointManager,
  type CheckpointManagerConfig,
  type CheckpointManagerEvents,
} from './checkpoint-manager.js';

// Overnight Processor
export {
  OvernightProcessor,
  createOvernightProcessor,
  type OvernightProcessorConfig,
  type OvernightSession,
  type OvernightProcessorEvents,
} from './overnight-processor.js';
