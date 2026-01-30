/**
 * Content Creator Suite - Pipeline Orchestrator
 *
 * Orchestrates content repurposing workflows and transformation pipelines.
 */

import type {
  RepurposingPipeline,
  PipelineTransformation,
  RepurposingJob,
  RepurposingError,
  GeneratedContent,
  ContentType,
  ContentPlatform,
  TransformationConfig,
} from '../../types.js';
import type { ContentStore } from '../../stores/content-store.js';
import type { VoiceProfileStore } from '../../stores/voice-profile-store.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface TransformationHandler {
  sourceType: ContentType;
  targetType: ContentType;
  transform: (
    source: GeneratedContent,
    config: TransformationConfig
  ) => Promise<GeneratedContent | null>;
}

export interface PipelineOrchestratorConfig {
  maxConcurrentJobs?: number;
  jobTimeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface CreatePipelineOptions {
  userId: string;
  name: string;
  description?: string;
  sourceType: ContentType;
  transformations: Array<{
    targetType: ContentType;
    targetPlatform: ContentPlatform;
    config?: TransformationConfig;
  }>;
}

export interface JobStatus {
  id: string;
  pipelineId: string;
  status: RepurposingJob['status'];
  progress: number;
  currentStep: number;
  totalSteps: number;
  outputs: GeneratedContent[];
  errors: RepurposingError[];
  startedAt: number;
  completedAt?: number;
}

// =============================================================================
// Pipeline Orchestrator Service
// =============================================================================

export class PipelineOrchestratorService {
  private readonly config: Required<PipelineOrchestratorConfig>;
  private pipelines = new Map<string, RepurposingPipeline>();
  private jobs = new Map<string, RepurposingJob>();
  private transformationHandlers = new Map<string, TransformationHandler>();
  private activeJobs = 0;
  private jobQueue: string[] = [];
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(
    private readonly contentStore: ContentStore,
    private readonly voiceProfileStore: VoiceProfileStore,
    config?: PipelineOrchestratorConfig
  ) {
    this.config = {
      maxConcurrentJobs: config?.maxConcurrentJobs ?? 3,
      jobTimeoutMs: config?.jobTimeoutMs ?? 300000, // 5 minutes
      retryAttempts: config?.retryAttempts ?? 2,
      retryDelayMs: config?.retryDelayMs ?? 5000,
    };
  }

  // ===========================================================================
  // Pipeline Management
  // ===========================================================================

