import type { Permission, UserIdentity, SessionContext } from '../types.js';

// ============================================================================
// Permission Condition Evaluator - ABAC (Attribute-Based Access Control)
// ============================================================================

/**
 * Supported condition operators
 */
export type ConditionOperator =
  | 'eq'      // Equal
  | 'neq'     // Not equal
  | 'gt'      // Greater than
  | 'gte'     // Greater than or equal
  | 'lt'      // Less than
  | 'lte'     // Less than or equal
  | 'in'      // Value in array
  | 'nin'     // Value not in array
  | 'contains' // String/array contains
  | 'startsWith'
  | 'endsWith'
  | 'matches' // Regex match
  | 'exists'  // Property exists
  | 'and'     // Logical AND
  | 'or'      // Logical OR
  | 'not';    // Logical NOT

/**
 * Condition definition
 */
export interface Condition {
  operator: ConditionOperator;
  field?: string;
  value?: unknown;
  conditions?: Condition[]; // For and/or/not operators
}

/**
 * Context available for condition evaluation
 */
export interface EvaluationContext {
  identity: UserIdentity;
  session?: SessionContext;
  resource?: {
    type: string;
    id?: string;
    ownerId?: string;
    attributes?: Record<string, unknown>;
  };
  environment?: {
    timestamp: number;
    ipAddress?: string;
    userAgent?: string;
    riskScore?: number;
  };
  request?: Record<string, unknown>;
}

/**
 * Evaluation result with detailed information
 */
export interface EvaluationResult {
  allowed: boolean;
  reason?: string;
  failedCondition?: Condition;
  evaluatedConditions: number;
}

/**
 * Permission Evaluator for ABAC conditions
 */
export class PermissionEvaluator {
  /**
   * Evaluate whether a permission's conditions are satisfied
   */
  evaluatePermission(
    permission: Permission,
    context: EvaluationContext
  ): EvaluationResult {
    // If no conditions, permission is granted
    if (!permission.conditions || Object.keys(permission.conditions).length === 0) {
      return { allowed: true, evaluatedConditions: 0 };
    }

    // Convert conditions object to evaluatable structure
    const conditions = this.parseConditions(permission.conditions);
    let evaluatedCount = 0;

    for (const condition of conditions) {
      evaluatedCount++;
      const result = this.evaluateCondition(condition, context);

      if (!result) {
        return {
          allowed: false,
          reason: `Condition failed: ${this.conditionToString(condition)}`,
          failedCondition: condition,
          evaluatedConditions: evaluatedCount,
        };
      }
    }

    return { allowed: true, evaluatedConditions: evaluatedCount };
  }

