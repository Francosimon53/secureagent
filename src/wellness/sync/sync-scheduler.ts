/**
 * Sync Scheduler
 *
 * Orchestrates automatic synchronization of wearable data from all providers.
 */

import { EventEmitter } from 'events';
import type { WearableStore } from '../stores/wearable-store.js';
import type { SleepStore } from '../stores/sleep-store.js';
import type { ActivityStore } from '../stores/activity-store.js';
import type {
  WearableSource,
  SyncState,
  RecoveryData,
  StrainData,
  SleepRecord,
  Activity,
} from '../types.js';
import { WellnessProviderRegistry, type SyncCapableProvider } from '../providers/base.js';

// =============================================================================
// Sync Scheduler Configuration
// =============================================================================

export interface SyncSchedulerConfig {
  defaultIntervalMinutes: number;
  retryAttempts: number;
  retryDelayMinutes: number;
  enableAutoSync: boolean;
  providerIntervals: Partial<Record<WearableSource, number>>;
}

const DEFAULT_CONFIG: SyncSchedulerConfig = {
  defaultIntervalMinutes: 60,
  retryAttempts: 3,
  retryDelayMinutes: 5,
  enableAutoSync: true,
  providerIntervals: {},
};

// =============================================================================
// Sync Result
// =============================================================================

export interface SyncResult {
  provider: WearableSource;
  userId: string;
  success: boolean;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  dataFetched: {
    recovery?: number;
    strain?: number;
    sleep?: number;
    activities?: number;
  };
  error?: string;
}

// =============================================================================
// Sync Job
// =============================================================================

interface SyncJob {
  userId: string;
  provider: WearableSource;
  intervalMinutes: number;
  timer?: NodeJS.Timeout;
  lastRun?: number;
  nextRun?: number;
  isRunning: boolean;
  consecutiveFailures: number;
}

// =============================================================================
// Sync Scheduler
// =============================================================================

export class SyncScheduler extends EventEmitter {
  private readonly config: SyncSchedulerConfig;
  private jobs = new Map<string, SyncJob>();
  private readonly registry: WellnessProviderRegistry;

  constructor(
    private readonly wearableStore: WearableStore,
    private readonly sleepStore: SleepStore,
    private readonly activityStore: ActivityStore,
    config: Partial<SyncSchedulerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.registry = WellnessProviderRegistry.getInstance();
  }

  /**
   * Get job key for a user/provider combination
   */
  private getJobKey(userId: string, provider: WearableSource): string {
    return `${userId}:${provider}`;
  }

  /**
   * Schedule sync for a user/provider
   */
  scheduleSync(
    userId: string,
    provider: WearableSource,
    intervalMinutes?: number
  ): void {
    const key = this.getJobKey(userId, provider);
    const existing = this.jobs.get(key);

    if (existing?.timer) {
      clearInterval(existing.timer);
    }

    const interval =
      intervalMinutes ??
      this.config.providerIntervals[provider] ??
      this.config.defaultIntervalMinutes;

    const job: SyncJob = {
      userId,
      provider,
      intervalMinutes: interval,
      isRunning: false,
      consecutiveFailures: 0,
      nextRun: Date.now() + interval * 60 * 1000,
    };

    if (this.config.enableAutoSync) {
      job.timer = setInterval(() => {
        this.runSync(userId, provider);
      }, interval * 60 * 1000);
    }

    this.jobs.set(key, job);

    this.emit('sync:scheduled', {
      userId,
      provider,
      intervalMinutes: interval,
      nextRun: job.nextRun,
    });
  }

  /**
   * Cancel scheduled sync for a user/provider
   */
  cancelSync(userId: string, provider: WearableSource): void {
    const key = this.getJobKey(userId, provider);
    const job = this.jobs.get(key);

    if (job?.timer) {
      clearInterval(job.timer);
    }

    this.jobs.delete(key);

    this.emit('sync:cancelled', { userId, provider });
  }

  /**
   * Cancel all syncs for a user
   */
  cancelAllSyncs(userId: string): void {
    for (const [key, job] of this.jobs.entries()) {
      if (job.userId === userId) {
        if (job.timer) {
          clearInterval(job.timer);
        }
        this.jobs.delete(key);
      }
    }
  }