  /**
   * Create a new pipeline
   */
  createPipeline(options: CreatePipelineOptions): RepurposingPipeline {
    const now = Date.now();
    const pipeline: RepurposingPipeline = {
      id: crypto.randomUUID(),
      userId: options.userId,
      name: options.name,
      description: options.description,
      sourceType: options.sourceType,
      transformations: options.transformations.map((t, index) => ({
        id: crypto.randomUUID(),
        order: index + 1,
        sourceType: index === 0 ? options.sourceType : options.transformations[index - 1].targetType,
        targetType: t.targetType,
        targetPlatform: t.targetPlatform,
        config: t.config ?? {},
      })),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(pipeline.id, pipeline);
    return pipeline;
  }

  /**
   * Get a pipeline by ID
   */
  getPipeline(pipelineId: string): RepurposingPipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  /**
   * Get pipelines for a user
   */
  getUserPipelines(userId: string): RepurposingPipeline[] {
    return Array.from(this.pipelines.values()).filter(p => p.userId === userId);
  }

  /**
   * Update a pipeline
   */
  updatePipeline(
    pipelineId: string,
    updates: Partial<Pick<RepurposingPipeline, 'name' | 'description' | 'enabled' | 'transformations'>>
  ): RepurposingPipeline | undefined {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return undefined;

    if (updates.name !== undefined) pipeline.name = updates.name;
    if (updates.description !== undefined) pipeline.description = updates.description;
    if (updates.enabled !== undefined) pipeline.enabled = updates.enabled;
    if (updates.transformations !== undefined) pipeline.transformations = updates.transformations;
    pipeline.updatedAt = Date.now();

    return pipeline;
  }

  /**
   * Delete a pipeline
   */
  deletePipeline(pipelineId: string): boolean {
    return this.pipelines.delete(pipelineId);
  }

  // ===========================================================================
  // Transformation Handlers
  // ===========================================================================

  /**
   * Register a transformation handler
   */
  registerTransformationHandler(handler: TransformationHandler): void {
    const key = `${handler.sourceType}:${handler.targetType}`;
    this.transformationHandlers.set(key, handler);
  }

  /**
   * Get available transformations
   */
  getAvailableTransformations(): Array<{ sourceType: ContentType; targetType: ContentType }> {
    return Array.from(this.transformationHandlers.values()).map(h => ({
      sourceType: h.sourceType,
      targetType: h.targetType,
    }));
  }

  /**
   * Check if a transformation is supported
   */
  isTransformationSupported(sourceType: ContentType, targetType: ContentType): boolean {
    return this.transformationHandlers.has(`${sourceType}:${targetType}`);
  }

  // ===========================================================================
  // Job Execution
  // ===========================================================================

  /**
   * Execute a pipeline for a source content
   */
  async executePipeline(
    pipelineId: string,
    sourceContentId: string
  ): Promise<RepurposingJob> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    if (!pipeline.enabled) {
      throw new Error('Pipeline is disabled');
    }

    const sourceContent = await this.contentStore.get(sourceContentId);
    if (!sourceContent) {
      throw new Error('Source content not found');
    }

    // Create job
    const job: RepurposingJob = {
      id: crypto.randomUUID(),
      pipelineId,
      sourceContentId,
      status: 'pending',
      currentStep: 0,
      totalSteps: pipeline.transformations.length,
      outputs: [],
      errors: [],
      startedAt: Date.now(),
    };

    this.jobs.set(job.id, job);
    this.emit(CONTENT_EVENTS.PIPELINE_STARTED, {
      jobId: job.id,
      pipelineId,
      sourceContentId,
    });

    // Queue or execute
    if (this.activeJobs < this.config.maxConcurrentJobs) {
      this.processJob(job, pipeline, sourceContent);
    } else {
      this.jobQueue.push(job.id);
    }

    return job;
  }

  /**
   * Process a job
   */
  private async processJob(
    job: RepurposingJob,
    pipeline: RepurposingPipeline,
    sourceContent: GeneratedContent
  ): Promise<void> {
    this.activeJobs++;
    job.status = 'processing';

    let currentContent = sourceContent;

    for (const transformation of pipeline.transformations) {
      job.currentStep = transformation.order;

      const handlerKey = `${transformation.sourceType}:${transformation.targetType}`;
      const handler = this.transformationHandlers.get(handlerKey);

      if (!handler) {
        const error: RepurposingError = {
          step: transformation.order,
          transformationId: transformation.id,
          message: `No handler registered for ${handlerKey}`,
          timestamp: Date.now(),
        };
        job.errors.push(error);
        continue;
      }

      try {
        // Apply voice profile if configured
        let config = transformation.config;
        if (config.voiceProfileId) {
          const voiceProfile = await this.voiceProfileStore.getProfile(config.voiceProfileId);
          if (voiceProfile) {
            config = { ...config, voiceProfile };
          }
        }

        const output = await this.executeTransformationWithRetry(
          handler,
          currentContent,
          config
        );

        if (output) {
          // Store the output
          const storedOutput = await this.contentStore.create({
            userId: sourceContent.userId,
            type: transformation.targetType,
            platform: transformation.targetPlatform,
            status: 'draft',
            content: output.content,
            title: output.title,
            metadata: {
              ...output.metadata,
              sourceContentId: sourceContent.id,
              transformationType: `${transformation.sourceType}:${transformation.targetType}`,
            },
          });

          job.outputs.push(storedOutput);
          currentContent = storedOutput;

          this.emit(CONTENT_EVENTS.PIPELINE_STEP_COMPLETED, {
            jobId: job.id,
            step: transformation.order,
            outputId: storedOutput.id,
          });

          this.emit(CONTENT_EVENTS.TRANSFORMATION_COMPLETED, {
            jobId: job.id,
            transformationType: handlerKey,
            outputId: storedOutput.id,
          });
        } else {
          const error: RepurposingError = {
            step: transformation.order,
            transformationId: transformation.id,
            message: 'Transformation returned null',
            timestamp: Date.now(),
          };
          job.errors.push(error);
        }
      } catch (err) {
        const error: RepurposingError = {
          step: transformation.order,
          transformationId: transformation.id,
          message: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now(),
        };
        job.errors.push(error);

        this.emit(CONTENT_EVENTS.SEO_ISSUE_DETECTED, {
          jobId: job.id,
          step: transformation.order,
          error: error.message,
        });
      }
    }

    // Complete job
    job.status = job.errors.length > 0 && job.outputs.length === 0 ? 'failed' : 'completed';
    job.completedAt = Date.now();

    this.activeJobs--;

    if (job.status === 'completed') {
      this.emit(CONTENT_EVENTS.PIPELINE_COMPLETED, {
        jobId: job.id,
        outputCount: job.outputs.length,
        errorCount: job.errors.length,
      });
    } else {
      this.emit(CONTENT_EVENTS.PIPELINE_FAILED, {
        jobId: job.id,
        errors: job.errors,
      });
    }

    // Process next queued job
    this.processNextQueuedJob();
  }

