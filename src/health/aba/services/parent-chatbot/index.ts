/**
 * Parent Chatbot Service
 *
 * AI-powered chatbot for answering parent questions about:
 * - Scheduling and appointments
 * - Authorization status and units
 * - Billing and insurance
 * - Therapy progress and goals
 * - General clinic information
 *
 * Features:
 * - Intent classification
 * - FAQ knowledge base matching
 * - Dynamic data lookups
 * - Escalation to human staff
 * - Multi-language support
 */

import { EventEmitter } from 'events';
import type { FAQStore } from '../../stores/faq-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { NotificationProvider } from '../../providers/notification/types.js';
import type {
  ChatSession,
  ChatSessionId,
  ChatMessage,
  FAQEntry,
  FAQCategory,
  PatientId,
} from '../../types.js';
import type { ChatbotConfig } from '../../config.js';
import { HEALTH_EVENTS } from '../../constants.js';
import { IntentClassifier, type Intent, type IntentName } from './intent-classifier.js';
import { ResponseGenerator, type GeneratedResponse } from './response-generator.js';
import {
  EscalationHandler,
  type EscalationRequest,
  type EscalationReason,
  type StaffRecipient,
} from './escalation-handler.js';

// =============================================================================
// Parent Chatbot Options
// =============================================================================

export interface ParentChatbotOptions {
  faqStore: FAQStore;
  patientStore: PatientStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  config: ChatbotConfig;
  clinicInfo: {
    name: string;
    phone: string;
    email: string;
    billingPhone?: string;
    billingEmail?: string;
    businessHours: string;
  };
  staffRecipients: StaffRecipient[];
}

// =============================================================================
// Chat Response
// =============================================================================

export interface ChatResponse {
  message: string;
  sessionId: ChatSessionId;
  intent: IntentName;
  confidence: number;
  suggestions?: string[];
  escalated: boolean;
  escalationId?: string;
}

// =============================================================================
// Parent Chatbot Service
// =============================================================================

export class ParentChatbotService extends EventEmitter {
  private readonly faqStore: FAQStore;
  private readonly patientStore: PatientStore;
  private readonly config: ChatbotConfig;

  private readonly intentClassifier: IntentClassifier;
  private readonly responseGenerator: ResponseGenerator;
  private readonly escalationHandler: EscalationHandler;

  private readonly sessions = new Map<string, ChatSession>();

  constructor(options: ParentChatbotOptions) {
    super();

    this.faqStore = options.faqStore;
    this.patientStore = options.patientStore;
    this.config = options.config;

    // Initialize sub-services
    this.intentClassifier = new IntentClassifier({
      faqStore: options.faqStore,
      confidenceThreshold: options.config.escalationThreshold,
    });

    this.responseGenerator = new ResponseGenerator({
      faqStore: options.faqStore,
      patientStore: options.patientStore,
      appointmentStore: options.appointmentStore,
      authorizationStore: options.authorizationStore,
      clinicInfo: options.clinicInfo,
      escalationThreshold: options.config.escalationThreshold,
    });

    this.escalationHandler = new EscalationHandler({
      patientStore: options.patientStore,
      smsProvider: options.smsProvider,
      emailProvider: options.emailProvider,
      staffNotificationRecipients: options.staffRecipients,
    });

    // Forward events
    this.escalationHandler.on(HEALTH_EVENTS.CHAT_ESCALATED, (data) =>
      this.emit(HEALTH_EVENTS.CHAT_ESCALATED, data)
    );
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Start a new chat session
   */
  startSession(
    userId: string,
    patientId?: PatientId,
    contactId?: string,
    language = 'en'
  ): ChatSession {
    const now = Date.now();
    const session: ChatSession = {
      id: crypto.randomUUID() as ChatSessionId,
      userId,
      patientId,
      contactId,
      contactName: '', // Will be populated from contact lookup
      contactMethod: 'web',
      language,
      messages: [],
      status: 'active',
      startedAt: now,
      lastActivityAt: now,
    };

    this.sessions.set(session.id, session);

    this.emit(HEALTH_EVENTS.CHAT_SESSION_STARTED, {
      sessionId: session.id,
      patientId,
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: ChatSessionId): ChatSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * End a chat session
   */
  endSession(sessionId: ChatSessionId): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      session.endedAt = Date.now();
      session.lastActivityAt = Date.now();

      this.emit(HEALTH_EVENTS.CHAT_SESSION_ENDED, {
        sessionId,
        messageCount: session.messages.length,
        timestamp: Date.now(),
      });
    }
  }

  // ===========================================================================
  // Message Handling
  // ===========================================================================

  /**
   * Process a user message and generate response
   */
  async processMessage(
    sessionId: ChatSessionId,
    message: string
  ): Promise<ChatResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Check if session is active
    if (session.status !== 'active') {
      return {
        message: 'This chat session has ended. Please start a new session.',
        sessionId,
        intent: 'unknown',
        confidence: 1,
        escalated: false,
      };
    }

    // Add user message to session
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'user',
      content: message,
      timestamp: Date.now(),
      escalated: false,
    };
    session.messages.push(userMessage);
    session.lastActivityAt = Date.now();

