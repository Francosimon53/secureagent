/**
 * Google Chat Bot API Endpoint
 *
 * Receives webhook events from Google Chat and processes them through SecureAgent.
 * Supports both synchronous responses and async messaging via Google Chat API.
 *
 * Setup:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create or select a project
 * 3. Enable the Google Chat API
 * 4. Go to Google Chat API > Configuration
 * 5. Set App URL to: https://your-domain.vercel.app/api/google-chat
 * 6. Enable the bot and configure permissions
 * 7. For async messaging, create a service account and set GOOGLE_CHAT_CREDENTIALS
 *
 * Environment Variables:
 * - ANTHROPIC_API_KEY: Your Anthropic API key (required)
 * - GOOGLE_CHAT_CREDENTIALS: Service account JSON for async messaging (optional)
 * - GOOGLE_CHAT_PROJECT_ID: Google Cloud project ID (optional, for verification)
 *
 * Endpoints:
 * - POST /api/google-chat - Receive Google Chat events
 * - GET /api/google-chat - Setup instructions
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// Google Chat Types
// =============================================================================

interface GoogleChatUser {
  name: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  type: 'HUMAN' | 'BOT';
  domainId?: string;
}

interface GoogleChatSpace {
  name: string;
  type: 'ROOM' | 'DM' | 'DIRECT_MESSAGE';
  displayName?: string;
  singleUserBotDm?: boolean;
  threaded?: boolean;
  spaceThreadingState?: 'THREADED_MESSAGES' | 'GROUPED_MESSAGES' | 'UNTHREADED_MESSAGES';
}

interface GoogleChatThread {
  name: string;
  threadKey?: string;
}

interface GoogleChatMessage {
  name: string;
  sender: GoogleChatUser;
  createTime: string;
  text?: string;
  formattedText?: string;
  cards?: unknown[];
  cardsV2?: unknown[];
  annotations?: GoogleChatAnnotation[];
  thread?: GoogleChatThread;
  space: GoogleChatSpace;
  argumentText?: string;
  slashCommand?: {
    commandId: string;
  };
}

interface GoogleChatAnnotation {
  type: 'USER_MENTION' | 'SLASH_COMMAND';
  startIndex?: number;
  length?: number;
  userMention?: {
    user: GoogleChatUser;
    type: 'ADD' | 'MENTION';
  };
  slashCommand?: {
    bot: GoogleChatUser;
    type: 'ADD' | 'INVOKE';
    commandName: string;
    commandId: string;
    triggersDialog?: boolean;
  };
}

interface GoogleChatEvent {
  type: 'MESSAGE' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE' | 'CARD_CLICKED';
  eventTime: string;
  token?: string;
  message?: GoogleChatMessage;
  user: GoogleChatUser;
  space: GoogleChatSpace;
  action?: {
    actionMethodName: string;
    parameters?: Array<{ key: string; value: string }>;
  };
  configCompleteRedirectUrl?: string;
  isDialogEvent?: boolean;
  dialogEventType?: 'REQUEST_DIALOG' | 'SUBMIT_DIALOG' | 'CANCEL_DIALOG';
  common?: {
    userLocale?: string;
    hostApp?: string;
    platform?: string;
    timeZone?: {
      id: string;
      offset: number;
    };
  };
}

interface GoogleChatResponse {
  text?: string;
  cardsV2?: Array<{
    cardId: string;
    card: GoogleChatCard;
  }>;
  actionResponse?: {
    type: 'NEW_MESSAGE' | 'UPDATE_MESSAGE' | 'REQUEST_CONFIG' | 'DIALOG';
    url?: string;
    dialogAction?: {
      dialog?: {
        body: GoogleChatCard;
      };
      actionStatus?: {
        statusCode: 'OK' | 'CANCELLED' | 'UNKNOWN' | 'INVALID_ARGUMENT' | 'DEADLINE_EXCEEDED' | 'NOT_FOUND' | 'PERMISSION_DENIED' | 'INTERNAL' | 'UNAVAILABLE';
        userFacingMessage?: string;
      };
    };
  };
  thread?: {
    name?: string;
    threadKey?: string;
  };
}

interface GoogleChatCard {
  header?: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    imageType?: 'SQUARE' | 'CIRCLE';
  };
  sections?: Array<{
    header?: string;
    collapsible?: boolean;
    uncollapsibleWidgetsCount?: number;
    widgets: Array<{
      textParagraph?: { text: string };
      image?: { imageUrl: string; altText?: string };
      decoratedText?: {
        icon?: { knownIcon?: string; iconUrl?: string };
        topLabel?: string;
        text: string;
        bottomLabel?: string;
        button?: GoogleChatButton;
      };
      buttonList?: { buttons: GoogleChatButton[] };
      divider?: {};
    }>;
  }>;
}

interface GoogleChatButton {
  text: string;
  icon?: { knownIcon?: string; iconUrl?: string };
  color?: { red: number; green: number; blue: number; alpha?: number };
  onClick: {
    action?: {
      function: string;
      parameters?: Array<{ key: string; value: string }>;
    };
    openLink?: { url: string };
  };
  disabled?: boolean;
}

// =============================================================================
// Conversation Memory (In-memory for serverless)
// =============================================================================

interface ConversationState {
  messages: Anthropic.MessageParam[];
  lastUpdated: number;
}

const conversations = new Map<string, ConversationState>();

// Clean up old conversations (older than 1 hour)
function cleanupConversations(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, state] of conversations.entries()) {
    if (state.lastUpdated < oneHourAgo) {
      conversations.delete(key);
    }
  }
}

// =============================================================================
// Tools Definition (matching other channel implementations)
// =============================================================================

const tools: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make HTTP requests to fetch data from public APIs',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
        headers: { type: 'object', description: 'Optional headers' },
        body: { type: 'string', description: 'Optional request body for POST' },
      },
      required: ['url'],
    },
  },
  {
    name: 'json_parse',
    description: 'Parse and extract data from JSON strings',
    input_schema: {
      type: 'object' as const,
      properties: {
        json: { type: 'string', description: 'JSON string to parse' },
        path: { type: 'string', description: 'Optional JSONPath to extract specific data' },
      },
      required: ['json'],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current date and time',
    input_schema: {
      type: 'object' as const,
      properties: {
        timezone: { type: 'string', description: 'Optional timezone (e.g., "America/New_York")' },
      },
    },
  },
];

// =============================================================================
// Tool Execution
// =============================================================================

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'http_request': {
      try {
        const url = args.url as string;
        const method = (args.method as string) || 'GET';
        const headers = (args.headers as Record<string, string>) || {};
        const body = args.body as string | undefined;

        const response = await fetch(url, {
          method,
          headers: { 'User-Agent': 'SecureAgent/1.0', ...headers },
          body: method === 'POST' ? body : undefined,
        });

        const text = await response.text();
        return text.substring(0, 4000); // Limit response size
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Request failed'}`;
      }
    }

    case 'json_parse': {
      try {
        const json = JSON.parse(args.json as string);
        const path = args.path as string | undefined;

        if (path) {
          const parts = path.split('.');
          let result = json;
          for (const part of parts) {
            result = result[part];
          }
          return JSON.stringify(result, null, 2);
        }

        return JSON.stringify(json, null, 2);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : 'Parse failed'}`;
      }
    }

    case 'get_current_time': {
      const timezone = (args.timezone as string) || 'UTC';
      try {
        const now = new Date();
        const formatted = now.toLocaleString('en-US', { timeZone: timezone });
        return `Current time in ${timezone}: ${formatted}`;
      } catch {
        return `Current time (UTC): ${new Date().toISOString()}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// =============================================================================
// Process Message with AI
// =============================================================================

async function processMessage(
  anthropic: Anthropic,
  spaceId: string,
  userMessage: string,
  userName: string
): Promise<string> {
  // Get or create conversation
  let conversation = conversations.get(spaceId);
  if (!conversation) {
    conversation = { messages: [], lastUpdated: Date.now() };
    conversations.set(spaceId, conversation);
  }

  // Add user message
  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.lastUpdated = Date.now();

  // Keep only last 20 messages to manage context
  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }

  const systemPrompt = `You are SecureAgent, a helpful AI assistant integrated with Google Chat.
You can help users with questions, fetch data from the web, and process information.
You have access to tools for HTTP requests, JSON parsing, and getting current time.

Guidelines:
- Be concise and helpful - Google Chat works best with shorter messages
- Use formatting sparingly (Google Chat supports basic markdown)
- If users ask about complex topics, break down your response
- For code, use code blocks with \`\`\`language syntax
- You're chatting with ${userName}

Available tools:
- http_request: Fetch data from public APIs
- json_parse: Parse JSON data
- get_current_time: Get current date/time`;

  try {
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: conversation.messages,
    });

    // Handle tool use
    let iterations = 0;
    const maxIterations = 5;

    while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
      iterations++;
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant response and tool results to conversation
      conversation.messages.push({ role: 'assistant', content: response.content });
      conversation.messages.push({ role: 'user', content: toolResults });

      // Continue the conversation
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: conversation.messages,
      });
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const assistantMessage = textBlocks.map((b) => b.text).join('\n') || 'I processed your request.';

    // Add final response to conversation
    conversation.messages.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  } catch (error) {
    console.error('AI processing error:', error);
    return `Sorry, I encountered an error processing your message. Please try again.`;
  }
}

// =============================================================================
// Create Rich Card Response
// =============================================================================

function createWelcomeCard(spaceName: string): GoogleChatResponse {
  return {
    cardsV2: [
      {
        cardId: 'welcome-card',
        card: {
          header: {
            title: 'SecureAgent',
            subtitle: 'Your AI Assistant',
            imageUrl: 'https://raw.githubusercontent.com/Francosimon53/secureagent/main/assets/logo.png',
            imageType: 'CIRCLE',
          },
          sections: [
            {
              header: 'Welcome!',
              widgets: [
                {
                  textParagraph: {
                    text: `Thanks for adding me to <b>${spaceName || 'this space'}</b>! I'm SecureAgent, an AI assistant powered by Claude.`,
                  },
                },
                {
                  textParagraph: {
                    text: '• Ask me questions on any topic\n• I can fetch data from the web\n• I remember our conversation context',
                  },
                },
              ],
            },
            {
              header: 'Quick Actions',
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: 'Say Hello',
                        onClick: {
                          action: {
                            function: 'say_hello',
                          },
                        },
                      },
                      {
                        text: 'View Docs',
                        onClick: {
                          openLink: {
                            url: 'https://github.com/Francosimon53/secureagent',
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function createHelpCard(): GoogleChatResponse {
  return {
    cardsV2: [
      {
        cardId: 'help-card',
        card: {
          header: {
            title: 'SecureAgent Help',
            subtitle: 'Available Commands',
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    icon: { knownIcon: 'CHAT' },
                    topLabel: 'Chat',
                    text: 'Just type your message to chat with me',
                  },
                },
                {
                  decoratedText: {
                    icon: { knownIcon: 'HELP_OUTLINE' },
                    topLabel: 'Help',
                    text: 'Type "help" to see this message',
                  },
                },
                {
                  decoratedText: {
                    icon: { knownIcon: 'RESTORE' },
                    topLabel: 'Clear',
                    text: 'Type "clear" to reset conversation',
                  },
                },
              ],
            },
            {
              header: 'Capabilities',
              widgets: [
                {
                  textParagraph: {
                    text: '• Answer questions on any topic\n• Fetch data from web APIs\n• Process and analyze information\n• Remember conversation context',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

// =============================================================================
// Main Handler
// =============================================================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Setup instructions
  if (req.method === 'GET') {
    const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY;
    const credentialsConfigured = !!process.env.GOOGLE_CHAT_CREDENTIALS;

    res.status(200).json({
      name: 'SecureAgent Google Chat Bot',
      version: '1.0.0',
      status: {
        apiKeyConfigured,
        credentialsConfigured,
        ready: apiKeyConfigured,
      },
      setup: {
        step1: 'Go to https://console.cloud.google.com/',
        step2: 'Create or select a project',
        step3: 'Enable the Google Chat API at https://console.cloud.google.com/apis/library/chat.googleapis.com',
        step4: 'Go to Google Chat API > Configuration',
        step5: 'Configure the app:',
        appConfig: {
          appName: 'SecureAgent',
          avatarUrl: 'https://raw.githubusercontent.com/Francosimon53/secureagent/main/assets/logo.png',
          description: 'AI assistant powered by Claude',
          interactiveFeatures: true,
          connectionSettings: {
            appUrl: 'https://your-domain.vercel.app/api/google-chat',
          },
          visibility: 'Make available to specific people or groups in your domain',
        },
        step6: 'Set environment variables in Vercel:',
        envVars: [
          'ANTHROPIC_API_KEY - Your Anthropic API key (required)',
          'GOOGLE_CHAT_CREDENTIALS - Service account JSON for async messaging (optional)',
        ],
        step7: 'Publish the bot and add it to a space or DM',
      },
      usage: [
        'Mention @SecureAgent in a space',
        'Send a direct message to the bot',
        'Type "help" for available commands',
        'Type "clear" to reset conversation',
      ],
      supportedEvents: [
        'MESSAGE - When a user sends a message',
        'ADDED_TO_SPACE - When bot is added to a space or DM',
        'REMOVED_FROM_SPACE - When bot is removed',
        'CARD_CLICKED - When a user clicks a card button',
      ],
    });
    return;
  }

  // POST - Handle Google Chat events
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Bot not configured - missing ANTHROPIC_API_KEY' });
    return;
  }

  // Parse event
  const event = req.body as GoogleChatEvent;

  if (!event || !event.type) {
    res.status(400).json({ error: 'Invalid event payload' });
    return;
  }

  console.log(`Google Chat event: ${event.type} from ${event.user?.displayName || 'unknown'}`);

  // Clean up old conversations periodically
  cleanupConversations();

  try {
    switch (event.type) {
      case 'ADDED_TO_SPACE': {
        // Bot was added to a space or DM
        const spaceName = event.space?.displayName || 'this space';
        const isDirectMessage = event.space?.type === 'DM' || event.space?.type === 'DIRECT_MESSAGE';

        if (isDirectMessage) {
          res.status(200).json({
            text: `Hello ${event.user?.displayName || 'there'}! I'm SecureAgent, your AI assistant. How can I help you today?\n\nType *help* for available commands.`,
          });
        } else {
          res.status(200).json(createWelcomeCard(spaceName));
        }
        return;
      }

      case 'REMOVED_FROM_SPACE': {
        // Bot was removed - clean up conversation
        const spaceId = event.space?.name || '';
        conversations.delete(spaceId);
        res.status(200).json({});
        return;
      }

      case 'CARD_CLICKED': {
        // Handle card button clicks
        const actionName = event.action?.actionMethodName;

        if (actionName === 'say_hello') {
          res.status(200).json({
            text: `Hello ${event.user?.displayName || 'there'}! How can I help you today?`,
          });
          return;
        }

        res.status(200).json({
          text: 'Button clicked!',
        });
        return;
      }

      case 'MESSAGE': {
        // Handle incoming message
        const message = event.message;
        if (!message?.text && !message?.argumentText) {
          res.status(200).json({});
          return;
        }

        // Get the actual text (argumentText is the text after @mention)
        let userText = message.argumentText || message.text || '';
        userText = userText.trim();

        // Skip if empty
        if (!userText) {
          res.status(200).json({});
          return;
        }

        // Handle commands
        const lowerText = userText.toLowerCase();

        if (lowerText === 'help' || lowerText === '/help') {
          res.status(200).json(createHelpCard());
          return;
        }

        if (lowerText === 'clear' || lowerText === '/clear') {
          const spaceId = event.space?.name || '';
          conversations.delete(spaceId);
          res.status(200).json({
            text: '✓ Conversation cleared! Let\'s start fresh.',
          });
          return;
        }

        // Process with AI
        const anthropic = new Anthropic({ apiKey });
        const spaceId = event.space?.name || `user_${event.user?.name || 'unknown'}`;
        const userName = event.user?.displayName || 'User';

        const response = await processMessage(anthropic, spaceId, userText, userName);

        // Send response
        const chatResponse: GoogleChatResponse = {
          text: response,
        };

        // If in a thread, reply in the same thread
        if (message.thread?.name) {
          chatResponse.thread = {
            name: message.thread.name,
          };
        }

        res.status(200).json(chatResponse);
        return;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
        res.status(200).json({});
        return;
    }
  } catch (error) {
    console.error('Google Chat handler error:', error);
    res.status(200).json({
      text: 'Sorry, I encountered an error processing your request. Please try again.',
    });
  }
}
