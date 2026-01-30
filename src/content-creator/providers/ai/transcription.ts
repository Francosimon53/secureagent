/**
 * Content Creator Suite - Transcription Provider
 *
 * Audio transcription using various providers (Whisper, AssemblyAI, Deepgram).
 */

import { BaseContentProvider, ContentProviderError } from '../base.js';
import type { TranscriptionConfigSchema } from '../../config.js';
import type { ContentProviderResult, TranscriptionSegment, Speaker } from '../../types.js';
import { API_ENDPOINTS, ERROR_CODES, CONTENT_DEFAULTS } from '../../constants.js';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

type TranscriptionConfig = z.infer<typeof TranscriptionConfigSchema>;

interface TranscriptionProviderConfig {
  provider: 'whisper' | 'assemblyai' | 'deepgram';
  whisperApiKeyEnvVar: string;
  assemblyAiApiKeyEnvVar: string;
  deepgramApiKeyEnvVar: string;
  language: string;
  enableSpeakerDiarization: boolean;
  maxSpeakers: number;
  timeout: number;
  rateLimitPerMinute: number;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  speakers: Speaker[];
  duration: number;
  language: string;
  confidence: number;
}

export interface TranscriptionOptions {
  language?: string;
  enableDiarization?: boolean;
  maxSpeakers?: number;
  vocabularyHints?: string[];
  punctuate?: boolean;
  formatText?: boolean;
}

// Whisper API types
interface WhisperResponse {
  text: string;
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    avg_logprob: number;
  }>;
  language: string;
  duration?: number;
}

// AssemblyAI types
interface AssemblyAIUploadResponse {
  upload_url: string;
}

interface AssemblyAITranscriptResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  utterances?: Array<{
    speaker: string;
    start: number;
    end: number;
    text: string;
    confidence: number;
  }>;
  words?: Array<{
    text: string;
    start: number;
    end: number;
    confidence: number;
    speaker?: string;
  }>;
  audio_duration?: number;
  language_code?: string;
  confidence?: number;
  error?: string;
}

// =============================================================================
// Transcription Provider
// =============================================================================

export class TranscriptionProvider extends BaseContentProvider<TranscriptionProviderConfig> {
  private whisperApiKey: string | undefined;
  private assemblyAiApiKey: string | undefined;
  private deepgramApiKey: string | undefined;

  constructor(config?: TranscriptionConfig) {
    const providerConfig: TranscriptionProviderConfig = {
      provider: config?.provider ?? 'whisper',
      whisperApiKeyEnvVar: config?.whisperApiKeyEnvVar ?? 'OPENAI_API_KEY',
      assemblyAiApiKeyEnvVar: config?.assemblyAiApiKeyEnvVar ?? 'ASSEMBLYAI_API_KEY',
      deepgramApiKeyEnvVar: config?.deepgramApiKeyEnvVar ?? 'DEEPGRAM_API_KEY',
      language: config?.language ?? 'en',
      enableSpeakerDiarization: config?.enableSpeakerDiarization ?? true,
      maxSpeakers: config?.maxSpeakers ?? 5,
      timeout: config?.timeout ?? CONTENT_DEFAULTS.TRANSCRIPTION_TIMEOUT,
      rateLimitPerMinute: 10,
    };
    super(providerConfig);
  }

  get name(): string {
    return 'transcription';
  }

  get type(): string {
    return 'ai';
  }

  protected requiresApiKey(): boolean {
    return true;
  }

