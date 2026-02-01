/**
 * Skill Marketplace - Service
 *
 * Core marketplace service for managing skills
 */

import type {
  MarketplaceSkill,
  InstalledSkill,
  SkillRating,
  SkillSubmission,
  MarketplaceSearchOptions,
  PaginatedResponse,
  SkillCard,
  ValidationResult,
  MarketplaceStats,
  SkillVersion,
} from './types.js';
import type { MarketplaceStore } from './store.js';
import { getMarketplaceStore } from './store.js';
import { validateSkillSubmission, validateVersionBump } from './validation.js';

/**
 * Marketplace service error
 */
export class MarketplaceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = 'MarketplaceError';
  }
}

/**
 * Marketplace service configuration
 */
export interface MarketplaceServiceConfig {
  store?: MarketplaceStore;
  requireReview?: boolean;
  maxSkillsPerUser?: number;
}

/**
 * Marketplace Service
 */
export class MarketplaceService {
  private store: MarketplaceStore;
  private requireReview: boolean;
  private maxSkillsPerUser: number;

  constructor(config: MarketplaceServiceConfig = {}) {
    this.store = config.store || getMarketplaceStore();
    this.requireReview = config.requireReview ?? false;
    this.maxSkillsPerUser = config.maxSkillsPerUser ?? 50;
  }

  /**
   * Search marketplace skills
   */
  async searchSkills(options: MarketplaceSearchOptions): Promise<PaginatedResponse<SkillCard>> {
    return this.store.searchSkills(options);
  }

