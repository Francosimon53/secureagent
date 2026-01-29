/**
 * Sleep Alert Engine
 *
 * Evaluates sleep data against configured alerts and triggers notifications.
 */

import { EventEmitter } from 'events';
import type { SleepStore } from '../stores/sleep-store.js';
import type {
  SleepRecord,
  SleepAlert,
  SleepAlertType,
  SleepAlertCondition,
  AggregatedSleepData,
} from '../types.js';

// =============================================================================
// Alert Engine Configuration
// =============================================================================

export interface AlertEngineConfig {
  enabled: boolean;
  cooldownMinutes: number;
  defaultNotificationChannels: string[];
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  enabled: true,
  cooldownMinutes: 60,
  defaultNotificationChannels: ['push'],
};

// =============================================================================
// Alert Evaluation Result
// =============================================================================

export interface AlertEvaluationResult {
  alert: SleepAlert;
  triggered: boolean;
  actualValue: number;
  message: string;
}

// =============================================================================
// Sleep Alert Engine
// =============================================================================

export class SleepAlertEngine extends EventEmitter {
  private readonly config: AlertEngineConfig;

  constructor(
    private readonly store: SleepStore,
    config: Partial<AlertEngineConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Evaluate all enabled alerts for a user against sleep data
   */
  async evaluateAlerts(
    userId: string,
    sleepData: SleepRecord | AggregatedSleepData
  ): Promise<AlertEvaluationResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    const alerts = await this.store.getEnabledAlerts(userId);
    const results: AlertEvaluationResult[] = [];

    for (const alert of alerts) {
      const result = this.evaluateSingleAlert(alert, sleepData);
      results.push(result);

      if (result.triggered) {
        // Check cooldown
        if (this.isInCooldown(alert)) {
          continue;
        }

        // Update last triggered
        await this.store.updateSleepAlert(alert.id, {
          lastTriggeredAt: Date.now(),
        });

        // Emit alert event
        this.emit('alert:triggered', {
          userId,
          alert,
          sleepData,
          result,
        });
      }
    }

    return results;
  }

  /**
   * Evaluate a single alert against sleep data
   */
  private evaluateSingleAlert(
    alert: SleepAlert,
    sleepData: SleepRecord | AggregatedSleepData
  ): AlertEvaluationResult {
    const actualValue = this.getValueForAlertType(alert.alertType, sleepData);
    const triggered = this.evaluateCondition(actualValue, alert.condition, alert.threshold);
    const message = this.generateAlertMessage(alert, actualValue, triggered);

    return {
      alert,
      triggered,
      actualValue,
      message,
    };
  }

  /**
   * Get the relevant value for an alert type
   */
  private getValueForAlertType(
    alertType: SleepAlertType,
    sleepData: SleepRecord | AggregatedSleepData
  ): number {
    switch (alertType) {
      case 'bedtime_late': {
        // Return minutes past target (midnight = 0)
        const bedtime = new Date(sleepData.bedtime);
        return bedtime.getHours() * 60 + bedtime.getMinutes();
      }

      case 'wake_early': {
        // Return minutes from midnight
        const wakeTime = new Date(sleepData.wakeTime);
        return wakeTime.getHours() * 60 + wakeTime.getMinutes();
      }

      case 'sleep_duration_low':
        return sleepData.totalSleepMinutes;

      case 'sleep_efficiency_low':
        if ('sleepEfficiency' in sleepData && sleepData.sleepEfficiency !== undefined) {
          return sleepData.sleepEfficiency;
        }
        if ('qualityMetrics' in sleepData) {
          return sleepData.qualityMetrics.efficiency;
        }
        return 100; // Default to no alert

      case 'sleep_score_low':
        if ('sleepScore' in sleepData && sleepData.sleepScore !== undefined) {
          return sleepData.sleepScore;
        }
        return 100; // Default to no alert

      default:
        return 0;
    }
  }

