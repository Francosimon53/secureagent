/**
 * Skill Marketplace - Store
 *
 * Database abstraction for marketplace data
 */

import type {
  MarketplaceSkill,
  InstalledSkill,
  SkillRating,
  MarketplaceSearchOptions,
  PaginatedResponse,
  SkillCard,
  TrendingMetrics,
  MarketplaceStats,
  SkillCategory,
  SKILL_CATEGORIES,
} from './types.js';

/**
 * Marketplace store interface
 */
export interface MarketplaceStore {
  // Skills
  getSkill(id: string): Promise<MarketplaceSkill | null>;
  getSkillByName(name: string): Promise<MarketplaceSkill | null>;
  searchSkills(options: MarketplaceSearchOptions): Promise<PaginatedResponse<SkillCard>>;
  createSkill(skill: Omit<MarketplaceSkill, 'id'>): Promise<MarketplaceSkill>;
  updateSkill(id: string, updates: Partial<MarketplaceSkill>): Promise<MarketplaceSkill | null>;
  deleteSkill(id: string): Promise<boolean>;
  getFeaturedSkills(limit?: number): Promise<SkillCard[]>;
  getTrendingSkills(limit?: number): Promise<SkillCard[]>;
  getSkillsByAuthor(authorId: string): Promise<SkillCard[]>;

  // Installs
  getInstall(userId: string, skillId: string): Promise<InstalledSkill | null>;
  getUserInstalls(userId: string): Promise<InstalledSkill[]>;
  createInstall(install: Omit<InstalledSkill, 'id'>): Promise<InstalledSkill>;
  updateInstall(id: string, updates: Partial<InstalledSkill>): Promise<InstalledSkill | null>;
  deleteInstall(id: string): Promise<boolean>;
  getInstallCount(skillId: string): Promise<number>;
  getRecentInstallCount(skillId: string, sinceTimestamp: number): Promise<number>;

  // Ratings
  getRating(userId: string, skillId: string): Promise<SkillRating | null>;
  getSkillRatings(skillId: string, limit?: number): Promise<SkillRating[]>;
  createRating(rating: Omit<SkillRating, 'id'>): Promise<SkillRating>;
  updateRating(id: string, updates: Partial<SkillRating>): Promise<SkillRating | null>;
  deleteRating(id: string): Promise<boolean>;
  getAverageRating(skillId: string): Promise<{ rating: number; count: number }>;

