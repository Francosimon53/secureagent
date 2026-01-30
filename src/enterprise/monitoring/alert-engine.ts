/**
 * Alert Engine
 *
 * Monitors usage, billing, and system health to generate alerts
 */

import type { EventEmitter } from 'events';
import type {
  UsageAlert,
  UsageMetric,
  SubscriptionTier,
  Tenant,
  Subscription,
} from '../types.js';
import type { UsageStore } from '../stores/usage-store.js';
import type { TenantStore } from '../stores/tenant-store.js';
import type { SubscriptionStore } from '../stores/subscription-store.js';
import { getTierLimits, ENTERPRISE_DEFAULTS, ENTERPRISE_EVENTS } from '../constants.js';

// =============================================================================
// Alert Types
// =============================================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertType =
  | 'usage_threshold'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'subscription_expiring'
  | 'payment_failed'
  | 'trial_ending'
  | 'storage_full'
  | 'user_limit_reached';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  tenantId: string;
  title: string;
  message: string;
  metric?: UsageMetric;
  currentValue?: number;
  threshold?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  metric: UsageMetric | 'subscription' | 'trial';
  condition: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  threshold: number;
  severity: AlertSeverity;
  cooldownMinutes: number;
  notifyChannels: ('email' | 'webhook' | 'in_app')[];
}

// =============================================================================
// Alert Engine Configuration
// =============================================================================

export interface AlertEngineConfig {
  /** Check interval in milliseconds */
  checkIntervalMs: number;
  /** Default cooldown between same alerts */
  defaultCooldownMinutes: number;
  /** Usage warning threshold (percentage) */
  usageWarningThreshold: number;
  /** Usage critical threshold (percentage) */
  usageCriticalThreshold: number;
  /** Days before subscription expiry to alert */
  subscriptionExpiryDays: number;
  /** Days before trial end to alert */
  trialEndingDays: number;
  /** Maximum alerts per tenant per day */
  maxAlertsPerTenantPerDay: number;
  /** Event emitter for notifications */
  eventEmitter?: EventEmitter;
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  checkIntervalMs: 5 * 60 * 1000, // 5 minutes
  defaultCooldownMinutes: 60,
  usageWarningThreshold: ENTERPRISE_DEFAULTS.USAGE_WARNING_THRESHOLD,
  usageCriticalThreshold: ENTERPRISE_DEFAULTS.USAGE_CRITICAL_THRESHOLD,
  subscriptionExpiryDays: 7,
  trialEndingDays: 3,
  maxAlertsPerTenantPerDay: 50,
};

// =============================================================================
// Alert Engine
// =============================================================================

export class AlertEngine {
  private readonly config: AlertEngineConfig;
  private readonly usageStore: UsageStore;
  private readonly tenantStore: TenantStore;
  private readonly subscriptionStore: SubscriptionStore;
  private readonly eventEmitter?: EventEmitter;

  private checkTimer?: ReturnType<typeof setInterval>;
  private readonly activeAlerts = new Map<string, Alert>();
  private readonly alertCooldowns = new Map<string, number>();
  private readonly alertCountByTenant = new Map<string, number>();
  private isRunning = false;

  constructor(
    usageStore: UsageStore,
    tenantStore: TenantStore,
    subscriptionStore: SubscriptionStore,
    config?: Partial<AlertEngineConfig>
  ) {
    this.usageStore = usageStore;
    this.tenantStore = tenantStore;
    this.subscriptionStore = subscriptionStore;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventEmitter = this.config.eventEmitter;
  }

  /**
   * Start the alert engine
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkTimer = setInterval(() => {
      this.runChecks().catch(error => {
        console.error('Alert engine check failed:', error);
      });
    }, this.config.checkIntervalMs);

    // Run initial check
    this.runChecks().catch(console.error);

    this.emit(ENTERPRISE_EVENTS.ALERT_ENGINE_STARTED, {});
  }

  /**
   * Stop the alert engine
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    this.isRunning = false;
    this.emit(ENTERPRISE_EVENTS.ALERT_ENGINE_STOPPED, {});
  }

  /**
   * Run all alert checks
   */
  async runChecks(): Promise<void> {
    // Reset daily alert counts at midnight
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() < 5) {
      this.alertCountByTenant.clear();
    }

