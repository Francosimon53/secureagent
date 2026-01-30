/**
 * SecureAgent Chat API Endpoint
 *
 * Uses Claude/Anthropic to process messages and generate responses.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  return new Anthropic({ apiKey });
};

// Conversation storage (in-memory for demo - resets on cold start)
const conversations = new Map<string, Anthropic.MessageParam[]>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Use POST to send messages',
    });
  }

  try {
    const { message, conversationId, systemPrompt } = req.body as {
      message?: string;
      conversationId?: string;
      systemPrompt?: string;
    };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message is required',
      });
    }

    const client = getClient();
    const convId = conversationId || 'default';

    // Get or create conversation history
    let history = conversations.get(convId) || [];

    // Add user message to history
    history.push({
      role: 'user',
      content: message,
    });

    // Call Claude
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt || 'You are SecureAgent, a helpful and secure AI assistant. Be concise and helpful.',
      messages: history,
    });

    // Extract text response
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Add assistant response to history
    history.push({
      role: 'assistant',
      content: textContent,
    });

    // Keep only last 20 messages to prevent token overflow
    if (history.length > 20) {
      history = history.slice(-20);
    }

    // Store updated history
    conversations.set(convId, history);

    return res.status(200).json({
      response: textContent,
      conversationId: convId,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);

    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        return res.status(500).json({
          error: 'Configuration Error',
          message: 'Invalid API key configured',
        });
      }
      if (error.status === 429) {
        return res.status(429).json({
          error: 'Rate Limited',
          message: 'Too many requests. Please try again later.',
        });
      }
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
