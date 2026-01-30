/**
 * Response Generator
 *
 * Generates responses to parent questions based on classified intents.
 * Uses FAQ knowledge base and dynamic data lookups.
 */

import type { FAQStore } from '../../stores/faq-store.js';
import type { PatientStore } from '../../stores/patient-store.js';
import type { AppointmentStore } from '../../stores/appointment-store.js';
import type { AuthorizationStore } from '../../stores/authorization-store.js';
import type { Patient, Appointment, Authorization, FAQEntry } from '../../types.js';
import type { Intent, IntentName, ExtractedEntity } from './intent-classifier.js';

// =============================================================================
// Response Types
// =============================================================================

export interface GeneratedResponse {
  text: string;
  confidence: number;
  source: ResponseSource;
  followUpSuggestions?: string[];
  requiresEscalation: boolean;
  escalationReason?: string;
  metadata?: Record<string, unknown>;
}

export type ResponseSource = 'faq' | 'dynamic' | 'template' | 'fallback';

// =============================================================================
// Response Templates
// =============================================================================

const RESPONSE_TEMPLATES: Record<IntentName, string> = {
  schedule_inquiry:
    'Let me check the schedule for you. {{schedule_info}}',
  schedule_change:
    'I can help you with scheduling changes. To reschedule or cancel an appointment, please contact our office at {{clinic_phone}} or use our patient portal. Cancellations made less than 24 hours in advance may be subject to our cancellation policy.',
  authorization_status:
    'Here\'s the authorization status: {{auth_info}}',
  authorization_units:
    'Current authorization unit status: {{units_info}}',
  billing_question:
    'For billing questions, please contact our billing department at {{billing_phone}} or email {{billing_email}}. You can also view your statements in the patient portal.',
  payment_inquiry:
    'We accept various payment methods including credit cards, debit cards, and HSA/FSA cards. We also work with most major insurance providers. For specific questions about your balance, please contact our billing department.',
  insurance_question:
    'We work with most major insurance providers. To verify your specific coverage for ABA therapy services, please contact your insurance company or our billing department at {{billing_phone}}. Be sure to ask about coverage for CPT codes 97151-97158.',
  therapy_progress:
    'I\'d be happy to discuss your child\'s progress. {{progress_info}} For detailed progress reports, please speak with your BCBA supervisor.',
  goal_inquiry:
    'Your child\'s treatment goals are designed specifically for their needs. {{goals_info}} To discuss goals in detail, please schedule a meeting with your BCBA.',
  behavior_question:
    'Behavior management is an important part of ABA therapy. {{behavior_info}} For specific strategies, please consult with your BCBA who can provide personalized recommendations.',
  session_notes:
    'Session notes are available through your BCBA or in the parent portal. {{notes_info}}',
  therapist_info:
    'Here\'s information about your therapy team: {{therapist_info}}',
  contact_staff:
    'You can reach our office at {{clinic_phone}} during business hours ({{business_hours}}). For urgent matters, please call the main line. For non-urgent questions, you can email us at {{clinic_email}}.',
  policy_question:
    '{{policy_info}} You can find our complete policies in your welcome packet or on our patient portal.',
  emergency:
    'If this is a medical emergency, please call 911 immediately. For mental health crisis support, contact the 988 Suicide & Crisis Lifeline by calling or texting 988. If you need to speak with someone at our office urgently, please call {{clinic_phone}}.',
  greeting:
    'Hello! I\'m here to help answer your questions about appointments, authorizations, billing, and your child\'s ABA therapy. What can I help you with today?',
  thanks:
    'You\'re welcome! Is there anything else I can help you with?',
  unknown:
    'I\'m not sure I understand your question. Could you please rephrase it, or choose from one of these common topics:\n\n• Scheduling & appointments\n• Authorization status\n• Billing & insurance\n• Therapy progress\n• Contact staff',
};

// =============================================================================
// Follow-up Suggestions
// =============================================================================

