/**
 * Content Creator Suite - Podcast Transcriber
 *
 * Handles audio transcription with speaker diarization for podcasts.
 */

import type {
  PodcastTranscription,
  TranscriptionSegment,
  Speaker,
} from '../../types.js';
import type { TranscriptionProvider } from '../../providers/ai/transcription.js';
import type { PodcastProvider, PodcastEpisode } from '../../providers/media/podcast.js';
import { CONTENT_EVENTS } from '../../constants.js';

// =============================================================================
// Types
// =============================================================================

export interface TranscriberConfig {
  enableDiarization: boolean;
  maxSpeakers: number;
  language: string;
  vocabularyHints?: string[];
}

export interface TranscriptionJob {
  id: string;
  episodeTitle: string;
  audioUrl: string;
  status: 'pending' | 'downloading' | 'transcribing' | 'completed' | 'failed';
  progress: number;
  result?: PodcastTranscription;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

export interface TranscriptionOptions {
  language?: string;
  enableDiarization?: boolean;
  maxSpeakers?: number;
  vocabularyHints?: string[];
  speakerNames?: Map<string, string>;
}

// =============================================================================
// Transcriber Service
// =============================================================================

export class TranscriberService {
  private readonly config: TranscriberConfig;
  private jobs = new Map<string, TranscriptionJob>();
  private eventHandlers: ((event: string, data: unknown) => void)[] = [];

  constructor(
    private readonly transcriptionProvider: TranscriptionProvider,
    private readonly podcastProvider?: PodcastProvider,
    config?: Partial<TranscriberConfig>
  ) {
    this.config = {
      enableDiarization: config?.enableDiarization ?? true,
      maxSpeakers: config?.maxSpeakers ?? 5,
      language: config?.language ?? 'en',
      vocabularyHints: config?.vocabularyHints,
    };
  }

