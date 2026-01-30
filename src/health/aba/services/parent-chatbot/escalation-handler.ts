/**
 * Escalation Handler
 *
 * Handles escalation of chat conversations to human staff when:
 * - Intent confidence is too low
 * - User explicitly requests human assistance
 * - Emergency/crisis detected
 * - Repeated failed interactions
 */

import { EventEmitter } from 'events';
import type { NotificationProvider, NotificationRecipient, NotificationMessage } from '../../providers/notification/types.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { Patient, PatientContact, ChatSession, ChatMessage } from '../../types.js';
import { HEALTH_EVENTS } from '../../constants.js';

// =============================================================================
// Escalation Types
// =============================================================================

export interface EscalationRequest {
  id: string;
  sessionId: string;
  patientId?: string;
  patientName?: string;
  contactId?: string;
  contactName?: string;
  reason: EscalationReason;
  priority: EscalationPriority;
  conversationSummary: string;
  lastMessages: ChatMessage[];
  status: EscalationStatus;
  assignedTo?: string;
  createdAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  resolution?: string;
}

export type EscalationReason =
  | 'low_confidence'
  | 'user_request'
  | 'emergency'
  | 'repeated_failures'
  | 'sensitive_topic'
  | 'complaint'
  | 'billing_issue'
  | 'authorization_issue';

export type EscalationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type EscalationStatus = 'pending' | 'acknowledged' | 'in_progress' | 'resolved';

// =============================================================================
// Escalation Handler Options
// =============================================================================

export interface EscalationHandlerOptions {
  patientStore: PatientStore;
  smsProvider?: NotificationProvider;
  emailProvider?: NotificationProvider;
  staffNotificationRecipients: StaffRecipient[];
  escalationThresholds?: EscalationThresholds;
}

export interface StaffRecipient {
  name: string;
  role: 'supervisor' | 'admin' | 'billing' | 'clinical';
  email?: string;
  phone?: string;
  notifyFor: EscalationReason[];
}

export interface EscalationThresholds {
  lowConfidenceThreshold: number;
  maxFailedInteractions: number;
  autoEscalateKeywords: string[];
}

// =============================================================================
// Default Thresholds
// =============================================================================

const DEFAULT_THRESHOLDS: EscalationThresholds = {
  lowConfidenceThreshold: 0.3,
  maxFailedInteractions: 3,
  autoEscalateKeywords: [
    'speak to a person',
    'talk to someone',
    'human',
    'representative',
    'manager',
    'supervisor',
    'complaint',
    'frustrated',
    'angry',
    'upset',
  ],
};

// =============================================================================
// Escalation Handler
// =============================================================================

export class EscalationHandler extends EventEmitter {
  private readonly patientStore: PatientStore;
  private readonly smsProvider?: NotificationProvider;
  private readonly emailProvider?: NotificationProvider;
  private readonly staffRecipients: StaffRecipient[];
  private readonly thresholds: EscalationThresholds;

  private readonly escalations = new Map<string, EscalationRequest>();
  private readonly sessionFailures = new Map<string, number>();

  constructor(options: EscalationHandlerOptions) {
    super();
    this.patientStore = options.patientStore;
    this.smsProvider = options.smsProvider;
    this.emailProvider = options.emailProvider;
    this.staffRecipients = options.staffNotificationRecipients;
    this.thresholds = options.escalationThresholds ?? DEFAULT_THRESHOLDS;
  }

  /**
   * Check if escalation is needed based on message
   */
  shouldEscalate(message: string, confidence: number): {
    shouldEscalate: boolean;
    reason?: EscalationReason;
  } {
    const lowerMessage = message.toLowerCase();

    // Check for emergency keywords
    if (this.isEmergency(lowerMessage)) {
      return { shouldEscalate: true, reason: 'emergency' };
    }

    // Check for explicit escalation request
    if (this.isUserRequestingHuman(lowerMessage)) {
      return { shouldEscalate: true, reason: 'user_request' };
    }

    // Check for complaint indicators
    if (this.isComplaint(lowerMessage)) {
      return { shouldEscalate: true, reason: 'complaint' };
    }

    // Check confidence threshold
    if (confidence < this.thresholds.lowConfidenceThreshold) {
      return { shouldEscalate: true, reason: 'low_confidence' };
    }

    return { shouldEscalate: false };
  }

  /**
   * Record a failed interaction
   */
  recordFailure(sessionId: string): boolean {
    const failures = (this.sessionFailures.get(sessionId) ?? 0) + 1;
    this.sessionFailures.set(sessionId, failures);

    return failures >= this.thresholds.maxFailedInteractions;
  }

  /**
   * Reset failure count for a session
   */
  resetFailures(sessionId: string): void {
    this.sessionFailures.delete(sessionId);
  }

