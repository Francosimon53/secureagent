/**
 * Consent Manager
 *
 * Manages permission and consent for memory sharing between family members.
 */

import type {
  ConsentScope,
  MemoryShareConsent,
  MemorySharingSettings,
  SharedMemoryType,
} from '../types.js';
import type {
  MemoryConsentStore,
  MemorySharingSettingsStore,
} from '../stores/shared-memory-store.js';
import type { FamilyGroupStore } from '../stores/family-group-store.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ConsentManagerConfig {
  requireExplicitConsent: boolean;
  defaultConsentScope: ConsentScope;
  consentExpirationDays?: number;
  allowChildConsent: boolean;
}

// ============================================================================
// Consent Manager
// ============================================================================

export class ConsentManager {
  private readonly settingsStore: MemorySharingSettingsStore;
  private readonly consentStore: MemoryConsentStore;
  private readonly familyGroupStore: FamilyGroupStore;
  private readonly config: ConsentManagerConfig;

  constructor(
    settingsStore: MemorySharingSettingsStore,
    consentStore: MemoryConsentStore,
    familyGroupStore: FamilyGroupStore,
    config?: Partial<ConsentManagerConfig>
  ) {
    this.settingsStore = settingsStore;
    this.consentStore = consentStore;
    this.familyGroupStore = familyGroupStore;
    this.config = {
      requireExplicitConsent: config?.requireExplicitConsent ?? true,
      defaultConsentScope: config?.defaultConsentScope || 'category',
      consentExpirationDays: config?.consentExpirationDays,
      allowChildConsent: config?.allowChildConsent ?? false,
    };
  }

  // ============================================================================
  // Settings Management
  // ============================================================================

  /**
   * Initialize sharing settings for a user in a family group
   */
  async initializeSettings(
    userId: string,
    familyGroupId: string,
    encryptionKeyId: string,
    options?: Partial<MemorySharingSettings>
  ): Promise<MemorySharingSettings> {
    const existing = await this.settingsStore.getSettings(userId, familyGroupId);
    if (existing) return existing;

    return this.settingsStore.createSettings({
      userId,
      familyGroupId,
      encryptionKeyId,
      autoShareCategories: options?.autoShareCategories,
      requireApproval: options?.requireApproval ?? this.config.requireExplicitConsent,
      shareWithChildren: options?.shareWithChildren ?? false,
    });
  }

  /**
   * Get user's sharing settings
   */
  async getSettings(userId: string, familyGroupId: string): Promise<MemorySharingSettings | null> {
    return this.settingsStore.getSettings(userId, familyGroupId);
  }

  /**
   * Update sharing settings
   */
  async updateSettings(
    userId: string,
    familyGroupId: string,
    updates: Partial<Pick<MemorySharingSettings, 'autoShareCategories' | 'requireApproval' | 'shareWithChildren'>>
  ): Promise<MemorySharingSettings | null> {
    return this.settingsStore.updateSettings(userId, familyGroupId, updates);
  }

  /**
   * Set auto-share categories
   */
  async setAutoShareCategories(
    userId: string,
    familyGroupId: string,
    categories: string[]
  ): Promise<MemorySharingSettings | null> {
    return this.settingsStore.updateSettings(userId, familyGroupId, {
      autoShareCategories: categories,
    });
  }

  // ============================================================================
  // Consent Management
  // ============================================================================

  /**
   * Grant consent for memory sharing
   */
  async grantConsent(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string,
    scope?: ConsentScope,
    categories?: string[]
  ): Promise<MemoryShareConsent> {
    // Verify both users are in the family group
    await this.verifyFamilyMembership(fromUserId, familyGroupId);
    await this.verifyFamilyMembership(toUserId, familyGroupId);

    // Check if recipient is a child and if that's allowed
    if (!this.config.allowChildConsent) {
      const recipientRole = await this.familyGroupStore.getMemberRole(familyGroupId, toUserId);
      if (recipientRole === 'child') {
        throw new Error('Cannot grant consent to share with child members');
      }
    }

    const consent: Omit<MemoryShareConsent, 'grantedAt'> = {
      fromUserId,
      toUserId,
      familyGroupId,
      scope: scope || this.config.defaultConsentScope,
      categories: scope === 'category' ? categories : undefined,
      expiresAt: this.config.consentExpirationDays
        ? Date.now() + this.config.consentExpirationDays * 24 * 60 * 60 * 1000
        : undefined,
    };

    return this.consentStore.grantConsent(consent);
  }

