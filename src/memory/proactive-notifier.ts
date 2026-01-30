/**
 * Proactive Notifier
 *
 * Priority queue notifications with delivery management and user preferences
 */

import { randomUUID } from 'crypto';
import type {
  QueuedNotification,
  NotificationAction,
  NotificationPreferences,
  NotificationChannel,
  QuietHours,
  NotificationFilter,
  MemoryPriority,
} from './types.js';
import { MemoryError } from './types.js';
import { NOTIFICATION_DEFAULTS, MEMORY_EVENTS, PRIORITY_ORDER, TABLE_NAMES } from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Notification Store Interface
// =============================================================================

export interface NotificationStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Queue a notification */
  queue(notification: Omit<QueuedNotification, 'id' | 'read' | 'dismissed' | 'createdAt'>): Promise<QueuedNotification>;

  /** Get notification by ID */
  get(id: string): Promise<QueuedNotification | null>;

  /** Get notifications for a user */
  getByUserId(userId: string, options?: NotificationQueryOptions): Promise<QueuedNotification[]>;

  /** Count unread notifications */
  countUnread(userId: string): Promise<number>;

  /** Mark as read */
  markAsRead(id: string): Promise<boolean>;

  /** Mark multiple as read */
  markAllAsRead(userId: string): Promise<number>;

  /** Dismiss notification */
  dismiss(id: string): Promise<boolean>;

  /** Delete notification */
  delete(id: string): Promise<boolean>;

  /** Delete expired notifications */
  deleteExpired(): Promise<number>;

  /** Get/set user preferences */
  getPreferences(userId: string): Promise<NotificationPreferences | null>;
  setPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences>;
}

