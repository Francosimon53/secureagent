/**
 * Content Creator Suite - LinkedIn Engagement Manager
 *
 * Manages automated engagement actions with rate limiting and rules.
 */

import type {
  AutomationRule,
  AutomationTrigger,
  AutomationAction,
  AutomationCondition,
  LinkedInEngagementAction,
  ContentProviderResult,
} from '../../types.js';
import type { LinkedInProvider } from '../../providers/social/linkedin.js';
import type { LinkedInConfig } from '../../config.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface EngagementManagerConfig {
  enabled: boolean;
  maxActionsPerDay: number;
  cooldownMinutes: number;
  allowedActions: LinkedInEngagementAction[];
}

export interface EngagementTarget {
  type: 'post' | 'profile' | 'comment';
  urn: string;
  authorId?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface EngagementLog {
  id: string;
  ruleId?: string;
  action: LinkedInEngagementAction;
  targetUrn: string;
  content?: string;
  success: boolean;
  error?: string;
  executedAt: number;
}

// =============================================================================
// Engagement Manager Service
// =============================================================================

export class EngagementManagerService {
  private rules = new Map<string, AutomationRule>();
  private logs: EngagementLog[] = [];
  private dailyActionCount = 0;
  private lastActionTime = 0;
  private lastDayReset = this.getStartOfDay();
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(
    private readonly provider: LinkedInProvider,
    private readonly config: EngagementManagerConfig
  ) {}

  /**
   * Create an automation rule
   */
  createRule(
    userId: string,
    rule: Omit<AutomationRule, 'id' | 'createdAt' | 'actionsToday'>
  ): AutomationRule {
    const id = crypto.randomUUID();
    const now = Date.now();

    const newRule: AutomationRule = {
      ...rule,
      id,
      userId,
      actionsToday: 0,
      createdAt: now,
    };

    this.rules.set(id, newRule);
    return newRule;
  }

  /**
   * Update an automation rule
   */
  updateRule(
    ruleId: string,
    updates: Partial<Omit<AutomationRule, 'id' | 'userId' | 'createdAt'>>
  ): AutomationRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return null;
    }

    const updated: AutomationRule = {
      ...rule,
      ...updates,
    };

