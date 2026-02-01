/**
 * Sensitivity Classifier
 * Classifies actions by sensitivity and risk level
 */

import { EventEmitter } from 'events';
import type {
  SensitivityCategory,
  ActionClassification,
  PlanStep,
} from '../types.js';
import { SENSITIVITY_KEYWORDS } from '../constants.js';

/**
 * Classification rule
 */
export interface ClassificationRule {
  /** Rule name */
  name: string;
  /** Categories this rule can assign */
  categories: SensitivityCategory[];
  /** Tool name patterns (glob-like) */
  toolPatterns?: string[];
  /** Argument key patterns */
  argumentPatterns?: string[];
  /** Description patterns */
  descriptionPatterns?: string[];
  /** Base risk level (1-10) */
  baseRiskLevel: number;
}

/**
 * Classifier configuration
 */
export interface SensitivityClassifierConfig {
  /** Custom classification rules */
  customRules?: ClassificationRule[];
  /** Sensitive categories to check */
  sensitiveCategories?: SensitivityCategory[];
  /** Default risk level for unknown actions */
  defaultRiskLevel?: number;
}

/**
 * Default rules
 */
const DEFAULT_RULES: ClassificationRule[] = [
  {
    name: 'database_modification',
    categories: ['data_modification', 'irreversible_action'],
    toolPatterns: ['*database*', '*db*', '*sql*'],
    argumentPatterns: ['delete', 'drop', 'truncate', 'alter'],
    baseRiskLevel: 8,
  },
  {
    name: 'file_deletion',
    categories: ['data_modification', 'irreversible_action'],
    toolPatterns: ['*file*', '*fs*', '*delete*', '*remove*'],
    argumentPatterns: ['delete', 'remove', 'unlink'],
    baseRiskLevel: 7,
  },
  {
    name: 'email_send',
    categories: ['external_communication'],
    toolPatterns: ['*email*', '*mail*', '*send*'],
    descriptionPatterns: ['send', 'email', 'message'],
    baseRiskLevel: 6,
  },
  {
    name: 'payment_action',
    categories: ['financial', 'irreversible_action'],
    toolPatterns: ['*payment*', '*charge*', '*transfer*', '*stripe*', '*paypal*'],
    descriptionPatterns: ['payment', 'charge', 'transfer', 'refund'],
    baseRiskLevel: 9,
  },
  {
    name: 'credential_access',
    categories: ['credential_access'],
    toolPatterns: ['*auth*', '*login*', '*credential*', '*secret*', '*key*'],
    argumentPatterns: ['password', 'token', 'secret', 'api_key', 'credential'],
    baseRiskLevel: 8,
  },
  {
    name: 'system_configuration',
    categories: ['system_change'],
    toolPatterns: ['*config*', '*setting*', '*admin*', '*install*'],
    descriptionPatterns: ['configure', 'install', 'update settings'],
    baseRiskLevel: 7,
  },
  {
    name: 'data_export',
    categories: ['data_export'],
    toolPatterns: ['*export*', '*download*', '*backup*', '*sync*'],
    descriptionPatterns: ['export', 'download', 'backup', 'sync'],
    baseRiskLevel: 5,
  },
];

/**
 * Sensitivity Classifier
 * Classifies actions by their potential impact and sensitivity
 */
export class SensitivityClassifier extends EventEmitter {
  private readonly rules: ClassificationRule[];
  private readonly sensitiveCategories: Set<SensitivityCategory>;
  private readonly defaultRiskLevel: number;

  constructor(config?: SensitivityClassifierConfig) {
    super();
    this.rules = [...DEFAULT_RULES, ...(config?.customRules ?? [])];
    this.sensitiveCategories = new Set(config?.sensitiveCategories ?? [
      'data_modification',
      'financial',
      'credential_access',
      'irreversible_action',
    ]);
    this.defaultRiskLevel = config?.defaultRiskLevel ?? 3;
  }