  /**
   * Create an escalation request
   */
  async createEscalation(
    session: ChatSession,
    reason: EscalationReason,
    conversationSummary: string
  ): Promise<EscalationRequest> {
    // Get patient and contact info
    let patient: Patient | null = null;
    let contact: PatientContact | null = null;

    if (session.patientId) {
      patient = await this.patientStore.getPatient(session.patientId);
      if (patient) {
        contact = await this.patientStore.getPrimaryContact(session.patientId);
      }
    }

    // Determine priority
    const priority = this.determinePriority(reason);

    // Get last few messages for context
    const lastMessages = session.messages.slice(-5);

    // Create escalation request
    const escalation: EscalationRequest = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      patientId: session.patientId,
      patientName: patient ? `${patient.firstName} ${patient.lastName}` : undefined,
      contactId: contact?.id,
      contactName: contact ? `${contact.firstName} ${contact.lastName}` : undefined,
      reason,
      priority,
      conversationSummary,
      lastMessages,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Store escalation
    this.escalations.set(escalation.id, escalation);

    // Notify appropriate staff
    await this.notifyStaff(escalation);

    // Emit event
    this.emit(HEALTH_EVENTS.CHAT_ESCALATED, {
      escalationId: escalation.id,
      sessionId: session.id,
      reason,
      priority,
      timestamp: Date.now(),
    });

    return escalation;
  }

  /**
   * Get escalation by ID
   */
  getEscalation(id: string): EscalationRequest | null {
    return this.escalations.get(id) ?? null;
  }

  /**
   * List pending escalations
   */
  getPendingEscalations(): EscalationRequest[] {
    return Array.from(this.escalations.values())
      .filter((e) => e.status === 'pending' || e.status === 'acknowledged')
      .sort((a, b) => {
        // Sort by priority then by creation time
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.createdAt - b.createdAt;
      });
  }

  /**
   * Acknowledge an escalation
   */
  acknowledgeEscalation(id: string, staffMember: string): EscalationRequest | null {
    const escalation = this.escalations.get(id);
    if (!escalation) return null;

    escalation.status = 'acknowledged';
    escalation.assignedTo = staffMember;
    escalation.acknowledgedAt = Date.now();

    return escalation;
  }

  /**
   * Update escalation status
   */
  updateEscalationStatus(
    id: string,
    status: EscalationStatus,
    resolution?: string
  ): EscalationRequest | null {
    const escalation = this.escalations.get(id);
    if (!escalation) return null;

    escalation.status = status;

    if (status === 'resolved') {
      escalation.resolvedAt = Date.now();
      escalation.resolution = resolution;

      // Clean up session failures
      this.sessionFailures.delete(escalation.sessionId);
    }

    return escalation;
  }

  /**
   * Generate user message for escalation
   */
  getEscalationMessage(reason: EscalationReason): string {
    switch (reason) {
      case 'emergency':
        return (
          'I understand this may be an urgent situation. I\'m connecting you with our staff immediately.\n\n' +
          'If this is a medical emergency, please call 911. For mental health crisis support, call or text 988.'
        );

      case 'user_request':
        return (
          'I understand you\'d like to speak with someone directly. I\'m notifying our staff now, ' +
          'and someone will reach out to you shortly.\n\n' +
          'Our typical response time is within 1 business hour.'
        );

      case 'complaint':
        return (
          'I\'m sorry to hear you\'re having concerns. I\'ve escalated this to our team, and ' +
          'a supervisor will contact you to address your concerns personally.\n\n' +
          'We value your feedback and want to make this right.'
        );

      case 'billing_issue':
        return (
          'I\'ve notified our billing department about your question. A billing specialist will ' +
          'reach out to you with more detailed information.\n\n' +
          'For immediate assistance, you can also call our billing line directly.'
        );

      case 'authorization_issue':
        return (
          'Authorization questions often require specific account details. I\'ve notified our ' +
          'authorization team, and they\'ll contact you with more information.\n\n' +
          'You should hear back within 1 business day.'
        );

      case 'low_confidence':
      case 'repeated_failures':
      default:
        return (
          'I want to make sure you get the help you need. I\'ve notified our staff, and ' +
          'someone will follow up with you shortly.\n\n' +
          'Is there anything else I can try to help with in the meantime?'
        );
    }
  }

  /**
   * Check if message indicates emergency
   */
  private isEmergency(message: string): boolean {
    const emergencyKeywords = [
      'emergency',
      'crisis',
      '911',
      'suicide',
      'self-harm',
      'danger',
      'hurt myself',
      'hurt themselves',
      'kill',
    ];

    return emergencyKeywords.some((kw) => message.includes(kw));
  }

  /**
   * Check if user is requesting human assistance
   */
  private isUserRequestingHuman(message: string): boolean {
    const humanRequestKeywords = [
      'speak to a person',
      'talk to someone',
      'talk to a human',
      'speak to a human',
      'real person',
      'representative',
      'agent',
      'manager',
      'supervisor',
      'someone call me',
      'call me back',
    ];

    return humanRequestKeywords.some((kw) => message.includes(kw));
  }

  /**
   * Check if message indicates a complaint
   */
  private isComplaint(message: string): boolean {
    const complaintIndicators = [
      'complaint',
      'frustrated',
      'angry',
      'upset',
      'unacceptable',
      'terrible service',
      'poor service',
      'disappointed',
      'never coming back',
      'report this',
      'file a complaint',
    ];

    return complaintIndicators.some((indicator) => message.includes(indicator));
  }

