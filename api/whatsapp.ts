/**
 * WhatsApp Webhook API Endpoint
 *
 * Receives webhook updates from WhatsApp Cloud API, processes them through SecureAgent,
 * and sends responses back to the user.
 *
 * Setup:
 * 1. Create a Meta Developer account at https://developers.facebook.com
 * 2. Create a new app with WhatsApp product
 * 3. Get your Phone Number ID and Access Token from the WhatsApp dashboard
 * 4. Set environment variables:
 *    - WHATSAPP_ACCESS_TOKEN: Permanent access token
 *    - WHATSAPP_PHONE_NUMBER_ID: Your WhatsApp business phone number ID
 *    - WHATSAPP_VERIFY_TOKEN: Custom token for webhook verification (you create this)
 * 5. Configure webhook URL in Meta dashboard: https://your-domain.vercel.app/api/whatsapp
 * 6. Subscribe to 'messages' webhook field
 *
 * Endpoints:
 * - POST /api/whatsapp - Receive webhook updates from WhatsApp
 * - GET /api/whatsapp - Webhook verification (required by Meta)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// WhatsApp Types (Cloud API)
// =============================================================================

interface WhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

interface WhatsAppTextMessage {
  body: string;
}

interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'button' | 'reaction';
  text?: WhatsAppTextMessage;
}

interface WhatsAppValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: Array<{
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
  }>;
}

interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

interface WhatsAppWebhook {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}

// =============================================================================
// Conversation Memory (In-memory for serverless)
// =============================================================================

interface ConversationState {
  messages: Anthropic.MessageParam[];
  lastUpdated: number;
  userName: string;
}

const conversations = new Map<string, ConversationState>();

function cleanupConversations(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, state] of conversations.entries()) {
    if (state.lastUpdated < oneHourAgo) {
      conversations.delete(key);
    }
  }
}

// =============================================================================
// WhatsApp API Helper
// =============================================================================

async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`WhatsApp API error: ${JSON.stringify(error)}`);
  }
}

async function markMessageAsRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });
}

// =============================================================================
// Agent Integration
// =============================================================================

const AVAILABLE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to fetch data from public APIs',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method' },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_timestamp',
    description: 'Get current date and time',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'http_request') {
    const url = args.url as string;
    const method = (args.method as string) || 'GET';

    // Security: Block localhost and internal IPs
    const blockedPatterns = [
      /^https?:\/\/localhost/i,
      /^https?:\/\/127\./,
      /^https?:\/\/10\./,
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^https?:\/\/192\.168\./,
    ];

    for (const pattern of blockedPatterns) {
      if (pattern.test(url)) {
        throw new Error('Access blocked for security reasons');
      }
    }

    const response = await fetch(url, { method });
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return await response.text();
  }

  if (name === 'get_timestamp') {
    return new Date().toISOString();
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function processWithAgent(
  userMessage: string,
  phoneNumber: string,
  userName: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "I'm sorry, but I'm not properly configured. Please ask the administrator to set up the ANTHROPIC_API_KEY.";
  }

  const client = new Anthropic({ apiKey });

  // Get or create conversation
  let conversation = conversations.get(phoneNumber);
  if (!conversation) {
    conversation = { messages: [], lastUpdated: Date.now(), userName };
    conversations.set(phoneNumber, conversation);
  }

  conversation.messages.push({ role: 'user', content: userMessage });
  conversation.lastUpdated = Date.now();

  // Clean up old conversations periodically
  if (Math.random() < 0.1) {
    cleanupConversations();
  }

  // Keep only last 20 messages for context
  if (conversation.messages.length > 20) {
    conversation.messages = conversation.messages.slice(-20);
  }

  try {
    let response: Anthropic.Message;
    let turns = 0;
    const maxTurns = 3;

    while (turns < maxTurns) {
      turns++;

      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are SecureAgent, a helpful AI assistant available on WhatsApp. You're chatting with ${userName}.

Be concise since this is a chat interface - keep responses under 300 words unless detailed explanation is needed.
You can use tools to fetch data from the internet when helpful.
Be friendly and helpful. Use emojis sparingly but appropriately.
WhatsApp has a 4096 character limit per message, so keep responses within that limit.

Current time: ${new Date().toISOString()}`,
        messages: conversation.messages,
        tools: AVAILABLE_TOOLS,
      });

      // Check for tool use
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        break;
      }

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: (error as Error).message }),
            is_error: true,
          });
        }
      }

      // Add to conversation
      conversation.messages.push({ role: 'assistant', content: response.content });
      conversation.messages.push({ role: 'user', content: toolResults });
    }

    // Extract text response
    const textBlocks = response!.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const responseText = textBlocks.map(b => b.text).join('\n');

    // Add final response to conversation
    conversation.messages.push({ role: 'assistant', content: response!.content });

    return responseText || "I processed your request but don't have anything to say.";
  } catch (error) {
    console.error('Agent error:', error);
    return "I encountered an error processing your message. Please try again.";
  }
}

// =============================================================================
// Webhook Handler
// =============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { method } = req;

  // GET - Webhook verification (required by Meta)
  if (method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    // If this is a verification request from Meta
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }

    // If no verification params, return setup instructions
    if (!mode && !token) {
      const hasAccessToken = !!process.env.WHATSAPP_ACCESS_TOKEN;
      const hasPhoneNumberId = !!process.env.WHATSAPP_PHONE_NUMBER_ID;
      const hasVerifyToken = !!process.env.WHATSAPP_VERIFY_TOKEN;
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

      return res.status(200).json({
        name: 'SecureAgent WhatsApp Bot',
        version: '1.0.0',
        status: {
          accessTokenConfigured: hasAccessToken,
          phoneNumberIdConfigured: hasPhoneNumberId,
          verifyTokenConfigured: hasVerifyToken,
          apiKeyConfigured: hasApiKey,
          ready: hasAccessToken && hasPhoneNumberId && hasVerifyToken && hasApiKey,
        },
        setup: {
          step1: 'Go to https://developers.facebook.com and create a Meta Developer account',
          step2: 'Create a new app and add the WhatsApp product',
          step3: 'In WhatsApp > API Setup, get your Phone Number ID and generate an Access Token',
          step4: 'Set environment variables in Vercel:',
          envVars: [
            'WHATSAPP_ACCESS_TOKEN - Your permanent access token',
            'WHATSAPP_PHONE_NUMBER_ID - Your business phone number ID',
            'WHATSAPP_VERIFY_TOKEN - A custom secret string you create (e.g., "my_secure_verify_token_123")',
            'ANTHROPIC_API_KEY - Your Anthropic API key',
          ],
          step5: 'In WhatsApp > Configuration, set up the webhook:',
          webhookUrl: 'https://your-domain.vercel.app/api/whatsapp',
          step6: 'Use your WHATSAPP_VERIFY_TOKEN as the verify token in Meta dashboard',
          step7: 'Subscribe to the "messages" webhook field',
        },
        commands: [
          'hi / hello - Start a conversation',
          'help - Show help message',
          'clear - Clear conversation history',
        ],
        notes: [
          'WhatsApp Business API requires a verified business for production use',
          'Test numbers can only message numbers added to the allowlist in Meta dashboard',
          'For production, you need to complete Business Verification',
        ],
      });
    }

    // Verification failed
    console.error('WhatsApp webhook verification failed');
    return res.status(403).json({ error: 'Verification failed' });
  }

  // POST - Handle incoming messages
  if (method === 'POST') {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      console.error('WhatsApp credentials not configured');
      return res.status(200).json({ status: 'ok' }); // Always return 200 to Meta
    }

    try {
      // Parse body
      let webhook: WhatsAppWebhook;
      try {
        const rawBody = req.body;
        if (typeof rawBody === 'string') {
          webhook = JSON.parse(rawBody);
        } else if (rawBody && typeof rawBody === 'object') {
          webhook = rawBody as WhatsAppWebhook;
        } else {
          return res.status(200).json({ status: 'ok' });
        }
      } catch {
        console.error('Failed to parse WhatsApp webhook body');
        return res.status(200).json({ status: 'ok' });
      }

      // Validate it's a WhatsApp webhook
      if (webhook.object !== 'whatsapp_business_account') {
        return res.status(200).json({ status: 'ok' });
      }

      // Process each entry
      for (const entry of webhook.entry) {
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          const messages = value.messages;
          const contacts = value.contacts;

          if (!messages || messages.length === 0) continue;

          for (const message of messages) {
            // Only process text messages
            if (message.type !== 'text' || !message.text) continue;

            const from = message.from;
            const text = message.text.body;
            const messageId = message.id;

            // Get user name from contacts
            const contact = contacts?.find(c => c.wa_id === from);
            const userName = contact?.profile?.name || 'User';

            // Mark message as read
            try {
              await markMessageAsRead(phoneNumberId, accessToken, messageId);
            } catch (err) {
              console.error('Failed to mark message as read:', err);
            }

            // Handle commands
            const lowerText = text.toLowerCase().trim();

            if (lowerText === 'help' || lowerText === '/help') {
              await sendWhatsAppMessage(
                phoneNumberId,
                accessToken,
                from,
                `*SecureAgent Help*\n\n*Commands:*\n- help - Show this message\n- clear - Clear conversation history\n\n*Features:*\n- Natural conversation with AI\n- Web data fetching\n- Persistent conversation memory\n\nJust type your message and I'll respond!`
              );
              continue;
            }

            if (lowerText === 'clear' || lowerText === '/clear') {
              conversations.delete(from);
              await sendWhatsAppMessage(
                phoneNumberId,
                accessToken,
                from,
                'Conversation history cleared. Start fresh!'
              );
              continue;
            }

            // Process with agent
            const response = await processWithAgent(text, from, userName);

            // Send response (split if too long - WhatsApp limit is 4096 chars)
            const maxLength = 4096;
            if (response.length <= maxLength) {
              await sendWhatsAppMessage(phoneNumberId, accessToken, from, response);
            } else {
              // Split into chunks
              const chunks: string[] = [];
              let remaining = response;
              while (remaining.length > 0) {
                chunks.push(remaining.slice(0, maxLength));
                remaining = remaining.slice(maxLength);
              }

              for (const chunk of chunks) {
                await sendWhatsAppMessage(phoneNumberId, accessToken, from, chunk);
              }
            }
          }
        }
      }

      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      return res.status(200).json({ status: 'ok' }); // Always return 200 to Meta
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