  protected async onInitialize(): Promise<void> {
    this.whisperApiKey = process.env[this.config.whisperApiKeyEnvVar];
    this.assemblyAiApiKey = process.env[this.config.assemblyAiApiKeyEnvVar];
    this.deepgramApiKey = process.env[this.config.deepgramApiKeyEnvVar];

    const provider = this.config.provider;

    if (provider === 'whisper' && !this.whisperApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Whisper/OpenAI API key not found: ${this.config.whisperApiKeyEnvVar}`
      );
    }

    if (provider === 'assemblyai' && !this.assemblyAiApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `AssemblyAI API key not found: ${this.config.assemblyAiApiKeyEnvVar}`
      );
    }

    if (provider === 'deepgram' && !this.deepgramApiKey) {
      throw new ContentProviderError(
        this.name,
        ERROR_CODES.PROVIDER_AUTH_FAILED,
        `Deepgram API key not found: ${this.config.deepgramApiKeyEnvVar}`
      );
    }
  }

  // ===========================================================================
  // Main Transcription Method
  // ===========================================================================

  /**
   * Transcribe audio
   */
  async transcribe(
    audioSource: ArrayBuffer | string,
    options?: TranscriptionOptions
  ): Promise<ContentProviderResult<TranscriptionResult>> {
    const provider = this.config.provider;

    switch (provider) {
      case 'whisper':
        return this.transcribeWithWhisper(audioSource, options);
      case 'assemblyai':
        return this.transcribeWithAssemblyAI(audioSource, options);
      case 'deepgram':
        return this.transcribeWithDeepgram(audioSource, options);
      default:
        return {
          success: false,
          error: `Unsupported provider: ${provider}`,
          cached: false,
          fetchedAt: Date.now(),
        };
    }
  }

  // ===========================================================================
  // Whisper (OpenAI)
  // ===========================================================================

  /**
   * Transcribe with OpenAI Whisper
   */
  private async transcribeWithWhisper(
    audioSource: ArrayBuffer | string,
    options?: TranscriptionOptions
  ): Promise<ContentProviderResult<TranscriptionResult>> {
    let audioData: ArrayBuffer;

    if (typeof audioSource === 'string') {
      // Fetch from URL
      const response = await fetch(audioSource);
      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch audio: ${response.status}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }
      audioData = await response.arrayBuffer();
    } else {
      audioData = audioSource;
    }

    const formData = new FormData();
    const blob = new Blob([audioData], { type: 'audio/mp3' });
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    if (options?.language) {
      formData.append('language', options.language);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(
        `${API_ENDPOINTS.openai.base}${API_ENDPOINTS.openai.transcription}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.whisperApiKey}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: `Whisper API error: ${response.status} - ${error}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const data = await response.json() as WhisperResponse;

      const segments: TranscriptionSegment[] = (data.segments ?? []).map((seg, index) => ({
        id: String(seg.id),
        speakerId: 'speaker_0', // Whisper doesn't do diarization
        startTime: seg.start,
        endTime: seg.end,
        text: seg.text.trim(),
        confidence: Math.exp(seg.avg_logprob), // Convert log prob to confidence
      }));

      return {
        success: true,
        data: {
          text: data.text,
          segments,
          speakers: [{ id: 'speaker_0', label: 'Speaker', speakingTime: data.duration ?? 0, segmentCount: segments.length }],
          duration: data.duration ?? 0,
          language: data.language,
          confidence: segments.length > 0
            ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
            : 0.9,
        },
        cached: false,
        fetchedAt: Date.now(),
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Transcription timed out',
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        cached: false,
        fetchedAt: Date.now(),
      };
    }
  }

  // ===========================================================================
  // AssemblyAI
  // ===========================================================================

  /**
   * Transcribe with AssemblyAI
   */
  private async transcribeWithAssemblyAI(
    audioSource: ArrayBuffer | string,
    options?: TranscriptionOptions
  ): Promise<ContentProviderResult<TranscriptionResult>> {
    let audioUrl: string;

    if (typeof audioSource === 'string') {
      audioUrl = audioSource;
    } else {
      // Upload to AssemblyAI
      const uploadResult = await this.uploadToAssemblyAI(audioSource);
      if (!uploadResult.success) {
        return uploadResult as ContentProviderResult<TranscriptionResult>;
      }
      audioUrl = uploadResult.data;
    }

    // Create transcription request
    const transcriptBody: Record<string, unknown> = {
      audio_url: audioUrl,
      language_code: options?.language ?? this.config.language,
      punctuate: options?.punctuate ?? true,
      format_text: options?.formatText ?? true,
    };

    if (options?.enableDiarization ?? this.config.enableSpeakerDiarization) {
      transcriptBody.speaker_labels = true;
      transcriptBody.speakers_expected = options?.maxSpeakers ?? this.config.maxSpeakers;
    }

    if (options?.vocabularyHints && options.vocabularyHints.length > 0) {
      transcriptBody.word_boost = options.vocabularyHints;
    }

    const createResponse = await fetch(`${API_ENDPOINTS.assemblyai.base}${API_ENDPOINTS.assemblyai.transcript}`, {
      method: 'POST',
      headers: {
        Authorization: this.assemblyAiApiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptBody),
    });

    if (!createResponse.ok) {
      return {
        success: false,
        error: `AssemblyAI API error: ${createResponse.status}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const createData = await createResponse.json() as AssemblyAITranscriptResponse;
    const transcriptId = createData.id;

    // Poll for completion
    const result = await this.pollAssemblyAITranscript(transcriptId);
    return result;
  }

