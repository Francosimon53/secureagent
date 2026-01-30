/**
 * Content Creator Suite - Timestamp Extractor
 *
 * Extracts and generates meaningful timestamps from podcast transcriptions.
 */

import type {
  PodcastTranscription,
  TranscriptionSegment,
  TimestampEntry,
} from '../../types.js';
import type { ContentGeneratorProvider } from '../../providers/ai/content-generator.js';

// =============================================================================
// Types
// =============================================================================

export interface TimestampExtractionOptions {
  minTimestamps?: number;
  maxTimestamps?: number;
  minGapSeconds?: number;
  detectTopicChanges?: boolean;
  detectQuestions?: boolean;
  detectHighlights?: boolean;
}

export interface ExtractedTimestamp extends TimestampEntry {
  type: 'topic_change' | 'question' | 'highlight' | 'speaker_change' | 'key_point';
  confidence: number;
  segmentIndex?: number;
}

// =============================================================================
// Timestamp Extractor Service
// =============================================================================

export class TimestampExtractorService {
  constructor(private readonly contentGenerator?: ContentGeneratorProvider) {}

  /**
   * Extract timestamps from transcription
   */
  async extractTimestamps(
    transcription: PodcastTranscription,
    options?: TimestampExtractionOptions
  ): Promise<ExtractedTimestamp[]> {
    const opts = {
      minTimestamps: options?.minTimestamps ?? 5,
      maxTimestamps: options?.maxTimestamps ?? 20,
      minGapSeconds: options?.minGapSeconds ?? 60,
      detectTopicChanges: options?.detectTopicChanges ?? true,
      detectQuestions: options?.detectQuestions ?? true,
      detectHighlights: options?.detectHighlights ?? true,
    };

    const timestamps: ExtractedTimestamp[] = [];

    // Extract based on different criteria
    if (opts.detectTopicChanges) {
      const topicTimestamps = await this.detectTopicChanges(transcription, opts);
      timestamps.push(...topicTimestamps);
    }

    if (opts.detectQuestions) {
      const questionTimestamps = this.detectQuestions(transcription);
      timestamps.push(...questionTimestamps);
    }

    if (opts.detectHighlights) {
      const highlightTimestamps = this.detectHighlights(transcription);
      timestamps.push(...highlightTimestamps);
    }

    // Add speaker changes if multiple speakers
    if (transcription.speakers.length > 1) {
      const speakerTimestamps = this.detectSpeakerChanges(transcription);
      timestamps.push(...speakerTimestamps.slice(0, 5)); // Limit speaker changes
    }

    // Merge and deduplicate
    const merged = this.mergeTimestamps(timestamps, opts.minGapSeconds);

    // Sort by time
    merged.sort((a, b) => a.time - b.time);

    // Limit to max
    return merged.slice(0, opts.maxTimestamps);
  }

  /**
   * Detect topic changes using AI
   */
  private async detectTopicChanges(
    transcription: PodcastTranscription,
    options: { minGapSeconds: number }
  ): Promise<ExtractedTimestamp[]> {
    if (!this.contentGenerator) {
      return this.detectTopicChangesHeuristic(transcription, options);
    }

    // Sample segments for AI analysis
    const segments = transcription.segments;
    const chunkSize = Math.max(1, Math.floor(segments.length / 10));
    const samples: { time: number; text: string }[] = [];

    for (let i = 0; i < segments.length; i += chunkSize) {
      const chunk = segments.slice(i, Math.min(i + chunkSize, segments.length));
      const text = chunk.map(s => s.text).join(' ');
      samples.push({
        time: chunk[0].startTime,
        text: text.substring(0, 300),
      });
    }

    const prompt = `Analyze these podcast transcript excerpts and identify topic changes:

${samples.map((s, i) => `[${this.formatTime(s.time)}] ${s.text}`).join('\n\n')}

Identify 5-10 points where the topic changes significantly.
For each, provide:
- TIME: [timestamp from the excerpts]
- TOPIC: [brief topic label, 3-5 words]

Format:
TIME: MM:SS
TOPIC: [topic]
---`;

    const result = await this.contentGenerator.generate({
      prompt,
      systemPrompt: 'You identify topic changes in podcast transcripts.',
      maxTokens: 500,
    });

    const timestamps: ExtractedTimestamp[] = [];

    if (result.success) {
      const topicRegex = /TIME:\s*(\d+:\d+)\s*\nTOPIC:\s*(.+?)(?=\n---|$)/gis;
      let match;

      while ((match = topicRegex.exec(result.data.content)) !== null) {
        const timeParts = match[1].split(':').map(p => parseInt(p, 10));
        const time = timeParts[0] * 60 + timeParts[1];

        timestamps.push({
          time,
          label: match[2].trim(),
          type: 'topic_change',
          confidence: 0.8,
        });
      }
    }

    return timestamps;
  }

