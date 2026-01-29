/**
 * Wearable Sync Service
 *
 * Orchestrates data synchronization from all wearable providers.
 */

import { EventEmitter } from 'events';
import type { WearableStore } from '../stores/wearable-store.js';
import type { SleepStore } from '../stores/sleep-store.js';
import type { ActivityStore } from '../stores/activity-store.js';
import type { WearableSource, SyncState, OAuthToken } from '../types.js';
import {
  SyncScheduler,
  createSyncScheduler,
  type SyncSchedulerConfig,
  type SyncResult,
} from './sync-scheduler.js';
import {
  WellnessProviderRegistry,
  type OAuthWellnessProvider,
  type OAuth1WellnessProvider,
} from '../providers/base.js';

// =============================================================================
// Re-exports
// =============================================================================

export {
  SyncScheduler,
  createSyncScheduler,
  type SyncSchedulerConfig,
  type SyncResult,
} from './sync-scheduler.js';

// =============================================================================
// Wearable Sync Service Configuration
// =============================================================================

export interface WearableSyncServiceConfig {
  enabled: boolean;
  scheduler?: Partial<SyncSchedulerConfig>;
}

const DEFAULT_CONFIG: WearableSyncServiceConfig = {
  enabled: true,
};

// =============================================================================
// Connection Status
// =============================================================================

export interface ProviderConnectionStatus {
  provider: WearableSource;
  connected: boolean;
  lastSyncAt?: number;
  syncStatus?: 'idle' | 'syncing' | 'success' | 'failed';
  error?: string;
  tokenExpiresAt?: number;
}

// =============================================================================
// Wearable Sync Service
// =============================================================================

export class WearableSyncService extends EventEmitter {
  private readonly config: WearableSyncServiceConfig;
  private readonly scheduler: SyncScheduler;
  private readonly registry: WellnessProviderRegistry;

  constructor(
    private readonly wearableStore: WearableStore,
    private readonly sleepStore: SleepStore,
    private readonly activityStore: ActivityStore,
    config: Partial<WearableSyncServiceConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scheduler = createSyncScheduler(
      wearableStore,
      sleepStore,
      activityStore,
      config.scheduler
    );
    this.registry = WellnessProviderRegistry.getInstance();

    // Forward scheduler events
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.scheduler.on('sync:started', (event) => {
      this.emit('sync:started', event);
    });
    this.scheduler.on('sync:completed', (event) => {
      this.emit('sync:completed', event);
    });
    this.scheduler.on('sync:failed', (event) => {
      this.emit('sync:failed', event);
    });
    this.scheduler.on('sync:scheduled', (event) => {
      this.emit('sync:scheduled', event);
    });
    this.scheduler.on('sync:cancelled', (event) => {
      this.emit('sync:cancelled', event);
    });
  }

  /**
   * Get OAuth authorization URL for a provider
   */
  getAuthorizationUrl(provider: WearableSource, state: string, redirectUri: string): string {
    const providerInstance = this.registry.getProvider(provider);

    if (!providerInstance) {
      throw new Error(`Provider ${provider} not registered`);
    }

    // Check if it's an OAuth 2.0 provider
    if ('getAuthorizationUrl' in providerInstance) {
      return (providerInstance as unknown as OAuthWellnessProvider).getAuthorizationUrl(state, redirectUri);
    }

    // Check if it's an OAuth 1.0a provider
    if ('getRequestToken' in providerInstance) {
      throw new Error(`OAuth 1.0a providers require a different flow. Use getRequestToken first.`);
    }

    throw new Error(`Provider ${provider} does not support OAuth`);
  }

  /**
   * Get OAuth 1.0a request token (for Garmin)
   */
  async getOAuth1RequestToken(
    provider: WearableSource,
    callbackUrl: string
  ): Promise<{ token: string; tokenSecret: string; authUrl: string }> {
    const providerInstance = this.registry.getProvider(provider);

    if (!providerInstance || !('getRequestToken' in providerInstance)) {
      throw new Error(`Provider ${provider} does not support OAuth 1.0a`);
    }

    const oauth1Provider = providerInstance as unknown as OAuth1WellnessProvider;
    const result = await oauth1Provider.getRequestToken(callbackUrl);

    if (!result.success || !result.data) {
      throw new Error(`Failed to get request token: ${result.error ?? 'Unknown error'}`);
    }

    // Get authorization URL using the request token
    const authUrl = oauth1Provider.getAuthorizationUrl(result.data.oauthToken);

    return {
      token: result.data.oauthToken,
      tokenSecret: result.data.oauthTokenSecret,
      authUrl,
    };
  }

  /**
   * Exchange OAuth authorization code for tokens
   */
  async exchangeAuthorizationCode(
    userId: string,
    provider: WearableSource,
    code: string,
    redirectUri: string
  ): Promise<OAuthToken> {
    const providerInstance = this.registry.getProvider(provider);

    if (!providerInstance || !('exchangeCode' in providerInstance)) {
      throw new Error(`Provider ${provider} does not support OAuth 2.0`);
    }

    const tokenResponse = await (providerInstance as unknown as OAuthWellnessProvider).exchangeCode(code, redirectUri);

    if (!tokenResponse.success || !tokenResponse.data) {
      throw new Error(`Failed to exchange authorization code: ${tokenResponse.error ?? 'Unknown error'}`);
    }

    // Create OAuthToken from response
    const token: Omit<OAuthToken, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      provider,
      accessToken: tokenResponse.data.accessToken,
      refreshToken: tokenResponse.data.refreshToken ?? '',
      expiresAt: Date.now() + tokenResponse.data.expiresIn * 1000,
      tokenType: tokenResponse.data.tokenType ?? 'Bearer',
      scope: tokenResponse.data.scope,
    };