  /**
   * Evaluate a condition
   */
  private evaluateCondition(
    actualValue: number,
    condition: SleepAlertCondition,
    threshold: number
  ): boolean {
    switch (condition) {
      case 'less_than':
        return actualValue < threshold;
      case 'greater_than':
        return actualValue > threshold;
      case 'equals':
        return Math.abs(actualValue - threshold) < 0.01;
      default:
        return false;
    }
  }

  /**
   * Generate human-readable alert message
   */
  private generateAlertMessage(
    alert: SleepAlert,
    actualValue: number,
    triggered: boolean
  ): string {
    if (!triggered) {
      return `Sleep ${alert.alertType.replace(/_/g, ' ')} is within acceptable range`;
    }

    switch (alert.alertType) {
      case 'bedtime_late': {
        const hours = Math.floor(actualValue / 60);
        const minutes = actualValue % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return `Late bedtime alert: You went to bed at ${timeStr}, later than your target`;
      }

      case 'wake_early': {
        const hours = Math.floor(actualValue / 60);
        const minutes = actualValue % 60;
        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        return `Early wake alert: You woke up at ${timeStr}, earlier than your target`;
      }

      case 'sleep_duration_low': {
        const hours = (actualValue / 60).toFixed(1);
        return `Low sleep duration alert: You only got ${hours} hours of sleep`;
      }

      case 'sleep_efficiency_low':
        return `Low sleep efficiency alert: Your sleep efficiency was ${actualValue.toFixed(0)}%`;

      case 'sleep_score_low':
        return `Low sleep score alert: Your sleep score was ${actualValue.toFixed(0)}`;

      default:
        return `Sleep alert triggered: ${alert.alertType}`;
    }
  }

  /**
   * Check if alert is in cooldown period
   */
  private isInCooldown(alert: SleepAlert): boolean {
    if (!alert.lastTriggeredAt) {
      return false;
    }

    const cooldownMs = this.config.cooldownMinutes * 60 * 1000;
    return Date.now() - alert.lastTriggeredAt < cooldownMs;
  }

  /**
   * Create a new alert
   */
  async createAlert(
    userId: string,
    alertType: SleepAlertType,
    condition: SleepAlertCondition,
    threshold: number,
    notificationChannels?: string[]
  ): Promise<SleepAlert> {
    return this.store.createSleepAlert({
      userId,
      alertType,
      condition,
      threshold,
      enabled: true,
      notificationChannels: notificationChannels ?? this.config.defaultNotificationChannels,
    });
  }

  /**
   * Get preset alerts for common scenarios
   */
  getPresetAlerts(): Array<{
    name: string;
    description: string;
    alertType: SleepAlertType;
    condition: SleepAlertCondition;
    threshold: number;
  }> {
    return [
      {
        name: 'Late Bedtime',
        description: 'Alert when going to bed after 11 PM',
        alertType: 'bedtime_late',
        condition: 'greater_than',
        threshold: 23 * 60, // 11 PM in minutes
      },
      {
        name: 'Short Sleep',
        description: 'Alert when sleeping less than 7 hours',
        alertType: 'sleep_duration_low',
        condition: 'less_than',
        threshold: 420, // 7 hours in minutes
      },
      {
        name: 'Low Sleep Efficiency',
        description: 'Alert when sleep efficiency drops below 85%',
        alertType: 'sleep_efficiency_low',
        condition: 'less_than',
        threshold: 85,
      },
      {
        name: 'Poor Sleep Quality',
        description: 'Alert when sleep score is below 70',
        alertType: 'sleep_score_low',
        condition: 'less_than',
        threshold: 70,
      },
      {
        name: 'Early Wake',
        description: 'Alert when waking before 5 AM',
        alertType: 'wake_early',
        condition: 'less_than',
        threshold: 5 * 60, // 5 AM in minutes
      },
    ];
  }

  /**
   * Enable or disable the alert engine
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Check if alert engine is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSleepAlertEngine(
  store: SleepStore,
  config?: Partial<AlertEngineConfig>
): SleepAlertEngine {
  return new SleepAlertEngine(store, config);
}
