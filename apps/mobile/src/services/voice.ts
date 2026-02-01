/**
 * SecureAgent Mobile - Voice Input Service
 */

import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from '@react-native-voice/voice';
import { Platform } from 'react-native';

export interface VoiceState {
  isListening: boolean;
  results: string[];
  error: string | null;
}

type VoiceCallback = (state: VoiceState) => void;

class VoiceService {
  private isInitialized = false;
  private callback: VoiceCallback | null = null;
  private state: VoiceState = {
    isListening: false,
    results: [],
    error: null,
  };

  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      Voice.onSpeechStart = this.onSpeechStart.bind(this);
      Voice.onSpeechEnd = this.onSpeechEnd.bind(this);
      Voice.onSpeechResults = this.onSpeechResults.bind(this);
      Voice.onSpeechError = this.onSpeechError.bind(this);
      Voice.onSpeechPartialResults = this.onSpeechPartialResults.bind(this);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize voice:', error);
      return false;
    }
  }

  setCallback(callback: VoiceCallback): void {
    this.callback = callback;
  }

  private updateState(updates: Partial<VoiceState>): void {
    this.state = { ...this.state, ...updates };
    this.callback?.(this.state);
  }

  private onSpeechStart(): void {
    this.updateState({ isListening: true, error: null });
  }

  private onSpeechEnd(): void {
    this.updateState({ isListening: false });
  }

  private onSpeechResults(event: SpeechResultsEvent): void {
    const results = event.value || [];
    this.updateState({ results, isListening: false });
  }

  private onSpeechPartialResults(event: SpeechResultsEvent): void {
    const results = event.value || [];
    this.updateState({ results });
  }

  private onSpeechError(event: SpeechErrorEvent): void {
    console.error('Speech error:', event.error);
    this.updateState({
      error: event.error?.message || 'Speech recognition error',
      isListening: false,
    });
  }

  async startListening(): Promise<boolean> {
    if (!this.isInitialized) {
      const success = await this.initialize();
      if (!success) return false;
    }

    try {
      await Voice.start(Platform.OS === 'ios' ? 'en-US' : 'en_US');
      return true;
    } catch (error) {
      console.error('Failed to start voice:', error);
      this.updateState({
        error: error instanceof Error ? error.message : 'Failed to start',
        isListening: false,
      });
      return false;
    }
  }

  async stopListening(): Promise<void> {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Failed to stop voice:', error);
    }
  }

  async cancelListening(): Promise<void> {
    try {
      await Voice.cancel();
      this.updateState({ isListening: false, results: [] });
    } catch (error) {
      console.error('Failed to cancel voice:', error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await Voice.isAvailable();
    } catch {
      return false;
    }
  }

  destroy(): void {
    Voice.destroy().then(Voice.removeAllListeners);
    this.isInitialized = false;
  }
}

export const voice = new VoiceService();
