/**
 * Content Creator Suite - Podcast Transcription Service
 *
 * Main entry point for podcast transcription, show notes, and timestamp extraction.
 */

export {
  TranscriberService,
  createTranscriber,
  type TranscriberConfig,
  type TranscriptionJob,
  type TranscriptionOptions,
} from './transcriber.js';

export {
  ShowNotesGeneratorService,
  createShowNotesGenerator,
  type ShowNotesGenerationOptions,
  type GeneratedShowNotes,
} from './show-notes-generator.js';

export {
  TimestampExtractorService,
  createTimestampExtractor,
  type TimestampExtractionOptions,
  type ExtractedTimestamp,
} from './timestamp-extractor.js';

import type {
  PodcastTranscription,
  ShowNotes,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';
import type { TranscriptionProvider } from '../../providers/ai/transcription.js';
import type { PodcastProvider, PodcastEpisode } from '../../providers/media/podcast.js';
import type { PodcastConfig } from '../../config.js';

import { createTranscriber, type TranscriptionOptions, type TranscriptionJob } from './transcriber.js';
import { createShowNotesGenerator, type ShowNotesGenerationOptions, type GeneratedShowNotes } from './show-notes-generator.js';
import { createTimestampExtractor, type TimestampExtractionOptions, type ExtractedTimestamp } from './timestamp-extractor.js';

// =============================================================================
// Podcast Transcription Service (Facade)
// =============================================================================

export interface PodcastTranscriptionServiceConfig {
  podcast?: PodcastConfig;
}

export class PodcastTranscriptionService {
  public readonly transcriber: ReturnType<typeof createTranscriber>;
  public readonly showNotesGenerator: ReturnType<typeof createShowNotesGenerator>;
  public readonly timestampExtractor: ReturnType<typeof createTimestampExtractor>;

  constructor(
    transcriptionProvider: TranscriptionProvider,
    contentGenerator: ContentGeneratorProvider,
    podcastProvider?: PodcastProvider,
    config?: PodcastTranscriptionServiceConfig
  ) {
    // Initialize transcriber
    this.transcriber = createTranscriber(transcriptionProvider, podcastProvider, {
      enableDiarization: config?.podcast?.speakerDiarization,
      language: 'en',
    });

    // Initialize show notes generator
    this.showNotesGenerator = createShowNotesGenerator(contentGenerator);

    // Initialize timestamp extractor
    this.timestampExtractor = createTimestampExtractor(contentGenerator);
  }

  // ===========================================================================
  // Full Transcription Workflow
  // ===========================================================================

  /**
   * Transcribe and generate full show notes
   */
  async transcribeWithShowNotes(
    userId: string,
    episode: PodcastEpisode,
    options?: {
      transcription?: TranscriptionOptions;
      showNotes?: ShowNotesGenerationOptions;
      timestamps?: TimestampExtractionOptions;
    }
  ): Promise<{
    transcription: PodcastTranscription;
    showNotes: GeneratedShowNotes;
    timestamps: ExtractedTimestamp[];
  }> {
    // Transcribe
    const transcription = await this.transcriber.transcribeEpisode(
      userId,
      episode,
      options?.transcription
    );

    // Generate show notes
    const showNotes = await this.showNotesGenerator.generateShowNotes(
      transcription,
      options?.showNotes
    );

    // Extract timestamps
    const timestamps = await this.timestampExtractor.extractTimestamps(
      transcription,
      options?.timestamps
    );

    // Update transcription with generated show notes
    transcription.showNotes = showNotes;

    return { transcription, showNotes, timestamps };
  }

  /**
   * Transcribe from URL with full processing
   */
  async transcribeFromUrl(
    userId: string,
    audioUrl: string,
    title: string,
    options?: {
      transcription?: TranscriptionOptions;
      showNotes?: ShowNotesGenerationOptions;
    }
  ): Promise<{
    transcription: PodcastTranscription;
    showNotes: GeneratedShowNotes;
  }> {
    const transcription = await this.transcriber.transcribeFromUrl(
      userId,
      audioUrl,
      title,
      options?.transcription
    );

    const showNotes = await this.showNotesGenerator.generateShowNotes(
      transcription,
      options?.showNotes
    );

    transcription.showNotes = showNotes;

    return { transcription, showNotes };
  }

  // ===========================================================================
  // Individual Operations
  // ===========================================================================

  /**
   * Transcribe only (no show notes)
   */
  async transcribe(
    userId: string,
    episode: PodcastEpisode,
    options?: TranscriptionOptions
  ): Promise<PodcastTranscription> {
    return this.transcriber.transcribeEpisode(userId, episode, options);
  }

  /**
   * Generate show notes from existing transcription
   */
  async generateShowNotes(
    transcription: PodcastTranscription,
    options?: ShowNotesGenerationOptions
  ): Promise<GeneratedShowNotes> {
    return this.showNotesGenerator.generateShowNotes(transcription, options);
  }

  /**
   * Extract timestamps from existing transcription
   */
  async extractTimestamps(
    transcription: PodcastTranscription,
    options?: TimestampExtractionOptions
  ): Promise<ExtractedTimestamp[]> {
    return this.timestampExtractor.extractTimestamps(transcription, options);
  }

  // ===========================================================================
  // Formatting
  // ===========================================================================

  /**
   * Format show notes as markdown
   */
  formatShowNotesAsMarkdown(showNotes: GeneratedShowNotes, episodeTitle: string): string {
    return this.showNotesGenerator.formatAsMarkdown(showNotes, episodeTitle);
  }

  /**
   * Format timestamps for description
   */
  formatTimestampsForDescription(timestamps: ExtractedTimestamp[]): string {
    return this.timestampExtractor.formatForDescription(timestamps);
  }

  /**
   * Get full formatted output
   */
  formatFullOutput(
    transcription: PodcastTranscription,
    showNotes: GeneratedShowNotes,
    timestamps: ExtractedTimestamp[]
  ): string {
    const lines: string[] = [
      `# ${transcription.episodeTitle}`,
      '',
      `Duration: ${this.formatDuration(transcription.duration)}`,
      `Speakers: ${transcription.speakers.map(s => s.name ?? s.label).join(', ')}`,
      '',
      '---',
      '',
      this.showNotesGenerator.formatAsMarkdown(showNotes, transcription.episodeTitle),
      '',
      '## Timestamps',
      '',
      this.timestampExtractor.formatForDescription(timestamps),
      '',
      '---',
      '',
      '## Full Transcript',
      '',
    ];

    // Add transcript with speaker labels
    for (const segment of transcription.segments) {
      const speaker = transcription.speakers.find(s => s.id === segment.speakerId);
      const speakerName = speaker?.name ?? speaker?.label ?? 'Speaker';
      lines.push(`**${speakerName}** [${this.formatTime(segment.startTime)}]: ${segment.text}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  // ===========================================================================
  // Job Management
  // ===========================================================================

  /**
   * Get transcription job status
   */
  getJobStatus(jobId: string): TranscriptionJob | undefined {
    return this.transcriber.getJobStatus(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): TranscriptionJob[] {
    return this.transcriber.getAllJobs();
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Format duration
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  }

  /**
   * Format time
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ===========================================================================
  // Event Handling
  // ===========================================================================

  /**
   * Register event handler
   */
  onEvent(handler: (event: string, data: unknown) => void): () => void {
    const unsubTranscriber = this.transcriber.onEvent(handler);
    const unsubShowNotes = this.showNotesGenerator.onEvent(handler);

    return () => {
      unsubTranscriber();
      unsubShowNotes();
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPodcastTranscriptionService(
  transcriptionProvider: TranscriptionProvider,
  contentGenerator: ContentGeneratorProvider,
  podcastProvider?: PodcastProvider,
  config?: PodcastTranscriptionServiceConfig
): PodcastTranscriptionService {
  return new PodcastTranscriptionService(
    transcriptionProvider,
    contentGenerator,
    podcastProvider,
    config
  );
}