  /**
   * Upload audio to AssemblyAI
   */
  private async uploadToAssemblyAI(audioData: ArrayBuffer): Promise<ContentProviderResult<string>> {
    const response = await fetch(`${API_ENDPOINTS.assemblyai.base}${API_ENDPOINTS.assemblyai.upload}`, {
      method: 'POST',
      headers: {
        Authorization: this.assemblyAiApiKey!,
        'Content-Type': 'application/octet-stream',
      },
      body: audioData,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `AssemblyAI upload error: ${response.status}`,
        cached: false,
        fetchedAt: Date.now(),
      };
    }

    const data = await response.json() as AssemblyAIUploadResponse;

    return {
      success: true,
      data: data.upload_url,
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Poll AssemblyAI for transcript completion
   */
  private async pollAssemblyAITranscript(
    transcriptId: string
  ): Promise<ContentProviderResult<TranscriptionResult>> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < this.config.timeout) {
      const response = await fetch(
        `${API_ENDPOINTS.assemblyai.base}${API_ENDPOINTS.assemblyai.transcript}/${transcriptId}`,
        {
          headers: {
            Authorization: this.assemblyAiApiKey!,
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `AssemblyAI API error: ${response.status}`,
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      const data = await response.json() as AssemblyAITranscriptResponse;

      if (data.status === 'completed') {
        return this.parseAssemblyAIResult(data);
      }

      if (data.status === 'error') {
        return {
          success: false,
          error: data.error ?? 'Transcription failed',
          cached: false,
          fetchedAt: Date.now(),
        };
      }

      // Wait before polling again
      await this.sleep(pollInterval);
    }

    return {
      success: false,
      error: 'Transcription timed out',
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  /**
   * Parse AssemblyAI result
   */
  private parseAssemblyAIResult(data: AssemblyAITranscriptResponse): ContentProviderResult<TranscriptionResult> {
    const segments: TranscriptionSegment[] = [];
    const speakerMap = new Map<string, Speaker>();

    if (data.utterances) {
      for (const utterance of data.utterances) {
        const speakerId = utterance.speaker;

        if (!speakerMap.has(speakerId)) {
          speakerMap.set(speakerId, {
            id: speakerId,
            label: `Speaker ${speakerMap.size + 1}`,
            speakingTime: 0,
            segmentCount: 0,
          });
        }

        const speaker = speakerMap.get(speakerId)!;
        speaker.speakingTime += (utterance.end - utterance.start) / 1000;
        speaker.segmentCount++;

        segments.push({
          id: String(segments.length),
          speakerId,
          startTime: utterance.start / 1000,
          endTime: utterance.end / 1000,
          text: utterance.text,
          confidence: utterance.confidence,
        });
      }
    } else if (data.words) {
      // Fall back to word-level segments if no utterances
      let currentSegment: TranscriptionSegment | null = null;

      for (const word of data.words) {
        if (!currentSegment || (currentSegment.endTime && word.start / 1000 - currentSegment.endTime > 1)) {
          if (currentSegment) {
            segments.push(currentSegment);
          }
          currentSegment = {
            id: String(segments.length),
            speakerId: word.speaker ?? 'speaker_0',
            startTime: word.start / 1000,
            endTime: word.end / 1000,
            text: word.text,
            confidence: word.confidence,
          };
        } else {
          currentSegment.text += ' ' + word.text;
          currentSegment.endTime = word.end / 1000;
          currentSegment.confidence = (currentSegment.confidence + word.confidence) / 2;
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }
    }

    return {
      success: true,
      data: {
        text: data.text ?? '',
        segments,
        speakers: Array.from(speakerMap.values()),
        duration: (data.audio_duration ?? 0) / 1000,
        language: data.language_code ?? 'en',
        confidence: data.confidence ?? 0.9,
      },
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Deepgram (placeholder)
  // ===========================================================================

  /**
   * Transcribe with Deepgram
   */
  private async transcribeWithDeepgram(
    audioSource: ArrayBuffer | string,
    options?: TranscriptionOptions
  ): Promise<ContentProviderResult<TranscriptionResult>> {
    // Deepgram implementation would go here
    // Similar pattern to AssemblyAI
    return {
      success: false,
      error: 'Deepgram provider not yet implemented',
      cached: false,
      fetchedAt: Date.now(),
    };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get current provider
   */
  getProvider(): string {
    return this.config.provider;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createTranscriptionProvider(config?: TranscriptionConfig): TranscriptionProvider {
  return new TranscriptionProvider(config);
}
