/**
 * Meeting Prep
 *
 * AI-powered meeting preparation with participant research and context
 */

import type {
  MeetingPrep,
  ParticipantInfo,
  MeetingContext,
  AgendaItem,
  PrepDocument,
  MeetingHistory,
  CalendarEvent,
  EmailSummary,
  EmailParticipant,
} from './types.js';
import { DailyDriverError } from './types.js';
import type { CalendarManager } from './calendar-manager.js';
import type { EmailSummarizer } from './email-summarizer.js';
import type { InboxZeroManager } from './inbox-zero.js';
import {
  DAILY_DRIVER_EVENTS,
  MEETING_PREP_DEFAULTS,
  MEETING_TYPES,
  TIME_CONSTANTS,
} from './constants.js';

// =============================================================================
// AI Prep Assistant Interface
// =============================================================================

export interface AIPrepAssistant {
  generateTalkingPoints(context: MeetingContext, participants: ParticipantInfo[]): Promise<string[]>;
  generateQuestions(context: MeetingContext, previousMeetings: MeetingHistory[]): Promise<string[]>;
  suggestAgenda(context: MeetingContext, duration: number): Promise<AgendaItem[]>;
  enrichParticipant(participant: EmailParticipant): Promise<Partial<ParticipantInfo>>;
}

// =============================================================================
// Meeting Prep Config
// =============================================================================

export interface MeetingPrepConfig {
  /** Calendar manager */
  calendarManager?: CalendarManager;
  /** Email summarizer */
  emailSummarizer?: EmailSummarizer;
  /** Inbox manager */
  inboxManager?: InboxZeroManager;
  /** AI prep assistant */
  aiAssistant?: AIPrepAssistant;
  /** Lead time for prep in minutes */
  prepLeadTimeMinutes: number;
  /** Maximum previous meetings to include */
  maxPreviousMeetings: number;
  /** Maximum related emails per participant */
  maxRelatedEmails: number;
  /** Event callback */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: MeetingPrepConfig = {
  prepLeadTimeMinutes: MEETING_PREP_DEFAULTS.PREP_LEAD_TIME_MINUTES,
  maxPreviousMeetings: MEETING_PREP_DEFAULTS.MAX_PREVIOUS_MEETINGS,
  maxRelatedEmails: MEETING_PREP_DEFAULTS.MAX_RELATED_EMAILS,
};

// =============================================================================
// Meeting History Store Interface
// =============================================================================

export interface MeetingHistoryStore {
  getMeetingsWithParticipant(email: string, limit?: number): Promise<MeetingHistory[]>;
  getMeetingsInSeries(seriesId: string, limit?: number): Promise<MeetingHistory[]>;
  saveMeetingNotes(eventId: string, notes: string, actionItems?: string[]): Promise<void>;
  getMeetingNotes(eventId: string): Promise<{ notes: string; actionItems: string[] } | null>;
}

// =============================================================================
// Meeting Prep Generator
// =============================================================================

export class MeetingPrepGenerator {
  private readonly config: MeetingPrepConfig;
  private historyStore: MeetingHistoryStore | null = null;