  /**
   * Revoke consent for memory sharing
   */
  async revokeConsent(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string
  ): Promise<boolean> {
    return this.consentStore.revokeConsent(fromUserId, toUserId, familyGroupId);
  }

  /**
   * Check if sharing is allowed
   */
  async canShare(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string,
    memoryType?: SharedMemoryType,
    category?: string
  ): Promise<CanShareResult> {
    // Check if both users are in the family group
    try {
      await this.verifyFamilyMembership(fromUserId, familyGroupId);
      await this.verifyFamilyMembership(toUserId, familyGroupId);
    } catch {
      return { allowed: false, reason: 'Users must be in the same family group' };
    }

    // Check sender's settings
    const senderSettings = await this.settingsStore.getSettings(fromUserId, familyGroupId);

    // Check if recipient is a child
    const recipientRole = await this.familyGroupStore.getMemberRole(familyGroupId, toUserId);
    if (recipientRole === 'child') {
      if (!senderSettings?.shareWithChildren) {
        return { allowed: false, reason: 'Sharing with children is disabled' };
      }
    }

    // Check if auto-share is enabled for this category
    if (category && senderSettings?.autoShareCategories?.includes(category)) {
      return { allowed: true, autoShare: true };
    }

    // Check explicit consent
    if (this.config.requireExplicitConsent) {
      const hasConsent = await this.consentStore.hasConsent(
        fromUserId,
        toUserId,
        familyGroupId,
        category
      );

      if (!hasConsent) {
        return { allowed: false, reason: 'Explicit consent required' };
      }
    }

    return { allowed: true };
  }

  /**
   * List users who have granted consent to share with a user
   */
  async listConsentsToUser(toUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    return this.consentStore.listConsentsTo(toUserId, familyGroupId);
  }

  /**
   * List consents granted by a user
   */
  async listConsentsFromUser(fromUserId: string, familyGroupId: string): Promise<MemoryShareConsent[]> {
    return this.consentStore.listConsentsFrom(fromUserId, familyGroupId);
  }

  /**
   * Get specific consent
   */
  async getConsent(
    fromUserId: string,
    toUserId: string,
    familyGroupId: string
  ): Promise<MemoryShareConsent | null> {
    return this.consentStore.getConsent(fromUserId, toUserId, familyGroupId);
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Grant consent to all family members
   */
  async grantConsentToAll(
    fromUserId: string,
    familyGroupId: string,
    scope?: ConsentScope,
    categories?: string[]
  ): Promise<MemoryShareConsent[]> {
    const group = await this.familyGroupStore.getGroup(familyGroupId);
    if (!group) {
      throw new Error('Family group not found');
    }

    const consents: MemoryShareConsent[] = [];

    for (const member of group.members) {
      if (member.userId === fromUserId) continue;

      // Skip children if not allowed
      if (!this.config.allowChildConsent && member.role === 'child') continue;

      try {
        const consent = await this.grantConsent(
          fromUserId,
          member.userId,
          familyGroupId,
          scope,
          categories
        );
        consents.push(consent);
      } catch {
        // Skip if consent cannot be granted
      }
    }

    return consents;
  }

  /**
   * Revoke all consents granted by a user
   */
  async revokeAllConsents(fromUserId: string, familyGroupId: string): Promise<number> {
    const consents = await this.consentStore.listConsentsFrom(fromUserId, familyGroupId);
    let count = 0;

    for (const consent of consents) {
      if (await this.consentStore.revokeConsent(
        consent.fromUserId,
        consent.toUserId,
        consent.familyGroupId
      )) {
        count++;
      }
    }

    return count;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up expired consents
   */
  async cleanupExpiredConsents(): Promise<number> {
    return this.consentStore.deleteExpired();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async verifyFamilyMembership(userId: string, familyGroupId: string): Promise<void> {
    const role = await this.familyGroupStore.getMemberRole(familyGroupId, userId);
    if (!role) {
      throw new Error(`User ${userId} is not a member of family group ${familyGroupId}`);
    }
  }
}

// ============================================================================
// Types
// ============================================================================

export interface CanShareResult {
  allowed: boolean;
  reason?: string;
  autoShare?: boolean;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createConsentManager(
  settingsStore: MemorySharingSettingsStore,
  consentStore: MemoryConsentStore,
  familyGroupStore: FamilyGroupStore,
  config?: Partial<ConsentManagerConfig>
): ConsentManager {
  return new ConsentManager(settingsStore, consentStore, familyGroupStore, config);
}
