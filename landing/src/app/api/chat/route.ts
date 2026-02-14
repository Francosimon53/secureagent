import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// System prompt for SecureAgent
const SYSTEM_PROMPT = `You are SecureAgent, an enterprise-grade AI assistant.

Your capabilities:
- Answer questions clearly and helpfully
- Summarize text and documents
- Explain complex topics simply
- Translate content between languages
- Rewrite and improve text
- Help with coding and technical questions
- Assist with productivity tasks

Your personality:
- Professional but friendly
- Concise but thorough
- Security-conscious
- Helpful and proactive

Always respond in the same language the user writes in.
If asked about your capabilities, explain what SecureAgent can do.
Never pretend to have capabilities you don't have.`;

interface ChatRequest {
  message: string;
  conversationId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  action?: 'chat' | 'summarize' | 'translate' | 'explain' | 'rewrite';
  context?: {
    pageUrl?: string;
    pageTitle?: string;
    selectedText?: string;
  };
}

interface ChatResponse {
  id: string;
  message: string;
  conversationId: string;
  timestamp: number;
}

// Build prompt based on action and context
function buildPrompt(message: string, action?: string, context?: ChatRequest['context']): string {
  if (action === 'summarize' && context?.selectedText) {
    return `Please summarize the following text concisely:\n\n${context.selectedText}`;
  }
  
  if (action === 'translate' && context?.selectedText) {
    return `Please translate the following text. Detect the source language and translate to English (or to Spanish if it's already in English):\n\n${context.selectedText}`;
  }
  
  if (action === 'explain' && context?.selectedText) {
    return `Please explain the following text in simple terms:\n\n${context.selectedText}`;
  }
  
  if (action === 'rewrite' && context?.selectedText) {
    return `Please rewrite the following text to be clearer and more professional:\n\n${context.selectedText}`;
  }
  
  // Add page context if available
  if (context?.pageTitle && context?.pageUrl) {
    return `[Context: User is on page ${context.pageTitle} at ${context.pageUrl}]\n\nUser: ${message}`;
  }
  
  return message;
}

export async function POST(request: Request) {
  try {
    // Check API key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI service not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { message, conversationId, history, action, context } = body as ChatRequest;

    // Validate request
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (message.length > 10000) {
      return NextResponse.json(
        { error: 'Message too long (max 10000 characters)' },
        { status: 400 }
      );
    }

    // Build the prompt
    const userPrompt = buildPrompt(message, action, context);

    // Build messages array with history
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    
    if (history && Array.isArray(history)) {
      // Add last 10 messages for context
      const recentHistory = history.slice(-10);
      messages.push(...recentHistory);
    }
    
    messages.push({ role: 'user', content: userPrompt });

    // Call Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    // Extract text response
    const textContent = response.content.find(block => block.type === 'text');
    const assistantMessage = textContent?.type === 'text' ? textContent.text : 'I apologize, but I could not generate a response.';

    const chatResponse: ChatResponse = {
      id: crypto.randomUUID(),
      message: assistantMessage,
      conversationId: conversationId || crypto.randomUUID(),
      timestamp: Date.now(),
    };

    return NextResponse.json(chatResponse);
    
  } catch (error) {
    console.error('Chat error:', error);
    
    // Handle specific Anthropic errors
    if (error instanceof Anthropic.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'AI service authentication failed. Please contact support.' },
          { status: 503 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again in a moment.' },
          { status: 429 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to process chat message. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'SecureAgent Chat API',
    version: '2.0.0',
    status: process.env.ANTHROPIC_API_KEY ? 'ready' : 'not_configured',
    endpoints: {
      'POST /api/chat': {
        description: 'Send a chat message',
        body: {
          message: 'string (required)',
          conversationId: 'string (optional)',
          history: 'array of {role, content} (optional)',
          action: 'chat | summarize | translate | explain | rewrite (optional)',
          context: {
            pageUrl: 'string (optional)',
            pageTitle: 'string (optional)',
            selectedText: 'string (optional)',
          },
        },
      },
    },
  });
}