  /**
   * Get skill by ID
   */
  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    return this.store.getSkill(id);
  }

  /**
   * Get skill by name
   */
  async getSkillByName(name: string): Promise<MarketplaceSkill | null> {
    return this.store.getSkillByName(name);
  }

  /**
   * Get featured skills
   */
  async getFeaturedSkills(limit?: number): Promise<SkillCard[]> {
    return this.store.getFeaturedSkills(limit);
  }

  /**
   * Get trending skills
   */
  async getTrendingSkills(limit?: number): Promise<SkillCard[]> {
    return this.store.getTrendingSkills(limit);
  }

  /**
   * Submit new skill
   */
  async submitSkill(
    submission: SkillSubmission,
    authorId: string,
    authorName: string,
    authorAvatar?: string,
  ): Promise<{ skill: MarketplaceSkill; validation: ValidationResult }> {
    // Validate submission
    const validation = validateSkillSubmission(submission);
    if (!validation.valid) {
      throw new MarketplaceError(
        `Skill validation failed: ${validation.errors[0]?.message}`,
        'VALIDATION_FAILED',
      );
    }

    // Check if skill name already exists
    const existing = await this.store.getSkillByName(submission.config.name);
    if (existing) {
      throw new MarketplaceError(
        `Skill with name "${submission.config.name}" already exists`,
        'SKILL_EXISTS',
        409,
      );
    }

    // Check user's skill count
    const userSkills = await this.store.getSkillsByAuthor(authorId);
    if (userSkills.length >= this.maxSkillsPerUser) {
      throw new MarketplaceError(
        `Maximum skills per user (${this.maxSkillsPerUser}) reached`,
        'MAX_SKILLS_REACHED',
        403,
      );
    }

    // Create skill
    const now = Date.now();
    const skill = await this.store.createSkill({
      config: submission.config,
      code: submission.code,
      authorId,
      authorName,
      authorAvatar,
      status: this.requireReview ? 'pending_review' : 'published',
      featured: false,
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: this.requireReview ? undefined : now,
      versions: [
        {
          version: submission.config.version,
          code: submission.code,
          config: submission.config,
          publishedAt: now,
        },
      ],
    });

    return { skill, validation };
  }

  /**
   * Update existing skill (new version)
   */
  async updateSkill(
    skillId: string,
    submission: SkillSubmission,
    authorId: string,
  ): Promise<{ skill: MarketplaceSkill; validation: ValidationResult }> {
    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    if (skill.authorId !== authorId) {
      throw new MarketplaceError(
        'You can only update your own skills',
        'UNAUTHORIZED',
        403,
      );
    }

    // Validate submission
    const validation = validateSkillSubmission(submission);
    if (!validation.valid) {
      throw new MarketplaceError(
        `Skill validation failed: ${validation.errors[0]?.message}`,
        'VALIDATION_FAILED',
      );
    }

    // Validate version bump
    const versionCheck = validateVersionBump(
      skill.config.version,
      submission.config.version,
    );
    if (!versionCheck.valid) {
      throw new MarketplaceError(versionCheck.error!, 'INVALID_VERSION');
    }

    // Add new version
    const now = Date.now();
    const newVersion: SkillVersion = {
      version: submission.config.version,
      code: submission.code,
      config: submission.config,
      publishedAt: now,
    };

    const updated = await this.store.updateSkill(skillId, {
      config: submission.config,
      code: submission.code,
      updatedAt: now,
      versions: [...skill.versions, newVersion],
    });

    return { skill: updated!, validation };
  }

  /**
   * Archive a skill
   */
  async archiveSkill(skillId: string, authorId: string): Promise<void> {
    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    if (skill.authorId !== authorId) {
      throw new MarketplaceError(
        'You can only archive your own skills',
        'UNAUTHORIZED',
        403,
      );
    }

    await this.store.updateSkill(skillId, {
      status: 'archived',
      updatedAt: Date.now(),
    });
  }

  /**
   * Install skill for user
   */
  async installSkill(
    skillId: string,
    userId: string,
  ): Promise<InstalledSkill> {
    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    if (skill.status !== 'published') {
      throw new MarketplaceError(
        'Skill is not available for installation',
        'NOT_AVAILABLE',
      );
    }

    // Check if already installed
    const existing = await this.store.getInstall(userId, skillId);
    if (existing) {
      throw new MarketplaceError(
        'Skill is already installed',
        'ALREADY_INSTALLED',
        409,
      );
    }

    return this.store.createInstall({
      userId,
      skillId,
      installedVersion: skill.config.version,
      installedAt: Date.now(),
      enabled: true,
    });
  }

  /**
   * Uninstall skill for user
   */
  async uninstallSkill(skillId: string, userId: string): Promise<void> {
    const install = await this.store.getInstall(userId, skillId);
    if (!install) {
      throw new MarketplaceError('Skill is not installed', 'NOT_INSTALLED', 404);
    }

    await this.store.deleteInstall(install.id);
  }

  /**
   * Get user's installed skills
   */
  async getUserInstalls(userId: string): Promise<InstalledSkill[]> {
    return this.store.getUserInstalls(userId);
  }

  /**
   * Check if user has skill installed
   */
  async isInstalled(skillId: string, userId: string): Promise<boolean> {
    const install = await this.store.getInstall(userId, skillId);
    return install !== null;
  }

  /**
   * Rate a skill
   */
  async rateSkill(
    skillId: string,
    userId: string,
    rating: number,
    review?: string,
  ): Promise<SkillRating> {
    if (rating < 1 || rating > 5) {
      throw new MarketplaceError('Rating must be between 1 and 5', 'INVALID_RATING');
    }

    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    // Check if user has installed the skill
    const install = await this.store.getInstall(userId, skillId);
    if (!install) {
      throw new MarketplaceError(
        'You must install a skill before rating it',
        'NOT_INSTALLED',
      );
    }

    // Check for existing rating
    const existing = await this.store.getRating(userId, skillId);
    if (existing) {
      // Update existing rating
      return (await this.store.updateRating(existing.id, { rating, review }))!;
    }

    // Create new rating
    return this.store.createRating({
      skillId,
      userId,
      rating,
      review,
      createdAt: Date.now(),
    });
  }

  /**
   * Get skill ratings
   */
  async getSkillRatings(skillId: string, limit?: number): Promise<SkillRating[]> {
    return this.store.getSkillRatings(skillId, limit);
  }

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<MarketplaceStats> {
    return this.store.getStats();
  }

  /**
   * Get skills by author
   */
  async getSkillsByAuthor(authorId: string): Promise<SkillCard[]> {
    return this.store.getSkillsByAuthor(authorId);
  }

  /**
   * Feature/unfeature a skill (admin only)
   */
  async setFeatured(skillId: string, featured: boolean): Promise<void> {
    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    await this.store.updateSkill(skillId, { featured });
  }

  /**
   * Approve/reject skill (admin only)
   */
  async reviewSkill(
    skillId: string,
    approved: boolean,
    reason?: string,
  ): Promise<void> {
    const skill = await this.store.getSkill(skillId);
    if (!skill) {
      throw new MarketplaceError('Skill not found', 'NOT_FOUND', 404);
    }

    if (skill.status !== 'pending_review') {
      throw new MarketplaceError('Skill is not pending review', 'INVALID_STATUS');
    }

    const now = Date.now();
    await this.store.updateSkill(skillId, {
      status: approved ? 'published' : 'rejected',
      publishedAt: approved ? now : undefined,
      updatedAt: now,
    });
  }
}

// Singleton instance
let serviceInstance: MarketplaceService | null = null;

export function getMarketplaceService(
  config?: MarketplaceServiceConfig,
): MarketplaceService {
  if (!serviceInstance) {
    serviceInstance = new MarketplaceService(config);
  }
  return serviceInstance;
}

export function createMarketplaceService(
  config?: MarketplaceServiceConfig,
): MarketplaceService {
  return new MarketplaceService(config);
}