  /**
   * Determine escalation priority
   */
  private determinePriority(reason: EscalationReason): EscalationPriority {
    switch (reason) {
      case 'emergency':
        return 'urgent';
      case 'complaint':
      case 'user_request':
        return 'high';
      case 'billing_issue':
      case 'authorization_issue':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Notify appropriate staff members
   */
  private async notifyStaff(escalation: EscalationRequest): Promise<void> {
    // Find staff members who should be notified
    const recipientsToNotify = this.staffRecipients.filter((r) =>
      r.notifyFor.includes(escalation.reason)
    );

    if (recipientsToNotify.length === 0) {
      // Notify all supervisors for unhandled reasons
      recipientsToNotify.push(
        ...this.staffRecipients.filter((r) => r.role === 'supervisor')
      );
    }

    // Build notification message
    const message = this.buildStaffNotification(escalation);

    // Send notifications
    for (const recipient of recipientsToNotify) {
      if (recipient.email && this.emailProvider) {
        try {
          await this.emailProvider.send(
            {
              email: recipient.email,
              name: recipient.name,
            },
            {
              templateId: 'chat-escalation',
              subject: `[${escalation.priority.toUpperCase()}] Chat Escalation: ${escalation.reason}`,
              text: message,
              html: this.formatHtmlNotification(escalation),
            }
          );
        } catch {
          // Continue with other notifications
        }
      }

      if (recipient.phone && this.smsProvider && escalation.priority === 'urgent') {
        try {
          await this.smsProvider.send(
            {
              phone: recipient.phone,
              name: recipient.name,
            },
            {
              templateId: 'chat-escalation-sms',
              text: `URGENT: Chat escalation - ${escalation.reason}. Patient: ${escalation.patientName ?? 'Unknown'}. Check dashboard for details.`,
            }
          );
        } catch {
          // Continue with other notifications
        }
      }
    }
  }

  /**
   * Build notification message for staff
   */
  private buildStaffNotification(escalation: EscalationRequest): string {
    const lines = [
      `Priority: ${escalation.priority.toUpperCase()}`,
      `Reason: ${escalation.reason}`,
      `Patient: ${escalation.patientName ?? 'Unknown'}`,
      `Contact: ${escalation.contactName ?? 'Unknown'}`,
      '',
      'Conversation Summary:',
      escalation.conversationSummary,
      '',
      'Recent Messages:',
      ...escalation.lastMessages.map(
        (m) => `[${m.role}]: ${m.content.substring(0, 200)}`
      ),
    ];

    return lines.join('\n');
  }

  /**
   * Format HTML notification
   */
  private formatHtmlNotification(escalation: EscalationRequest): string {
    const priorityColors = {
      urgent: '#dc2626',
      high: '#f59e0b',
      medium: '#3b82f6',
      low: '#6b7280',
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { padding: 10px 15px; border-radius: 5px; margin-bottom: 20px; }
    .urgent { background: #fef2f2; border-left: 4px solid #dc2626; }
    .high { background: #fffbeb; border-left: 4px solid #f59e0b; }
    .medium { background: #eff6ff; border-left: 4px solid #3b82f6; }
    .low { background: #f9fafb; border-left: 4px solid #6b7280; }
    .info-row { margin: 8px 0; }
    .label { font-weight: bold; color: #4b5563; }
    .messages { background: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 15px; }
    .message { margin: 10px 0; padding: 8px; background: white; border-radius: 4px; }
    .user { border-left: 3px solid #3b82f6; }
    .assistant { border-left: 3px solid #10b981; }
  </style>
</head>
<body>
  <div class="header ${escalation.priority}">
    <h2 style="margin: 0; color: ${priorityColors[escalation.priority]};">
      ${escalation.priority.toUpperCase()} Priority Escalation
    </h2>
    <p style="margin: 5px 0 0 0;">Reason: ${escalation.reason.replace('_', ' ')}</p>
  </div>

  <div class="info-row"><span class="label">Patient:</span> ${escalation.patientName ?? 'Unknown'}</div>
  <div class="info-row"><span class="label">Contact:</span> ${escalation.contactName ?? 'Unknown'}</div>
  <div class="info-row"><span class="label">Time:</span> ${new Date(escalation.createdAt).toLocaleString()}</div>

  <h3>Conversation Summary</h3>
  <p>${escalation.conversationSummary}</p>

  <h3>Recent Messages</h3>
  <div class="messages">
    ${escalation.lastMessages
      .map(
        (m) => `
      <div class="message ${m.role}">
        <strong>${m.role === 'user' ? 'Parent' : 'Bot'}:</strong>
        ${m.content.substring(0, 500)}
      </div>
    `
      )
      .join('')}
  </div>

  <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">
    This escalation requires your attention. Please respond via the dashboard or contact the parent directly.
  </p>
</body>
</html>
    `.trim();
  }
}