    const savedToken = await this.wearableStore.saveToken(token);

    this.emit('provider:connected', { userId, provider });

    // Schedule automatic sync
    this.scheduler.scheduleSync(userId, provider);

    // Run initial sync
    this.scheduler.runSync(userId, provider);

    return savedToken;
  }

  /**
   * Exchange OAuth 1.0a verifier for access tokens (for Garmin)
   */
  async exchangeOAuth1Verifier(
    userId: string,
    provider: WearableSource,
    requestToken: string,
    requestTokenSecret: string,
    verifier: string
  ): Promise<OAuthToken> {
    const providerInstance = this.registry.getProvider(provider);

    if (!providerInstance || !('exchangeVerifier' in providerInstance)) {
      throw new Error(`Provider ${provider} does not support OAuth 1.0a`);
    }

    const tokenResponse = await (providerInstance as unknown as OAuth1WellnessProvider).exchangeVerifier(
      requestToken,
      requestTokenSecret,
      verifier
    );

    if (!tokenResponse.success || !tokenResponse.data) {
      throw new Error(`Failed to exchange OAuth verifier: ${tokenResponse.error ?? 'Unknown error'}`);
    }

    // Create OAuthToken from response
    const token: Omit<OAuthToken, 'id' | 'createdAt' | 'updatedAt'> = {
      userId,
      provider,
      accessToken: tokenResponse.data.oauthToken,
      refreshToken: tokenResponse.data.oauthTokenSecret, // OAuth 1.0a uses token secret instead
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // OAuth 1.0a tokens don't typically expire
      tokenType: 'OAuth1',
    };

    const savedToken = await this.wearableStore.saveToken(token);

    this.emit('provider:connected', { userId, provider });

    // Schedule automatic sync
    this.scheduler.scheduleSync(userId, provider);

    // Run initial sync
    this.scheduler.runSync(userId, provider);

    return savedToken;
  }

  /**
   * Disconnect a provider
   */
  async disconnectProvider(userId: string, provider: WearableSource): Promise<void> {
    // Cancel scheduled syncs
    this.scheduler.cancelSync(userId, provider);

    // Delete stored token
    await this.wearableStore.deleteToken(userId, provider);

    this.emit('provider:disconnected', { userId, provider });
  }

  /**
   * Get connection status for all providers
   */
  async getConnectionStatuses(userId: string): Promise<ProviderConnectionStatus[]> {
    const statuses: ProviderConnectionStatus[] = [];
    const providers = this.registry.listProviders();

    for (const provider of providers) {
      const token = await this.wearableStore.getToken(userId, provider);
      const syncState = await this.wearableStore.getSyncState(userId, provider);

      statuses.push({
        provider,
        connected: token !== null && token.expiresAt > Date.now(),
        lastSyncAt: syncState?.lastSyncAt,
        syncStatus: syncState?.lastSyncStatus as ProviderConnectionStatus['syncStatus'],
        error: syncState?.lastError,
        tokenExpiresAt: token?.expiresAt,
      });
    }

    return statuses;
  }

  /**
   * Get connection status for a specific provider
   */
  async getConnectionStatus(
    userId: string,
    provider: WearableSource
  ): Promise<ProviderConnectionStatus> {
    const token = await this.wearableStore.getToken(userId, provider);
    const syncState = await this.wearableStore.getSyncState(userId, provider);

    return {
      provider,
      connected: token !== null && token.expiresAt > Date.now(),
      lastSyncAt: syncState?.lastSyncAt,
      syncStatus: syncState?.lastSyncStatus as ProviderConnectionStatus['syncStatus'],
      error: syncState?.lastError,
      tokenExpiresAt: token?.expiresAt,
    };
  }

  /**
   * Manually trigger sync for a provider
   */
  async syncProvider(userId: string, provider: WearableSource): Promise<SyncResult> {
    return this.scheduler.runSync(userId, provider);
  }

  /**
   * Sync all connected providers
   */
  async syncAll(userId: string): Promise<SyncResult[]> {
    return this.scheduler.syncAll(userId);
  }

  /**
   * Get sync status
   */
  async getSyncState(userId: string, provider: WearableSource): Promise<SyncState | null> {
    return this.scheduler.getSyncState(userId, provider);
  }

  /**
   * Get all sync statuses
   */
  async getAllSyncStatuses(userId: string): Promise<SyncState[]> {
    return this.scheduler.getAllSyncStates(userId);
  }

  /**
   * Get scheduled sync jobs
   */
  getScheduledJobs(userId: string) {
    return this.scheduler.getScheduledJobs(userId);
  }

  /**
   * Initialize sync service for a user
   */
  async initialize(userId: string): Promise<void> {
    await this.scheduler.initializeUserSync(userId);
  }

  /**
   * Shutdown sync service
   */
  shutdown(): void {
    this.scheduler.shutdown();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createWearableSyncService(
  wearableStore: WearableStore,
  sleepStore: SleepStore,
  activityStore: ActivityStore,
  config?: Partial<WearableSyncServiceConfig>
): WearableSyncService {
  return new WearableSyncService(wearableStore, sleepStore, activityStore, config);
}