  /**
   * Parse conditions from permission object
   */
  private parseConditions(conditions: Record<string, unknown>): Condition[] {
    const parsed: Condition[] = [];

    for (const [key, value] of Object.entries(conditions)) {
      // Handle special operators
      if (key === '$and' && Array.isArray(value)) {
        parsed.push({
          operator: 'and',
          conditions: value.flatMap(v => this.parseConditions(v as Record<string, unknown>)),
        });
      } else if (key === '$or' && Array.isArray(value)) {
        parsed.push({
          operator: 'or',
          conditions: value.flatMap(v => this.parseConditions(v as Record<string, unknown>)),
        });
      } else if (key === '$not' && typeof value === 'object' && value !== null) {
        parsed.push({
          operator: 'not',
          conditions: this.parseConditions(value as Record<string, unknown>),
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Operator-based condition
        const operators = value as Record<string, unknown>;
        for (const [op, opValue] of Object.entries(operators)) {
          parsed.push({
            operator: this.normalizeOperator(op),
            field: key,
            value: opValue,
          });
        }
      } else {
        // Simple equality condition
        parsed.push({
          operator: 'eq',
          field: key,
          value,
        });
      }
    }

    return parsed;
  }

  /**
   * Normalize operator strings to ConditionOperator
   */
  private normalizeOperator(op: string): ConditionOperator {
    const mapping: Record<string, ConditionOperator> = {
      '$eq': 'eq',
      '$neq': 'neq',
      '$ne': 'neq',
      '$gt': 'gt',
      '$gte': 'gte',
      '$lt': 'lt',
      '$lte': 'lte',
      '$in': 'in',
      '$nin': 'nin',
      '$contains': 'contains',
      '$startsWith': 'startsWith',
      '$endsWith': 'endsWith',
      '$matches': 'matches',
      '$regex': 'matches',
      '$exists': 'exists',
      'eq': 'eq',
      'neq': 'neq',
      'gt': 'gt',
      'gte': 'gte',
      'lt': 'lt',
      'lte': 'lte',
      'in': 'in',
      'nin': 'nin',
    };

    return mapping[op] ?? 'eq';
  }

  /**
   * Evaluate a single condition against the context
   */
  private evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
    switch (condition.operator) {
      case 'and':
        return condition.conditions?.every(c => this.evaluateCondition(c, context)) ?? true;

      case 'or':
        return condition.conditions?.some(c => this.evaluateCondition(c, context)) ?? false;

      case 'not':
        return !condition.conditions?.every(c => this.evaluateCondition(c, context));

      default:
        return this.evaluateFieldCondition(condition, context);
    }
  }

  /**
   * Evaluate a field-based condition
   */
  private evaluateFieldCondition(condition: Condition, context: EvaluationContext): boolean {
    if (!condition.field) return true;

    const fieldValue = this.resolveFieldValue(condition.field, context);
    const conditionValue = this.resolveValue(condition.value, context);

    switch (condition.operator) {
      case 'eq':
        return this.deepEqual(fieldValue, conditionValue);

      case 'neq':
        return !this.deepEqual(fieldValue, conditionValue);

      case 'gt':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number'
          && fieldValue > conditionValue;

      case 'gte':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number'
          && fieldValue >= conditionValue;

      case 'lt':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number'
          && fieldValue < conditionValue;

      case 'lte':
        return typeof fieldValue === 'number' && typeof conditionValue === 'number'
          && fieldValue <= conditionValue;

      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);

      case 'nin':
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);

      case 'contains':
        if (typeof fieldValue === 'string' && typeof conditionValue === 'string') {
          return fieldValue.includes(conditionValue);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(conditionValue);
        }
        return false;

      case 'startsWith':
        return typeof fieldValue === 'string' && typeof conditionValue === 'string'
          && fieldValue.startsWith(conditionValue);

      case 'endsWith':
        return typeof fieldValue === 'string' && typeof conditionValue === 'string'
          && fieldValue.endsWith(conditionValue);

      case 'matches':
        if (typeof fieldValue !== 'string') return false;
        try {
          const regex = typeof conditionValue === 'string'
            ? new RegExp(conditionValue)
            : conditionValue instanceof RegExp
              ? conditionValue
              : null;
          return regex !== null && regex.test(fieldValue);
        } catch {
          return false;
        }

      case 'exists':
        return conditionValue ? fieldValue !== undefined : fieldValue === undefined;

      default:
        return false;
    }
  }

  /**
   * Resolve a field path to its value from the context
   */
  private resolveFieldValue(field: string, context: EvaluationContext): unknown {
    // Support special field references
    const specialFields: Record<string, () => unknown> = {
      '$currentUserId': () => context.identity.userId,
      '$currentRoles': () => context.identity.roles,
      '$mfaVerified': () => context.identity.mfaVerified,
      '$resourceOwnerId': () => context.resource?.ownerId,
      '$resourceType': () => context.resource?.type,
      '$resourceId': () => context.resource?.id,
      '$timestamp': () => context.environment?.timestamp ?? Date.now(),
      '$ipAddress': () => context.environment?.ipAddress ?? context.session?.ipAddress,
      '$riskScore': () => context.environment?.riskScore ?? context.session?.riskScore,
      '$sessionId': () => context.session?.sessionId,
    };

    if (field in specialFields) {
      return specialFields[field]();
    }

    // Parse dot-notation paths
    const parts = field.split('.');
    let value: unknown = context;

    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (typeof value !== 'object') return undefined;
      value = (value as Record<string, unknown>)[part];
    }

    return value;
  }

  /**
   * Resolve a value (may contain special references)
   */
  private resolveValue(value: unknown, context: EvaluationContext): unknown {
    if (typeof value === 'string' && value.startsWith('$')) {
      return this.resolveFieldValue(value, context);
    }
    return value;
  }

  /**
   * Deep equality comparison
   */
  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.deepEqual(val, b[idx]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(key => this.deepEqual(aObj[key], bObj[key]));
    }

    return false;
  }

  /**
   * Convert condition to human-readable string
   */
  private conditionToString(condition: Condition): string {
    if (condition.operator === 'and' || condition.operator === 'or') {
      const subConditions = condition.conditions?.map(c => this.conditionToString(c)) ?? [];
      return `(${subConditions.join(` ${condition.operator.toUpperCase()} `)})`;
    }

    if (condition.operator === 'not') {
      const subConditions = condition.conditions?.map(c => this.conditionToString(c)) ?? [];
      return `NOT(${subConditions.join(' AND ')})`;
    }

    return `${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`;
  }
}

// ============================================================================
// Pre-built Condition Helpers
// ============================================================================

/**
 * Create an owner-only condition (resource.ownerId must match current user)
 */
export function ownerOnlyCondition(): Record<string, unknown> {
  return {
    'resource.ownerId': { $eq: '$currentUserId' },
  };
}

/**
 * Create a time-based condition
 */
export function timeWindowCondition(
  startHour: number,
  endHour: number,
  timezone: string = 'UTC'
): Record<string, unknown> {
  return {
    '$currentHour': { $gte: startHour, $lte: endHour },
    '$timezone': timezone,
  };
}

/**
 * Create an IP whitelist condition
 */
export function ipWhitelistCondition(allowedIps: string[]): Record<string, unknown> {
  return {
    '$ipAddress': { $in: allowedIps },
  };
}

/**
 * Create a risk score threshold condition
 */
export function maxRiskScoreCondition(maxScore: number): Record<string, unknown> {
  return {
    '$riskScore': { $lte: maxScore },
  };
}

/**
 * Require MFA for this permission
 */
export function requireMfaCondition(): Record<string, unknown> {
  return {
    '$mfaVerified': { $eq: true },
  };
}

/**
 * Resource type condition
 */
export function resourceTypeCondition(types: string[]): Record<string, unknown> {
  return {
    '$resourceType': { $in: types },
  };
}
