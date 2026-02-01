/**
 * Permission Manager
 * Manages user permissions and approval workflows
 */

import { EventEmitter } from 'events';
import type {
  PermissionLevel,
  SensitivityCategory,
  UserPermissions,
  ActionClassification,
  EnrichedApprovalRequest,
  ApprovalDecision,
  AlternativeAction,
  PlanStep,
  Goal,
  Plan,
} from '../types.js';
import type { ApprovalConfig } from '../config.js';
import { AUTONOMY_EVENTS } from '../constants.js';
import { SensitivityClassifier, createSensitivityClassifier } from './sensitivity-classifier.js';
import { ConfirmationBuilder, createConfirmationBuilder } from './confirmation-builder.js';

/**
 * Approval handler interface
 */
export interface ApprovalHandler {
  /** Request approval from user */
  requestApproval(request: EnrichedApprovalRequest): Promise<ApprovalDecision>;
  /** Check if a step is pre-approved */
  isPreApproved?(step: PlanStep, userId?: string): Promise<boolean>;
}

/**
 * Permission manager configuration
 */
export interface PermissionManagerConfig {
  /** Approval configuration */
  approvalConfig?: Partial<ApprovalConfig>;
  /** Approval handler */
  approvalHandler?: ApprovalHandler;
  /** User permissions store */
  permissionsStore?: Map<string, UserPermissions>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<Pick<ApprovalConfig, 'defaultPermissionLevel' | 'sensitiveCategories' | 'approvalTimeout' | 'suggestAlternatives' | 'maxAlternatives' | 'alwaysRequireApprovalPatterns' | 'neverRequireApprovalPatterns'>> = {
  defaultPermissionLevel: 'sensitive_only',
  sensitiveCategories: [
    'data_modification',
    'financial',
    'credential_access',
    'irreversible_action',
  ],
  approvalTimeout: 300000,
  suggestAlternatives: true,
  maxAlternatives: 3,
  alwaysRequireApprovalPatterns: [],
  neverRequireApprovalPatterns: [],
};

/**
 * Permission Manager
 * Manages user permissions and approval workflows
 */
export class PermissionManager extends EventEmitter {
  private readonly config: typeof DEFAULT_CONFIG;
  private readonly classifier: SensitivityClassifier;
  private readonly confirmationBuilder: ConfirmationBuilder;
  private readonly approvalHandler?: ApprovalHandler;
  private readonly permissionsStore: Map<string, UserPermissions>;
  private readonly pendingApprovals: Map<string, {
    request: EnrichedApprovalRequest;
    resolve: (decision: ApprovalDecision) => void;
    timer: NodeJS.Timeout;
  }> = new Map();

