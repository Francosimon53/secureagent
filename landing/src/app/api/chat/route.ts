import { NextResponse } from 'next/server';

interface ChatRequest {
  message: string;
  conversationId?: string;
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

// Simple response generation (in production, connect to actual AI API)
function generateResponse(message: string, action?: string, context?: ChatRequest['context']): string {
  const lowerMessage = message.toLowerCase();

  // Handle specific actions
  if (action === 'summarize' && context?.selectedText) {
    return generateSummary(context.selectedText);
  }

  if (action === 'translate' && context?.selectedText) {
    return `**Translation:**\n\n"${context.selectedText}"\n\n*Note: This is a demo. In production, this would use a translation API to translate the text.*`;
  }

  if (action === 'explain' && context?.selectedText) {
    return generateExplanation(context.selectedText);
  }

  if (action === 'rewrite' && context?.selectedText) {
    return `**Rewritten:**\n\n${rewriteText(context.selectedText)}`;
  }

  // Handle page summarization
  if (lowerMessage.includes('summarize') && lowerMessage.includes('page')) {
    return `I'd be happy to summarize this page for you.\n\n**Page:** ${context?.pageTitle || 'Current page'}\n\nTo get a full summary, please select the text you'd like me to summarize, or I can provide general information about the page content.`;
  }

  // Handle greetings
  if (lowerMessage.match(/^(hi|hello|hey|greetings)/)) {
    return "Hello! I'm SecureAgent, your AI assistant. I can help you:\n\n- **Summarize** text or web pages\n- **Explain** complex topics\n- **Translate** content\n- **Rewrite** text for clarity\n\nJust select text on any webpage and ask me about it, or type your question here!";
  }

  // Handle help requests
  if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
    return "I'm SecureAgent, and I can assist you with:\n\n1. **Text Selection**: Highlight text on any webpage, then ask me to explain, translate, or summarize it\n2. **Page Summaries**: Click 'Summarize Page' to get key points\n3. **Quick Actions**: Use the buttons above for common tasks\n4. **Chat**: Ask me anything!\n\n**Tips:**\n- Right-click on selected text for quick actions\n- Use keyboard shortcut Ctrl+Shift+S to open me quickly";
  }

  // Handle code-related questions
  if (lowerMessage.includes('code') || lowerMessage.includes('function') || lowerMessage.includes('program')) {
    return `I can help with coding questions!\n\nFor the best results:\n1. Share the specific code you're working with\n2. Describe what you're trying to achieve\n3. Mention any error messages\n\nI'm ready to assist with debugging, explaining code, or suggesting improvements.`;
  }

  // Default conversational response
  return generateConversationalResponse(message);
}

function generateSummary(text: string): string {
  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;

  if (words < 20) {
    return `This is a brief text with ${words} words. Here's what it says:\n\n> ${text}`;
  }

  // Extract key phrases (simplified)
  const keyPhrases = text
    .split(/[.!?]+/)
    .filter(s => s.trim().length > 20)
    .slice(0, 3)
    .map(s => s.trim());

  return `**Summary** (${words} words, ${sentences} sentences)\n\n**Key Points:**\n${keyPhrases.map(p => `- ${p.substring(0, 100)}...`).join('\n')}\n\n*This is a demo summary. In production, this would use AI to generate a comprehensive summary.*`;
}

function generateExplanation(text: string): string {
  const words = text.split(/\s+/).length;

  if (words < 5) {
    return `**"${text}"**\n\nThis appears to be a term or short phrase. To provide a detailed explanation, I would typically:\n\n1. Define the term\n2. Provide context and examples\n3. Explain related concepts\n\n*In production, this would connect to an AI model for comprehensive explanations.*`;
  }

  return `**Explanation:**\n\nYou've asked about:\n> "${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"\n\n**Analysis:**\nThis text contains ${words} words and discusses a specific topic. A thorough explanation would break down:\n\n1. **Main concepts** - The key ideas presented\n2. **Context** - Background information\n3. **Implications** - What this means in practice\n\n*This is a demo. In production, I would provide a detailed AI-powered explanation.*`;
}

function rewriteText(text: string): string {
  // Simple rewrite (capitalize sentences properly, clean up spacing)
  const cleaned = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map(sentence => {
      const trimmed = sentence.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    })
    .join(' ');

  return `${cleaned}\n\n*This is a basic cleanup. In production, I would use AI to improve clarity, tone, and structure while preserving the original meaning.*`;
}

function generateConversationalResponse(message: string): string {
  const responses = [
    "That's an interesting question! Let me think about this.",
    "I understand what you're asking. Here's my perspective:",
    "Great question! I'd be happy to help with that.",
  ];

  const randomResponse = responses[Math.floor(Math.random() * responses.length)];

  return `${randomResponse}\n\nYou asked: "${message}"\n\nI'm a demo version of SecureAgent. In production, I would:\n\n1. **Analyze** your question thoroughly\n2. **Search** relevant knowledge bases\n3. **Provide** a comprehensive, accurate response\n\nFor now, try using the quick actions (Summarize, Translate, Explain, Rewrite) with selected text for the best experience!`;
}

export async function POST(request: Request) {
  try {
    // Check for API key (optional for demo)
    const authHeader = request.headers.get('authorization');
    const apiKey = authHeader?.replace('Bearer ', '');

    // In production, validate API key here
    // For demo, we'll accept any key or no key

    const body = await request.json();
    const { message, conversationId, action, context } = body as ChatRequest;

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

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

    // Generate response
    const response = generateResponse(message, action, context);

    const chatResponse: ChatResponse = {
      id: crypto.randomUUID(),
      message: response,
      conversationId: conversationId || crypto.randomUUID(),
      timestamp: Date.now(),
    };

    return NextResponse.json(chatResponse);
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat message' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'SecureAgent Chat API',
    version: '1.0.0',
    endpoints: {
      'POST /api/chat': {
        description: 'Send a chat message',
        body: {
          message: 'string (required)',
          conversationId: 'string (optional)',
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
