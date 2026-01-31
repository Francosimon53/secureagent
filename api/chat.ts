/**
 * SecureAgent Chat API Endpoint
 *
 * Uses Claude/Anthropic to process messages and generate responses.
 * Supports multiple AI agents with different personalities and specializations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Multi-Agent Configuration
// ============================================================================

export interface AgentConfig {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  keywords: string[]; // Keywords for auto-routing
  color: string; // UI accent color
}

export const AGENTS: Record<string, AgentConfig> = {
  general: {
    id: 'general',
    name: 'General Assistant',
    emoji: '🛡️',
    description: 'Your helpful all-purpose assistant',
    color: '#3B82F6', // blue
    keywords: ['help', 'what', 'how', 'why', 'explain', 'tell me', 'can you'],
    systemPrompt: `You are SecureAgent, a helpful, friendly, and secure AI assistant.
You provide clear, accurate, and concise answers to questions on any topic.
Be conversational but informative. Help users with general questions, daily tasks, and provide guidance.
Always be helpful while maintaining a professional yet approachable tone.`,
  },

  code: {
    id: 'code',
    name: 'Code Helper',
    emoji: '💻',
    description: 'Programming, debugging, and technical help',
    color: '#10B981', // green
    keywords: [
      'code', 'coding', 'program', 'programming', 'debug', 'debugging', 'bug', 'error',
      'function', 'class', 'method', 'api', 'javascript', 'python', 'typescript',
      'react', 'node', 'sql', 'database', 'git', 'github', 'deploy', 'build',
      'compile', 'syntax', 'variable', 'array', 'object', 'loop', 'algorithm',
      'data structure', 'fix this', 'refactor', 'optimize', 'implement', 'create a function',
      'write code', 'script', 'html', 'css', 'frontend', 'backend', 'fullstack',
    ],
    systemPrompt: `You are SecureAgent Code Helper, an expert programming assistant.
You excel at:
- Writing clean, efficient, and well-documented code
- Debugging and fixing errors with clear explanations
- Explaining programming concepts and best practices
- Reviewing code and suggesting improvements
- Helping with system design and architecture

Always provide code examples when helpful. Use markdown code blocks with proper language tags.
Explain your reasoning and suggest best practices. Be thorough but concise.
If you write code, make it production-ready with proper error handling.`,
  },

  research: {
    id: 'research',
    name: 'Research Agent',
    emoji: '🔍',
    description: 'Web searches, data gathering, and analysis',
    color: '#8B5CF6', // purple
    keywords: [
      'search', 'find', 'look up', 'research', 'investigate', 'discover',
      'latest', 'news', 'current', 'today', 'recent', 'trending',
      'statistics', 'data', 'numbers', 'facts', 'information',
      'compare', 'comparison', 'versus', 'vs', 'difference between',
      'source', 'reference', 'citation', 'study', 'report', 'analysis',
      'market', 'industry', 'competitor', 'weather', 'stock', 'price',
    ],
    systemPrompt: `You are SecureAgent Research Agent, an expert at gathering and analyzing information.
You excel at:
- Finding relevant information and data
- Synthesizing multiple sources into clear summaries
- Providing balanced analysis of topics
- Fact-checking and verifying information
- Explaining complex topics in accessible terms

Structure your responses clearly with sections and bullet points when appropriate.
Always indicate when information might be outdated or when you're uncertain.
Provide context and multiple perspectives when relevant.`,
  },

  creative: {
    id: 'creative',
    name: 'Creative Writer',
    emoji: '✨',
    description: 'Stories, content, and creative writing',
    color: '#EC4899', // pink
    keywords: [
      'write', 'story', 'creative', 'content', 'blog', 'article', 'post',
      'marketing', 'copy', 'copywriting', 'ad', 'advertisement', 'slogan',
      'tagline', 'headline', 'title', 'description', 'bio', 'about',
      'email', 'newsletter', 'social media', 'tweet', 'caption',
      'poem', 'poetry', 'lyrics', 'song', 'script', 'dialogue',
      'fiction', 'novel', 'character', 'plot', 'narrative', 'storytelling',
      'brainstorm', 'ideas', 'creative', 'imagine', 'invent',
    ],
    systemPrompt: `You are SecureAgent Creative Writer, a talented content creator and storyteller.
You excel at:
- Writing engaging stories and narratives
- Creating compelling marketing copy and content
- Crafting social media posts and captions
- Developing creative concepts and ideas
- Writing in various styles and tones

Be creative, original, and engaging. Match the tone to the request.
For marketing content, focus on benefits and emotional connection.
For stories, create vivid characters and compelling narratives.
Ask clarifying questions if the creative brief is unclear.`,
  },
};

// Get list of all agents for API responses
export const getAgentList = () =>
  Object.values(AGENTS).map(({ id, name, emoji, description, color }) => ({
    id, name, emoji, description, color,
  }));

// Auto-detect which agent to use based on message content
export function detectAgent(message: string): string {
  const lowerMessage = message.toLowerCase();

  // Score each agent based on keyword matches
  const scores: Record<string, number> = {};

  for (const [agentId, agent] of Object.entries(AGENTS)) {
    scores[agentId] = 0;
    for (const keyword of agent.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        // Longer keywords get higher scores (more specific)
        scores[agentId] += keyword.split(' ').length;
      }
    }
  }

  // Find agent with highest score
  let bestAgent = 'general';
  let highestScore = 0;

  for (const [agentId, score] of Object.entries(scores)) {
    if (score > highestScore) {
      highestScore = score;
      bestAgent = agentId;
    }
  }

  return bestAgent;
}

// Initialize Anthropic client
const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  return new Anthropic({ apiKey });
};

// Conversation storage (in-memory for demo - resets on cold start)
interface ConversationData {
  messages: Anthropic.MessageParam[];
  agentId: string;
}
const conversations = new Map<string, ConversationData>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET request returns list of available agents
  if (req.method === 'GET') {
    return res.status(200).json({
      agents: getAgentList(),
      defaultAgent: 'general',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Use GET to list agents or POST to send messages',
    });
  }

  try {
    const { message, conversationId, agentId, autoDetect } = req.body as {
      message?: string;
      conversationId?: string;
      agentId?: string;
      autoDetect?: boolean;
    };

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Message is required',
      });
    }

    const client = getClient();
    const convId = conversationId || `conv_${Date.now()}`;

    // Get or create conversation data
    let conversationData = conversations.get(convId);
    if (!conversationData) {
      conversationData = {
        messages: [],
        agentId: 'general',
      };
    }

    // Determine which agent to use
    let selectedAgentId = agentId || conversationData.agentId;
    let wasAutoDetected = false;

    // Auto-detect agent if enabled and no explicit agent specified
    if (autoDetect !== false && !agentId) {
      const detectedAgentId = detectAgent(message);
      if (detectedAgentId !== 'general' || conversationData.messages.length === 0) {
        selectedAgentId = detectedAgentId;
        wasAutoDetected = true;
      }
    }

    // Get agent configuration
    const agent = AGENTS[selectedAgentId] || AGENTS.general;

    // Add user message to history
    conversationData.messages.push({
      role: 'user',
      content: message,
    });

    // Update agent if changed
    conversationData.agentId = selectedAgentId;

    // Call Claude with agent-specific system prompt
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: agent.systemPrompt,
      messages: conversationData.messages,
    });

    // Extract text response
    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // Add assistant response to history
    conversationData.messages.push({
      role: 'assistant',
      content: textContent,
    });

    // Keep only last 20 messages to prevent token overflow
    if (conversationData.messages.length > 20) {
      conversationData.messages = conversationData.messages.slice(-20);
    }

    // Store updated conversation
    conversations.set(convId, conversationData);

    return res.status(200).json({
      response: textContent,
      conversationId: convId,
      model: response.model,
      agent: {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        color: agent.color,
        wasAutoDetected,
      },
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
