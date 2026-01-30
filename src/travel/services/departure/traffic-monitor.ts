/**
 * Traffic Monitor
 *
 * Monitors traffic conditions for departure alerts.
 */

import { randomUUID } from 'crypto';
import type {
  DepartureAlert,
  DepartureAlertNotification,
  TrafficUpdate,
  TrafficConditions,
  TransportMode,
  Location,
  BookingType,
} from '../../types.js';
import type { TrafficProvider, TrafficResult } from '../../providers/base.js';

export interface TrafficMonitorConfig {
  enabled: boolean;
  checkIntervalMinutes: number;
  startMonitoringHoursBefore: number;
  defaultBufferMinutes: {
    airport: number;
    hotel: number;
    activity: number;
    car_rental: number;
    flight: number;
  };
  notificationChannels: string[];
}

export interface TrafficMonitorDeps {
  getTrafficProvider: () => TrafficProvider | undefined;
  onDepartureAlert?: (event: DepartureAlertEvent) => void;
  onLeaveNow?: (event: LeaveNowEvent) => void;
}

export interface DepartureAlertEvent {
  alertId: string;
  userId: string;
  bookingId: string;
  recommendedDepartureTime: number;
  estimatedTravelTime: number;
  trafficConditions: TrafficConditions;
  message: string;
}

export interface LeaveNowEvent {
  alertId: string;
  userId: string;
  bookingId: string;
  estimatedArrivalTime: number;
  message: string;
}

/**
 * Monitors traffic for departure alerts
 */
export class TrafficMonitor {
  private readonly config: TrafficMonitorConfig;
  private readonly deps: TrafficMonitorDeps;
  private alerts = new Map<string, DepartureAlert>();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(config: TrafficMonitorConfig, deps: TrafficMonitorDeps) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Create a departure alert
   */
  createAlert(params: {
    userId: string;
    bookingId: string;
    bookingType: BookingType;
    origin: Location;
    destination: Location;
    targetArrivalTime: number;
    bufferMinutes?: number;
    transportMode?: TransportMode;
  }): DepartureAlert {
    const bufferMinutes = params.bufferMinutes ??
      this.config.defaultBufferMinutes[params.bookingType] ??
      this.config.defaultBufferMinutes.activity;

    const alert: DepartureAlert = {
      id: randomUUID(),
      userId: params.userId,
      bookingId: params.bookingId,
      bookingType: params.bookingType,
      origin: params.origin,
      destination: params.destination,
      targetArrivalTime: params.targetArrivalTime,
      bufferMinutes,
      transportMode: params.transportMode ?? 'driving',
      isActive: true,
      alertsSent: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  /**
   * Get an alert by ID
   */
  getAlert(alertId: string): DepartureAlert | undefined {
    return this.alerts.get(alertId);
  }

  /**
   * Get alerts for a user
   */
  getAlertsForUser(userId: string): DepartureAlert[] {
    return Array.from(this.alerts.values()).filter(a => a.userId === userId);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): DepartureAlert[] {
    return Array.from(this.alerts.values()).filter(a => a.isActive);
  }

  /**
   * Update an alert
   */
  updateAlert(alertId: string, updates: Partial<DepartureAlert>): DepartureAlert | null {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return null;
    }

    Object.assign(alert, updates, { updatedAt: Date.now() });
    return alert;
  }

  /**
   * Delete an alert
   */
  deleteAlert(alertId: string): boolean {
    return this.alerts.delete(alertId);
  }

  /**
   * Deactivate an alert
   */
  deactivateAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.isActive = false;
    alert.updatedAt = Date.now();
    return true;
  }

