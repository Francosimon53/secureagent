/**
 * Content Creator Suite - Blog Providers
 *
 * Export all blog platform providers.
 */

export {
  WordPressProvider,
  createWordPressProvider,
  type WordPressPublishOptions,
} from './wordpress.js';

export {
  GhostProvider,
  createGhostProvider,
  type GhostPublishOptions,
} from './ghost.js';

export {
  BearBlogProvider,
  createBearBlogProvider,
  type BearBlogPublishOptions,
} from './bearblog.js';

import type { ContentPlatform, BlogPost, ContentProviderResult } from '../../types.js';
import type { BlogPublishingConfig } from '../../config.js';

import { createWordPressProvider, type WordPressProvider } from './wordpress.js';
import { createGhostProvider, type GhostProvider } from './ghost.js';
import { createBearBlogProvider, type BearBlogProvider } from './bearblog.js';

// =============================================================================
// Types
// =============================================================================

export type BlogProvider = WordPressProvider | GhostProvider | BearBlogProvider;

export interface BlogProviderRegistry {
  wordpress?: WordPressProvider;
  ghost?: GhostProvider;
  bearblog?: BearBlogProvider;
}

export interface UnifiedPublishResult {
  id: string;
  url: string;
  slug: string;
  platform: ContentPlatform;
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Create blog providers based on configuration
 */
export function createBlogProviders(config?: BlogPublishingConfig): BlogProviderRegistry {
  const providers: BlogProviderRegistry = {};

  if (config?.platforms?.wordpress?.enabled && config.platforms.wordpress.siteUrl) {
    providers.wordpress = createWordPressProvider(config.platforms.wordpress);
  }

  if (config?.platforms?.ghost?.enabled && config.platforms.ghost.siteUrl) {
    providers.ghost = createGhostProvider(config.platforms.ghost);
  }

  if (config?.platforms?.bearblog?.enabled && config.platforms.bearblog.siteUrl) {
    providers.bearblog = createBearBlogProvider(config.platforms.bearblog);
  }

  return providers;
}

/**
 * Get a blog provider by platform name
 */
export function getBlogProvider(
  registry: BlogProviderRegistry,
  platform: 'wordpress' | 'ghost' | 'bearblog'
): BlogProvider | undefined {
  return registry[platform];
}

/**
 * Get all initialized providers
 */
export function getInitializedProviders(registry: BlogProviderRegistry): BlogProvider[] {
  const providers: BlogProvider[] = [];

  if (registry.wordpress?.isInitialized()) providers.push(registry.wordpress);
  if (registry.ghost?.isInitialized()) providers.push(registry.ghost);
  if (registry.bearblog?.isInitialized()) providers.push(registry.bearblog);

  return providers;
}

/**
 * Initialize all providers in registry
 */
export async function initializeAllBlogProviders(registry: BlogProviderRegistry): Promise<void> {
  const initPromises: Promise<void>[] = [];

  if (registry.wordpress) {
    initPromises.push(
      registry.wordpress.initialize().catch(err => {
        console.warn('Failed to initialize WordPress provider:', err.message);
      })
    );
  }

  if (registry.ghost) {
    initPromises.push(
      registry.ghost.initialize().catch(err => {
        console.warn('Failed to initialize Ghost provider:', err.message);
      })
    );
  }

  if (registry.bearblog) {
    initPromises.push(
      registry.bearblog.initialize().catch(err => {
        console.warn('Failed to initialize Bear Blog provider:', err.message);
      })
    );
  }

  await Promise.all(initPromises);
}

/**
 * Shutdown all providers in registry
 */
export async function shutdownAllBlogProviders(registry: BlogProviderRegistry): Promise<void> {
  const shutdownPromises: Promise<void>[] = [];

  if (registry.wordpress) {
    shutdownPromises.push(registry.wordpress.shutdown());
  }

  if (registry.ghost) {
    shutdownPromises.push(registry.ghost.shutdown());
  }

  if (registry.bearblog) {
    shutdownPromises.push(registry.bearblog.shutdown());
  }

  await Promise.all(shutdownPromises);
}

// =============================================================================
// Unified Publishing Interface
// =============================================================================

/**
 * Publish a post to multiple platforms
 */
export async function publishToMultiplePlatforms(
  registry: BlogProviderRegistry,
  post: BlogPost,
  platforms: ('wordpress' | 'ghost' | 'bearblog')[]
): Promise<Map<ContentPlatform, ContentProviderResult<UnifiedPublishResult>>> {
  const results = new Map<ContentPlatform, ContentProviderResult<UnifiedPublishResult>>();

  const publishPromises = platforms.map(async platform => {
    const provider = registry[platform];

    if (!provider || !provider.isInitialized()) {
      results.set(platform, {
        success: false,
        error: `Provider ${platform} not available or not initialized`,
        cached: false,
        fetchedAt: Date.now(),
      });
      return;
    }

    try {
      const result = await provider.publishPost(post);

      if (result.success) {
        // Handle different id field names across providers
        const getId = (data: { id?: number | string; uid?: string }): string => {
          if ('uid' in data && data.uid !== undefined) return data.uid;
          if ('id' in data && data.id !== undefined) return String(data.id);
          return '';
        };

        results.set(platform, {
          success: true,
          data: {
            id: getId(result.data),
            url: result.data.url,
            slug: result.data.slug,
            platform,
          },
          cached: false,
          fetchedAt: Date.now(),
        });
      } else {
        results.set(platform, {
          success: false,
          error: result.error,
          cached: false,
          fetchedAt: Date.now(),
        });
      }
    } catch (error) {
      results.set(platform, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        fetchedAt: Date.now(),
      });
    }
  });

  await Promise.all(publishPromises);

  return results;
}