  // Stats
  getStats(): Promise<MarketplaceStats>;
  getTrendingMetrics(limit?: number): Promise<TrendingMetrics[]>;
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `skill_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Convert MarketplaceSkill to SkillCard
 */
function toSkillCard(skill: MarketplaceSkill): SkillCard {
  return {
    id: skill.id,
    name: skill.config.name,
    displayName: skill.config.displayName,
    description: skill.config.description,
    icon: skill.config.icon,
    category: skill.config.category,
    authorName: skill.authorName,
    authorAvatar: skill.authorAvatar,
    downloads: skill.downloads,
    rating: skill.rating,
    ratingCount: skill.ratingCount,
    featured: skill.featured,
    version: skill.config.version,
    tags: skill.config.tags,
  };
}

/**
 * In-memory marketplace store implementation
 */
export class InMemoryMarketplaceStore implements MarketplaceStore {
  private skills: Map<string, MarketplaceSkill> = new Map();
  private installs: Map<string, InstalledSkill> = new Map();
  private ratings: Map<string, SkillRating> = new Map();

  // Skills
  async getSkill(id: string): Promise<MarketplaceSkill | null> {
    return this.skills.get(id) || null;
  }

  async getSkillByName(name: string): Promise<MarketplaceSkill | null> {
    for (const skill of this.skills.values()) {
      if (skill.config.name === name) {
        return skill;
      }
    }
    return null;
  }

  async searchSkills(options: MarketplaceSearchOptions): Promise<PaginatedResponse<SkillCard>> {
    let results = Array.from(this.skills.values()).filter(
      (skill) => skill.status === 'published',
    );

    // Filter by query
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        (skill) =>
          skill.config.name.toLowerCase().includes(query) ||
          skill.config.displayName.toLowerCase().includes(query) ||
          skill.config.description.toLowerCase().includes(query) ||
          skill.config.tags?.some((tag) => tag.toLowerCase().includes(query)),
      );
    }

    // Filter by category
    if (options.category) {
      results = results.filter((skill) => skill.config.category === options.category);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((skill) =>
        options.tags!.some((tag) => skill.config.tags?.includes(tag)),
      );
    }

    // Filter by featured
    if (options.featured !== undefined) {
      results = results.filter((skill) => skill.featured === options.featured);
    }

    // Filter by author
    if (options.authorId) {
      results = results.filter((skill) => skill.authorId === options.authorId);
    }

    // Sort
    const sortBy = options.sortBy || 'downloads';
    const sortOrder = options.sortOrder || 'desc';
    results.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'downloads':
          comparison = a.downloads - b.downloads;
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'recent':
          comparison = (a.publishedAt || 0) - (b.publishedAt || 0);
          break;
        case 'name':
          comparison = a.config.displayName.localeCompare(b.config.displayName);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const total = results.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = results.slice(start, start + pageSize).map(toSkillCard);

    return { items, total, page, pageSize, totalPages };
  }

  async createSkill(skill: Omit<MarketplaceSkill, 'id'>): Promise<MarketplaceSkill> {
    const id = generateId();
    const newSkill: MarketplaceSkill = { ...skill, id };
    this.skills.set(id, newSkill);
    return newSkill;
  }

  async updateSkill(
    id: string,
    updates: Partial<MarketplaceSkill>,
  ): Promise<MarketplaceSkill | null> {
    const skill = this.skills.get(id);
    if (!skill) return null;
    const updated = { ...skill, ...updates, id };
    this.skills.set(id, updated);
    return updated;
  }

  async deleteSkill(id: string): Promise<boolean> {
    return this.skills.delete(id);
  }

  async getFeaturedSkills(limit = 10): Promise<SkillCard[]> {
    return Array.from(this.skills.values())
      .filter((skill) => skill.status === 'published' && skill.featured)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit)
      .map(toSkillCard);
  }

  async getTrendingSkills(limit = 10): Promise<SkillCard[]> {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const metrics = await this.getTrendingMetrics(limit);
    const skillIds = new Set(metrics.map((m) => m.skillId));

    return Array.from(this.skills.values())
      .filter((skill) => skill.status === 'published' && skillIds.has(skill.id))
      .sort((a, b) => {
        const aMetric = metrics.find((m) => m.skillId === a.id);
        const bMetric = metrics.find((m) => m.skillId === b.id);
        return (bMetric?.trendScore || 0) - (aMetric?.trendScore || 0);
      })
      .slice(0, limit)
      .map(toSkillCard);
  }

  async getSkillsByAuthor(authorId: string): Promise<SkillCard[]> {
    return Array.from(this.skills.values())
      .filter((skill) => skill.authorId === authorId)
      .map(toSkillCard);
  }

  // Installs
  async getInstall(userId: string, skillId: string): Promise<InstalledSkill | null> {
    for (const install of this.installs.values()) {
      if (install.userId === userId && install.skillId === skillId) {
        return install;
      }
    }
    return null;
  }

  async getUserInstalls(userId: string): Promise<InstalledSkill[]> {
    return Array.from(this.installs.values()).filter((install) => install.userId === userId);
  }

  async createInstall(install: Omit<InstalledSkill, 'id'>): Promise<InstalledSkill> {
    const id = `install_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newInstall: InstalledSkill = { ...install, id };
    this.installs.set(id, newInstall);

    // Update download count
    const skill = this.skills.get(install.skillId);
    if (skill) {
      skill.downloads += 1;
      this.skills.set(skill.id, skill);
    }

