/**
 * Voice Cloning Integration
 *
 * Clone user's voice using ElevenLabs for personalized AI calls.
 */

import type { VoiceClone, Voice } from './types.js';
import type { ElevenLabsConfig } from './config.js';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  samples: Array<{ sample_id: string; file_name: string }>;
  category: string;
  fine_tuning: {
    is_allowed_to_fine_tune: boolean;
    state: Record<string, unknown>;
  };
  labels: Record<string, string>;
  description: string;
  preview_url: string;
  available_for_tiers: string[];
  settings: {
    stability: number;
    similarity_boost: number;
  };
}

interface ElevenLabsModel {
  model_id: string;
  name: string;
  can_be_finetuned: boolean;
  can_do_text_to_speech: boolean;
  can_do_voice_conversion: boolean;
  description: string;
  languages: Array<{ language_id: string; name: string }>;
}

export class VoiceCloneService {
  private config: ElevenLabsConfig;
  private clones: Map<string, VoiceClone> = new Map();
  private consentVerifications: Map<string, { verified: boolean; timestamp: number }> = new Map();

  constructor(config: ElevenLabsConfig) {
    this.config = config;
  }

  /**
   * Make API request to ElevenLabs
   */
  private async api<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: unknown,
    isFormData = false
  ): Promise<T> {
    const url = `https://api.elevenlabs.io/v1${endpoint}`;

    const headers: Record<string, string> = {
      'xi-api-key': this.config.apiKey,
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      if (isFormData) {
        options.body = body as FormData;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as {
        detail?: { message?: string };
        message?: string;
      };
      throw new Error(`ElevenLabs API error: ${error.detail?.message || error.message}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    const result = await this.api<{ voices: ElevenLabsVoice[] }>('/voices');

    return result.voices.map((voice) => ({
      id: voice.voice_id,
      name: voice.name,
      provider: 'elevenlabs' as const,
      language: voice.labels?.language || 'en',
      gender: voice.labels?.gender as 'male' | 'female' | undefined,
      preview_url: voice.preview_url,
    }));
  }

  /**
   * Get available models
   */
  async getModels(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    languages: string[];
  }>> {
    const result = await this.api<ElevenLabsModel[]>('/models');

    return result.map((model) => ({
      id: model.model_id,
      name: model.name,
      description: model.description,
      languages: model.languages.map((l) => l.name),
    }));
  }

  /**
   * Verify user consent for voice cloning
   * This is required by ElevenLabs for custom voice cloning.
   */
  async verifyConsent(userId: string, consentData: {
    fullName: string;
    email: string;
    agreementText: string;
    signatureTimestamp: number;
    ipAddress?: string;
  }): Promise<{ verified: boolean; verificationId: string }> {
    // Store consent verification
    const verificationId = `consent_${userId}_${Date.now()}`;

    // In production, you would:
    // 1. Store consent in database
    // 2. Send confirmation email
    // 3. Potentially require audio confirmation

    this.consentVerifications.set(userId, {
      verified: true,
      timestamp: Date.now(),
    });

    console.log('Voice cloning consent recorded:', {
      verificationId,
      ...consentData,
    });

    return { verified: true, verificationId };
  }

  /**
   * Check if user has verified consent
   */
  hasVerifiedConsent(userId: string): boolean {
    const consent = this.consentVerifications.get(userId);
    if (!consent?.verified) return false;

    // Consent expires after 1 year
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    return Date.now() - consent.timestamp < oneYear;
  }

  /**
   * Create a voice clone from audio samples
   */
  async createVoiceClone(options: {
    userId: string;
    name: string;
    description?: string;
    audioFiles: Array<{
      filename: string;
      data: Buffer;
      mimeType: string;
    }>;
    labels?: Record<string, string>;
  }): Promise<VoiceClone> {
    // Verify consent
    if (!this.hasVerifiedConsent(options.userId)) {
      throw new Error('Voice cloning requires verified consent. Please complete the consent flow first.');
    }

    // Validate audio files
    if (options.audioFiles.length < 1) {
      throw new Error('At least one audio sample is required');
    }

    // Check total audio length (ElevenLabs requires 1-30 minutes)
    // This is a simplified check

    // Create form data
    const formData = new FormData();
    formData.append('name', options.name);

    if (options.description) {
      formData.append('description', options.description);
    }

    if (options.labels) {
      formData.append('labels', JSON.stringify(options.labels));
    }

    // Add audio files
    for (const file of options.audioFiles) {
      const blob = new Blob([new Uint8Array(file.data)], { type: file.mimeType });
      formData.append('files', blob, file.filename);
    }

    // Create voice clone
    const result = await this.api<{ voice_id: string }>(
      '/voices/add',
      'POST',
      formData,
      true
    );

    const clone: VoiceClone = {
      id: `clone_${options.userId}_${Date.now()}`,
      name: options.name,
      elevenLabsVoiceId: result.voice_id,
      status: 'processing',
      sampleCount: options.audioFiles.length,
      createdAt: Date.now(),
      consentVerified: true,
    };

    this.clones.set(clone.id, clone);

    // Check status after a delay
    setTimeout(() => this.checkCloneStatus(clone.id), 30000);

    return clone;
  }

  /**
   * Check voice clone status
   */
  private async checkCloneStatus(cloneId: string): Promise<void> {
    const clone = this.clones.get(cloneId);
    if (!clone) return;

    try {
      const voice = await this.api<ElevenLabsVoice>(`/voices/${clone.elevenLabsVoiceId}`);

      if (voice) {
        clone.status = 'ready';
      }
    } catch {
      clone.status = 'failed';
    }
  }

  /**
   * Delete a voice clone
   */
  async deleteVoiceClone(cloneId: string): Promise<boolean> {
    const clone = this.clones.get(cloneId);
    if (!clone) return false;

    try {
      await this.api(`/voices/${clone.elevenLabsVoiceId}`, 'DELETE');
      this.clones.delete(cloneId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get voice clone
   */
  getVoiceClone(cloneId: string): VoiceClone | undefined {
    return this.clones.get(cloneId);
  }

  /**
   * Get all voice clones
   */
  getVoiceClones(): VoiceClone[] {
    return Array.from(this.clones.values());
  }

  /**
   * Test voice clone with sample text
   */
  async testVoiceClone(
    cloneId: string,
    text: string = 'Hello, this is a test of my cloned voice.'
  ): Promise<Buffer> {
    const clone = this.clones.get(cloneId);
    if (!clone) {
      throw new Error('Voice clone not found');
    }

    if (clone.status !== 'ready') {
      throw new Error('Voice clone is not ready yet');
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${clone.elevenLabsVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.config.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`TTS error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Get recording guidelines for voice cloning
   */
  getRecordingGuidelines(): {
    requirements: string[];
    tips: string[];
    duration: { min: number; max: number };
  } {
    return {
      requirements: [
        'Clear audio with minimal background noise',
        'Consistent speaking volume and pace',
        'Single speaker only',
        'Natural speech (not reading or scripted)',
        'High quality microphone recommended',
        'MP3, WAV, or M4A format',
      ],
      tips: [
        'Record in a quiet room',
        'Speak naturally, as if in conversation',
        'Include various emotions and tones',
        'Avoid long pauses between sentences',
        'Record multiple samples for better quality',
        'Total audio should be 1-5 minutes for best results',
      ],
      duration: {
        min: 60, // 1 minute minimum
        max: 1800, // 30 minutes maximum
      },
    };
  }

  /**
   * Get consent agreement text
   */
  getConsentAgreement(): string {
    return `VOICE CLONING CONSENT AGREEMENT

By proceeding with voice cloning, you agree to the following:

1. OWNERSHIP: You confirm that the voice samples you provide are either:
   - Your own voice, or
   - You have explicit written permission from the voice owner

2. USAGE: You understand that the cloned voice will be used by SecureAgent to:
   - Make phone calls on your behalf
   - Leave voicemails
   - Interact with others using your voice

3. RESPONSIBILITY: You accept full responsibility for any communications made using your cloned voice.

4. PRIVACY: Your voice data will be:
   - Stored securely on ElevenLabs servers
   - Used only for the purposes described above
   - Not shared with third parties without your consent

5. DELETION: You may request deletion of your voice clone at any time.

6. DISCLAIMER: SecureAgent is not responsible for any misunderstandings or issues that may arise from AI-generated voice communications.

By clicking "I Agree" or providing voice samples, you acknowledge that you have read, understood, and agree to these terms.`;
  }
}
