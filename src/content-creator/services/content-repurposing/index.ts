/**
 * Content Creator Suite - Content Repurposing Service
 *
 * Main entry point for content transformation and repurposing pipelines.
 */

export {
  PipelineOrchestratorService,
  createPipelineOrchestrator,
  type TransformationHandler,
  type PipelineOrchestratorConfig,
  type CreatePipelineOptions,
  type JobStatus,
} from './pipeline-orchestrator.js';

export {
  VideoToBlogService,
  createVideoToBlogTransformer,
  type VideoToBlogConfig,
  type VideoContent,
} from './video-to-blog.js';

export {
  BlogToSocialService,
  createBlogToSocialTransformer,
  type BlogToSocialConfig,
  type ExtractedBlogContent,
} from './blog-to-social.js';

export {
  BlogToNewsletterService,
  createBlogToNewsletterTransformer,
  type BlogToNewsletterConfig,
  type NewsletterContent,
} from './blog-to-newsletter.js';

import type {
  GeneratedContent,
  RepurposingPipeline,
  RepurposingJob,
  ContentType,
  ContentPlatform,
} from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { ContentRepurposingConfig } from '../../config.js';

import {
  createPipelineOrchestrator,
  type TransformationHandler,
  type JobStatus,
} from './pipeline-orchestrator.js';
import { createVideoToBlogTransformer } from './video-to-blog.js';
import { createBlogToSocialTransformer } from './blog-to-social.js';
import { createBlogToNewsletterTransformer } from './blog-to-newsletter.js';

// =============================================================================
// Content Repurposing Service (Facade)
// =============================================================================

export interface ContentRepurposingServiceConfig {
  contentRepurposing?: ContentRepurposingConfig;
}

export class ContentRepurposingService {
  public readonly orchestrator: ReturnType<typeof createPipelineOrchestrator>;
  private readonly videoToBlog: ReturnType<typeof createVideoToBlogTransformer>;
  private readonly blogToSocial: ReturnType<typeof createBlogToSocialTransformer>;
  private readonly blogToNewsletter: ReturnType<typeof createBlogToNewsletterTransformer>;

  constructor(
    contentStore: ContentStore,
    voiceProfileStore: VoiceProfileStore,
    contentGenerator: ContentGeneratorProvider,
    config?: ContentRepurposingServiceConfig
  ) {
    // Initialize orchestrator
    this.orchestrator = createPipelineOrchestrator(contentStore, voiceProfileStore, {
      maxConcurrentJobs: config?.contentRepurposing?.maxConcurrentJobs,
    });

    // Initialize transformers
    this.videoToBlog = createVideoToBlogTransformer(contentGenerator);
    this.blogToSocial = createBlogToSocialTransformer(contentGenerator);
    this.blogToNewsletter = createBlogToNewsletterTransformer(contentGenerator);

    // Register transformation handlers
    this.registerDefaultHandlers();
  }

  /**
   * Register default transformation handlers
   */
  private registerDefaultHandlers(): void {
    // Video to Blog
    this.orchestrator.registerTransformationHandler({
      sourceType: 'video_script',
      targetType: 'blog_post',
      transform: (source, config) => this.videoToBlog.transform(source, config),
    });

    // Blog to Tweet
    this.orchestrator.registerTransformationHandler({
      sourceType: 'blog_post',
      targetType: 'tweet',
      transform: (source, config) =>
        this.blogToSocial.transform(source, {
          ...config,
          targetPlatform: 'twitter',
          contentType: 'tweet',
        }),
    });

    // Blog to Thread
    this.orchestrator.registerTransformationHandler({
      sourceType: 'blog_post',
      targetType: 'thread',
      transform: (source, config) =>
        this.blogToSocial.transform(source, {
          ...config,
          targetPlatform: 'twitter',
          contentType: 'thread',
        }),
    });

    // Blog to LinkedIn
    this.orchestrator.registerTransformationHandler({
      sourceType: 'blog_post',
      targetType: 'linkedin_post',
      transform: (source, config) =>
        this.blogToSocial.transform(source, {
          ...config,
          targetPlatform: 'linkedin',
          contentType: 'linkedin_post',
        }),
    });

    // Blog to Newsletter
    this.orchestrator.registerTransformationHandler({
      sourceType: 'blog_post',
      targetType: 'newsletter',
      transform: (source, config) => this.blogToNewsletter.transform(source, config),
    });
  }

  // ===========================================================================
  // Quick Transformations
  // ===========================================================================

  /**
   * Transform video to blog post
   */
  async videoToBlogPost(
    source: GeneratedContent,
    options?: {
      targetWordCount?: number;
      blogStyle?: 'tutorial' | 'summary' | 'listicle' | 'narrative';
      includeTimestamps?: boolean;
      includeQuotes?: boolean;
      generateSEO?: boolean;
      voiceProfileId?: string;
    }
  ): Promise<GeneratedContent | null> {
    return this.videoToBlog.transform(source, {
      targetWordCount: options?.targetWordCount,
      blogStyle: options?.blogStyle,
      includeTimestamps: options?.includeTimestamps,
      includeQuotes: options?.includeQuotes,
      generateSEO: options?.generateSEO,
      voiceProfileId: options?.voiceProfileId,
    });
  }