  /**
   * Detect topic changes using heuristics
   */
  private detectTopicChangesHeuristic(
    transcription: PodcastTranscription,
    options: { minGapSeconds: number }
  ): ExtractedTimestamp[] {
    const timestamps: ExtractedTimestamp[] = [];
    const segments = transcription.segments;

    if (segments.length === 0) return timestamps;

    // Look for natural breaks (pauses, speaker changes, transition words)
    const transitionWords = [
      'now', 'next', 'moving on', 'another', 'also', 'let\'s talk',
      'speaking of', 'anyway', 'so', 'okay', 'alright',
    ];

    let lastTimestamp = 0;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const textLower = segment.text.toLowerCase();

      // Check for transition words at start of segment
      const hasTransition = transitionWords.some(tw =>
        textLower.startsWith(tw) || textLower.includes(`. ${tw}`)
      );

      // Check for significant pause (gap between segments)
      const prevSegment = segments[i - 1];
      const hasGap = prevSegment && (segment.startTime - prevSegment.endTime > 2);

      if ((hasTransition || hasGap) && (segment.startTime - lastTimestamp >= options.minGapSeconds)) {
        timestamps.push({
          time: segment.startTime,
          label: this.extractTopicLabel(segment.text),
          type: 'topic_change',
          confidence: hasTransition ? 0.6 : 0.4,
          segmentIndex: i,
        });
        lastTimestamp = segment.startTime;
      }
    }

    return timestamps;
  }

  /**
   * Detect questions in the transcript
   */
  private detectQuestions(transcription: PodcastTranscription): ExtractedTimestamp[] {
    const timestamps: ExtractedTimestamp[] = [];
    const questionPatterns = [
      /^(what|why|how|when|where|who|which|can|could|would|should|do|does|is|are|will)/i,
      /\?$/,
    ];

    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];
      const text = segment.text.trim();

      const isQuestion = questionPatterns.some(pattern => pattern.test(text));

      if (isQuestion && text.length > 20) {
        timestamps.push({
          time: segment.startTime,
          label: this.truncateText(text, 50),
          type: 'question',
          confidence: text.endsWith('?') ? 0.9 : 0.7,
          segmentIndex: i,
        });
      }
    }

    // Keep only notable questions (every 5 minutes or so)
    return this.sampleTimestamps(timestamps, 120);
  }

  /**
   * Detect highlights (emphasized or notable moments)
   */
  private detectHighlights(transcription: PodcastTranscription): ExtractedTimestamp[] {
    const timestamps: ExtractedTimestamp[] = [];

    // Look for segments marked as highlights or with high confidence
    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];

      if (segment.isHighlight || segment.confidence > 0.95) {
        timestamps.push({
          time: segment.startTime,
          label: this.truncateText(segment.text, 50),
          type: 'highlight',
          confidence: segment.confidence,
          segmentIndex: i,
        });
      }
    }

    return timestamps;
  }

  /**
   * Detect speaker changes
   */
  private detectSpeakerChanges(transcription: PodcastTranscription): ExtractedTimestamp[] {
    const timestamps: ExtractedTimestamp[] = [];
    let lastSpeaker = '';

    for (let i = 0; i < transcription.segments.length; i++) {
      const segment = transcription.segments[i];

      if (segment.speakerId !== lastSpeaker && lastSpeaker !== '') {
        const speaker = transcription.speakers.find(s => s.id === segment.speakerId);
        timestamps.push({
          time: segment.startTime,
          label: `${speaker?.name ?? speaker?.label ?? 'Speaker'} speaks`,
          type: 'speaker_change',
          confidence: 0.9,
          segmentIndex: i,
        });
      }

      lastSpeaker = segment.speakerId;
    }

    return timestamps;
  }

  /**
   * Merge timestamps that are too close together
   */
  private mergeTimestamps(
    timestamps: ExtractedTimestamp[],
    minGapSeconds: number
  ): ExtractedTimestamp[] {
    if (timestamps.length === 0) return [];

    // Sort by time
    const sorted = [...timestamps].sort((a, b) => a.time - b.time);

    const merged: ExtractedTimestamp[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.time - last.time < minGapSeconds) {
        // Keep the one with higher confidence
        if (current.confidence > last.confidence) {
          merged[merged.length - 1] = current;
        }
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Sample timestamps to reduce density
   */
  private sampleTimestamps(
    timestamps: ExtractedTimestamp[],
    minGapSeconds: number
  ): ExtractedTimestamp[] {
    if (timestamps.length === 0) return [];

    const sampled: ExtractedTimestamp[] = [timestamps[0]];
    let lastTime = timestamps[0].time;

    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i].time - lastTime >= minGapSeconds) {
        sampled.push(timestamps[i]);
        lastTime = timestamps[i].time;
      }
    }

    return sampled;
  }

  /**
   * Extract a topic label from text
   */
  private extractTopicLabel(text: string): string {
    // Try to extract the first meaningful phrase
    const cleaned = text
      .replace(/^(so|okay|alright|now|well|um|uh|like)\s*/i, '')
      .trim();

    // Get first sentence or phrase
    const firstSentence = cleaned.match(/^[^.!?]+/)?.[0] ?? cleaned;

    return this.truncateText(firstSentence, 40);
  }

  /**
   * Truncate text to max length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;

    const truncated = text.substring(0, maxLength - 3);
    const lastSpace = truncated.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Format time in seconds to MM:SS
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format timestamps for YouTube/podcast description
   */
  formatForDescription(timestamps: ExtractedTimestamp[]): string {
    return timestamps
      .map(ts => `${this.formatTime(ts.time)} - ${ts.label}`)
      .join('\n');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTimestampExtractor(
  contentGenerator?: ContentGeneratorProvider
): TimestampExtractorService {
  return new TimestampExtractorService(contentGenerator);
}