const FOLLOW_UP_SUGGESTIONS: Record<IntentName, string[]> = {
  schedule_inquiry: [
    'Cancel or reschedule an appointment',
    'What is the cancellation policy?',
    'Who is my therapist?',
  ],
  schedule_change: [
    'What is the cancellation policy?',
    'View my upcoming appointments',
  ],
  authorization_status: [
    'How many units do I have left?',
    'When does my authorization expire?',
  ],
  authorization_units: [
    'When does my authorization expire?',
    'How do I request more units?',
  ],
  billing_question: [
    'What payment methods do you accept?',
    'Does my insurance cover ABA therapy?',
  ],
  payment_inquiry: [
    'View my current balance',
    'Set up a payment plan',
  ],
  insurance_question: [
    'Check my authorization status',
    'What are my out-of-pocket costs?',
  ],
  therapy_progress: [
    'What are my child\'s current goals?',
    'Request a progress report',
  ],
  goal_inquiry: [
    'How is my child progressing?',
    'Schedule a meeting with BCBA',
  ],
  behavior_question: [
    'Request behavior strategies for home',
    'Schedule a parent training session',
  ],
  session_notes: [
    'View progress report',
    'Contact my BCBA',
  ],
  therapist_info: [
    'Contact my therapist',
    'Request a different therapist',
  ],
  contact_staff: [
    'Schedule an appointment',
    'Billing questions',
  ],
  policy_question: [
    'Cancellation policy',
    'No-show policy',
    'Sick child policy',
  ],
  emergency: [],
  greeting: [
    'Check my schedule',
    'Authorization status',
    'Contact staff',
  ],
  thanks: [
    'Check my schedule',
    'Authorization status',
  ],
  unknown: [],
};

// =============================================================================
// Response Generator Options
// =============================================================================

export interface ResponseGeneratorOptions {
  faqStore: FAQStore;
  patientStore: PatientStore;
  appointmentStore: AppointmentStore;
  authorizationStore: AuthorizationStore;
  clinicInfo: {
    name: string;
    phone: string;
    email: string;
    billingPhone?: string;
    billingEmail?: string;
    businessHours: string;
  };
  escalationThreshold?: number;
}

// =============================================================================
// Response Generator
// =============================================================================

export class ResponseGenerator {
  private readonly faqStore: FAQStore;
  private readonly patientStore: PatientStore;
  private readonly appointmentStore: AppointmentStore;
  private readonly authorizationStore: AuthorizationStore;
  private readonly clinicInfo: ResponseGeneratorOptions['clinicInfo'];
  private readonly escalationThreshold: number;

  constructor(options: ResponseGeneratorOptions) {
    this.faqStore = options.faqStore;
    this.patientStore = options.patientStore;
    this.appointmentStore = options.appointmentStore;
    this.authorizationStore = options.authorizationStore;
    this.clinicInfo = options.clinicInfo;
    this.escalationThreshold = options.escalationThreshold ?? 0.3;
  }

  /**
   * Generate response for a classified intent
   */
  async generateResponse(
    userId: string,
    patientId: string | undefined,
    intent: Intent,
    originalMessage: string
  ): Promise<GeneratedResponse> {
    // Check for emergency
    if (intent.name === 'emergency') {
      return this.generateEmergencyResponse();
    }

    // Check if escalation needed due to low confidence
    if (intent.confidence < this.escalationThreshold) {
      return this.generateEscalationResponse(intent, 'Low confidence in understanding the question');
    }

    // Try FAQ first
    const faqResponse = await this.tryFAQResponse(userId, intent, originalMessage);
    if (faqResponse) {
      return faqResponse;
    }

    // Generate dynamic response based on intent
    const dynamicResponse = await this.generateDynamicResponse(
      userId,
      patientId,
      intent
    );
    if (dynamicResponse) {
      return dynamicResponse;
    }

    // Fall back to template
    return this.generateTemplateResponse(intent);
  }