  /**
   * Run sync immediately
   */
  async runSync(userId: string, provider: WearableSource): Promise<SyncResult> {
    const key = this.getJobKey(userId, provider);
    const job = this.jobs.get(key);

    if (job?.isRunning) {
      return {
        provider,
        userId,
        success: false,
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 0,
        dataFetched: {},
        error: 'Sync already in progress',
      };
    }

    const startedAt = Date.now();

    // Update job state
    if (job) {
      job.isRunning = true;
      job.lastRun = startedAt;
    }

    // Update sync status in store
    const existingState = await this.wearableStore.getSyncState(userId, provider);
    await this.wearableStore.updateSyncState(userId, provider, {
      lastSyncAt: startedAt,
      lastSyncStatus: 'syncing',
    });

    this.emit('sync:started', { userId, provider, startedAt });

    try {
      const providerInstance = this.registry.getProvider(provider);

      if (!providerInstance) {
        throw new Error(`Provider ${provider} not registered`);
      }

      // Get OAuth token
      const token = await this.wearableStore.getToken(userId, provider);
      if (!token) {
        throw new Error(`No OAuth token for provider ${provider}`);
      }

      // Check if token is expired - refresh handled by provider
      const dataFetched: SyncResult['dataFetched'] = {};

      // Determine sync range (last 7 days by default, or since last sync)
      const syncState = await this.wearableStore.getSyncState(userId, provider);
      const since = syncState?.lastSyncAt ?? Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Use provider's sync methods which return SyncResult
      // Cast to SyncCapableProvider when using sync methods
      const syncProvider = providerInstance as unknown as Partial<SyncCapableProvider>;

      if (syncProvider.syncRecovery) {
        const recoveryResult = await syncProvider.syncRecovery(userId, since);
        dataFetched.recovery = recoveryResult.recordsCreated + recoveryResult.recordsUpdated;
      }

      if (syncProvider.syncStrain) {
        const strainResult = await syncProvider.syncStrain(userId, since);
        dataFetched.strain = strainResult.recordsCreated + strainResult.recordsUpdated;
      }

      if (syncProvider.syncSleep) {
        const sleepResult = await syncProvider.syncSleep(userId, since);
        dataFetched.sleep = sleepResult.recordsCreated + sleepResult.recordsUpdated;
      }

      if (syncProvider.syncActivities) {
        const activityResult = await syncProvider.syncActivities(userId, since);
        dataFetched.activities = activityResult.recordsCreated + activityResult.recordsUpdated;
      }

      const completedAt = Date.now();
      const result: SyncResult = {
        provider,
        userId,
        success: true,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        dataFetched,
      };

      // Update job state
      if (job) {
        job.isRunning = false;
        job.consecutiveFailures = 0;
        job.nextRun = Date.now() + job.intervalMinutes * 60 * 1000;
      }

      // Update sync status
      await this.wearableStore.updateSyncState(userId, provider, {
        lastSyncAt: completedAt,
        lastSyncStatus: 'success',
        lastError: undefined,
        nextSyncAt: job?.nextRun,
      });

      this.emit('sync:completed', result);

      return result;
    } catch (error) {
      const completedAt = Date.now();
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: SyncResult = {
        provider,
        userId,
        success: false,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        dataFetched: {},
        error: errorMessage,
      };

      // Update job state
      if (job) {
        job.isRunning = false;
        job.consecutiveFailures++;

        // Schedule retry if under limit
        if (job.consecutiveFailures < this.config.retryAttempts) {
          const retryDelay = this.config.retryDelayMinutes * 60 * 1000;
          setTimeout(() => {
            this.runSync(userId, provider);
          }, retryDelay);
          job.nextRun = Date.now() + retryDelay;
        } else {
          job.nextRun = Date.now() + job.intervalMinutes * 60 * 1000;
        }
      }

      // Update sync status
      await this.wearableStore.updateSyncState(userId, provider, {
        lastSyncAt: completedAt,
        lastSyncStatus: 'failed',
        lastError: errorMessage,
        nextSyncAt: job?.nextRun,
      });

      this.emit('sync:failed', result);

      return result;
    }
  }

  /**
   * Sync all providers for a user
   */
  async syncAll(userId: string): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const providers = this.registry.listProviders();

    for (const provider of providers) {
      // Check if user has token for this provider
      const token = await this.wearableStore.getToken(userId, provider);
      if (token) {
        const result = await this.runSync(userId, provider);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get sync status for a user/provider
   */
  async getSyncState(
    userId: string,
    provider: WearableSource
  ): Promise<SyncState | null> {
    return this.wearableStore.getSyncState(userId, provider);
  }

  /**
   * Get all sync statuses for a user
   */
  async getAllSyncStates(userId: string): Promise<SyncState[]> {
    const statuses: SyncState[] = [];
    const providers = this.registry.listProviders();

    for (const provider of providers) {
      const status = await this.wearableStore.getSyncState(userId, provider);
      if (status) {
        statuses.push(status);
      }
    }

    return statuses;
  }

  /**
   * Get scheduled jobs for a user
   */
  getScheduledJobs(userId: string): Array<{
    provider: WearableSource;
    intervalMinutes: number;
    lastRun?: number;
    nextRun?: number;
    isRunning: boolean;
  }> {
    const userJobs: Array<{
      provider: WearableSource;
      intervalMinutes: number;
      lastRun?: number;
      nextRun?: number;
      isRunning: boolean;
    }> = [];

    for (const job of this.jobs.values()) {
      if (job.userId === userId) {
        userJobs.push({
          provider: job.provider,
          intervalMinutes: job.intervalMinutes,
          lastRun: job.lastRun,
          nextRun: job.nextRun,
          isRunning: job.isRunning,
        });
      }
    }

    return userJobs;
  }

  /**
   * Initialize sync for a user (schedule all connected providers)
   */
  async initializeUserSync(userId: string): Promise<void> {
    const providers = this.registry.listProviders();

    for (const provider of providers) {
      const token = await this.wearableStore.getToken(userId, provider);
      if (token && token.expiresAt > Date.now()) {
        this.scheduleSync(userId, provider);
        // Run initial sync
        this.runSync(userId, provider);
      }
    }
  }

  /**
   * Shutdown scheduler
   */
  shutdown(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearInterval(job.timer);
      }
    }
    this.jobs.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createSyncScheduler(
  wearableStore: WearableStore,
  sleepStore: SleepStore,
  activityStore: ActivityStore,
  config?: Partial<SyncSchedulerConfig>
): SyncScheduler {
  return new SyncScheduler(wearableStore, sleepStore, activityStore, config);
}
