/**
 * Shared Memory Service
 *
 * Service for managing cross-user memory sharing within families.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type {
  EncryptedContent,
  MemoryShareConsent,
  MemorySharingSettings,
  SharedMemory,
  SharedMemoryQueryOptions,
  SharedMemoryType,
  SharedMemoryWithEncryption,
} from '../types.js';
import type {
  MemoryConsentStore,
  MemorySharingSettingsStore,
  SharedMemoryStore,
} from '../stores/shared-memory-store.js';
import type { FamilyGroupStore } from '../stores/family-group-store.js';
import { ConsentManager, type ConsentManagerConfig } from './consent-manager.js';

// ============================================================================
// Service Configuration
// ============================================================================

export interface SharedMemoryServiceConfig {
  encryptionEnabled: boolean;
  maxMemoriesPerUser: number;
  defaultExpirationDays?: number;
  consentManager?: Partial<ConsentManagerConfig>;
}

// ============================================================================
// Key Management Interface
// ============================================================================

export interface KeyManager {
  getKey(keyId: string): Promise<Buffer | null>;
  createKey(userId: string, familyGroupId: string): Promise<{ keyId: string; key: Buffer }>;
  deleteKey(keyId: string): Promise<boolean>;
}

// ============================================================================
// Simple Key Manager (In-Memory for Development)
// ============================================================================

export class InMemoryKeyManager implements KeyManager {
  private keys = new Map<string, Buffer>();

  async getKey(keyId: string): Promise<Buffer | null> {
    return this.keys.get(keyId) ?? null;
  }

  async createKey(userId: string, familyGroupId: string): Promise<{ keyId: string; key: Buffer }> {
    const keyId = `key-${userId}-${familyGroupId}-${Date.now()}`;
    const key = randomBytes(32);
    this.keys.set(keyId, key);
    return { keyId, key };
  }

  async deleteKey(keyId: string): Promise<boolean> {
    return this.keys.delete(keyId);
  }
}

// ============================================================================
// Shared Memory Service
// ============================================================================

export class SharedMemoryService {
  private readonly memoryStore: SharedMemoryStore;
  private readonly settingsStore: MemorySharingSettingsStore;
  private readonly consentManager: ConsentManager;
  private readonly keyManager: KeyManager;
  private readonly config: SharedMemoryServiceConfig;

  constructor(
    memoryStore: SharedMemoryStore,
    settingsStore: MemorySharingSettingsStore,
    consentStore: MemoryConsentStore,
    familyGroupStore: FamilyGroupStore,
    keyManager?: KeyManager,
    config?: Partial<SharedMemoryServiceConfig>
  ) {
    this.memoryStore = memoryStore;
    this.settingsStore = settingsStore;
    this.keyManager = keyManager || new InMemoryKeyManager();
    this.config = {
      encryptionEnabled: config?.encryptionEnabled ?? true,
      maxMemoriesPerUser: config?.maxMemoriesPerUser || 1000,
      defaultExpirationDays: config?.defaultExpirationDays,
      consentManager: config?.consentManager,
    };
    this.consentManager = new ConsentManager(
      settingsStore,
      consentStore,
      familyGroupStore,
      config?.consentManager
    );
  }

  // ============================================================================
  // Memory Sharing
  // ============================================================================

  /**
   * Share a memory with family members
   */
  async shareMemory(
    fromUserId: string,
    familyGroupId: string,
    originalMemoryId: string,
    content: string,
    options: ShareMemoryOptions
  ): Promise<SharedMemory> {
    // Check sharing permissions for each recipient
    for (const recipientId of options.sharedWith) {
      const canShare = await this.consentManager.canShare(
        fromUserId,
        recipientId,
        familyGroupId,
        options.type,
        options.category
      );

      if (!canShare.allowed) {
        throw new Error(`Cannot share with user ${recipientId}: ${canShare.reason}`);
      }
    }

    // Get or create encryption key
    const settings = await this.settingsStore.getSettings(fromUserId, familyGroupId);
    let keyId: string;

    if (settings?.encryptionKeyId) {
      keyId = settings.encryptionKeyId;
    } else {
      const { keyId: newKeyId } = await this.keyManager.createKey(fromUserId, familyGroupId);
      keyId = newKeyId;

      // Save key ID to settings
      await this.consentManager.initializeSettings(fromUserId, familyGroupId, keyId);
    }

    // Encrypt content
    let encryptedContent: EncryptedContent;
    if (this.config.encryptionEnabled) {
      encryptedContent = await this.encryptContent(content, keyId);
    } else {
      // Store as plaintext (base64 encoded for consistency)
      encryptedContent = {
        ciphertext: Buffer.from(content).toString('base64'),
        iv: '',
        tag: '',
      };
    }

    // Calculate expiration
    let expiresAt: number | undefined;
    if (options.expiresAt) {
      expiresAt = options.expiresAt;
    } else if (this.config.defaultExpirationDays) {
      expiresAt = Date.now() + this.config.defaultExpirationDays * 24 * 60 * 60 * 1000;
    }

    // Create shared memory
    const memory = await this.memoryStore.createMemory({
      familyGroupId,
      originalMemoryId,
      originalUserId: fromUserId,
      sharedWith: options.sharedWith,
      contentCiphertext: encryptedContent.ciphertext,
      contentIv: encryptedContent.iv,
      contentTag: encryptedContent.tag,
      type: options.type,
      category: options.category,
      importance: options.importance ?? 0.5,
      expiresAt,
    });

    return this.decryptMemory(memory, keyId);
  }

  /**
   * Get a shared memory
   */
  async getMemory(
    id: string,
    requestingUserId: string
  ): Promise<SharedMemory | null> {
    const memory = await this.memoryStore.getMemory(id);
    if (!memory) return null;

    // Check access
    if (
      memory.originalUserId !== requestingUserId &&
      !memory.sharedWith.includes(requestingUserId)
    ) {
      return null;
    }

    // Get encryption key
    const settings = await this.settingsStore.getSettings(
      memory.originalUserId,
      memory.familyGroupId
    );

    if (!settings?.encryptionKeyId) {
      throw new Error('Encryption key not found');
    }

    return this.decryptMemory(memory, settings.encryptionKeyId);
  }

  /**
   * Get memories shared with a user
   */
  async getMemoriesSharedWithMe(
    userId: string,
    familyGroupId: string
  ): Promise<SharedMemory[]> {
    const memories = await this.memoryStore.getMemoriesSharedWithUser(userId, familyGroupId);
    return this.decryptMemories(memories, familyGroupId);
  }

  /**
   * Get memories shared by a user
   */
  async getMemoriesSharedByMe(
    userId: string,
    familyGroupId: string
  ): Promise<SharedMemory[]> {
    const memories = await this.memoryStore.getMemoriesByOriginalUser(userId, familyGroupId);
    return this.decryptMemories(memories, familyGroupId);
  }

  /**
   * Update who a memory is shared with
   */
  async updateSharing(
    id: string,
    requestingUserId: string,
    addUsers: string[],
    removeUsers: string[]
  ): Promise<SharedMemory | null> {
    const memory = await this.memoryStore.getMemory(id);
    if (!memory) return null;

    // Only owner can update sharing
    if (memory.originalUserId !== requestingUserId) {
      throw new Error('Only the memory owner can update sharing');
    }

    // Check consent for new users
    for (const userId of addUsers) {
      const canShare = await this.consentManager.canShare(
        requestingUserId,
        userId,
        memory.familyGroupId,
        memory.type,
        memory.category
      );

      if (!canShare.allowed) {
        throw new Error(`Cannot share with user ${userId}: ${canShare.reason}`);
      }
    }

    // Update sharing
    let updated = memory;
    for (const userId of addUsers) {
      updated = (await this.memoryStore.addSharedWith(id, userId)) ?? updated;
    }
    for (const userId of removeUsers) {
      updated = (await this.memoryStore.removeSharedWith(id, userId)) ?? updated;
    }

    const settings = await this.settingsStore.getSettings(
      memory.originalUserId,
      memory.familyGroupId
    );

    return this.decryptMemory(updated, settings?.encryptionKeyId || '');
  }

  /**
   * Delete a shared memory
   */
  async deleteMemory(id: string, requestingUserId: string): Promise<boolean> {
    const memory = await this.memoryStore.getMemory(id);
    if (!memory) return false;

    // Only owner can delete
    if (memory.originalUserId !== requestingUserId) {
      throw new Error('Only the memory owner can delete it');
    }

    return this.memoryStore.deleteMemory(id);
  }

  /**
   * Delete all memories shared by a user
   */
  async deleteAllMyMemories(userId: string): Promise<number> {
    return this.memoryStore.deleteByOriginalUser(userId);
  }

  // ============================================================================
  // Consent Delegation
  // ============================================================================

  /**
   * Initialize sharing settings for a user
   */
  async initializeSettings(
    userId: string,
    familyGroupId: string
  ): Promise<MemorySharingSettings> {
    const { keyId } = await this.keyManager.createKey(userId, familyGroupId);
    return this.consentManager.initializeSettings(userId, familyGroupId, keyId);
  }

  /**
   * Get user's sharing settings
   */
  async getSettings(userId: string, familyGroupId: string): Promise<MemorySharingSettings | null> {
    return this.consentManager.getSettings(userId, familyGroupId);
  }

  /**
   * Update sharing settings
   */
  async updateSettings(
    userId: string,
    familyGroupId: string,
    updates: Partial<Pick<MemorySharingSettings, 'autoShareCategories' | 'requireApproval' | 'shareWithChildren'>>
  ): Promise<MemorySharingSettings | null> {
    return this.consentManager.updateSettings(userId, familyGroupId, updates);
  }

  /**
   * Grant consent to share memories
   */
  async grantConsent(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string,
    scope?: 'all' | 'category' | 'individual',
    categories?: string[]
  ): Promise<MemoryShareConsent> {
    return this.consentManager.grantConsent(fromUserId, toUserId, familyGroupId, scope, categories);
  }

  /**
   * Revoke consent to share memories
   */
  async revokeConsent(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string
  ): Promise<boolean> {
    return this.consentManager.revokeConsent(fromUserId, toUserId, familyGroupId);
  }

  /**
   * Check if sharing is allowed
   */
  async canShare(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string,
    type?: SharedMemoryType,
    category?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    return this.consentManager.canShare(fromUserId, toUserId, familyGroupId, type, category);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up expired memories
   */
  async cleanupExpired(): Promise<{ memories: number; consents: number }> {
    const memories = await this.memoryStore.deleteExpired();
    const consents = await this.consentManager.cleanupExpiredConsents();
    return { memories, consents };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async encryptContent(content: string, keyId: string): Promise<EncryptedContent> {
    const key = await this.keyManager.getKey(keyId);
    if (!key) {
      throw new Error('Encryption key not found');
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    let ciphertext = cipher.update(content, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  private async decryptContent(encrypted: EncryptedContent, keyId: string): Promise<string> {
    if (!encrypted.iv || !encrypted.tag) {
      // Not encrypted, just decode base64
      return Buffer.from(encrypted.ciphertext, 'base64').toString('utf8');
    }

    const key = await this.keyManager.getKey(keyId);
    if (!key) {
      throw new Error('Encryption key not found');
    }

    const iv = Buffer.from(encrypted.iv, 'base64');
    const tag = Buffer.from(encrypted.tag, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let content = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    content += decipher.final('utf8');

    return content;
  }

  private async decryptMemory(
    memory: SharedMemoryWithEncryption,
    keyId: string
  ): Promise<SharedMemory> {
    const content = await this.decryptContent(
      {
        ciphertext: memory.contentCiphertext,
        iv: memory.contentIv,
        tag: memory.contentTag,
      },
      keyId
    );

    return {
      id: memory.id,
      familyGroupId: memory.familyGroupId,
      originalMemoryId: memory.originalMemoryId,
      originalUserId: memory.originalUserId,
      sharedWith: memory.sharedWith,
      content,
      type: memory.type,
      category: memory.category,
      importance: memory.importance,
      expiresAt: memory.expiresAt,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    };
  }

  private async decryptMemories(
    memories: SharedMemoryWithEncryption[],
    familyGroupId: string
  ): Promise<SharedMemory[]> {
    const decrypted: SharedMemory[] = [];

    for (const memory of memories) {
      try {
        const settings = await this.settingsStore.getSettings(
          memory.originalUserId,
          familyGroupId
        );

        if (settings?.encryptionKeyId) {
          decrypted.push(await this.decryptMemory(memory, settings.encryptionKeyId));
        }
      } catch {
        // Skip memories that can't be decrypted
      }
    }

    return decrypted;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ShareMemoryOptions {
  sharedWith: string[];
  type: SharedMemoryType;
  category?: string;
  importance?: number;
  expiresAt?: number;
}

// ============================================================================
// Exports
// ============================================================================

export {
  ConsentManager,
  type ConsentManagerConfig,
  type CanShareResult,
  createConsentManager,
} from './consent-manager.js';

export function createSharedMemoryService(
  memoryStore: SharedMemoryStore,
  settingsStore: MemorySharingSettingsStore,
  consentStore: MemoryConsentStore,
  familyGroupStore: FamilyGroupStore,
  keyManager?: KeyManager,
  config?: Partial<SharedMemoryServiceConfig>
): SharedMemoryService {
  return new SharedMemoryService(
    memoryStore,
    settingsStore,
    consentStore,
    familyGroupStore,
    keyManager,
    config
  );
}