  /**
   * Try to find a matching FAQ response
   */
  private async tryFAQResponse(
    userId: string,
    intent: Intent,
    message: string
  ): Promise<GeneratedResponse | null> {
    // Search FAQ for similar questions
    const faqMatches = await this.faqStore.findSimilarQuestions(userId, message);

    if (faqMatches.length === 0) {
      return null;
    }

    const bestMatch = faqMatches[0];

    // Track view
    await this.faqStore.incrementViewCount(bestMatch.id);

    return {
      text: bestMatch.answer,
      confidence: intent.confidence,
      source: 'faq',
      followUpSuggestions: bestMatch.relatedFAQs ?? FOLLOW_UP_SUGGESTIONS[intent.name],
      requiresEscalation: false,
      metadata: {
        faqId: bestMatch.id,
        faqQuestion: bestMatch.questions[0],
      },
    };
  }

  /**
   * Generate dynamic response with real data
   */
  private async generateDynamicResponse(
    userId: string,
    patientId: string | undefined,
    intent: Intent
  ): Promise<GeneratedResponse | null> {
    if (!patientId) {
      return null;
    }

    let data: Record<string, unknown> = {};
    let text = '';

    switch (intent.name) {
      case 'schedule_inquiry': {
        const appointments = await this.getUpcomingAppointments(userId, patientId);
        if (appointments.length > 0) {
          text = this.formatScheduleResponse(appointments);
          data = { appointments };
        }
        break;
      }

      case 'authorization_status': {
        const authorizations = await this.authorizationStore.getActiveAuthorizations(
          userId,
          patientId
        );
        if (authorizations.length > 0) {
          text = this.formatAuthorizationStatusResponse(authorizations);
          data = { authorizations };
        }
        break;
      }

      case 'authorization_units': {
        const authorizations = await this.authorizationStore.getActiveAuthorizations(
          userId,
          patientId
        );
        if (authorizations.length > 0) {
          text = this.formatUnitsResponse(authorizations);
          data = { authorizations };
        }
        break;
      }

      case 'therapist_info': {
        const patient = await this.patientStore.getPatient(patientId);
        if (patient?.assignedBCBA) {
          text = this.formatTherapistResponse(patient);
          data = { patient };
        }
        break;
      }

      default:
        return null;
    }

    if (!text) {
      return null;
    }

    return {
      text,
      confidence: intent.confidence,
      source: 'dynamic',
      followUpSuggestions: FOLLOW_UP_SUGGESTIONS[intent.name],
      requiresEscalation: false,
      metadata: data,
    };
  }

  /**
   * Generate response from template
   */
  private generateTemplateResponse(intent: Intent): GeneratedResponse {
    const template = RESPONSE_TEMPLATES[intent.name] || RESPONSE_TEMPLATES.unknown;
    const text = this.applyTemplateVariables(template);

    return {
      text,
      confidence: intent.confidence,
      source: 'template',
      followUpSuggestions: FOLLOW_UP_SUGGESTIONS[intent.name],
      requiresEscalation: intent.name === 'unknown',
      escalationReason: intent.name === 'unknown' ? 'Unable to understand question' : undefined,
    };
  }

  /**
   * Generate emergency response
   */
  private generateEmergencyResponse(): GeneratedResponse {
    const text = this.applyTemplateVariables(RESPONSE_TEMPLATES.emergency);

    return {
      text,
      confidence: 1,
      source: 'template',
      requiresEscalation: true,
      escalationReason: 'Emergency or crisis detected',
    };
  }

  /**
   * Generate escalation response
   */
  private generateEscalationResponse(intent: Intent, reason: string): GeneratedResponse {
    return {
      text:
        `I'm having trouble understanding your question. Let me connect you with our staff who can help.\n\n` +
        `In the meantime, here are some common topics I can help with:\n` +
        `• Scheduling & appointments\n` +
        `• Authorization status & units\n` +
        `• Billing & insurance questions\n` +
        `• Therapy progress & goals\n\n` +
        `Or you can contact us directly at ${this.clinicInfo.phone}.`,
      confidence: intent.confidence,
      source: 'fallback',
      requiresEscalation: true,
      escalationReason: reason,
    };
  }