    return newInstall;
  }

  async updateInstall(
    id: string,
    updates: Partial<InstalledSkill>,
  ): Promise<InstalledSkill | null> {
    const install = this.installs.get(id);
    if (!install) return null;
    const updated = { ...install, ...updates, id };
    this.installs.set(id, updated);
    return updated;
  }

  async deleteInstall(id: string): Promise<boolean> {
    return this.installs.delete(id);
  }

  async getInstallCount(skillId: string): Promise<number> {
    return Array.from(this.installs.values()).filter(
      (install) => install.skillId === skillId,
    ).length;
  }

  async getRecentInstallCount(skillId: string, sinceTimestamp: number): Promise<number> {
    return Array.from(this.installs.values()).filter(
      (install) => install.skillId === skillId && install.installedAt >= sinceTimestamp,
    ).length;
  }

  // Ratings
  async getRating(userId: string, skillId: string): Promise<SkillRating | null> {
    for (const rating of this.ratings.values()) {
      if (rating.userId === userId && rating.skillId === skillId) {
        return rating;
      }
    }
    return null;
  }

  async getSkillRatings(skillId: string, limit = 50): Promise<SkillRating[]> {
    return Array.from(this.ratings.values())
      .filter((rating) => rating.skillId === skillId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async createRating(rating: Omit<SkillRating, 'id'>): Promise<SkillRating> {
    const id = `rating_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newRating: SkillRating = { ...rating, id };
    this.ratings.set(id, newRating);

    // Update skill rating
    await this.updateSkillRating(rating.skillId);

    return newRating;
  }

  async updateRating(id: string, updates: Partial<SkillRating>): Promise<SkillRating | null> {
    const rating = this.ratings.get(id);
    if (!rating) return null;
    const updated = { ...rating, ...updates, id, updatedAt: Date.now() };
    this.ratings.set(id, updated);

    // Update skill rating
    await this.updateSkillRating(rating.skillId);

    return updated;
  }

  async deleteRating(id: string): Promise<boolean> {
    const rating = this.ratings.get(id);
    if (!rating) return false;
    const deleted = this.ratings.delete(id);

    // Update skill rating
    await this.updateSkillRating(rating.skillId);

    return deleted;
  }

  async getAverageRating(skillId: string): Promise<{ rating: number; count: number }> {
    const ratings = Array.from(this.ratings.values()).filter(
      (rating) => rating.skillId === skillId,
    );
    if (ratings.length === 0) {
      return { rating: 0, count: 0 };
    }
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    return { rating: sum / ratings.length, count: ratings.length };
  }

  private async updateSkillRating(skillId: string): Promise<void> {
    const skill = this.skills.get(skillId);
    if (!skill) return;

    const { rating, count } = await this.getAverageRating(skillId);
    skill.rating = rating;
    skill.ratingCount = count;
    this.skills.set(skillId, skill);
  }

  // Stats
  async getStats(): Promise<MarketplaceStats> {
    const publishedSkills = Array.from(this.skills.values()).filter(
      (skill) => skill.status === 'published',
    );

    const categoryCounts = {} as Record<SkillCategory, number>;
    for (const cat of ['productivity', 'developer', 'communication', 'data', 'automation', 'custom'] as SkillCategory[]) {
      categoryCounts[cat] = publishedSkills.filter((s) => s.config.category === cat).length;
    }

    const totalDownloads = publishedSkills.reduce((acc, s) => acc + s.downloads, 0);
    const uniqueAuthors = new Set(publishedSkills.map((s) => s.authorId));

    const topSkills = publishedSkills
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 5)
      .map(toSkillCard);

    const recentSkills = publishedSkills
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, 5)
      .map(toSkillCard);

    return {
      totalSkills: publishedSkills.length,
      totalDownloads,
      totalAuthors: uniqueAuthors.size,
      categoryCounts,
      topSkills,
      recentSkills,
    };
  }

  async getTrendingMetrics(limit = 10): Promise<TrendingMetrics[]> {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const publishedSkills = Array.from(this.skills.values()).filter(
      (skill) => skill.status === 'published',
    );

    const metrics: TrendingMetrics[] = [];

    for (const skill of publishedSkills) {
      const recentInstalls = await this.getRecentInstallCount(skill.id, oneWeekAgo);
      const recentRatings = Array.from(this.ratings.values()).filter(
        (r) => r.skillId === skill.id && r.createdAt >= oneWeekAgo,
      ).length;

      // Trend score: weighted combination of recent activity
      const trendScore = recentInstalls * 2 + recentRatings * 3 + skill.rating * 10;

      metrics.push({
        skillId: skill.id,
        recentInstalls,
        recentRatings,
        trendScore,
      });
    }

    return metrics.sort((a, b) => b.trendScore - a.trendScore).slice(0, limit);
  }
}

/**
 * Create marketplace store
 */
export function createMarketplaceStore(): MarketplaceStore {
  return new InMemoryMarketplaceStore();
}

// Singleton instance
let storeInstance: MarketplaceStore | null = null;

export function getMarketplaceStore(): MarketplaceStore {
  if (!storeInstance) {
    storeInstance = createMarketplaceStore();
  }
  return storeInstance;
}
