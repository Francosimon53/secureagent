/**
 * Skill Marketplace - Types
 *
 * Type definitions for the public skill marketplace
 */

/**
 * Skill categories
 */
export const SKILL_CATEGORIES = [
  'productivity',
  'developer',
  'communication',
  'data',
  'automation',
  'custom',
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * Skill status in the marketplace
 */
export type SkillStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';

/**
 * Skill parameter definition
 */
export interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

/**
 * Skill configuration (JSON format)
 */
export interface SkillConfig {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: SkillCategory;
  icon?: string;
  parameters: SkillParameter[];
  tags?: string[];
  dependencies?: string[];
  permissions?: SkillPermission[];
}

/**
 * Skill permissions
 */
export type SkillPermission =
  | 'network'
  | 'filesystem'
  | 'shell'
  | 'browser'
  | 'notifications'
  | 'clipboard';

/**
 * Published skill in marketplace
 */
export interface MarketplaceSkill {
  id: string;
  config: SkillConfig;
  code: string; // TypeScript function code
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  status: SkillStatus;
  featured: boolean;
  downloads: number;
  rating: number;
  ratingCount: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  versions: SkillVersion[];
}

/**
 * Skill version history
 */
export interface SkillVersion {
  version: string;
  changelog?: string;
  code: string;
  config: SkillConfig;
  publishedAt: number;
}

/**
 * User's installed skill
 */
export interface InstalledSkill {
  id: string;
  userId: string;
  skillId: string;
  installedVersion: string;
  installedAt: number;
  lastUsed?: number;
  enabled: boolean;
  settings?: Record<string, unknown>;
}

/**
 * Skill rating from user
 */
export interface SkillRating {
  id: string;
  skillId: string;
  userId: string;
  rating: number; // 1-5
  review?: string;
  createdAt: number;
  updatedAt?: number;
}

/**
 * Skill submission input
 */
export interface SkillSubmission {
  config: SkillConfig;
  code: string;
}

/**
 * Search/filter options for marketplace
 */
export interface MarketplaceSearchOptions {
  query?: string;
  category?: SkillCategory;
  tags?: string[];
  sortBy?: 'downloads' | 'rating' | 'recent' | 'name';
  sortOrder?: 'asc' | 'desc';
  featured?: boolean;
  authorId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Skill card for display (simplified version)
 */
export interface SkillCard {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon?: string;
  category: SkillCategory;
  authorName: string;
  authorAvatar?: string;
  downloads: number;
  rating: number;
  ratingCount: number;
  featured: boolean;
  version: string;
  tags?: string[];
}

/**
 * Trending skill calculation
 */
export interface TrendingMetrics {
  skillId: string;
  recentInstalls: number;
  recentRatings: number;
  trendScore: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

/**
 * Marketplace statistics
 */
export interface MarketplaceStats {
  totalSkills: number;
  totalDownloads: number;
  totalAuthors: number;
  categoryCounts: Record<SkillCategory, number>;
  topSkills: SkillCard[];
  recentSkills: SkillCard[];
}