  constructor(config?: PermissionManagerConfig) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config?.approvalConfig,
    };
    this.classifier = createSensitivityClassifier({
      sensitiveCategories: this.config.sensitiveCategories,
    });
    this.confirmationBuilder = createConfirmationBuilder({
      approvalTimeout: this.config.approvalTimeout,
      maxAlternatives: this.config.maxAlternatives,
      suggestAlternatives: this.config.suggestAlternatives,
    });
    this.approvalHandler = config?.approvalHandler;
    this.permissionsStore = config?.permissionsStore ?? new Map();
  }

  /**
   * Check if approval is required for a step
   */
  async requiresApproval(
    step: PlanStep,
    userId?: string
  ): Promise<{
    required: boolean;
    classification: ActionClassification;
    reason?: string;
  }> {
    // Classify the action
    const classification = this.classifier.classify(step);

    // Check always/never require patterns
    if (step.toolName) {
      if (this.matchesPatterns(step.toolName, this.config.alwaysRequireApprovalPatterns)) {
        return {
          required: true,
          classification,
          reason: 'Tool matches always-require-approval pattern',
        };
      }
      if (this.matchesPatterns(step.toolName, this.config.neverRequireApprovalPatterns)) {
        return {
          required: false,
          classification,
          reason: 'Tool matches never-require-approval pattern',
        };
      }
    }

    // Get user permissions
    const permissions = userId ? this.getPermissions(userId) : undefined;
    const permissionLevel = permissions?.defaultLevel ?? this.config.defaultPermissionLevel;

    // Check based on permission level
    switch (permissionLevel) {
      case 'always_ask':
        return {
          required: true,
          classification,
          reason: 'User preference: always ask',
        };

      case 'never_ask':
        return {
          required: false,
          classification,
          reason: 'User preference: never ask',
        };

      case 'sensitive_only':
        // Check category overrides
        if (permissions?.categoryOverrides) {
          for (const category of classification.categories) {
            const override = permissions.categoryOverrides[category];
            if (override === 'never_ask') {
              continue;
            }
            if (override === 'always_ask' || classification.isSensitive) {
              return {
                required: true,
                classification,
                reason: `Action is sensitive (${category})`,
              };
            }
          }
        }

        // Check tool overrides
        if (step.toolName && permissions?.toolOverrides) {
          const toolOverride = permissions.toolOverrides[step.toolName];
          if (toolOverride === 'always_ask') {
            return {
              required: true,
              classification,
              reason: 'Tool requires approval per user settings',
            };
          }
          if (toolOverride === 'never_ask') {
            return {
              required: false,
              classification,
              reason: 'Tool exempt per user settings',
            };
          }
        }

        // Check trusted patterns
        if (step.toolName && permissions?.trustedPatterns) {
          if (this.matchesPatterns(step.toolName, permissions.trustedPatterns)) {
            return {
              required: false,
              classification,
              reason: 'Tool matches trusted pattern',
            };
          }
        }

        // Default: require if sensitive
        return {
          required: classification.isSensitive,
          classification,
          reason: classification.isSensitive
            ? `Action classified as sensitive: ${classification.categories.join(', ')}`
            : 'Action is not sensitive',
        };
    }
  }

  /**
   * Request approval for a step
   */
  async requestApproval(
    step: PlanStep,
    context: {
      goal: Goal;
      plan: Plan;
      userId?: string;
      progressPercent?: number;
    }
  ): Promise<ApprovalDecision> {
    const { goal, plan, userId, progressPercent = 0 } = context;

    // Classify the action
    const classification = this.classifier.classify(step);

    // Build enriched request
    const request = await this.confirmationBuilder.build(step, classification, {
      goal,
      plan,
      progressPercent,
    });

    this.emit(AUTONOMY_EVENTS.APPROVAL_REQUESTED, {
      requestId: request.id,
      stepId: step.id,
      toolName: step.toolName,
      riskLevel: classification.riskLevel,
      categories: classification.categories,
      timestamp: Date.now(),
    });

    // Use approval handler if provided
    if (this.approvalHandler) {
      try {
        const decision = await Promise.race([
          this.approvalHandler.requestApproval(request),
          this.createTimeout(request.id, this.config.approvalTimeout),
        ]);

        this.emitDecision(decision);
        return decision;
      } catch (error) {
        // Timeout or error
        const decision: ApprovalDecision = {
          requestId: request.id,
          approved: false,
          decidedBy: 'system',
          reason: error instanceof Error ? error.message : 'Approval failed',
          decidedAt: Date.now(),
        };
        this.emitDecision(decision);
        return decision;
      }
    }

    // No handler - use internal pending approvals
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(request.id);
        const decision: ApprovalDecision = {
          requestId: request.id,
          approved: false,
          decidedBy: 'system',
          reason: 'Approval timeout',
          decidedAt: Date.now(),
        };
        this.emit(AUTONOMY_EVENTS.APPROVAL_TIMEOUT, {
          requestId: request.id,
          stepId: step.id,
          timestamp: Date.now(),
        });
        resolve(decision);
      }, this.config.approvalTimeout);

      this.pendingApprovals.set(request.id, { request, resolve, timer });
    });
  }

  /**
   * Provide an approval decision
   */
  provideDecision(
    requestId: string,
    approved: boolean,
    options?: {
      decidedBy?: string;
      reason?: string;
      selectedAlternative?: AlternativeAction;
    }
  ): boolean {
    const pending = this.pendingApprovals.get(requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(requestId);

    const decision: ApprovalDecision = {
      requestId,
      approved,
      decidedBy: options?.decidedBy ?? 'user',
      reason: options?.reason,
      selectedAlternative: options?.selectedAlternative,
      decidedAt: Date.now(),
    };

    this.emitDecision(decision);
    pending.resolve(decision);

    return true;
  }

  /**
   * Get pending approval requests
   */
  getPendingApprovals(): EnrichedApprovalRequest[] {
    return Array.from(this.pendingApprovals.values()).map(p => p.request);
  }

  /**
   * Get user permissions
   */
  getPermissions(userId: string): UserPermissions | undefined {
    return this.permissionsStore.get(userId);
  }

  /**
   * Set user permissions
   */
  setPermissions(userId: string, permissions: Partial<UserPermissions>): void {
    const existing = this.permissionsStore.get(userId);
    const updated: UserPermissions = {
      userId,
      defaultLevel: permissions.defaultLevel ?? existing?.defaultLevel ?? this.config.defaultPermissionLevel,
      categoryOverrides: { ...existing?.categoryOverrides, ...permissions.categoryOverrides },
      toolOverrides: { ...existing?.toolOverrides, ...permissions.toolOverrides },
      trustedPatterns: permissions.trustedPatterns ?? existing?.trustedPatterns ?? [],
      updatedAt: Date.now(),
    };
    this.permissionsStore.set(userId, updated);
  }

  /**
   * Update default permission level
   */
  setDefaultLevel(userId: string, level: PermissionLevel): void {
    this.setPermissions(userId, { defaultLevel: level });
  }

  /**
   * Set category override
   */
  setCategoryOverride(
    userId: string,
    category: SensitivityCategory,
    level: PermissionLevel
  ): void {
    const existing = this.getPermissions(userId);
    this.setPermissions(userId, {
      categoryOverrides: {
        ...existing?.categoryOverrides,
        [category]: level,
      },
    });
  }

  /**
   * Set tool override
   */
  setToolOverride(userId: string, toolName: string, level: PermissionLevel): void {
    const existing = this.getPermissions(userId);
    this.setPermissions(userId, {
      toolOverrides: {
        ...existing?.toolOverrides,
        [toolName]: level,
      },
    });
  }

  /**
   * Add trusted pattern
   */
  addTrustedPattern(userId: string, pattern: string): void {
    const existing = this.getPermissions(userId);
    const patterns = existing?.trustedPatterns ?? [];
    if (!patterns.includes(pattern)) {
      patterns.push(pattern);
      this.setPermissions(userId, { trustedPatterns: patterns });
    }
  }

  /**
   * Remove trusted pattern
   */
  removeTrustedPattern(userId: string, pattern: string): void {
    const existing = this.getPermissions(userId);
    if (!existing?.trustedPatterns) return;
    const patterns = existing.trustedPatterns.filter(p => p !== pattern);
    this.setPermissions(userId, { trustedPatterns: patterns });
  }

  /**
   * Get the sensitivity classifier
   */
  getClassifier(): SensitivityClassifier {
    return this.classifier;
  }

  /**
   * Get the confirmation builder
   */
  getConfirmationBuilder(): ConfirmationBuilder {
    return this.confirmationBuilder;
  }

  /**
   * Cancel all pending approvals
   */
  cancelAllPending(): void {
    for (const [requestId, pending] of this.pendingApprovals) {
      clearTimeout(pending.timer);
      const decision: ApprovalDecision = {
        requestId,
        approved: false,
        decidedBy: 'system',
        reason: 'Cancelled',
        decidedAt: Date.now(),
      };
      pending.resolve(decision);
    }
    this.pendingApprovals.clear();
  }

  /**
   * Match against patterns
   */
  private matchesPatterns(value: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchPattern(value.toLowerCase(), pattern.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Match a single pattern
   */
  private matchPattern(value: string, pattern: string): boolean {
    const regex = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regex}$`, 'i').test(value);
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(requestId: string, timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Approval timeout'));
        this.emit(AUTONOMY_EVENTS.APPROVAL_TIMEOUT, {
          requestId,
          timestamp: Date.now(),
        });
      }, timeoutMs);
    });
  }

  /**
   * Emit decision event
   */
  private emitDecision(decision: ApprovalDecision): void {
    this.emit(
      decision.approved ? AUTONOMY_EVENTS.APPROVAL_GRANTED : AUTONOMY_EVENTS.APPROVAL_DENIED,
      {
        requestId: decision.requestId,
        approved: decision.approved,
        decidedBy: decision.decidedBy,
        reason: decision.reason,
        timestamp: decision.decidedAt,
      }
    );

    if (decision.selectedAlternative) {
      this.emit(AUTONOMY_EVENTS.APPROVAL_ALTERNATIVE_SELECTED, {
        requestId: decision.requestId,
        alternative: decision.selectedAlternative.description,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Create a permission manager
 */
export function createPermissionManager(
  config?: PermissionManagerConfig
): PermissionManager {
  return new PermissionManager(config);
}
