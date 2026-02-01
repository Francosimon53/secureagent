/**
 * Skill Marketplace Module
 *
 * Public skill marketplace for community-created skills
 */

// Types
export * from './types.js';

// Store
export {
  type MarketplaceStore,
  InMemoryMarketplaceStore,
  createMarketplaceStore,
  getMarketplaceStore,
} from './store.js';

// Validation
export {
  validateSkillSubmission,
  validateVersionBump,
  sanitizeSkillForDisplay,
} from './validation.js';

// Service
export {
  MarketplaceService,
  MarketplaceError,
  type MarketplaceServiceConfig,
  getMarketplaceService,
  createMarketplaceService,
} from './service.js';