  /**
   * Transform blog to tweet
   */
  async blogToTweet(
    source: GeneratedContent,
    options?: {
      includeHashtags?: boolean;
      maxHashtags?: number;
      includeEmojis?: boolean;
      includeCTA?: boolean;
      voiceProfileId?: string;
    }
  ): Promise<GeneratedContent | null> {
    return this.blogToSocial.transform(source, {
      targetPlatform: 'twitter',
      contentType: 'tweet',
      includeHashtags: options?.includeHashtags,
      maxHashtags: options?.maxHashtags,
      includeEmojis: options?.includeEmojis,
      includeCTA: options?.includeCTA,
      voiceProfileId: options?.voiceProfileId,
    });
  }

  /**
   * Transform blog to Twitter thread
   */
  async blogToThread(
    source: GeneratedContent,
    options?: {
      maxTweets?: number;
      includeHashtags?: boolean;
      includeEmojis?: boolean;
      voiceProfileId?: string;
    }
  ): Promise<GeneratedContent | null> {
    return this.blogToSocial.transform(source, {
      targetPlatform: 'twitter',
      contentType: 'thread',
      maxTweets: options?.maxTweets,
      includeHashtags: options?.includeHashtags,
      includeEmojis: options?.includeEmojis,
      voiceProfileId: options?.voiceProfileId,
    });
  }

  /**
   * Transform blog to LinkedIn post
   */
  async blogToLinkedIn(
    source: GeneratedContent,
    options?: {
      includeHashtags?: boolean;
      includeEmojis?: boolean;
      includeCTA?: boolean;
      voiceProfileId?: string;
    }
  ): Promise<GeneratedContent | null> {
    return this.blogToSocial.transform(source, {
      targetPlatform: 'linkedin',
      contentType: 'linkedin_post',
      includeHashtags: options?.includeHashtags,
      includeEmojis: options?.includeEmojis,
      includeCTA: options?.includeCTA,
      voiceProfileId: options?.voiceProfileId,
    });
  }

  /**
   * Transform blog to newsletter
   */
  async blogToNewsletterContent(
    source: GeneratedContent,
    options?: {
      newsletterStyle?: 'digest' | 'featured' | 'roundup' | 'educational';
      includeTakeaways?: boolean;
      includeResources?: boolean;
      maxLength?: number;
      voiceProfileId?: string;
    }
  ): Promise<GeneratedContent | null> {
    return this.blogToNewsletter.transform(source, {
      newsletterStyle: options?.newsletterStyle,
      includeTakeaways: options?.includeTakeaways,
      includeResources: options?.includeResources,
      maxLength: options?.maxLength,
      voiceProfileId: options?.voiceProfileId,
    });
  }

  // ===========================================================================
  // Pipeline Management
  // ===========================================================================

  /**
   * Create a repurposing pipeline
   */
  createPipeline(options: {
    userId: string;
    name: string;
    description?: string;
    sourceType: ContentType;
    transformations: Array<{
      targetType: ContentType;
      targetPlatform: ContentPlatform;
      config?: Record<string, unknown>;
    }>;
  }): RepurposingPipeline {
    return this.orchestrator.createPipeline(options);
  }

  /**
   * Execute a pipeline
   */
  async executePipeline(pipelineId: string, sourceContentId: string): Promise<RepurposingJob> {
    return this.orchestrator.executePipeline(pipelineId, sourceContentId);
  }

  /**
   * Get pipeline by ID
   */
  getPipeline(pipelineId: string): RepurposingPipeline | undefined {
    return this.orchestrator.getPipeline(pipelineId);
  }

  /**
   * Get user's pipelines
   */
  getUserPipelines(userId: string): RepurposingPipeline[] {
    return this.orchestrator.getUserPipelines(userId);
  }

  /**
   * Delete a pipeline
   */
  deletePipeline(pipelineId: string): boolean {
    return this.orchestrator.deletePipeline(pipelineId);
  }

  // ===========================================================================
  // Job Management
  // ===========================================================================

  /**
   * Get job status
   */
  getJobStatus(jobId: string): JobStatus | undefined {
    return this.orchestrator.getJobStatus(jobId);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    return this.orchestrator.cancelJob(jobId);
  }

  // ===========================================================================
  // Transformation Info
  // ===========================================================================

  /**
   * Get available transformations
   */
  getAvailableTransformations(): Array<{ sourceType: ContentType; targetType: ContentType }> {
    return this.orchestrator.getAvailableTransformations();
  }

  /**
   * Check if transformation is supported
   */
  isTransformationSupported(sourceType: ContentType, targetType: ContentType): boolean {
    return this.orchestrator.isTransformationSupported(sourceType, targetType);
  }

  /**
   * Register custom transformation handler
   */
  registerTransformationHandler(handler: TransformationHandler): void {
    this.orchestrator.registerTransformationHandler(handler);
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    return this.orchestrator.onEvent(handler);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createContentRepurposingService(
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  contentGenerator: ContentGeneratorProvider,
  config?: ContentRepurposingServiceConfig
): ContentRepurposingService {
  return new ContentRepurposingService(contentStore, voiceProfileStore, contentGenerator, config);
}
