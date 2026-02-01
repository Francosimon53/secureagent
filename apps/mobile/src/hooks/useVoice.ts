/**
 * SecureAgent Mobile - Voice Input Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { voice, VoiceState } from '../services/voice';

interface UseVoiceReturn {
  isListening: boolean;
  transcript: string;
  error: string | null;
  isAvailable: boolean;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  cancelListening: () => Promise<void>;
}

export function useVoice(): UseVoiceReturn {
  const [state, setState] = useState<VoiceState>({
    isListening: false,
    results: [],
    error: null,
  });
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    voice.setCallback(setState);
    voice.isAvailable().then(setIsAvailable);

    return () => {
      voice.destroy();
    };
  }, []);

  const startListening = useCallback(async () => {
    await voice.startListening();
  }, []);

  const stopListening = useCallback(async () => {
    await voice.stopListening();
  }, []);

  const cancelListening = useCallback(async () => {
    await voice.cancelListening();
  }, []);

  return {
    isListening: state.isListening,
    transcript: state.results[0] || '',
    error: state.error,
    isAvailable,
    startListening,
    stopListening,
    cancelListening,
  };
}
