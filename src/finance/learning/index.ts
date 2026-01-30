/**
 * Learning Module Index
 *
 * Re-exports learning components including pattern storage and confidence calculation.
 */

// Re-export from pattern store for convenience
export {
  type PatternStore,
  DatabasePatternStore,
  InMemoryPatternStore,
  createPatternStore,
} from '../stores/pattern-store.js';

// Confidence Calculator
export { ConfidenceCalculator, createConfidenceCalculator } from './confidence-calculator.js';