    // Classify intent
    const intent = await this.intentClassifier.classify(session.userId, message);

    // Check if escalation is needed
    const escalationCheck = this.escalationHandler.shouldEscalate(
      message,
      intent.confidence
    );

    if (escalationCheck.shouldEscalate) {
      return this.handleEscalation(
        session,
        intent,
        escalationCheck.reason ?? 'user_request'
      );
    }

    // Generate response
    const response = await this.responseGenerator.generateResponse(
      session.userId,
      session.patientId,
      intent,
      message
    );

    // Check if response requires escalation
    if (response.requiresEscalation) {
      // Track failures for repeated issues
      const needsAutoEscalation = this.escalationHandler.recordFailure(sessionId);

      if (needsAutoEscalation) {
        return this.handleEscalation(session, intent, 'repeated_failures');
      }
    } else {
      // Reset failure count on successful interaction
      this.escalationHandler.resetFailures(sessionId);
    }

    // Add assistant message to session
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      content: response.text,
      timestamp: Date.now(),
      intent: {
        name: intent.name,
        confidence: intent.confidence,
        requiresEscalation: false,
      },
      confidence: intent.confidence,
      escalated: false,
    };
    session.messages.push(assistantMessage);
    session.lastActivityAt = Date.now();

    this.emit(HEALTH_EVENTS.CHAT_MESSAGE_RECEIVED, {
      sessionId,
      intent: intent.name,
      confidence: intent.confidence,
      timestamp: Date.now(),
    });

    return {
      message: response.text,
      sessionId,
      intent: intent.name,
      confidence: intent.confidence,
      suggestions: response.followUpSuggestions,
      escalated: false,
    };
  }

  /**
   * Handle escalation to human staff
   */
  private async handleEscalation(
    session: ChatSession,
    intent: Intent,
    reason: EscalationReason
  ): Promise<ChatResponse> {
    // Generate conversation summary
    const summary = this.summarizeConversation(session);

    // Create escalation
    const escalation = await this.escalationHandler.createEscalation(
      session,
      reason,
      summary
    );

    // Update session status
    session.status = 'escalated';
    session.lastActivityAt = Date.now();

    // Get escalation message for user
    const escalationMessage = this.escalationHandler.getEscalationMessage(reason);

    // Add message to session
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      role: 'assistant',
      content: escalationMessage,
      timestamp: Date.now(),
      intent: {
        name: intent.name,
        confidence: intent.confidence,
        requiresEscalation: true,
        escalationReason: reason,
      },
      confidence: intent.confidence,
      escalated: true,
      escalationDetails: {
        reason,
        priority: 'medium',
      },
    };
    session.messages.push(assistantMessage);

    return {
      message: escalationMessage,
      sessionId: session.id,
      intent: intent.name,
      confidence: intent.confidence,
      escalated: true,
      escalationId: escalation.id,
    };
  }

  /**
   * Summarize a conversation for escalation
   */
  private summarizeConversation(session: ChatSession): string {
    if (session.messages.length === 0) {
      return 'No messages in conversation.';
    }

    // Get user messages and intents
    const userMessages = session.messages.filter((m) => m.role === 'user');
    const intents = session.messages
      .filter((m) => m.role === 'assistant' && m.intent)
      .map((m) => m.intent)
      .filter((v, i, a) => a.indexOf(v) === i); // Unique intents

    const summary = [
      `Messages: ${session.messages.length}`,
      `Topics discussed: ${intents.join(', ') || 'Unknown'}`,
      `User questions:`,
      ...userMessages.slice(-3).map((m) => `- ${m.content.substring(0, 100)}`),
    ];

    return summary.join('\n');
  }

  // ===========================================================================
  // FAQ Management
  // ===========================================================================

  /**
   * Add FAQ entry
   */
  async addFAQEntry(
    userId: string,
    entry: Omit<FAQEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<FAQEntry> {
    return this.faqStore.createEntry({ ...entry, userId });
  }

  /**
   * Update FAQ entry
   */
  async updateFAQEntry(
    id: string,
    updates: Partial<FAQEntry>
  ): Promise<FAQEntry | null> {
    return this.faqStore.updateEntry(id, updates);
  }

  /**
   * Delete FAQ entry
   */
  async deleteFAQEntry(id: string): Promise<boolean> {
    return this.faqStore.deleteEntry(id);
  }

  /**
   * List FAQ entries
   */
  async listFAQEntries(
    userId: string,
    category?: FAQCategory
  ): Promise<FAQEntry[]> {
    return this.faqStore.listEntries(userId, category ? { category } : undefined);
  }

  /**
   * Search FAQ entries
   */
  async searchFAQ(userId: string, query: string): Promise<FAQEntry[]> {
    return this.faqStore.searchEntries(userId, query);
  }

  /**
   * Get popular FAQ entries
   */
  async getPopularFAQ(userId: string, limit = 10): Promise<FAQEntry[]> {
    return this.faqStore.getPopularEntries(userId, limit);
  }

  /**
   * Record FAQ feedback
   */
  async recordFAQFeedback(
    faqId: string,
    helpful: boolean
  ): Promise<void> {
    if (helpful) {
      await this.faqStore.incrementHelpfulCount(faqId);
    } else {
      await this.faqStore.incrementNotHelpfulCount(faqId);
    }
  }

  // ===========================================================================
  // Escalation Management
  // ===========================================================================

  /**
   * Get pending escalations
   */
  getPendingEscalations(): EscalationRequest[] {
    return this.escalationHandler.getPendingEscalations();
  }

  /**
   * Acknowledge escalation
   */
  acknowledgeEscalation(
    escalationId: string,
    staffMember: string
  ): EscalationRequest | null {
    return this.escalationHandler.acknowledgeEscalation(escalationId, staffMember);
  }

  /**
   * Resolve escalation
   */
  resolveEscalation(
    escalationId: string,
    resolution: string
  ): EscalationRequest | null {
    return this.escalationHandler.updateEscalationStatus(
      escalationId,
      'resolved',
      resolution
    );
  }

  // ===========================================================================
  // Analytics
  // ===========================================================================

  /**
   * Get chatbot statistics
   */
  getStatistics(): {
    activeSessions: number;
    totalMessages: number;
    averageConfidence: number;
    escalationRate: number;
    topIntents: Array<{ intent: string; count: number }>;
  } {
    const sessions = Array.from(this.sessions.values());
    const allMessages = sessions.flatMap((s) => s.messages);

    const assistantMessages = allMessages.filter(
      (m) => m.role === 'assistant' && m.confidence
    );
    const averageConfidence =
      assistantMessages.length > 0
        ? assistantMessages.reduce((sum, m) => sum + (m.confidence ?? 0), 0) /
          assistantMessages.length
        : 0;

    const escalatedSessions = sessions.filter((s) => s.status === 'escalated');
    const escalationRate =
      sessions.length > 0 ? escalatedSessions.length / sessions.length : 0;

    // Count intents
    const intentCounts = new Map<string, number>();
    for (const message of assistantMessages) {
      if (message.intent) {
        const intentName = typeof message.intent === 'string' ? message.intent : message.intent.name;
        intentCounts.set(
          intentName,
          (intentCounts.get(intentName) ?? 0) + 1
        );
      }
    }

    const topIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      activeSessions: sessions.filter((s) => s.status === 'active').length,
      totalMessages: allMessages.length,
      averageConfidence,
      escalationRate,
      topIntents,
    };
  }
}

// Re-export sub-components
export { IntentClassifier, type Intent, type IntentName } from './intent-classifier.js';
export { ResponseGenerator, type GeneratedResponse } from './response-generator.js';
export {
  EscalationHandler,
  type EscalationRequest,
  type EscalationReason,
  type StaffRecipient,
} from './escalation-handler.js';
