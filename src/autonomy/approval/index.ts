/**
 * Approval Module
 * Human-in-the-loop approval workflows
 */

export {
  SensitivityClassifier,
  createSensitivityClassifier,
  type SensitivityClassifierConfig,
  type ClassificationRule,
} from './sensitivity-classifier.js';

export {
  ConfirmationBuilder,
  createConfirmationBuilder,
  type ConfirmationBuilderConfig,
  type AlternativeGenerator,
} from './confirmation-builder.js';

export {
  PermissionManager,
  createPermissionManager,
  type PermissionManagerConfig,
  type ApprovalHandler,
} from './permission-manager.js';