  /**
   * Classify an action
   */
  classify(
    step: PlanStep,
    context?: { variables?: Record<string, unknown> }
  ): ActionClassification {
    const matchedCategories: Set<SensitivityCategory> = new Set();
    let maxRiskLevel = this.defaultRiskLevel;
    const explanations: string[] = [];

    // Check against rules
    for (const rule of this.rules) {
      if (this.matchesRule(step, rule, context)) {
        for (const category of rule.categories) {
          matchedCategories.add(category);
        }
        maxRiskLevel = Math.max(maxRiskLevel, rule.baseRiskLevel);
        explanations.push(`Matched rule: ${rule.name}`);
      }
    }

    // Check keyword-based classification
    const keywordMatches = this.checkKeywords(step);
    for (const [category, keywords] of keywordMatches) {
      matchedCategories.add(category);
      explanations.push(`Keywords matched for ${category}: ${keywords.join(', ')}`);

      // Adjust risk based on category
      const categoryRisk = this.getCategoryRisk(category);
      maxRiskLevel = Math.max(maxRiskLevel, categoryRisk);
    }

    // Determine if sensitive
    const categories = Array.from(matchedCategories);
    const isSensitive = categories.some(c => this.sensitiveCategories.has(c));

    // Build explanation
    let explanation: string;
    if (categories.length === 0) {
      explanation = 'Action does not match any sensitive patterns';
    } else {
      explanation = explanations.join('. ');
    }

    return {
      isSensitive,
      categories,
      riskLevel: maxRiskLevel,
      explanation,
    };
  }

  /**
   * Check if action matches a rule
   */
  private matchesRule(
    step: PlanStep,
    rule: ClassificationRule,
    context?: { variables?: Record<string, unknown> }
  ): boolean {
    // Check tool patterns
    if (rule.toolPatterns && step.toolName) {
      if (this.matchesPatterns(step.toolName.toLowerCase(), rule.toolPatterns)) {
        return true;
      }
    }

    // Check argument patterns
    if (rule.argumentPatterns && step.toolArguments) {
      const argString = JSON.stringify(step.toolArguments).toLowerCase();
      if (rule.argumentPatterns.some(p => argString.includes(p.toLowerCase()))) {
        return true;
      }
    }

    // Check description patterns
    if (rule.descriptionPatterns && step.description) {
      const desc = step.description.toLowerCase();
      if (rule.descriptionPatterns.some(p => desc.includes(p.toLowerCase()))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match against glob-like patterns
   */
  private matchesPatterns(value: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchPattern(value, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Match a single pattern
   */
  private matchPattern(value: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regex = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
      .replace(/\*/g, '.*'); // Convert * to .*

    return new RegExp(`^${regex}$`, 'i').test(value);
  }

  /**
   * Check keywords in step
   */
  private checkKeywords(step: PlanStep): Map<SensitivityCategory, string[]> {
    const result = new Map<SensitivityCategory, string[]>();

    // Combine all text to check
    const textParts = [
      step.description,
      step.toolName,
      step.toolArguments ? JSON.stringify(step.toolArguments) : '',
    ];
    const text = textParts.join(' ').toLowerCase();

    // Check each category's keywords
    for (const [category, keywords] of Object.entries(SENSITIVITY_KEYWORDS)) {
      const matched = keywords.filter(kw => text.includes(kw.toLowerCase()));
      if (matched.length > 0) {
        result.set(category as SensitivityCategory, matched);
      }
    }

    return result;
  }

  /**
   * Get base risk level for a category
   */
  private getCategoryRisk(category: SensitivityCategory): number {
    const risks: Record<SensitivityCategory, number> = {
      data_modification: 6,
      external_communication: 5,
      financial: 9,
      credential_access: 8,
      irreversible_action: 9,
      system_change: 7,
      data_export: 4,
    };
    return risks[category] ?? this.defaultRiskLevel;
  }

  /**
   * Add a custom rule
   */
  addRule(rule: ClassificationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    const index = this.rules.findIndex(r => r.name === name);
    if (index !== -1) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): ClassificationRule[] {
    return [...this.rules];
  }

  /**
   * Update sensitive categories
   */
  setSensitiveCategories(categories: SensitivityCategory[]): void {
    this.sensitiveCategories.clear();
    for (const category of categories) {
      this.sensitiveCategories.add(category);
    }
  }

  /**
   * Get sensitive categories
   */
  getSensitiveCategories(): SensitivityCategory[] {
    return Array.from(this.sensitiveCategories);
  }
}

/**
 * Create a sensitivity classifier
 */
export function createSensitivityClassifier(
  config?: SensitivityClassifierConfig
): SensitivityClassifier {
  return new SensitivityClassifier(config);
}