  /**
   * Check traffic for an alert
   */
  async checkTraffic(alertId: string): Promise<TrafficUpdate | null> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return null;
    }

    const provider = this.deps.getTrafficProvider();
    if (!provider) {
      return null;
    }

    try {
      const result = await provider.getTravelTime(
        alert.origin,
        alert.destination,
        undefined,
        alert.transportMode
      );

      const update: TrafficUpdate = {
        origin: alert.origin,
        destination: alert.destination,
        transportMode: alert.transportMode,
        currentDuration: result.durationSeconds,
        typicalDuration: result.durationSeconds,
        durationInTraffic: result.durationInTrafficSeconds,
        distance: result.distanceMeters,
        trafficConditions: result.trafficCondition,
        fetchedAt: result.fetchedAt,
      };

      // Update the alert with current traffic info
      alert.currentTravelTime = result.durationInTrafficSeconds;
      alert.trafficConditions = result.trafficCondition;
      alert.lastCheckedAt = Date.now();

      // Calculate recommended departure time
      const travelTimeMs = result.durationInTrafficSeconds * 1000;
      const bufferMs = alert.bufferMinutes * 60 * 1000;
      alert.recommendedDepartureTime = alert.targetArrivalTime - travelTimeMs - bufferMs;

      return update;
    } catch (error) {
      console.error(`Error checking traffic for alert ${alertId}:`, error);
      return null;
    }
  }

  /**
   * Process all active alerts
   */
  async processAlerts(): Promise<void> {
    const now = Date.now();
    const startMonitoringBefore = this.config.startMonitoringHoursBefore * 60 * 60 * 1000;

    const activeAlerts = this.getActiveAlerts();

    for (const alert of activeAlerts) {
      // Only check alerts within the monitoring window
      const timeUntilTarget = alert.targetArrivalTime - now;

      if (timeUntilTarget <= 0) {
        // Target time has passed, deactivate
        this.deactivateAlert(alert.id);
        continue;
      }

      if (timeUntilTarget > startMonitoringBefore) {
        // Too early to start monitoring
        continue;
      }

      // Check traffic
      await this.checkTraffic(alert.id);

      // Determine if we should send an alert
      await this.evaluateAndNotify(alert);
    }
  }

  /**
   * Get recommended departure time for an alert
   */
  async getRecommendedDeparture(alertId: string): Promise<{
    departureTime: number;
    travelTime: number;
    trafficConditions: TrafficConditions;
    message: string;
  } | null> {
    await this.checkTraffic(alertId);

    const alert = this.alerts.get(alertId);
    if (!alert || !alert.recommendedDepartureTime || !alert.currentTravelTime) {
      return null;
    }

    const travelMinutes = Math.round(alert.currentTravelTime / 60);
    const arrivalTime = new Date(alert.targetArrivalTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    let message = `Leave by ${new Date(alert.recommendedDepartureTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    message += ` to arrive by ${arrivalTime}. `;
    message += `Current travel time: ${travelMinutes} minutes. `;
    message += `Traffic: ${alert.trafficConditions}.`;

    return {
      departureTime: alert.recommendedDepartureTime,
      travelTime: alert.currentTravelTime,
      trafficConditions: alert.trafficConditions ?? 'moderate',
      message,
    };
  }

  /**
   * Start the traffic monitoring loop
   */
  start(): void {
    if (!this.config.enabled || this.monitoringInterval) {
      return;
    }

    this.monitoringInterval = setInterval(
      () => this.processAlerts().catch(console.error),
      this.config.checkIntervalMinutes * 60 * 1000
    );

    // Process immediately
    this.processAlerts().catch(console.error);
  }

  /**
   * Stop the traffic monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check if monitor is running
   */
  isRunning(): boolean {
    return this.monitoringInterval !== null;
  }

  private async evaluateAndNotify(alert: DepartureAlert): Promise<void> {
    const now = Date.now();

    if (!alert.recommendedDepartureTime || !alert.currentTravelTime) {
      return;
    }

    const timeUntilDeparture = alert.recommendedDepartureTime - now;
    const fiveMinutes = 5 * 60 * 1000;
    const fifteenMinutes = 15 * 60 * 1000;
    const thirtyMinutes = 30 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    // Check if we should send a "leave now" alert
    if (timeUntilDeparture <= fiveMinutes && timeUntilDeparture > -fiveMinutes) {
      const hasLeaveNowAlert = alert.alertsSent.some(a => a.type === 'leave_now');

      if (!hasLeaveNowAlert) {
        this.sendLeaveNowNotification(alert);
      }
      return;
    }

    // Check for initial/update alerts at key times
    const alertTimes = [
      { threshold: oneHour, type: 'initial' as const },
      { threshold: thirtyMinutes, type: 'update' as const },
      { threshold: fifteenMinutes, type: 'update' as const },
    ];

    for (const { threshold, type } of alertTimes) {
      if (timeUntilDeparture <= threshold + fiveMinutes && timeUntilDeparture > threshold - fiveMinutes) {
        const hasAlert = alert.alertsSent.some(a =>
          a.type === type &&
          Math.abs(a.recommendedDepartureTime - alert.recommendedDepartureTime!) < fifteenMinutes
        );

        if (!hasAlert) {
          this.sendDepartureNotification(alert, type);
        }
        break;
      }
    }
  }

  private sendDepartureNotification(alert: DepartureAlert, type: 'initial' | 'update'): void {
    const travelMinutes = Math.round((alert.currentTravelTime ?? 0) / 60);
    const departureTime = new Date(alert.recommendedDepartureTime!).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    let message: string;
    if (type === 'initial') {
      message = `Traffic update: Leave by ${departureTime} (${travelMinutes} min travel time, ${alert.trafficConditions} traffic)`;
    } else {
      message = `Updated: Leave by ${departureTime} - ${alert.trafficConditions} traffic (${travelMinutes} min)`;
    }

    const notification: DepartureAlertNotification = {
      id: randomUUID(),
      alertId: alert.id,
      type,
      message,
      recommendedDepartureTime: alert.recommendedDepartureTime!,
      estimatedTravelTime: alert.currentTravelTime!,
      trafficConditions: alert.trafficConditions ?? 'moderate',
      sentAt: Date.now(),
      channels: this.config.notificationChannels,
    };

    alert.alertsSent.push(notification);

    if (this.deps.onDepartureAlert) {
      this.deps.onDepartureAlert({
        alertId: alert.id,
        userId: alert.userId,
        bookingId: alert.bookingId,
        recommendedDepartureTime: alert.recommendedDepartureTime!,
        estimatedTravelTime: alert.currentTravelTime!,
        trafficConditions: alert.trafficConditions ?? 'moderate',
        message,
      });
    }
  }

  private sendLeaveNowNotification(alert: DepartureAlert): void {
    const arrivalTime = new Date(alert.targetArrivalTime).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const message = `🚗 Leave now to arrive by ${arrivalTime}!`;

    const notification: DepartureAlertNotification = {
      id: randomUUID(),
      alertId: alert.id,
      type: 'leave_now',
      message,
      recommendedDepartureTime: Date.now(),
      estimatedTravelTime: alert.currentTravelTime ?? 0,
      trafficConditions: alert.trafficConditions ?? 'moderate',
      sentAt: Date.now(),
      channels: this.config.notificationChannels,
    };

    alert.alertsSent.push(notification);

    if (this.deps.onLeaveNow) {
      this.deps.onLeaveNow({
        alertId: alert.id,
        userId: alert.userId,
        bookingId: alert.bookingId,
        estimatedArrivalTime: alert.targetArrivalTime,
        message,
      });
    }
  }
}

/**
 * Create a traffic monitor instance
 */
export function createTrafficMonitor(
  config: Partial<TrafficMonitorConfig>,
  deps: TrafficMonitorDeps
): TrafficMonitor {
  const fullConfig: TrafficMonitorConfig = {
    enabled: config.enabled ?? true,
    checkIntervalMinutes: config.checkIntervalMinutes ?? 15,
    startMonitoringHoursBefore: config.startMonitoringHoursBefore ?? 4,
    defaultBufferMinutes: {
      airport: config.defaultBufferMinutes?.airport ?? 120,
      hotel: config.defaultBufferMinutes?.hotel ?? 30,
      activity: config.defaultBufferMinutes?.activity ?? 30,
      car_rental: config.defaultBufferMinutes?.car_rental ?? 60,
      flight: config.defaultBufferMinutes?.flight ?? 120,
    },
    notificationChannels: config.notificationChannels ?? ['push', 'sms'],
  };

  return new TrafficMonitor(fullConfig, deps);
}
