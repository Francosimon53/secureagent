/**
 * Learning Module
 * Exports learning and self-improvement components
 */

// Error Capture
export {
  ErrorCapture,
  createErrorCapture,
  type ErrorCaptureConfig,
  type CaptureErrorRequest,
  type ErrorPattern,
  type ErrorCaptureEvents,
} from './error-capture.js';

// Knowledge Store
export {
  KnowledgeStore,
  createKnowledgeStore,
  type KnowledgeStoreConfig,
  type CreatePatternRequest,
  type PatternSearchOptions,
  type KnowledgeStoreEvents,
} from './knowledge-store.js';

// Improvement Engine
export {
  ImprovementEngine,
  createImprovementEngine,
  type ImprovementEngineConfig,
  type AnalysisResult,
  type ImprovementEngineEvents,
} from './improvement-engine.js';