  /**
   * Execute transformation with retry
   */
  private async executeTransformationWithRetry(
    handler: TransformationHandler,
    content: GeneratedContent,
    config: TransformationConfig
  ): Promise<GeneratedContent | null> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await handler.transform(content, config);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error');

        if (attempt < this.config.retryAttempts) {
          await this.sleep(this.config.retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Process next queued job
   */
  private async processNextQueuedJob(): Promise<void> {
    if (this.jobQueue.length === 0 || this.activeJobs >= this.config.maxConcurrentJobs) {
      return;
    }

    const jobId = this.jobQueue.shift()!;
    const job = this.jobs.get(jobId);
    if (!job) return;

    const pipeline = this.pipelines.get(job.pipelineId);
    if (!pipeline) return;

    const sourceContent = await this.contentStore.get(job.sourceContentId);
    if (!sourceContent) return;

    this.processJob(job, pipeline, sourceContent);
  }

  // ===========================================================================
  // Job Management
  // ===========================================================================

  /**
   * Get job status
   */
  getJobStatus(jobId: string): JobStatus | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    return {
      id: job.id,
      pipelineId: job.pipelineId,
      status: job.status,
      progress: job.totalSteps > 0 ? (job.currentStep / job.totalSteps) * 100 : 0,
      currentStep: job.currentStep,
      totalSteps: job.totalSteps,
      outputs: job.outputs,
      errors: job.errors,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  /**
   * Get all jobs for a pipeline
   */
  getPipelineJobs(pipelineId: string): RepurposingJob[] {
    return Array.from(this.jobs.values()).filter(j => j.pipelineId === pipelineId);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'pending') {
      return false;
    }

    // Remove from queue
    const queueIndex = this.jobQueue.indexOf(jobId);
    if (queueIndex > -1) {
      this.jobQueue.splice(queueIndex, 1);
    }

    job.status = 'failed';
    job.errors.push({
      step: 0,
      transformationId: '',
      message: 'Job cancelled',
      timestamp: Date.now(),
    });
    job.completedAt = Date.now();

    return true;
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPipelineOrchestrator(
  contentStore: ContentStore,
  voiceProfileStore: VoiceProfileStore,
  config?: PipelineOrchestratorConfig
): PipelineOrchestratorService {
  return new PipelineOrchestratorService(contentStore, voiceProfileStore, config);
}