    // Get all active tenants
    const tenants = await this.tenantStore.listTenants({ status: 'active' });

    for (const tenant of tenants) {
      await this.checkTenant(tenant);
    }
  }

  /**
   * Check alerts for a specific tenant
   */
  async checkTenant(tenant: Tenant): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check usage alerts
    const usageAlerts = await this.checkUsageAlerts(tenant);
    alerts.push(...usageAlerts);

    // Check subscription alerts
    const subscriptionAlerts = await this.checkSubscriptionAlerts(tenant.id);
    alerts.push(...subscriptionAlerts);

    return alerts;
  }

  /**
   * Check usage-based alerts
   */
  async checkUsageAlerts(tenant: Tenant): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const limits = getTierLimits(tenant.tier);
    const now = Date.now();

    // Check API calls for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const apiCallsToday = await this.usageStore.getUsageCount(
      tenant.id,
      'api_calls',
      today.getTime(),
      today.getTime() + 24 * 60 * 60 * 1000
    );

    if (limits.apiCallsPerDay !== -1) {
      const apiPercentage = (apiCallsToday / limits.apiCallsPerDay) * 100;
      const apiAlert = this.checkThreshold(
        tenant.id,
        'api_calls',
        apiCallsToday,
        limits.apiCallsPerDay,
        apiPercentage,
        'API calls'
      );
      if (apiAlert) alerts.push(apiAlert);
    }

    // Check storage
    const storageUsed = await this.usageStore.getUsageCount(
      tenant.id,
      'storage_bytes',
      0,
      now
    );

    if (limits.storageLimitBytes !== -1) {
      const storagePercentage = (storageUsed / limits.storageLimitBytes) * 100;
      const storageAlert = this.checkThreshold(
        tenant.id,
        'storage_bytes',
        storageUsed,
        limits.storageLimitBytes,
        storagePercentage,
        'Storage'
      );
      if (storageAlert) alerts.push(storageAlert);
    }

    return alerts;
  }

  /**
   * Check subscription-based alerts
   */
  async checkSubscriptionAlerts(tenantId: string): Promise<Alert[]> {
    const alerts: Alert[] = [];
    const subscription = await this.subscriptionStore.getSubscriptionByTenantId(tenantId);

    if (!subscription) return alerts;

    const now = Date.now();
    const daysUntilEnd = Math.ceil((subscription.currentPeriodEnd - now) / (24 * 60 * 60 * 1000));

    // Check trial ending
    if (subscription.status === 'trialing' && subscription.trialEnd) {
      const daysUntilTrialEnd = Math.ceil((subscription.trialEnd - now) / (24 * 60 * 60 * 1000));

      if (daysUntilTrialEnd <= this.config.trialEndingDays && daysUntilTrialEnd > 0) {
        const alert = this.createAlert(
          tenantId,
          'trial_ending',
          daysUntilTrialEnd <= 1 ? 'warning' : 'info',
          'Trial Ending Soon',
          `Your trial ends in ${daysUntilTrialEnd} day${daysUntilTrialEnd === 1 ? '' : 's'}. Add a payment method to continue.`,
          { daysRemaining: daysUntilTrialEnd }
        );
        if (alert) alerts.push(alert);
      }
    }

    // Check subscription expiring
    if (subscription.cancelAtPeriodEnd && daysUntilEnd <= this.config.subscriptionExpiryDays) {
      const alert = this.createAlert(
        tenantId,
        'subscription_expiring',
        daysUntilEnd <= 3 ? 'warning' : 'info',
        'Subscription Expiring',
        `Your subscription will expire in ${daysUntilEnd} day${daysUntilEnd === 1 ? '' : 's'}.`,
        { daysRemaining: daysUntilEnd }
      );
      if (alert) alerts.push(alert);
    }

    // Check payment issues
    if (subscription.status === 'past_due') {
      const alert = this.createAlert(
        tenantId,
        'payment_failed',
        'critical',
        'Payment Failed',
        'Your last payment failed. Please update your payment method to avoid service interruption.',
        {}
      );
      if (alert) alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Check threshold and create alert if needed
   */
  private checkThreshold(
    tenantId: string,
    metric: UsageMetric,
    currentValue: number,
    limit: number,
    percentage: number,
    resourceName: string
  ): Alert | null {
    let severity: AlertSeverity;
    let alertType: AlertType;

    if (percentage >= 100) {
      severity = 'critical';
      alertType = 'quota_exceeded';
    } else if (percentage >= this.config.usageCriticalThreshold) {
      severity = 'critical';
      alertType = 'usage_threshold';
    } else if (percentage >= this.config.usageWarningThreshold) {
      severity = 'warning';
      alertType = 'usage_threshold';
    } else {
      return null;
    }

    const title = percentage >= 100
      ? `${resourceName} Limit Exceeded`
      : `${resourceName} Usage High`;

    const message = percentage >= 100
      ? `You have exceeded your ${resourceName.toLowerCase()} limit (${this.formatNumber(currentValue)}/${this.formatNumber(limit)}).`
      : `Your ${resourceName.toLowerCase()} usage is at ${percentage.toFixed(1)}% (${this.formatNumber(currentValue)}/${this.formatNumber(limit)}).`;

    return this.createAlert(tenantId, alertType, severity, title, message, {
      metric,
      currentValue,
      limit,
      percentage,
    });
  }

  /**
   * Create an alert if not in cooldown
   */
  private createAlert(
    tenantId: string,
    type: AlertType,
    severity: AlertSeverity,
    title: string,
    message: string,
    metadata: Record<string, unknown>
  ): Alert | null {
    const cooldownKey = `${tenantId}:${type}`;
    const now = Date.now();

    // Check cooldown
    const cooldownUntil = this.alertCooldowns.get(cooldownKey);
    if (cooldownUntil && now < cooldownUntil) {
      return null;
    }

    // Check daily limit
    const dailyCount = this.alertCountByTenant.get(tenantId) ?? 0;
    if (dailyCount >= this.config.maxAlertsPerTenantPerDay) {
      return null;
    }

    // Create alert
    const alert: Alert = {
      id: crypto.randomUUID(),
      type,
      severity,
      tenantId,
      title,
      message,
      metadata,
      createdAt: now,
    };

    // Update tracking
    this.alertCooldowns.set(
      cooldownKey,
      now + this.config.defaultCooldownMinutes * 60 * 1000
    );
    this.alertCountByTenant.set(tenantId, dailyCount + 1);
    this.activeAlerts.set(alert.id, alert);

    // Emit event
    this.emit(ENTERPRISE_EVENTS.ALERT_CREATED, { alert });

    return alert;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.acknowledgedAt = Date.now();
    this.emit(ENTERPRISE_EVENTS.ALERT_ACKNOWLEDGED, { alert });

    return true;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = Date.now();
    this.activeAlerts.delete(alertId);
    this.emit(ENTERPRISE_EVENTS.ALERT_RESOLVED, { alert });

    return true;
  }

  /**
   * Get active alerts for a tenant
   */
  getActiveAlerts(tenantId: string): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(
      alert => alert.tenantId === tenantId && !alert.resolvedAt
    );
  }

  /**
   * Get all active alerts
   */
  getAllActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter(
      alert => !alert.resolvedAt
    );
  }

  /**
   * Clear all alerts for a tenant
   */
  clearTenantAlerts(tenantId: string): number {
    let cleared = 0;
    for (const [id, alert] of this.activeAlerts) {
      if (alert.tenantId === tenantId) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  /**
   * Format number for display
   */
  private formatNumber(value: number): string {
    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1)}B`;
    }
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1)}K`;
    }
    return value.toString();
  }

  /**
   * Emit event
   */
  private emit(event: string, data: Record<string, unknown>): void {
    this.eventEmitter?.emit(event, data);
  }
}

/**
 * Create alert engine
 */
export function createAlertEngine(
  usageStore: UsageStore,
  tenantStore: TenantStore,
  subscriptionStore: SubscriptionStore,
  config?: Partial<AlertEngineConfig>
): AlertEngine {
  return new AlertEngine(usageStore, tenantStore, subscriptionStore, config);
}
