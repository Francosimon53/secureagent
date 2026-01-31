import type { VercelRequest, VercelResponse } from '@vercel/node';

// =============================================================================
// ElevenLabs Text-to-Speech API
// =============================================================================

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Available voices with their IDs
const VOICES = {
  rachel: { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'Calm, professional female' },
  drew: { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', description: 'Confident, articulate male' },
  clyde: { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', description: 'Deep, authoritative male' },
  paul: { id: '5Q0t7uMcjvnagumLfvZi', name: 'Paul', description: 'Warm, friendly male' },
  domi: { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'Strong, expressive female' },
  dave: { id: 'CYw3kZ02Hs0563khs1Fj', name: 'Dave', description: 'Conversational British male' },
  fin: { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin', description: 'Trustworthy Irish male' },
  sarah: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Soft, youthful female' },
  antoni: { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'Crisp, articulate male' },
  thomas: { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', description: 'Calm, thoughtful male' },
  charlie: { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', description: 'Natural Australian male' },
  george: { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Warm British male' },
  emily: { id: 'LcfcDJNUP1GQjkzn1xUU', name: 'Emily', description: 'Calm, clear female' },
  elli: { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'Emotional, expressive female' },
  callum: { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', description: 'Intense, transatlantic male' },
  patrick: { id: 'ODq5zmih8GrVes37Dizd', name: 'Patrick', description: 'Shouty, energetic male' },
  harry: { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', description: 'Anxious, British male' },
  liam: { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Articulate, neutral male' },
  dorothy: { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', description: 'Pleasant British female' },
  josh: { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', description: 'Deep, narrative male' },
  arnold: { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'Crisp, American male' },
  charlotte: { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', description: 'Swedish, seductive female' },
  matilda: { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Warm, friendly female' },
  matthew: { id: 'Yko7PKHZNXotIFUBG7I9', name: 'Matthew', description: 'Authoritative male' },
  james: { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James', description: 'Calm Australian male' },
  joseph: { id: 'Zlb1dXrM653N07WRdFW3', name: 'Joseph', description: 'British, middle-aged male' },
  jeremy: { id: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', description: 'Excited, Irish male' },
  michael: { id: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', description: 'Older, American male' },
  ethan: { id: 'g5CIjZEefAph4nQFvHAz', name: 'Ethan', description: 'Young, American male' },
  chris: { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', description: 'Casual American male' },
  gigi: { id: 'jBpfuIE2acCO8z3wKNLl', name: 'Gigi', description: 'Childlike, American female' },
  freya: { id: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', description: 'American female' },
  brian: { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Deep American male' },
  grace: { id: 'oWAxZDx7w5VEj9dCyTzz', name: 'Grace', description: 'Southern American female' },
  daniel: { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Authoritative British male' },
  lily: { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', description: 'Warm British female' },
  serena: { id: 'pMsXgVXv3BLzUgSXRplE', name: 'Serena', description: 'Pleasant American female' },
  adam: { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'Deep, narrative male' },
  nicole: { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole', description: 'Soft, whisper female' },
  jessie: { id: 't0jbNlBVZ17f02VDIeMI', name: 'Jessie', description: 'Fast-talking, raspy male' },
  ryan: { id: 'wViXBPUzp2ZZixB1xQuM', name: 'Ryan', description: 'Upbeat American male' },
  sam: { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'Dynamic, raspy male' },
  glinda: { id: 'z9fAnlkpzviPz146aGWa', name: 'Glinda', description: 'Witchy, American female' },
  giovanni: { id: 'zcAOhNBS3c14rBihAFp1', name: 'Giovanni', description: 'Italian, deep male' },
  mimi: { id: 'zrHiDhphv9ZnVXBqCLjz', name: 'Mimi', description: 'Childlike, Swedish female' },
} as const;

// Default voices for quick selection
const FEATURED_VOICES = ['rachel', 'adam', 'sarah', 'josh', 'emily', 'brian'] as const;

interface TextToSpeechRequest {
  text: string;
  voice?: string;
  model?: string;
  stability?: number;
  similarity_boost?: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Return available voices and status
  if (req.method === 'GET') {
    const featuredVoices = FEATURED_VOICES.map(key => ({
      key,
      ...VOICES[key],
    }));

    const allVoices = Object.entries(VOICES).map(([key, voice]) => ({
      key,
      ...voice,
    }));

    res.status(200).json({
      name: 'SecureAgent ElevenLabs TTS',
      version: '1.0.0',
      status: {
        apiKeyConfigured: !!ELEVENLABS_API_KEY,
        ready: !!ELEVENLABS_API_KEY,
      },
      featuredVoices,
      allVoices,
      models: [
        { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Best quality, supports 29 languages' },
        { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Low latency, English optimized' },
        { id: 'eleven_turbo_v2', name: 'Turbo v2', description: 'Fast generation' },
      ],
      setup: {
        step1: 'Sign up at https://elevenlabs.io',
        step2: 'Get your API key from Profile Settings',
        step3: 'Set ELEVENLABS_API_KEY environment variable in Vercel',
      },
    });
    return;
  }

  // POST - Generate speech
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!ELEVENLABS_API_KEY) {
    res.status(503).json({
      error: 'ElevenLabs API not configured',
      message: 'Please set ELEVENLABS_API_KEY environment variable',
    });
    return;
  }

  try {
    const body: TextToSpeechRequest = req.body;

    if (!body.text || body.text.trim().length === 0) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    // Limit text length to prevent abuse
    const text = body.text.slice(0, 5000);

    // Get voice ID
    const voiceKey = body.voice || 'rachel';
    const voice = VOICES[voiceKey as keyof typeof VOICES];
    const voiceId = voice?.id || VOICES.rachel.id;

    // Model selection
    const model = body.model || 'eleven_turbo_v2_5';

    // Voice settings
    const stability = body.stability ?? 0.5;
    const similarityBoost = body.similarity_boost ?? 0.75;

    // Call ElevenLabs API
    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);

      if (response.status === 401) {
        res.status(401).json({ error: 'Invalid ElevenLabs API key' });
        return;
      }

      if (response.status === 429) {
        res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
        return;
      }

      res.status(response.status).json({
        error: 'ElevenLabs API error',
        message: errorText,
      });
      return;
    }

    // Get audio as buffer
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // Return as base64 encoded audio
    res.status(200).json({
      success: true,
      audio: audioBase64,
      contentType: 'audio/mpeg',
      voice: voiceKey,
      voiceName: voice?.name || 'Rachel',
      model,
      textLength: text.length,
    });
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    res.status(500).json({
      error: 'Failed to generate speech',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