  constructor(config?: Partial<MeetingPrepConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the meeting history store
   */
  setHistoryStore(store: MeetingHistoryStore): void {
    this.historyStore = store;
  }

  /**
   * Generate prep for an event
   */
  async generatePrep(event: CalendarEvent): Promise<MeetingPrep> {
    const context = this.determineMeetingContext(event);
    const participants = await this.enrichParticipants(event.attendees);
    const previousMeetings = await this.getPreviousMeetings(event, participants);
    const documents = await this.gatherDocuments(event, participants);

    let talkingPoints: string[] = [];
    let questions: string[] = [];
    let agenda: AgendaItem[] | undefined;

    if (this.config.aiAssistant) {
      [talkingPoints, questions, agenda] = await Promise.all([
        this.config.aiAssistant.generateTalkingPoints(context, participants),
        this.config.aiAssistant.generateQuestions(context, previousMeetings),
        event.description?.includes('agenda')
          ? Promise.resolve(undefined)
          : this.config.aiAssistant.suggestAgenda(context, (event.end - event.start) / TIME_CONSTANTS.MINUTE_MS),
      ]);
    } else {
      talkingPoints = this.generateDefaultTalkingPoints(context, event);
      questions = this.generateDefaultQuestions(context);
    }

    const reminders = this.generateReminders(event, context, participants);

    const prep: MeetingPrep = {
      eventId: event.id,
      event,
      preparedAt: Date.now(),
      participants,
      context,
      agenda,
      talkingPoints,
      questions,
      documents,
      previousMeetings,
      reminders,
    };

    this.emit(DAILY_DRIVER_EVENTS.MEETING_PREP_READY, {
      eventId: event.id,
      title: event.title,
      participantCount: participants.length,
    });

    return prep;
  }

  /**
   * Generate prep for upcoming meetings
   */
  async generateUpcomingPreps(hoursAhead: number = 24): Promise<MeetingPrep[]> {
    if (!this.config.calendarManager) {
      return [];
    }

    const events = await this.config.calendarManager.getUpcomingEvents(hoursAhead);

    // Filter out all-day events and very short meetings
    const meetingsToPrep = events.filter(e =>
      !e.isAllDay &&
      (e.end - e.start) >= 15 * TIME_CONSTANTS.MINUTE_MS &&
      e.attendees.length > 0
    );

    const preps: MeetingPrep[] = [];
    for (const event of meetingsToPrep) {
      try {
        const prep = await this.generatePrep(event);
        preps.push(prep);
      } catch {
        // Skip failed preps
      }
    }

    return preps;
  }

  /**
   * Get next meeting that needs prep
   */
  async getNextMeetingNeedingPrep(): Promise<CalendarEvent | null> {
    if (!this.config.calendarManager) {
      return null;
    }

    const events = await this.config.calendarManager.getUpcomingEvents(8);

    const now = Date.now();
    const prepWindow = this.config.prepLeadTimeMinutes * TIME_CONSTANTS.MINUTE_MS;

    // Find first meeting within prep window
    return events.find(e =>
      !e.isAllDay &&
      e.start - now <= prepWindow &&
      e.start > now &&
      e.attendees.length > 0
    ) ?? null;
  }

  /**
   * Format prep as text
   */
  formatAsText(prep: MeetingPrep): string {
    const lines: string[] = [];
    const meetingTime = new Date(prep.event.start).toLocaleString();

    lines.push(`📋 Meeting Prep: ${prep.event.title}`);
    lines.push(`📅 ${meetingTime}`);
    if (prep.event.location) {
      lines.push(`📍 ${prep.event.location}`);
    }
    lines.push('='.repeat(50));
    lines.push('');

    // Context
    lines.push(`Type: ${prep.context.type.replace('_', ' ')}`);
    lines.push(`Purpose: ${prep.context.purpose}`);
    lines.push('');

    // Participants
    lines.push('👥 Participants:');
    for (const p of prep.participants) {
      const details = [p.title, p.company].filter(Boolean).join(', ');
      lines.push(`  • ${p.name ?? p.email}${details ? ` (${details})` : ''}`);
    }
    lines.push('');

    // Agenda
    if (prep.agenda && prep.agenda.length > 0) {
      lines.push('📝 Suggested Agenda:');
      for (const item of prep.agenda) {
        lines.push(`  ${item.duration}min - ${item.title}`);
      }
      lines.push('');
    }

    // Talking points
    if (prep.talkingPoints.length > 0) {
      lines.push('💬 Talking Points:');
      for (const point of prep.talkingPoints) {
        lines.push(`  • ${point}`);
      }
      lines.push('');
    }

    // Questions
    if (prep.questions.length > 0) {
      lines.push('❓ Questions to Consider:');
      for (const q of prep.questions) {
        lines.push(`  • ${q}`);
      }
      lines.push('');
    }

    // Documents
    if (prep.documents.length > 0) {
      lines.push('📎 Related Documents:');
      for (const doc of prep.documents) {
        lines.push(`  • ${doc.title} - ${doc.relevance}`);
      }
      lines.push('');
    }

    // Previous meetings
    if (prep.previousMeetings.length > 0) {
      lines.push('📜 Previous Meetings:');
      for (const meeting of prep.previousMeetings.slice(0, 3)) {
        const date = new Date(meeting.date).toLocaleDateString();
        lines.push(`  • ${date}: ${meeting.title}`);
        if (meeting.outcome) {
          lines.push(`    Outcome: ${meeting.outcome}`);
        }
      }
      lines.push('');
    }

    // Reminders
    if (prep.reminders.length > 0) {
      lines.push('⚠️ Reminders:');
      for (const reminder of prep.reminders) {
        lines.push(`  • ${reminder}`);
      }
    }

    return lines.join('\n');
  }

  // ==========================================================================
  // Context & Enrichment
  // ==========================================================================

  private determineMeetingContext(event: CalendarEvent): MeetingContext {
    const title = event.title.toLowerCase();
    const description = event.description?.toLowerCase() ?? '';
    const attendeeCount = event.attendees.length;
    const isRecurring = !!event.recurrence;

    // Determine meeting type
    let type: MeetingContext['type'] = 'team';

    if (attendeeCount === 2) {
      type = 'one_on_one';
    } else if (title.includes('interview') || description.includes('candidate')) {
      type = 'interview';
    } else if (title.includes('present') || title.includes('demo') || title.includes('review')) {
      if (title.includes('review')) {
        type = 'review';
      } else {
        type = 'presentation';
      }
    } else if (title.includes('brainstorm') || title.includes('ideation')) {
      type = 'brainstorm';
    } else if (event.attendees.some(a => !a.email.includes('@' + this.extractDomain(event.organizer.email)))) {
      type = 'external';
    }

    // Determine purpose
    let purpose = 'General discussion';
    if (title.includes('sync') || title.includes('standup') || title.includes('check-in')) {
      purpose = 'Regular sync and status update';
    } else if (title.includes('planning') || title.includes('kickoff')) {
      purpose = 'Planning and alignment';
    } else if (title.includes('review') || title.includes('retrospective')) {
      purpose = 'Review and feedback';
    } else if (title.includes('training') || title.includes('onboarding')) {
      purpose = 'Knowledge sharing and training';
    } else if (title.includes('decision') || title.includes('approval')) {
      purpose = 'Decision making';
    }

    return {
      purpose,
      type,
      isRecurring,
    };
  }

  private async enrichParticipants(attendees: CalendarEvent['attendees']): Promise<ParticipantInfo[]> {
    const enriched: ParticipantInfo[] = [];

    for (const attendee of attendees) {
      let participantInfo: ParticipantInfo = {
        ...attendee,
      };

      // Get recent emails
      if (this.config.inboxManager && this.config.emailSummarizer) {
        try {
          // This would need the inbox manager to support filtering by sender
          // For now, we'll skip this enrichment
        } catch {
          // Ignore errors
        }
      }

      // AI enrichment
      if (this.config.aiAssistant) {
        try {
          const enrichment = await this.config.aiAssistant.enrichParticipant(attendee);
          participantInfo = { ...participantInfo, ...enrichment };

          this.emit(DAILY_DRIVER_EVENTS.PARTICIPANT_ENRICHED, {
            email: attendee.email,
            enriched: !!enrichment.title || !!enrichment.company,
          });
        } catch {
          // Ignore errors
        }
      }

      enriched.push(participantInfo);
    }

    return enriched;
  }

  private async getPreviousMeetings(
    event: CalendarEvent,
    participants: ParticipantInfo[]
  ): Promise<MeetingHistory[]> {
    if (!this.historyStore) {
      return [];
    }

    const allMeetings: MeetingHistory[] = [];

    // Get meetings with each participant
    for (const participant of participants.slice(0, 3)) {
      try {
        const meetings = await this.historyStore.getMeetingsWithParticipant(
          participant.email,
          this.config.maxPreviousMeetings
        );
        allMeetings.push(...meetings);
      } catch {
        // Ignore errors
      }
    }

    // Get meetings in same series
    if (event.iCalUID) {
      try {
        const seriesMeetings = await this.historyStore.getMeetingsInSeries(
          event.iCalUID,
          this.config.maxPreviousMeetings
        );
        allMeetings.push(...seriesMeetings);
      } catch {
        // Ignore errors
      }
    }

    // Deduplicate and sort
    const seen = new Set<string>();
    return allMeetings
      .filter(m => {
        if (seen.has(m.eventId)) return false;
        seen.add(m.eventId);
        return true;
      })
      .sort((a, b) => b.date - a.date)
      .slice(0, this.config.maxPreviousMeetings);
  }

  private async gatherDocuments(
    event: CalendarEvent,
    participants: ParticipantInfo[]
  ): Promise<PrepDocument[]> {
    const documents: PrepDocument[] = [];

    // Add event attachments
    if (event.attachments) {
      for (const attachment of event.attachments) {
        documents.push({
          title: attachment.title,
          type: 'attachment',
          url: attachment.fileUrl,
          relevance: 'Meeting attachment',
        });
      }
    }

    // Add recent emails from participants
    for (const participant of participants.slice(0, 3)) {
      if (participant.recentEmails) {
        for (const email of participant.recentEmails.slice(0, 2)) {
          documents.push({
            title: email.summary.substring(0, 50),
            type: 'email',
            summary: email.summary,
            relevance: `Recent email from ${participant.name ?? participant.email}`,
          });
        }
      }
    }

    return documents;
  }

  // ==========================================================================
  // Content Generation
  // ==========================================================================

  private generateDefaultTalkingPoints(context: MeetingContext, event: CalendarEvent): string[] {
    const points: string[] = [];

    switch (context.type) {
      case 'one_on_one':
        points.push('Check in on current projects and workload');
        points.push('Discuss any blockers or challenges');
        points.push('Review action items from last meeting');
        break;

      case 'team':
        points.push('Share updates on key initiatives');
        points.push('Align on priorities for the week');
        points.push('Discuss any cross-team dependencies');
        break;

      case 'external':
        points.push('Set clear expectations for the meeting');
        points.push('Prepare key questions for the other party');
        points.push('Have follow-up actions ready');
        break;

      case 'presentation':
        points.push('Test presentation materials beforehand');
        points.push('Prepare for likely questions');
        points.push('Have backup materials ready');
        break;

      case 'interview':
        points.push('Review candidate background');
        points.push('Prepare structured interview questions');
        points.push('Note evaluation criteria');
        break;

      case 'review':
        points.push('Gather relevant metrics and data');
        points.push('Note key achievements and challenges');
        points.push('Prepare improvement suggestions');
        break;

      case 'brainstorm':
        points.push('Define problem statement clearly');
        points.push('Encourage all ideas without judgment');
        points.push('Plan for idea evaluation process');
        break;
    }

    return points;
  }

  private generateDefaultQuestions(context: MeetingContext): string[] {
    const questions: string[] = [];

    switch (context.type) {
      case 'one_on_one':
        questions.push('What\'s going well this week?');
        questions.push('What challenges are you facing?');
        questions.push('How can I help remove any blockers?');
        break;

      case 'external':
        questions.push('What are the key objectives for this meeting?');
        questions.push('What would success look like?');
        questions.push('What are the next steps after this meeting?');
        break;

      default:
        questions.push('What are the key decisions to be made?');
        questions.push('What information is missing?');
        questions.push('What are the action items?');
    }

    return questions.slice(0, MEETING_PREP_DEFAULTS.MAX_QUESTIONS);
  }

  private generateReminders(
    event: CalendarEvent,
    context: MeetingContext,
    participants: ParticipantInfo[]
  ): string[] {
    const reminders: string[] = [];

    // Conference link reminder
    if (event.conferenceLink) {
      reminders.push('Join link is available in the calendar invite');
    } else if (!event.location) {
      reminders.push('No location or meeting link specified - confirm with organizer');
    }

    // Large meeting reminder
    if (participants.length > 5) {
      reminders.push('Large meeting - consider if all attendees are necessary');
    }

    // External meeting reminder
    if (context.type === 'external') {
      reminders.push('External meeting - review confidentiality before sharing');
    }

    // Recurring meeting
    if (context.isRecurring) {
      reminders.push('Review notes from previous occurrences');
    }

    // Time-based reminders
    const durationMinutes = (event.end - event.start) / TIME_CONSTANTS.MINUTE_MS;
    if (durationMinutes >= 60) {
      reminders.push('Long meeting - prepare an agenda to stay on track');
    }

    return reminders;
  }

  private extractDomain(email: string): string {
    return email.split('@')[1] ?? '';
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createMeetingPrepGenerator(config?: Partial<MeetingPrepConfig>): MeetingPrepGenerator {
  return new MeetingPrepGenerator(config);
}