    this.rules.set(ruleId, updated);
    return updated;
  }

  /**
   * Delete an automation rule
   */
  deleteRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all rules for a user
   */
  getUserRules(userId: string): AutomationRule[] {
    return Array.from(this.rules.values()).filter(r => r.userId === userId);
  }

  /**
   * Get a specific rule
   */
  getRule(ruleId: string): AutomationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Process a potential engagement target against all rules
   */
  async processTarget(
    userId: string,
    target: EngagementTarget
  ): Promise<EngagementLog[]> {
    if (!this.config.enabled) {
      return [];
    }

    const userRules = this.getUserRules(userId).filter(r => r.enabled);
    const executedLogs: EngagementLog[] = [];

    for (const rule of userRules) {
      // Check if rule matches target
      if (!this.ruleMatchesTarget(rule, target)) {
        continue;
      }

      // Check if conditions are met
      if (!this.conditionsMet(rule.conditions, target)) {
        continue;
      }

      // Check rate limits
      if (!this.canExecuteAction(rule)) {
        continue;
      }

      // Execute the action
      const log = await this.executeAction(rule, target);
      executedLogs.push(log);

      // Update rule stats
      rule.actionsToday++;
      rule.lastTriggeredAt = Date.now();
      this.rules.set(rule.id, rule);

      // Emit event
      this.emit(CONTENT_EVENTS.LINKEDIN_AUTOMATION_TRIGGERED, {
        ruleId: rule.id,
        ruleName: rule.name,
        action: rule.action.type,
        targetUrn: target.urn,
        success: log.success,
      });

      // Apply delay if configured
      if (rule.action.delay) {
        await this.sleep(rule.action.delay);
      }
    }

    return executedLogs;
  }

  /**
   * Manually perform an engagement action
   */
  async performAction(
    action: LinkedInEngagementAction,
    targetUrn: string,
    content?: string
  ): Promise<ContentProviderResult<boolean>> {
    // Check if action is allowed
    if (!this.config.allowedActions.includes(action)) {
      return {
        success: false,
        error: `Action '${action}' is not allowed`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Check daily limit
    this.resetDailyCountIfNeeded();
    if (this.dailyActionCount >= this.config.maxActionsPerDay) {
      return {
        success: false,
        error: 'Daily action limit reached',
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Check cooldown
    const timeSinceLastAction = Date.now() - this.lastActionTime;
    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    if (timeSinceLastAction < cooldownMs) {
      return {
        success: false,
        error: `Cooldown active. Wait ${Math.ceil((cooldownMs - timeSinceLastAction) / 1000)} seconds`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    // Perform the action
    const result = await this.provider.performEngagementAction(action, targetUrn, content);

    // Log the action
    const log: EngagementLog = {
      id: crypto.randomUUID(),
      action,
      targetUrn,
      content,
      success: result.success,
      error: result.success ? undefined : result.error,
      executedAt: Date.now(),
    };
    this.logs.push(log);

    // Update counters
    if (result.success) {
      this.dailyActionCount++;
      this.lastActionTime = Date.now();
    }

    this.emit(CONTENT_EVENTS.LINKEDIN_ENGAGEMENT_ACTION, {
      action,
      targetUrn,
      success: result.success,
    });

    return result;
  }

  /**
   * Get engagement logs
   */
  getLogs(options?: {
    userId?: string;
    action?: LinkedInEngagementAction;
    success?: boolean;
    limit?: number;
    fromDate?: number;
  }): EngagementLog[] {
    let logs = [...this.logs];

    if (options?.action) {
      logs = logs.filter(l => l.action === options.action);
    }
    if (options?.success !== undefined) {
      logs = logs.filter(l => l.success === options.success);
    }
    if (options?.fromDate) {
      logs = logs.filter(l => l.executedAt >= options.fromDate!);
    }

    // Sort by most recent first
    logs.sort((a, b) => b.executedAt - a.executedAt);

    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  /**
   * Get engagement statistics
   */
  getStats(): {
    dailyActionsRemaining: number;
    totalActionsToday: number;
    totalActionsAllTime: number;
    successRate: number;
    actionBreakdown: Record<LinkedInEngagementAction, number>;
  } {
    this.resetDailyCountIfNeeded();

    const successfulLogs = this.logs.filter(l => l.success);
    const successRate = this.logs.length > 0
      ? successfulLogs.length / this.logs.length
      : 0;

    const actionBreakdown: Record<string, number> = {};
    for (const log of this.logs) {
      actionBreakdown[log.action] = (actionBreakdown[log.action] ?? 0) + 1;
    }

    return {
      dailyActionsRemaining: Math.max(0, this.config.maxActionsPerDay - this.dailyActionCount),
      totalActionsToday: this.dailyActionCount,
      totalActionsAllTime: this.logs.length,
      successRate,
      actionBreakdown: actionBreakdown as Record<LinkedInEngagementAction, number>,
    };
  }

  /**
   * Check if a rule matches a target
   */
  private ruleMatchesTarget(rule: AutomationRule, target: EngagementTarget): boolean {
    const { trigger } = rule;

    switch (trigger.type) {
      case 'new_post':
        return target.type === 'post';

      case 'mention':
        // Check if target content mentions the user
        return target.content?.includes('@') ?? false;

      case 'keyword':
        if (!trigger.keywords || trigger.keywords.length === 0) {
          return true;
        }
        const content = (target.content ?? '').toLowerCase();
        return trigger.keywords.some(keyword =>
          content.includes(keyword.toLowerCase())
        );

      case 'connection_request':
        return target.type === 'profile';

      default:
        return false;
    }
  }

  /**
   * Check if all conditions are met
   */
  private conditionsMet(conditions: AutomationCondition[], target: EngagementTarget): boolean {
    for (const condition of conditions) {
      const value = this.getConditionValue(condition.field, target);
      if (!this.evaluateCondition(condition, value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get value from target for condition evaluation
   */
  private getConditionValue(field: string, target: EngagementTarget): unknown {
    switch (field) {
      case 'content':
        return target.content;
      case 'authorId':
        return target.authorId;
      case 'type':
        return target.type;
      default:
        return target.metadata?.[field];
    }
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: AutomationCondition, value: unknown): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
      case 'greater_than':
        return Number(value) > Number(condition.value);
      case 'less_than':
        return Number(value) < Number(condition.value);
      case 'matches':
        try {
          const regex = new RegExp(String(condition.value), 'i');
          return regex.test(String(value));
        } catch {
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Check if we can execute an action based on limits
   */
  private canExecuteAction(rule: AutomationRule): boolean {
    this.resetDailyCountIfNeeded();

    // Global daily limit
    if (this.dailyActionCount >= this.config.maxActionsPerDay) {
      return false;
    }

    // Rule-specific daily limit
    if (rule.actionsToday >= rule.maxActionsPerDay) {
      return false;
    }

    // Cooldown check
    if (rule.lastTriggeredAt) {
      const timeSinceLastTrigger = Date.now() - rule.lastTriggeredAt;
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      if (timeSinceLastTrigger < cooldownMs) {
        return false;
      }
    }

    // Global cooldown
    const timeSinceLastAction = Date.now() - this.lastActionTime;
    const globalCooldownMs = this.config.cooldownMinutes * 60 * 1000;
    if (timeSinceLastAction < globalCooldownMs && this.lastActionTime > 0) {
      return false;
    }

    return true;
  }

  /**
   * Execute an engagement action
   */
  private async executeAction(
    rule: AutomationRule,
    target: EngagementTarget
  ): Promise<EngagementLog> {
    const { action } = rule;
    let content = action.template;

    // Replace template variables
    if (content) {
      content = content.replace(/\{authorName\}/g, target.metadata?.authorName as string ?? '');
      content = content.replace(/\{topic\}/g, target.metadata?.topic as string ?? '');
    }

    const result = await this.provider.performEngagementAction(
      action.type,
      target.urn,
      content
    );

    const log: EngagementLog = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      action: action.type,
      targetUrn: target.urn,
      content,
      success: result.success,
      error: result.success ? undefined : result.error,
      executedAt: Date.now(),
    };

    this.logs.push(log);

    if (result.success) {
      this.dailyActionCount++;
      this.lastActionTime = Date.now();
    }

    return log;
  }

  /**
   * Reset daily count if a new day has started
   */
  private resetDailyCountIfNeeded(): void {
    const startOfToday = this.getStartOfDay();
    if (startOfToday > this.lastDayReset) {
      this.dailyActionCount = 0;
      this.lastDayReset = startOfToday;

      // Reset rule daily counters
      for (const rule of this.rules.values()) {
        rule.actionsToday = 0;
        this.rules.set(rule.id, rule);
      }
    }
  }

  /**
   * Get start of current day in milliseconds
   */
  private getStartOfDay(): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createEngagementManager(
  provider: LinkedInProvider,
  config?: Partial<EngagementManagerConfig>
): EngagementManagerService {
  const defaultConfig: EngagementManagerConfig = {
    enabled: false, // Disabled by default for safety
    maxActionsPerDay: 20,
    cooldownMinutes: 60,
    allowedActions: ['like', 'comment'],
    ...config,
  };

  return new EngagementManagerService(provider, defaultConfig);
}