  /**
   * Get upcoming appointments for a patient
   */
  private async getUpcomingAppointments(
    userId: string,
    patientId: string
  ): Promise<Appointment[]> {
    const now = Date.now();
    const twoWeeksFromNow = now + 14 * 24 * 60 * 60 * 1000;

    const appointments = await this.appointmentStore.getAppointmentsByPatient(
      userId,
      patientId
    );

    return appointments
      .filter((a) => a.startTime >= now && a.startTime <= twoWeeksFromNow)
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => a.startTime - b.startTime)
      .slice(0, 5);
  }

  /**
   * Format schedule response
   */
  private formatScheduleResponse(appointments: Appointment[]): string {
    if (appointments.length === 0) {
      return 'You have no upcoming appointments scheduled. Would you like to schedule a session?';
    }

    const lines = ['Here are your upcoming appointments:\n'];

    for (const apt of appointments) {
      const date = new Date(apt.startTime);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const status = apt.status === 'confirmed' ? '✓ Confirmed' : 'Pending confirmation';

      lines.push(`• ${dateStr} at ${timeStr} - ${status}`);
    }

    return lines.join('\n');
  }

  /**
   * Format authorization status response
   */
  private formatAuthorizationStatusResponse(authorizations: Authorization[]): string {
    if (authorizations.length === 0) {
      return 'No active authorizations found. Please contact our office for assistance.';
    }

    const lines = ['Here\'s your authorization status:\n'];

    for (const auth of authorizations) {
      const endDate = new Date(auth.endDate).toLocaleDateString();
      const status = auth.status === 'approved' ? '✓ Approved' : auth.status;

      lines.push(`• ${auth.serviceDescription}`);
      lines.push(`  Status: ${status}`);
      lines.push(`  Valid through: ${endDate}`);
      lines.push(`  Units remaining: ${auth.remainingUnits} of ${auth.totalUnits}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format units response
   */
  private formatUnitsResponse(authorizations: Authorization[]): string {
    if (authorizations.length === 0) {
      return 'No active authorizations found. Please contact our office for assistance.';
    }

    const lines = ['Current authorization units:\n'];

    for (const auth of authorizations) {
      const percentUsed = Math.round((auth.usedUnits / auth.totalUnits) * 100);
      const daysRemaining = Math.ceil(
        (auth.endDate - Date.now()) / (24 * 60 * 60 * 1000)
      );

      lines.push(`• ${auth.serviceDescription}`);
      lines.push(`  Total units: ${auth.totalUnits}`);
      lines.push(`  Used: ${auth.usedUnits} (${percentUsed}%)`);
      lines.push(`  Remaining: ${auth.remainingUnits}`);
      lines.push(`  Days until expiration: ${daysRemaining}`);
      lines.push('');
    }

    if (authorizations.some((a) => a.remainingUnits / a.totalUnits < 0.2)) {
      lines.push('⚠️ Note: One or more authorizations are running low on units. Please contact us about renewal.');
    }

    return lines.join('\n');
  }

  /**
   * Format therapist info response
   */
  private formatTherapistResponse(patient: Patient): string {
    const lines = ['Your therapy team:\n'];

    if (patient.assignedBCBA) {
      lines.push(`BCBA Supervisor: ${patient.assignedBCBA}`);
    }

    lines.push('');
    lines.push(`For questions about your child's treatment, please contact your BCBA supervisor.`);

    return lines.join('\n');
  }

  /**
   * Apply template variables
   */
  private applyTemplateVariables(template: string): string {
    const variables: Record<string, string> = {
      clinic_name: this.clinicInfo.name,
      clinic_phone: this.clinicInfo.phone,
      clinic_email: this.clinicInfo.email,
      billing_phone: this.clinicInfo.billingPhone ?? this.clinicInfo.phone,
      billing_email: this.clinicInfo.billingEmail ?? this.clinicInfo.email,
      business_hours: this.clinicInfo.businessHours,
    };

    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Remove any unreplaced placeholders
    result = result.replace(/{{[^}]+}}/g, '');

    return result;
  }
}
