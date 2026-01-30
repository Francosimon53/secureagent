/**
 * Content Creator Suite - Media Providers
 *
 * Export all media platform providers.
 */

export {
  YouTubeProvider,
  createYouTubeProvider,
  type YouTubeVideoInfo,
  type YouTubeTranscriptSegment,
  type YouTubeChapter,
} from './youtube.js';

export {
  PodcastProvider,
  createPodcastProvider,
  type PodcastFeed,
  type PodcastEpisode,
} from './podcast.js';

import type { MediaConfig } from '../../config.js';
import { createYouTubeProvider, type YouTubeProvider } from './youtube.js';
import { createPodcastProvider, type PodcastProvider } from './podcast.js';

// =============================================================================
// Types
// =============================================================================

export interface MediaProviderRegistry {
  youtube?: YouTubeProvider;
  podcast?: PodcastProvider;
}

// =============================================================================
// Provider Factory
// =============================================================================

/**
 * Create media providers based on configuration
 */
export function createMediaProviders(config?: MediaConfig): MediaProviderRegistry {
  const providers: MediaProviderRegistry = {};

  if (config?.youtube?.enabled !== false) {
    providers.youtube = createYouTubeProvider(config?.youtube);
  }

  if (config?.podcast?.enabled !== false) {
    providers.podcast = createPodcastProvider(config?.podcast);
  }

  return providers;
}

/**
 * Initialize all media providers
 */
export async function initializeAllMediaProviders(registry: MediaProviderRegistry): Promise<void> {
  const initPromises: Promise<void>[] = [];

  if (registry.youtube) {
    initPromises.push(
      registry.youtube.initialize().catch(err => {
        console.warn('Failed to initialize YouTube provider:', err.message);
      })
    );
  }

  if (registry.podcast) {
    initPromises.push(
      registry.podcast.initialize().catch(err => {
        console.warn('Failed to initialize Podcast provider:', err.message);
      })
    );
  }

  await Promise.all(initPromises);
}

/**
 * Shutdown all media providers
 */
export async function shutdownAllMediaProviders(registry: MediaProviderRegistry): Promise<void> {
  const shutdownPromises: Promise<void>[] = [];

  if (registry.youtube) {
    shutdownPromises.push(registry.youtube.shutdown());
  }

  if (registry.podcast) {
    shutdownPromises.push(registry.podcast.shutdown());
  }

  await Promise.all(shutdownPromises);
}