export interface NotificationQueryOptions {
  unreadOnly?: boolean;
  priority?: MemoryPriority;
  type?: QueuedNotification['type'];
  source?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface NotificationRow {
  id: string;
  user_id: string;
  priority: string;
  type: string;
  title: string;
  message: string;
  source: string;
  data: string | null;
  actions: string | null;
  read: number;
  dismissed: number;
  expires_at: number | null;
  created_at: number;
}

interface PreferencesRow {
  user_id: string;
  enabled: number;
  channels: string;
  quiet_hours: string | null;
  filters: string;
}

// =============================================================================
// Database Notification Store
// =============================================================================

export class DatabaseNotificationStore implements NotificationStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.NOTIFICATIONS} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        priority TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NOT NULL,
        data TEXT,
        actions TEXT,
        read INTEGER NOT NULL DEFAULT 0,
        dismissed INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER,
        created_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.NOTIFICATION_PREFERENCES} (
        user_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        channels TEXT NOT NULL,
        quiet_hours TEXT,
        filters TEXT NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON ${TABLE_NAMES.NOTIFICATIONS}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_priority ON ${TABLE_NAMES.NOTIFICATIONS}(priority)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON ${TABLE_NAMES.NOTIFICATIONS}(read)
    `);
  }

  async queue(
    input: Omit<QueuedNotification, 'id' | 'read' | 'dismissed' | 'createdAt'>
  ): Promise<QueuedNotification> {
    const now = Date.now();
    const notification: QueuedNotification = {
      ...input,
      id: randomUUID(),
      read: false,
      dismissed: false,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.NOTIFICATIONS} (
        id, user_id, priority, type, title, message, source, data, actions,
        read, dismissed, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        notification.id,
        notification.userId,
        notification.priority,
        notification.type,
        notification.title,
        notification.message,
        notification.source,
        notification.data ? JSON.stringify(notification.data) : null,
        notification.actions ? JSON.stringify(notification.actions) : null,
        0,
        0,
        notification.expiresAt ?? null,
        notification.createdAt,
      ]
    );

    return notification;
  }

  async get(id: string): Promise<QueuedNotification | null> {
    const result = await this.db.execute<NotificationRow>(
      `SELECT * FROM ${TABLE_NAMES.NOTIFICATIONS} WHERE id = ?`,
      [id]
    );
    return result.length > 0 ? this.rowToNotification(result[0]) : null;
  }

  async getByUserId(userId: string, options: NotificationQueryOptions = {}): Promise<QueuedNotification[]> {
    let sql = `SELECT * FROM ${TABLE_NAMES.NOTIFICATIONS} WHERE user_id = ? AND dismissed = 0`;
    const params: unknown[] = [userId];

    if (options.unreadOnly) {
      sql += ' AND read = 0';
    }

    if (options.priority) {
      sql += ' AND priority = ?';
      params.push(options.priority);
    }

    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }

    if (options.source) {
      sql += ' AND source = ?';
      params.push(options.source);
    }

    // Exclude expired
    sql += ' AND (expires_at IS NULL OR expires_at > ?)';
    params.push(Date.now());

    // Order by priority then creation time
    sql += ' ORDER BY CASE priority WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 ELSE 3 END, created_at DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const result = await this.db.execute<NotificationRow>(sql, params);
    return result.map(row => this.rowToNotification(row));
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.db.execute<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${TABLE_NAMES.NOTIFICATIONS}
       WHERE user_id = ? AND read = 0 AND dismissed = 0
       AND (expires_at IS NULL OR expires_at > ?)`,
      [userId, Date.now()]
    );
    return result[0]?.count ?? 0;
  }

  async markAsRead(id: string): Promise<boolean> {
    const result = await this.db.execute(
      `UPDATE ${TABLE_NAMES.NOTIFICATIONS} SET read = 1 WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.db.execute(
      `UPDATE ${TABLE_NAMES.NOTIFICATIONS} SET read = 1 WHERE user_id = ? AND read = 0`,
      [userId]
    );
    return (result as unknown as { changes: number }).changes;
  }

  async dismiss(id: string): Promise<boolean> {
    const result = await this.db.execute(
      `UPDATE ${TABLE_NAMES.NOTIFICATIONS} SET dismissed = 1 WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.NOTIFICATIONS} WHERE id = ?`,
      [id]
    );
    return (result as unknown as { changes: number }).changes > 0;
  }

  async deleteExpired(): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.NOTIFICATIONS} WHERE expires_at IS NOT NULL AND expires_at < ?`,
      [Date.now()]
    );
    return (result as unknown as { changes: number }).changes;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    const result = await this.db.execute<PreferencesRow>(
      `SELECT * FROM ${TABLE_NAMES.NOTIFICATION_PREFERENCES} WHERE user_id = ?`,
      [userId]
    );
    if (result.length === 0) return null;

    const row = result[0];
    return {
      userId: row.user_id,
      enabled: row.enabled === 1,
      channels: JSON.parse(row.channels),
      quietHours: row.quiet_hours ? JSON.parse(row.quiet_hours) : undefined,
      filters: JSON.parse(row.filters),
    };
  }

  async setPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    await this.db.execute(
      `INSERT OR REPLACE INTO ${TABLE_NAMES.NOTIFICATION_PREFERENCES} (
        user_id, enabled, channels, quiet_hours, filters
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        preferences.userId,
        preferences.enabled ? 1 : 0,
        JSON.stringify(preferences.channels),
        preferences.quietHours ? JSON.stringify(preferences.quietHours) : null,
        JSON.stringify(preferences.filters),
      ]
    );
    return preferences;
  }

  private rowToNotification(row: NotificationRow): QueuedNotification {
    return {
      id: row.id,
      userId: row.user_id,
      priority: row.priority as MemoryPriority,
      type: row.type as QueuedNotification['type'],
      title: row.title,
      message: row.message,
      source: row.source,
      data: row.data ? JSON.parse(row.data) : undefined,
      actions: row.actions ? JSON.parse(row.actions) : undefined,
      read: row.read === 1,
      dismissed: row.dismissed === 1,
      expiresAt: row.expires_at ?? undefined,
      createdAt: row.created_at,
    };
  }
}

// =============================================================================
// In-Memory Notification Store
// =============================================================================

export class InMemoryNotificationStore implements NotificationStore {
  private notifications = new Map<string, QueuedNotification>();
  private preferences = new Map<string, NotificationPreferences>();

  async initialize(): Promise<void> {
    // No-op
  }

  async queue(
    input: Omit<QueuedNotification, 'id' | 'read' | 'dismissed' | 'createdAt'>
  ): Promise<QueuedNotification> {
    const notification: QueuedNotification = {
      ...input,
      id: randomUUID(),
      read: false,
      dismissed: false,
      createdAt: Date.now(),
    };
    this.notifications.set(notification.id, notification);
    return { ...notification };
  }

  async get(id: string): Promise<QueuedNotification | null> {
    const notification = this.notifications.get(id);
    return notification ? { ...notification } : null;
  }

  async getByUserId(userId: string, options: NotificationQueryOptions = {}): Promise<QueuedNotification[]> {
    const now = Date.now();
    let notifications = Array.from(this.notifications.values())
      .filter(n => n.userId === userId && !n.dismissed)
      .filter(n => !n.expiresAt || n.expiresAt > now);

    if (options.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }
    if (options.priority) {
      notifications = notifications.filter(n => n.priority === options.priority);
    }
    if (options.type) {
      notifications = notifications.filter(n => n.type === options.type);
    }
    if (options.source) {
      notifications = notifications.filter(n => n.source === options.source);
    }

    // Sort by priority then time
    notifications.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    if (options.offset) {
      notifications = notifications.slice(options.offset);
    }
    if (options.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    return notifications.map(n => ({ ...n }));
  }

  async countUnread(userId: string): Promise<number> {
    const now = Date.now();
    return Array.from(this.notifications.values())
      .filter(n => n.userId === userId && !n.read && !n.dismissed)
      .filter(n => !n.expiresAt || n.expiresAt > now)
      .length;
  }

  async markAsRead(id: string): Promise<boolean> {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.read = true;
    return true;
  }

  async markAllAsRead(userId: string): Promise<number> {
    let count = 0;
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId && !notification.read) {
        notification.read = true;
        count++;
      }
    }
    return count;
  }

  async dismiss(id: string): Promise<boolean> {
    const notification = this.notifications.get(id);
    if (!notification) return false;
    notification.dismissed = true;
    return true;
  }

  async delete(id: string): Promise<boolean> {
    return this.notifications.delete(id);
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, notification] of this.notifications) {
      if (notification.expiresAt && notification.expiresAt < now) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    const prefs = this.preferences.get(userId);
    return prefs ? { ...prefs } : null;
  }

  async setPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    this.preferences.set(preferences.userId, { ...preferences });
    return preferences;
  }
}

// =============================================================================
// Notification Delivery Handler
// =============================================================================

export interface NotificationDeliveryHandler {
  deliver(notification: QueuedNotification, channel: NotificationChannel): Promise<boolean>;
}

// =============================================================================
// Proactive Notifier Service
// =============================================================================

export interface ProactiveNotifierConfig {
  maxQueueSize: number;
  defaultExpiryMs: number;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  cleanupIntervalMs: number;
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: ProactiveNotifierConfig = {
  maxQueueSize: NOTIFICATION_DEFAULTS.MAX_QUEUE_SIZE,
  defaultExpiryMs: NOTIFICATION_DEFAULTS.DEFAULT_EXPIRY_MS,
  batchSize: NOTIFICATION_DEFAULTS.BATCH_SIZE,
  maxRetries: NOTIFICATION_DEFAULTS.MAX_RETRIES,
  retryDelayMs: NOTIFICATION_DEFAULTS.RETRY_DELAY_MS,
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

export class ProactiveNotifier {
  private readonly config: ProactiveNotifierConfig;
  private readonly deliveryHandlers = new Map<string, NotificationDeliveryHandler>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly store: NotificationStore,
    config?: Partial<ProactiveNotifierConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a delivery handler for a channel type
   */
  registerDeliveryHandler(channelType: string, handler: NotificationDeliveryHandler): void {
    this.deliveryHandlers.set(channelType, handler);
  }

  /**
   * Start the notifier (cleanup timer)
   */
  start(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs
    );
  }

  /**
   * Stop the notifier
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Queue a notification
   */
  async notify(
    userId: string,
    title: string,
    message: string,
    options?: {
      type?: QueuedNotification['type'];
      priority?: MemoryPriority;
      source?: string;
      data?: Record<string, unknown>;
      actions?: NotificationAction[];
      expiresAt?: number;
      deliver?: boolean;
    }
  ): Promise<QueuedNotification> {
    // Check preferences
    const preferences = await this.store.getPreferences(userId);
    if (preferences && !preferences.enabled) {
      throw new MemoryError('NOTIFICATION_FAILED', 'Notifications are disabled for this user');
    }

    // Check queue size
    const currentCount = await this.store.countUnread(userId);
    if (currentCount >= this.config.maxQueueSize) {
      // Remove oldest low-priority notifications
      const old = await this.store.getByUserId(userId, { limit: 10 });
      const toRemove = old
        .filter(n => n.priority === 'low' || n.priority === 'normal')
        .slice(0, 5);
      for (const n of toRemove) {
        await this.store.delete(n.id);
      }
    }

    // Apply filters
    const priority = options?.priority ?? 'normal';
    const source = options?.source ?? 'system';

    if (preferences) {
      const blocked = this.isBlocked(preferences, priority, source, options?.type ?? 'info');
      if (blocked) {
        throw new MemoryError('NOTIFICATION_FAILED', 'Notification blocked by user filter');
      }
    }

    // Queue notification
    const notification = await this.store.queue({
      userId,
      priority,
      type: options?.type ?? 'info',
      title,
      message,
      source,
      data: options?.data,
      actions: options?.actions,
      expiresAt: options?.expiresAt ?? Date.now() + this.config.defaultExpiryMs,
    });

    this.emit(MEMORY_EVENTS.NOTIFICATION_QUEUED, { notification });

    // Deliver immediately if requested
    if (options?.deliver !== false && preferences) {
      await this.deliverNotification(notification, preferences);
    }

    return notification;
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(userId: string, options?: NotificationQueryOptions): Promise<QueuedNotification[]> {
    return this.store.getByUserId(userId, options);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.store.countUnread(userId);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string): Promise<boolean> {
    const result = await this.store.markAsRead(id);
    if (result) {
      this.emit(MEMORY_EVENTS.NOTIFICATION_READ, { id });
    }
    return result;
  }

  /**
   * Mark all as read
   */
  async markAllAsRead(userId: string): Promise<number> {
    return this.store.markAllAsRead(userId);
  }

  /**
   * Dismiss notification
   */
  async dismiss(id: string): Promise<boolean> {
    const result = await this.store.dismiss(id);
    if (result) {
      this.emit(MEMORY_EVENTS.NOTIFICATION_DISMISSED, { id });
    }
    return result;
  }

  /**
   * Delete notification
   */
  async deleteNotification(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    return this.store.getPreferences(userId);
  }

  /**
   * Set user preferences
   */
  async setPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    return this.store.setPreferences(preferences);
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferences, 'userId'>>
  ): Promise<NotificationPreferences> {
    const existing = await this.store.getPreferences(userId);
    const preferences: NotificationPreferences = {
      userId,
      enabled: updates.enabled ?? existing?.enabled ?? true,
      channels: updates.channels ?? existing?.channels ?? [],
      quietHours: updates.quietHours ?? existing?.quietHours,
      filters: updates.filters ?? existing?.filters ?? [],
    };
    return this.store.setPreferences(preferences);
  }

  /**
   * Add a notification channel
   */
  async addChannel(userId: string, channel: NotificationChannel): Promise<NotificationPreferences> {
    const existing = await this.store.getPreferences(userId);
    const channels = existing?.channels ?? [];

    // Replace existing channel of same type
    const filtered = channels.filter(c => c.type !== channel.type);
    filtered.push(channel);

    return this.updatePreferences(userId, { channels: filtered });
  }

  /**
   * Remove a notification channel
   */
  async removeChannel(userId: string, channelType: string): Promise<NotificationPreferences> {
    const existing = await this.store.getPreferences(userId);
    const channels = (existing?.channels ?? []).filter(c => c.type !== channelType);
    return this.updatePreferences(userId, { channels });
  }

  /**
   * Set quiet hours
   */
  async setQuietHours(userId: string, quietHours: QuietHours | undefined): Promise<NotificationPreferences> {
    return this.updatePreferences(userId, { quietHours });
  }

  /**
   * Add a filter
   */
  async addFilter(userId: string, filter: NotificationFilter): Promise<NotificationPreferences> {
    const existing = await this.store.getPreferences(userId);
    const filters = existing?.filters ?? [];
    filters.push(filter);
    return this.updatePreferences(userId, { filters });
  }

  /**
   * Remove a filter
   */
  async removeFilter(userId: string, index: number): Promise<NotificationPreferences> {
    const existing = await this.store.getPreferences(userId);
    const filters = existing?.filters ?? [];
    filters.splice(index, 1);
    return this.updatePreferences(userId, { filters });
  }

  /**
   * Deliver pending notifications for a user
   */
  async deliverPending(userId: string): Promise<number> {
    const preferences = await this.store.getPreferences(userId);
    if (!preferences || !preferences.enabled) return 0;

    // Check quiet hours
    if (this.isQuietHours(preferences.quietHours)) {
      return 0;
    }

    const notifications = await this.store.getByUserId(userId, {
      unreadOnly: true,
      limit: this.config.batchSize,
    });

    let delivered = 0;
    for (const notification of notifications) {
      // Skip low priority during quiet hours unless critical
      if (this.isQuietHours(preferences.quietHours) && notification.priority !== 'critical') {
        continue;
      }

      const success = await this.deliverNotification(notification, preferences);
      if (success) delivered++;
    }

    return delivered;
  }

  /**
   * Cleanup expired notifications
   */
  async cleanup(): Promise<number> {
    const deleted = await this.store.deleteExpired();
    if (deleted > 0) {
      this.emit(MEMORY_EVENTS.NOTIFICATION_EXPIRED, { count: deleted });
    }
    return deleted;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  private async deliverNotification(
    notification: QueuedNotification,
    preferences: NotificationPreferences
  ): Promise<boolean> {
    const enabledChannels = preferences.channels.filter(c => c.enabled);
    let delivered = false;

    for (const channel of enabledChannels) {
      const handler = this.deliveryHandlers.get(channel.type);
      if (!handler) continue;

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          const success = await handler.deliver(notification, channel);
          if (success) {
            delivered = true;
            break;
          }
        } catch {
          if (attempt < this.config.maxRetries - 1) {
            await this.sleep(this.config.retryDelayMs * (attempt + 1));
          }
        }
      }
    }

    if (delivered) {
      this.emit(MEMORY_EVENTS.NOTIFICATION_DELIVERED, { notification });
    }

    return delivered;
  }

  private isBlocked(
    preferences: NotificationPreferences,
    priority: MemoryPriority,
    source: string,
    type: string
  ): boolean {
    for (const filter of preferences.filters) {
      // Check type match
      if (filter.type !== '*' && filter.type !== type) continue;

      // Check source match
      if (filter.sources && !filter.sources.includes(source)) continue;

      // Check priority match
      if (filter.priorities && !filter.priorities.includes(priority)) continue;

      // Filter matches
      return filter.action === 'block';
    }

    return false;
  }

  private isQuietHours(quietHours?: QuietHours): boolean {
    if (!quietHours || !quietHours.enabled) return false;

    const now = new Date();
    const [startHour, startMin] = quietHours.start.split(':').map(Number);
    const [endHour, endMin] = quietHours.end.split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes <= endMinutes) {
      // Normal range (e.g., 22:00 - 07:00 would be startMinutes > endMinutes)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a notification action
 */
export function createNotificationAction(
  label: string,
  type: NotificationAction['type'],
  config: Record<string, unknown>
): NotificationAction {
  return {
    id: randomUUID(),
    label,
    type,
    config,
  };
}

/**
 * Create default preferences
 */
export function createDefaultPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    enabled: true,
    channels: [
      { type: 'in_app', enabled: true, config: {} },
    ],
    filters: [],
  };
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createNotificationStore(type: 'memory'): InMemoryNotificationStore;
export function createNotificationStore(type: 'database', db: DatabaseAdapter): DatabaseNotificationStore;
export function createNotificationStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): NotificationStore {
  if (type === 'memory') {
    return new InMemoryNotificationStore();
  }
  if (!db) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseNotificationStore(db);
}

export function createProactiveNotifier(
  store: NotificationStore,
  config?: Partial<ProactiveNotifierConfig>
): ProactiveNotifier {
  return new ProactiveNotifier(store, config);
}
