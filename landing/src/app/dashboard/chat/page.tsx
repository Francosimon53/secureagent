'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// Web Speech API type declarations
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  audioLoading?: boolean;
}

interface ElevenLabsVoice {
  key: string;
  id: string;
  name: string;
  description: string;
}

type VoiceState = 'off' | 'listening' | 'wake-detected' | 'command' | 'processing';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://secureagent.vercel.app';

// Wake word variations to detect
const WAKE_WORDS = [
  'hey secure agent',
  'hey secureagent',
  'hey secure',
  'a secure agent',
  'hey agent',
  'secure agent',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Voice recognition state
  const [voiceState, setVoiceState] = useState<VoiceState>('off');
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const voiceStateRef = useRef<VoiceState>('off');

  // ElevenLabs TTS state
  const [elevenLabsEnabled, setElevenLabsEnabled] = useState(false);
  const [elevenLabsReady, setElevenLabsReady] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('rachel');
  const [availableVoices, setAvailableVoices] = useState<ElevenLabsVoice[]>([]);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  // Fetch ElevenLabs voices on mount
  useEffect(() => {
    const fetchVoices = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/elevenlabs`);
        if (res.ok) {
          const data = await res.json();
          if (data.status?.ready) {
            setElevenLabsReady(true);
            setAvailableVoices(data.featuredVoices || []);
          }
        }
      } catch (error) {
        console.error('Failed to fetch ElevenLabs voices:', error);
      }
    };
    fetchVoices();
  }, []);

  // Check for voice support
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setVoiceSupported(!!SpeechRecognition);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Generate speech using ElevenLabs
  const generateSpeech = useCallback(async (messageId: string, text: string) => {
    if (!elevenLabsEnabled || !elevenLabsReady) return;

    // Update message to show loading
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, audioLoading: true } : m
    ));

    try {
      const res = await fetch(`${API_BASE}/api/elevenlabs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.slice(0, 2000), // Limit text length
          voice: selectedVoice,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate speech');
      }

      const data = await res.json();

      if (data.audio) {
        // Convert base64 to blob URL
        const audioBlob = await fetch(`data:audio/mpeg;base64,${data.audio}`).then(r => r.blob());
        const audioUrl = URL.createObjectURL(audioBlob);

        // Update message with audio URL
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, audioUrl, audioLoading: false } : m
        ));

        // Auto-play if enabled
        if (autoPlay) {
          // Stop any currently playing audio
          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
          }

          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;
          audio.play().catch(console.error);
        }
      }
    } catch (error) {
      console.error('ElevenLabs TTS error:', error);
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, audioLoading: false } : m
      ));
    }
  }, [elevenLabsEnabled, elevenLabsReady, selectedVoice, autoPlay]);

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    if (!messageText) setInput('');
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          conversationId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || errorData.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.conversationId) {
        setConversationId(data.conversationId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || data.error || 'No response received',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Generate ElevenLabs speech if enabled
      if (elevenLabsEnabled && elevenLabsReady) {
        generateSpeech(assistantMessage.id, assistantMessage.content);
      }
      // Fall back to browser TTS if voice wake is active
      else if (voiceState !== 'off' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(assistantMessage.content);
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.onend = () => {
          // Resume listening after speaking
          setVoiceState('listening');
        };
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to connect to the server. Please check your connection.'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversationId, voiceState, elevenLabsEnabled, elevenLabsReady, generateSpeech]);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    if (!voiceSupported) return null;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setVoiceError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentTranscript = (finalTranscript || interimTranscript).toLowerCase().trim();
      setTranscript(currentTranscript);

      // Check for wake word when in listening mode
      if (voiceState === 'listening') {
        const hasWakeWord = WAKE_WORDS.some(wake => currentTranscript.includes(wake));
        if (hasWakeWord) {
          setVoiceState('wake-detected');
          setTranscript('');

          // Play a sound or visual feedback
          if ('speechSynthesis' in window) {
            const ack = new SpeechSynthesisUtterance('Yes?');
            ack.rate = 1.2;
            ack.pitch = 1.1;
            ack.onend = () => {
              setVoiceState('command');
              // Set timeout for command
              if (commandTimeoutRef.current) {
                clearTimeout(commandTimeoutRef.current);
              }
              commandTimeoutRef.current = setTimeout(() => {
                setVoiceState('listening');
                setTranscript('');
              }, 10000); // 10 second timeout for command
            };
            window.speechSynthesis.speak(ack);
          } else {
            setVoiceState('command');
          }
        }
      }

      // Process command when in command mode and we have a final result
      if (voiceState === 'command' && finalTranscript) {
        const command = finalTranscript.trim();
        if (command.length > 2) {
          if (commandTimeoutRef.current) {
            clearTimeout(commandTimeoutRef.current);
          }
          setVoiceState('processing');
          setTranscript('');
          sendMessage(command);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        setVoiceError('Microphone access denied. Please allow microphone access.');
        setVoiceState('off');
      } else if (event.error === 'no-speech') {
        // Restart recognition if no speech detected
        if (voiceStateRef.current === 'listening' || voiceStateRef.current === 'command') {
          recognition.stop();
          setTimeout(() => {
            if (voiceStateRef.current !== 'off') {
              try { recognition.start(); } catch { /* ignore */ }
            }
          }, 100);
        }
      } else {
        setVoiceError(`Voice error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Restart if still supposed to be listening
      if (voiceStateRef.current === 'listening' || voiceStateRef.current === 'command') {
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            // Already started
          }
        }, 100);
      }
    };

    return recognition;
  }, [voiceSupported, voiceState, sendMessage]);

  // Start/stop voice recognition
  const toggleVoice = useCallback(() => {
    if (voiceState === 'off') {
      const recognition = initRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        try {
          recognition.start();
          setVoiceState('listening');
          setVoiceError(null);
        } catch (e) {
          setVoiceError('Failed to start voice recognition');
        }
      }
    } else {
      // Stop recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
      }
      window.speechSynthesis?.cancel();
      setVoiceState('off');
      setTranscript('');
    }
  }, [voiceState, initRecognition]);

  // Update recognition handlers when state changes
  useEffect(() => {
    if (recognitionRef.current && voiceState !== 'off') {
      const recognition = recognitionRef.current;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const currentTranscript = (finalTranscript || interimTranscript).toLowerCase().trim();
        setTranscript(finalTranscript || interimTranscript);

        if (voiceState === 'listening') {
          const hasWakeWord = WAKE_WORDS.some(wake => currentTranscript.includes(wake));
          if (hasWakeWord) {
            setVoiceState('wake-detected');
            setTranscript('');

            if ('speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const ack = new SpeechSynthesisUtterance('Yes?');
              ack.rate = 1.2;
              ack.pitch = 1.1;
              ack.onend = () => {
                setVoiceState('command');
                if (commandTimeoutRef.current) {
                  clearTimeout(commandTimeoutRef.current);
                }
                commandTimeoutRef.current = setTimeout(() => {
                  setVoiceState('listening');
                  setTranscript('');
                }, 10000);
              };
              window.speechSynthesis.speak(ack);
            } else {
              setVoiceState('command');
            }
          }
        }

        if (voiceState === 'command' && finalTranscript) {
          const command = finalTranscript.trim();
          if (command.length > 2) {
            if (commandTimeoutRef.current) {
              clearTimeout(commandTimeoutRef.current);
            }
            setVoiceState('processing');
            setTranscript('');
            sendMessage(command);
          }
        }
      };
    }
  }, [voiceState, sendMessage]);

  // Resume listening after processing
  useEffect(() => {
    if (voiceState === 'processing' && !isLoading) {
      // Wait a bit for TTS to finish
      const timer = setTimeout(() => {
        if (voiceState === 'processing') {
          setVoiceState('listening');
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [voiceState, isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
      }
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Close voice selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showVoiceSelector && !(e.target as Element).closest('.relative')) {
        setShowVoiceSelector(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showVoiceSelector]);

  const clearChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getVoiceButtonStyle = () => {
    switch (voiceState) {
      case 'listening':
        return 'bg-green-600 hover:bg-green-500 animate-pulse';
      case 'wake-detected':
        return 'bg-yellow-600 hover:bg-yellow-500';
      case 'command':
        return 'bg-blue-600 hover:bg-blue-500 animate-pulse';
      case 'processing':
        return 'bg-purple-600 hover:bg-purple-500';
      default:
        return 'bg-gray-700 hover:bg-gray-600';
    }
  };

  const getVoiceStateText = () => {
    switch (voiceState) {
      case 'listening':
        return 'Say "Hey SecureAgent"';
      case 'wake-detected':
        return 'Wake word detected!';
      case 'command':
        return 'Listening for command...';
      case 'processing':
        return 'Processing...';
      default:
        return 'Voice Off';
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Chat</h1>
          <p className="text-gray-400 text-sm">
            {conversationId ? `Session: ${conversationId.slice(0, 20)}...` : 'Start a conversation'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* ElevenLabs Voice Mode */}
          {elevenLabsReady && (
            <div className="relative">
              <button
                onClick={() => setShowVoiceSelector(!showVoiceSelector)}
                className={`px-4 py-2 rounded-lg text-white font-medium transition-all flex items-center gap-2 ${
                  elevenLabsEnabled
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-gray-700 hover:bg-gray-600'
                }`}
                title={elevenLabsEnabled ? 'ElevenLabs Voice On' : 'Enable ElevenLabs Voice'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828" />
                </svg>
                <span className="hidden sm:inline">
                  {elevenLabsEnabled ? availableVoices.find(v => v.key === selectedVoice)?.name || 'Voice' : 'TTS'}
                </span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Voice Selector Dropdown */}
              {showVoiceSelector && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">ElevenLabs Voice</span>
                      <button
                        onClick={() => setElevenLabsEnabled(!elevenLabsEnabled)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${
                          elevenLabsEnabled ? 'bg-purple-600' : 'bg-gray-600'
                        }`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          elevenLabsEnabled ? 'left-7' : 'left-1'
                        }`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-400">Auto-play responses</span>
                      <button
                        onClick={() => setAutoPlay(!autoPlay)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          autoPlay ? 'bg-blue-600' : 'bg-gray-600'
                        }`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          autoPlay ? 'left-5' : 'left-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {availableVoices.map((voice) => (
                      <button
                        key={voice.key}
                        onClick={() => {
                          setSelectedVoice(voice.key);
                          setShowVoiceSelector(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors flex items-center justify-between ${
                          selectedVoice === voice.key ? 'bg-gray-700' : ''
                        }`}
                      >
                        <div>
                          <p className="text-white font-medium">{voice.name}</p>
                          <p className="text-xs text-gray-400">{voice.description}</p>
                        </div>
                        {selectedVoice === voice.key && (
                          <svg className="w-5 h-5 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Voice Wake Button */}
          {voiceSupported && (
            <button
              onClick={toggleVoice}
              className={`px-4 py-2 rounded-lg text-white font-medium transition-all flex items-center gap-2 ${getVoiceButtonStyle()}`}
              title={getVoiceStateText()}
            >
              {voiceState === 'off' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              )}
              <span className="hidden sm:inline">
                {voiceState === 'off' ? 'Wake' : getVoiceStateText()}
              </span>
            </button>
          )}
          <button
            onClick={clearChat}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 transition-colors"
          >
            Clear Chat
          </button>
        </div>
      </div>

      {/* Voice Status Bar */}
      {voiceState !== 'off' && (
        <div className={`mb-4 p-3 rounded-xl border flex items-center justify-between ${
          voiceState === 'command'
            ? 'bg-blue-900/30 border-blue-500/50'
            : voiceState === 'wake-detected'
            ? 'bg-yellow-900/30 border-yellow-500/50'
            : voiceState === 'processing'
            ? 'bg-purple-900/30 border-purple-500/50'
            : 'bg-green-900/30 border-green-500/50'
        }`}>
          <div className="flex items-center gap-3">
            {/* Animated mic icon */}
            <div className="relative">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                voiceState === 'command' ? 'bg-blue-600' :
                voiceState === 'wake-detected' ? 'bg-yellow-600' :
                voiceState === 'processing' ? 'bg-purple-600' :
                'bg-green-600'
              }`}>
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
              {(voiceState === 'listening' || voiceState === 'command') && (
                <>
                  <div className="absolute inset-0 rounded-full bg-current opacity-25 animate-ping" />
                  <div className="absolute -inset-1 rounded-full border-2 border-current opacity-50 animate-pulse" />
                </>
              )}
            </div>
            <div>
              <p className="text-white font-medium">{getVoiceStateText()}</p>
              {transcript && (
                <p className="text-gray-300 text-sm truncate max-w-md">
                  "{transcript}"
                </p>
              )}
            </div>
          </div>
          {/* Sound wave visualization */}
          {(voiceState === 'listening' || voiceState === 'command') && (
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full ${
                    voiceState === 'command' ? 'bg-blue-400' : 'bg-green-400'
                  }`}
                  style={{
                    height: `${12 + Math.random() * 16}px`,
                    animation: `soundwave 0.5s ease-in-out infinite`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Voice Error */}
      {voiceError && (
        <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-500/50 text-red-300">
          {voiceError}
        </div>
      )}

      {/* Messages Container */}
      <div className="flex-1 bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <span className="text-6xl mb-4">💬</span>
              <p className="text-lg">Start chatting with SecureAgent</p>
              <p className="text-sm mt-2">Ask anything - I can help with questions, fetch data, and more!</p>
              {voiceSupported && (
                <p className="text-sm mt-4 text-blue-400">
                  🎤 Say "Hey SecureAgent" for voice commands
                </p>
              )}
              {elevenLabsReady && (
                <p className="text-sm mt-2 text-purple-400">
                  🔊 Enable TTS for natural voice responses
                </p>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-100 border border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {message.role === 'user' ? 'You' : '🛡️ SecureAgent'}
                    </span>
                    <span className="text-xs opacity-60">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{message.content}</p>

                  {/* Audio Controls for Assistant Messages */}
                  {message.role === 'assistant' && elevenLabsEnabled && elevenLabsReady && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      {message.audioLoading ? (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span>Generating voice...</span>
                        </div>
                      ) : message.audioUrl ? (
                        <div className="flex items-center gap-2">
                          <audio
                            src={message.audioUrl}
                            controls
                            className="h-8 w-full max-w-xs"
                            style={{ filter: 'invert(1)' }}
                          />
                          <button
                            onClick={() => {
                              const audio = new Audio(message.audioUrl);
                              if (currentAudioRef.current) {
                                currentAudioRef.current.pause();
                              }
                              currentAudioRef.current = audio;
                              audio.play();
                            }}
                            className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors"
                            title="Play again"
                          >
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => generateSpeech(message.id, message.content)}
                          className="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828" />
                          </svg>
                          <span>Generate voice</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">🛡️ SecureAgent</span>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Processing... Browser tasks may take up to 60s
                </p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={voiceState === 'command' ? 'Listening for voice command...' : 'Type your message...'}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 transition-colors"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-xl text-white font-medium transition-colors"
            >
              {isLoading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                'Send'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CSS for sound wave animation */}
      <style jsx>{`
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