  /**
   * Transcribe a podcast episode
   */
  async transcribeEpisode(
    userId: string,
    episode: PodcastEpisode,
    options?: TranscriptionOptions
  ): Promise<PodcastTranscription> {
    const jobId = crypto.randomUUID();
    const job: TranscriptionJob = {
      id: jobId,
      episodeTitle: episode.title,
      audioUrl: episode.audioUrl,
      status: 'pending',
      progress: 0,
      startedAt: Date.now(),
    };

    this.jobs.set(jobId, job);
    this.emit(CONTENT_EVENTS.PODCAST_TRANSCRIPTION_STARTED, {
      jobId,
      episodeTitle: episode.title,
    });

    try {
      // Start transcription
      job.status = 'transcribing';
      job.progress = 10;

      const result = await this.transcriptionProvider.transcribe(episode.audioUrl, {
        language: options?.language ?? this.config.language,
        enableDiarization: options?.enableDiarization ?? this.config.enableDiarization,
        maxSpeakers: options?.maxSpeakers ?? this.config.maxSpeakers,
        vocabularyHints: options?.vocabularyHints ?? this.config.vocabularyHints,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      job.progress = 80;

      // Process transcription result
      const transcription = this.processTranscriptionResult(
        userId,
        episode,
        result.data,
        options?.speakerNames
      );

      job.status = 'completed';
      job.progress = 100;
      job.result = transcription;
      job.completedAt = Date.now();

      this.emit(CONTENT_EVENTS.PODCAST_TRANSCRIPTION_COMPLETED, {
        jobId,
        episodeTitle: episode.title,
        duration: transcription.duration,
        speakerCount: transcription.speakers.length,
      });

      return transcription;
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = Date.now();

      this.emit(CONTENT_EVENTS.PODCAST_TRANSCRIPTION_FAILED, {
        jobId,
        episodeTitle: episode.title,
        error: job.error,
      });

      throw error;
    }
  }

  /**
   * Transcribe from audio URL
   */
  async transcribeFromUrl(
    userId: string,
    audioUrl: string,
    title: string,
    options?: TranscriptionOptions
  ): Promise<PodcastTranscription> {
    const episode: PodcastEpisode = {
      guid: crypto.randomUUID(),
      title,
      description: '',
      pubDate: new Date().toISOString(),
      audioUrl,
    };

    return this.transcribeEpisode(userId, episode, options);
  }

  /**
   * Transcribe from audio buffer
   */
  async transcribeFromBuffer(
    userId: string,
    audioBuffer: ArrayBuffer,
    title: string,
    options?: TranscriptionOptions
  ): Promise<PodcastTranscription> {
    const jobId = crypto.randomUUID();
    const job: TranscriptionJob = {
      id: jobId,
      episodeTitle: title,
      audioUrl: 'buffer',
      status: 'transcribing',
      progress: 10,
      startedAt: Date.now(),
    };

    this.jobs.set(jobId, job);

    try {
      const result = await this.transcriptionProvider.transcribe(audioBuffer, {
        language: options?.language ?? this.config.language,
        enableDiarization: options?.enableDiarization ?? this.config.enableDiarization,
        maxSpeakers: options?.maxSpeakers ?? this.config.maxSpeakers,
        vocabularyHints: options?.vocabularyHints ?? this.config.vocabularyHints,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const episode: PodcastEpisode = {
        guid: crypto.randomUUID(),
        title,
        description: '',
        pubDate: new Date().toISOString(),
        audioUrl: '',
        duration: result.data.duration,
      };

      const transcription = this.processTranscriptionResult(
        userId,
        episode,
        result.data,
        options?.speakerNames
      );

      job.status = 'completed';
      job.progress = 100;
      job.result = transcription;
      job.completedAt = Date.now();

      return transcription;
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = Date.now();
      throw error;
    }
  }

  /**
   * Get transcription job status
   */
  getJobStatus(jobId: string): TranscriptionJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): TranscriptionJob[] {
    return Array.from(this.jobs.values());
  }

  // ===========================================================================
  // Processing Methods
  // ===========================================================================

  /**
   * Process transcription result into PodcastTranscription
   */
  private processTranscriptionResult(
    userId: string,
    episode: PodcastEpisode,
    result: {
      text: string;
      segments: TranscriptionSegment[];
      speakers: Speaker[];
      duration: number;
      language: string;
    },
    speakerNames?: Map<string, string>
  ): PodcastTranscription {
    // Apply speaker names if provided
    const speakers = result.speakers.map(speaker => ({
      ...speaker,
      name: speakerNames?.get(speaker.id) ?? speaker.name,
    }));

    const segments = result.segments.map(segment => ({
      ...segment,
      speakerId: segment.speakerId,
    }));

    // Extract keywords
    const keywords = this.extractKeywords(result.text);

    // Generate summary
    const summary = this.generateBasicSummary(result.text);

    return {
      id: crypto.randomUUID(),
      userId,
      episodeTitle: episode.title,
      episodeUrl: episode.audioUrl,
      duration: result.duration,
      segments,
      speakers,
      showNotes: {
        summary,
        keyTakeaways: [],
        timestamps: [],
        resources: [],
        quotes: [],
      },
      keywords,
      summary,
      createdAt: Date.now(),
    };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'this', 'that', 'these', 'those', 'it', 'its', 'i', 'you', 'he', 'she',
      'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
      'so', 'just', 'like', 'know', 'think', 'really', 'very', 'well', 'also',
    ]);

    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      if (!commonWords.has(word)) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Generate basic summary from text
   */
  private generateBasicSummary(text: string): string {
    // Simple extractive summary - take first few sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').trim();
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

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

export function createTranscriber(
  transcriptionProvider: TranscriptionProvider,
  podcastProvider?: PodcastProvider,
  config?: Partial<TranscriberConfig>
): TranscriberService {
  return new TranscriberService(transcriptionProvider, podcastProvider, config);
}
