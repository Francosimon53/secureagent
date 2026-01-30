/**
 * Daily Driver Module Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DailyDriver,
  createDailyDriver,
  EmailSummarizer,
  createEmailSummarizer,
  InboxZeroManager,
  createInboxZeroManager,
  CalendarManager,
  createCalendarManager,
  TaskScorer,
  createTaskScorer,
  MorningBriefGenerator,
  createMorningBriefGenerator,
  WeeklyReviewGenerator,
  createWeeklyReviewGenerator,
  MeetingPrepGenerator,
  createMeetingPrepGenerator,
  DAILY_DRIVER_EVENTS,
  TIME_CONSTANTS,
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  formatDuration,
} from '../../src/daily-driver/index.js';
import type {
  Email,
  CalendarEvent,
  Task,
  EmailProvider,
  CalendarProvider,
  TaskProvider,
} from '../../src/daily-driver/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestEmail(overrides?: Partial<Email>): Email {
  return {
    id: 'email-1',
    threadId: 'thread-1',
    from: { name: 'John Doe', email: 'john@example.com' },
    to: [{ name: 'Jane Doe', email: 'jane@example.com' }],
    subject: 'Test Email',
    body: 'This is a test email body with some content.',
    receivedAt: Date.now() - 3600000,
    isRead: false,
    isStarred: false,
    labels: ['INBOX'],
    ...overrides,
  };
}

function createTestEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  const start = Date.now() + 3600000; // 1 hour from now
  return {
    id: 'event-1',
    calendarId: 'primary',
    title: 'Test Meeting',
    start,
    end: start + 3600000,
    isAllDay: false,
    status: 'confirmed',
    visibility: 'default',
    organizer: { email: 'organizer@example.com' },
    attendees: [
      { email: 'attendee1@example.com', responseStatus: 'accepted' },
      { email: 'attendee2@example.com', responseStatus: 'tentative' },
    ],
    ...overrides,
  };
}

function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    status: 'pending',
    priority: 'medium',
    energyRequired: 'medium',
    tags: [],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now(),
    ...overrides,
  };
}

// Mock providers
function createMockEmailProvider(): EmailProvider {
  return {
    name: 'mock-email',
    listEmails: vi.fn().mockResolvedValue([]),
    getEmail: vi.fn().mockResolvedValue(null),
    getThread: vi.fn().mockResolvedValue(null),
    markAsRead: vi.fn().mockResolvedValue(undefined),
    markAsUnread: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    trash: vi.fn().mockResolvedValue(undefined),
    label: vi.fn().mockResolvedValue(undefined),
    unlabel: vi.fn().mockResolvedValue(undefined),
    star: vi.fn().mockResolvedValue(undefined),
    unstar: vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue('sent-id'),
    createDraft: vi.fn().mockResolvedValue('draft-id'),
  };
}

function createMockCalendarProvider(): CalendarProvider {
  return {
    name: 'mock-calendar',
    listEvents: vi.fn().mockResolvedValue([]),
    getEvent: vi.fn().mockResolvedValue(null),
    createEvent: vi.fn().mockImplementation((calId, event) => Promise.resolve({ ...event, id: 'new-event', calendarId: calId })),
    updateEvent: vi.fn().mockResolvedValue(null),
    deleteEvent: vi.fn().mockResolvedValue(true),
    respondToEvent: vi.fn().mockResolvedValue(undefined),
    getFreeBusy: vi.fn().mockResolvedValue([]),
  };
}

function createMockTaskProvider(): TaskProvider {
  return {
    name: 'mock-tasks',
    listTasks: vi.fn().mockResolvedValue([]),
    getTask: vi.fn().mockResolvedValue(null),
    createTask: vi.fn().mockImplementation(task => Promise.resolve({ ...task, id: 'new-task', createdAt: Date.now(), updatedAt: Date.now() })),
    updateTask: vi.fn().mockResolvedValue(null),
    deleteTask: vi.fn().mockResolvedValue(true),
    completeTask: vi.fn().mockResolvedValue(null),
    reorderTasks: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Email Summarizer Tests
// =============================================================================

describe('EmailSummarizer', () => {
  let summarizer: EmailSummarizer;

  beforeEach(() => {
    summarizer = createEmailSummarizer();
  });

  describe('summarization', () => {
    it('should summarize email', async () => {
      const email = createTestEmail({
        body: 'Please review the attached document and provide your feedback by Friday.',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.emailId).toBe(email.id);
      expect(summary.summary).toBeDefined();
      expect(summary.keyPoints).toBeInstanceOf(Array);
      expect(summary.actionItems).toBeInstanceOf(Array);
      expect(summary.estimatedReadTime).toBeGreaterThan(0);
    });

    it('should detect priority from urgent keywords', async () => {
      const email = createTestEmail({
        subject: 'URGENT: Action Required Immediately',
        body: 'This is an urgent request that needs immediate attention.',
      });

      const summary = await summarizer.summarize(email);

      expect(['urgent', 'high']).toContain(summary.priority);
    });

    it('should categorize promotional emails', async () => {
      const email = createTestEmail({
        subject: 'Special Offer: 50% OFF Sale!',
        body: 'Limited time offer - get 50% off all items. Sale ends Friday!',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.category).toBe('promotional');
    });

    it('should categorize newsletters', async () => {
      const email = createTestEmail({
        body: 'Weekly digest - Here are the top stories. Click here to unsubscribe.',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.category).toBe('newsletter');
    });

    it('should boost priority for VIP contacts', async () => {
      const vipSummarizer = createEmailSummarizer({
        vipContacts: ['vip@example.com'],
      });

      // Create two emails with similar content - one from VIP, one from non-VIP
      const vipEmail = createTestEmail({
        from: { name: 'VIP Contact', email: 'vip@example.com' },
        body: 'Please review this important document.',
      });

      const regularEmail = createTestEmail({
        from: { name: 'Regular User', email: 'regular@example.com' },
        body: 'Please review this important document.',
      });

      const vipSummary = await vipSummarizer.summarize(vipEmail);
      const regularSummary = await vipSummarizer.summarize(regularEmail);

      // VIP email should have higher or equal priority
      const priorityOrder = ['low', 'normal', 'high', 'urgent'];
      const vipIndex = priorityOrder.indexOf(vipSummary.priority);
      const regularIndex = priorityOrder.indexOf(regularSummary.priority);

      expect(vipIndex).toBeGreaterThanOrEqual(regularIndex);
    });
  });

  describe('sentiment analysis', () => {
    it('should detect negative sentiment', async () => {
      const email = createTestEmail({
        body: 'I am very disappointed with the service. This is a serious problem.',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.sentiment).toBe('negative');
    });

    it('should detect positive sentiment', async () => {
      const email = createTestEmail({
        body: 'Great job on the project! The results are excellent and we appreciate your work.',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.sentiment).toBe('positive');
    });

    it('should detect urgent sentiment', async () => {
      const email = createTestEmail({
        body: 'This is critical and needs to be addressed ASAP. Emergency situation.',
      });

      const summary = await summarizer.summarize(email);

      expect(summary.sentiment).toBe('urgent');
    });
  });

  describe('caching', () => {
    it('should cache summaries', async () => {
      const email = createTestEmail();

      const summary1 = await summarizer.summarize(email);
      const summary2 = await summarizer.summarize(email);

      expect(summary1).toEqual(summary2);
    });

    it('should clear cache', async () => {
      const email = createTestEmail();

      await summarizer.summarize(email);
      summarizer.clearCache(email.id);

      // Should recompute after cache clear
      const summary = await summarizer.summarize(email);
      expect(summary.emailId).toBe(email.id);
    });
  });
});

// =============================================================================
// Inbox Zero Manager Tests
// =============================================================================

describe('InboxZeroManager', () => {
  let manager: InboxZeroManager;
  let mockProvider: EmailProvider;

  beforeEach(() => {
    mockProvider = createMockEmailProvider();
    manager = createInboxZeroManager({
      provider: mockProvider,
    });
  });

  describe('triage', () => {
    it('should triage emails', async () => {
      const emails = [
        createTestEmail({ id: 'email-1' }),
        createTestEmail({ id: 'email-2' }),
      ];
      vi.mocked(mockProvider.listEmails).mockResolvedValue(emails);

      const decisions = await manager.triageInbox();

      expect(decisions).toHaveLength(2);
      expect(decisions[0].emailId).toBe('email-1');
      expect(decisions[0].actions).toBeInstanceOf(Array);
    });

    it('should recommend archiving promotional emails', async () => {
      const email = createTestEmail({
        subject: '50% OFF Sale!',
        body: 'Limited time discount offer!',
      });
      vi.mocked(mockProvider.listEmails).mockResolvedValue([email]);

      const decisions = await manager.triageInbox();

      expect(decisions[0].actions.some(a => a.type === 'archive')).toBe(true);
    });

    it('should star VIP emails', async () => {
      const vipManager = createInboxZeroManager({
        provider: mockProvider,
        vipContacts: ['vip@example.com'],
      });

      const email = createTestEmail({
        from: { email: 'vip@example.com' },
      });
      vi.mocked(mockProvider.listEmails).mockResolvedValue([email]);

      const decisions = await vipManager.triageInbox();

      expect(decisions[0].actions.some(a => a.type === 'star')).toBe(true);
      expect(decisions[0].requiresReview).toBe(true);
    });
  });

  describe('stats', () => {
    it('should calculate inbox stats', async () => {
      const emails = [
        createTestEmail({ isRead: false }),
        createTestEmail({ isRead: false }),
        createTestEmail({ isRead: true }),
      ];
      vi.mocked(mockProvider.listEmails).mockResolvedValue(emails);

      const stats = await manager.getStats();

      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(2);
    });
  });
});

// =============================================================================
// Calendar Manager Tests
// =============================================================================

describe('CalendarManager', () => {
  let manager: CalendarManager;
  let mockProvider: CalendarProvider;

  beforeEach(() => {
    mockProvider = createMockCalendarProvider();
    manager = createCalendarManager({
      provider: mockProvider,
      workStartHour: 9,
      workEndHour: 17,
    });
  });

  describe('day overview', () => {
    it('should get day overview', async () => {
      const events = [
        createTestEvent({ title: 'Meeting 1' }),
        createTestEvent({ title: 'Meeting 2' }),
      ];
      vi.mocked(mockProvider.listEvents).mockResolvedValue(events);

      const overview = await manager.getDayOverview();

      expect(overview.events).toHaveLength(2);
      expect(overview.busyTime).toBeGreaterThan(0);
    });

    it('should calculate focus time', async () => {
      // No meetings = all focus time
      vi.mocked(mockProvider.listEvents).mockResolvedValue([]);

      const overview = await manager.getDayOverview();

      expect(overview.freeTime).toBeGreaterThan(0);
    });
  });

  describe('conflict detection', () => {
    it('should detect overlapping events', () => {
      const now = Date.now();
      const events = [
        createTestEvent({ id: 'e1', start: now, end: now + 3600000 }),
        createTestEvent({ id: 'e2', start: now + 1800000, end: now + 5400000 }), // Overlaps
      ];

      const conflicts = manager.detectConflicts(events);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].severity).toBe('overlap');
    });

    it('should detect back-to-back events', () => {
      const now = Date.now();
      const events = [
        createTestEvent({ id: 'e1', start: now, end: now + 3600000 }),
        createTestEvent({ id: 'e2', start: now + 3600000, end: now + 7200000 }), // Immediately after
      ];

      const conflicts = manager.detectConflicts(events);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].severity).toBe('back_to_back');
    });
  });

  describe('focus blocks', () => {
    it('should find focus time blocks', async () => {
      const now = getStartOfDay();
      const workStart = now + 9 * TIME_CONSTANTS.HOUR_MS;
      const event = createTestEvent({
        start: workStart + 2 * TIME_CONSTANTS.HOUR_MS,
        end: workStart + 3 * TIME_CONSTANTS.HOUR_MS,
      });
      vi.mocked(mockProvider.listEvents).mockResolvedValue([event]);

      const blocks = await manager.findFocusBlocks(now, 30);

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0].duration).toBeGreaterThanOrEqual(30);
    });
  });

  describe('event creation', () => {
    it('should create event', async () => {
      const start = Date.now() + 3600000;
      const end = start + 3600000;

      const event = await manager.createEvent('New Meeting', start, end);

      expect(event.title).toBe('New Meeting');
      expect(mockProvider.createEvent).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Task Scorer Tests
// =============================================================================

describe('TaskScorer', () => {
  let scorer: TaskScorer;
  let mockProvider: TaskProvider;

  beforeEach(() => {
    mockProvider = createMockTaskProvider();
    scorer = createTaskScorer({
      provider: mockProvider,
    });
  });

  describe('scoring', () => {
    it('should score task', () => {
      const task = createTestTask();

      const score = scorer.scoreTask(task);

      expect(score.taskId).toBe(task.id);
      expect(score.totalScore).toBeGreaterThanOrEqual(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
      expect(score.breakdown).toBeDefined();
      expect(score.recommendation).toBeDefined();
      expect(score.reasoning).toBeDefined();
    });

    it('should give higher score to overdue tasks', () => {
      const overdueTask = createTestTask({
        dueDate: Date.now() - 86400000, // Yesterday
      });
      const futureTask = createTestTask({
        dueDate: Date.now() + 7 * 86400000, // Next week
      });

      const overdueScore = scorer.scoreTask(overdueTask);
      const futureScore = scorer.scoreTask(futureTask);

      expect(overdueScore.totalScore).toBeGreaterThan(futureScore.totalScore);
    });

    it('should give higher score to high priority tasks', () => {
      const criticalTask = createTestTask({ priority: 'critical' });
      const lowTask = createTestTask({ priority: 'low' });

      const criticalScore = scorer.scoreTask(criticalTask);
      const lowScore = scorer.scoreTask(lowTask);

      expect(criticalScore.totalScore).toBeGreaterThan(lowScore.totalScore);
    });

    it('should recommend "do_now" for urgent important tasks', () => {
      const task = createTestTask({
        priority: 'critical',
        dueDate: Date.now() + 3600000, // 1 hour
      });

      const score = scorer.scoreTask(task);

      expect(score.recommendation).toBe('do_now');
    });
  });

  describe('context matching', () => {
    it('should boost score for context match', () => {
      scorer.setContext('office');

      const matchingTask = createTestTask({ context: ['office'] });
      const mismatchTask = createTestTask({ context: ['home'] });

      const matchScore = scorer.scoreTask(matchingTask);
      const mismatchScore = scorer.scoreTask(mismatchTask);

      expect(matchScore.breakdown.context).toBeGreaterThan(mismatchScore.breakdown.context);
    });
  });

  describe('energy matching', () => {
    it('should boost score for energy match', () => {
      // When current energy is 'low', low energy tasks score better than high energy tasks
      scorer.setEnergyLevel('low');

      const highEnergyTask = createTestTask({ energyRequired: 'high' });
      const lowEnergyTask = createTestTask({ energyRequired: 'low' });

      const highScore = scorer.scoreTask(highEnergyTask);
      const lowScore = scorer.scoreTask(lowEnergyTask);

      // Low energy task should have higher energy score when user has low energy
      expect(lowScore.breakdown.energy).toBeGreaterThan(highScore.breakdown.energy);
    });
  });

  describe('prioritization', () => {
    it('should prioritize tasks', async () => {
      const tasks = [
        createTestTask({ id: 'task-1', priority: 'low' }),
        createTestTask({ id: 'task-2', priority: 'critical' }),
        createTestTask({ id: 'task-3', priority: 'high' }),
      ];
      vi.mocked(mockProvider.listTasks).mockResolvedValue(tasks);

      const prioritized = await scorer.getPrioritizedTasks();

      expect(prioritized[0].task.id).toBe('task-2'); // Critical first
    });
  });
});

// =============================================================================
// Morning Brief Tests
// =============================================================================

describe('MorningBriefGenerator', () => {
  let generator: MorningBriefGenerator;

  beforeEach(() => {
    generator = createMorningBriefGenerator();
  });

  describe('generation', () => {
    it('should generate morning brief', async () => {
      const brief = await generator.generate('user-1');

      expect(brief.date).toBeDefined();
      expect(brief.greeting).toBeDefined();
      expect(brief.schedule).toBeDefined();
      expect(brief.emails).toBeDefined();
      expect(brief.tasks).toBeDefined();
      expect(brief.highlights).toBeDefined();
    });

    it('should include motivational quote by default', async () => {
      const brief = await generator.generate('user-1');

      expect(brief.motivationalQuote).toBeDefined();
    });

    it('should respect preferences', async () => {
      generator.setPreferences('user-1', {
        includeMotivationalQuote: false,
      });

      const brief = await generator.generate('user-1');

      expect(brief.motivationalQuote).toBeUndefined();
    });
  });

  describe('formatting', () => {
    it('should format brief as text', async () => {
      const brief = await generator.generate('user-1');
      const text = generator.formatAsText(brief);

      expect(text).toContain('Schedule');
      expect(text).toContain('Inbox');
      expect(text).toContain('Tasks');
    });
  });
});

// =============================================================================
// Weekly Review Tests
// =============================================================================

describe('WeeklyReviewGenerator', () => {
  let generator: WeeklyReviewGenerator;

  beforeEach(() => {
    generator = createWeeklyReviewGenerator();
  });

  describe('generation', () => {
    it('should generate weekly review', async () => {
      const review = await generator.generate();

      expect(review.weekStart).toBeDefined();
      expect(review.weekEnd).toBeDefined();
      expect(review.summary).toBeDefined();
      expect(review.accomplishments).toBeInstanceOf(Array);
      expect(review.insights).toBeInstanceOf(Array);
      expect(review.recommendations).toBeInstanceOf(Array);
      expect(review.nextWeekFocus).toBeInstanceOf(Array);
    });

    it('should calculate productivity score', async () => {
      const review = await generator.generate();

      expect(review.summary.productivityScore).toBeGreaterThanOrEqual(0);
      expect(review.summary.productivityScore).toBeLessThanOrEqual(100);
    });
  });

  describe('formatting', () => {
    it('should format review as text', async () => {
      const review = await generator.generate();
      const text = generator.formatAsText(review);

      expect(text).toContain('Weekly Review');
      expect(text).toContain('Summary');
    });
  });
});

// =============================================================================
// Meeting Prep Tests
// =============================================================================

describe('MeetingPrepGenerator', () => {
  let generator: MeetingPrepGenerator;

  beforeEach(() => {
    generator = createMeetingPrepGenerator();
  });

  describe('generation', () => {
    it('should generate meeting prep', async () => {
      const event = createTestEvent();
      const prep = await generator.generatePrep(event);

      expect(prep.eventId).toBe(event.id);
      expect(prep.event).toEqual(event);
      expect(prep.participants).toBeInstanceOf(Array);
      expect(prep.context).toBeDefined();
      expect(prep.talkingPoints).toBeInstanceOf(Array);
      expect(prep.questions).toBeInstanceOf(Array);
      expect(prep.reminders).toBeInstanceOf(Array);
    });

    it('should determine meeting type', async () => {
      // one_on_one requires exactly 2 attendees
      const oneOnOne = createTestEvent({
        attendees: [
          { email: 'me@example.com', responseStatus: 'accepted' },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      });

      const prep = await generator.generatePrep(oneOnOne);

      expect(prep.context.type).toBe('one_on_one');
    });

    it('should detect interview meetings', async () => {
      // Interview detection requires more than 2 attendees (otherwise one_on_one takes precedence)
      const interview = createTestEvent({
        title: 'Interview - Software Engineer Candidate',
        attendees: [
          { email: 'interviewer1@example.com', responseStatus: 'accepted' },
          { email: 'interviewer2@example.com', responseStatus: 'accepted' },
          { email: 'candidate@example.com', responseStatus: 'accepted' },
        ],
      });

      const prep = await generator.generatePrep(interview);

      expect(prep.context.type).toBe('interview');
    });
  });

  describe('formatting', () => {
    it('should format prep as text', async () => {
      const event = createTestEvent();
      const prep = await generator.generatePrep(event);
      const text = generator.formatAsText(prep);

      expect(text).toContain('Meeting Prep');
      expect(text).toContain(event.title);
      expect(text).toContain('Participants');
    });
  });
});

// =============================================================================
// Daily Driver Integration Tests
// =============================================================================

describe('DailyDriver', () => {
  let driver: DailyDriver;
  let mockEmailProvider: EmailProvider;
  let mockCalendarProvider: CalendarProvider;
  let mockTaskProvider: TaskProvider;

  beforeEach(() => {
    mockEmailProvider = createMockEmailProvider();
    mockCalendarProvider = createMockCalendarProvider();
    mockTaskProvider = createMockTaskProvider();

    driver = createDailyDriver({
      emailProvider: mockEmailProvider,
      calendarProvider: mockCalendarProvider,
      taskProvider: mockTaskProvider,
    });
  });

  describe('morning brief', () => {
    it('should generate morning brief', async () => {
      const brief = await driver.getMorningBrief();

      expect(brief).toBeDefined();
      expect(brief.date).toBeDefined();
    });

    it('should get morning brief as text', async () => {
      const text = await driver.getMorningBriefText();

      expect(text).toContain('Schedule');
    });
  });

  describe('quick summary', () => {
    it('should get quick day summary', async () => {
      vi.mocked(mockCalendarProvider.listEvents).mockResolvedValue([createTestEvent()]);
      vi.mocked(mockEmailProvider.listEmails).mockResolvedValue([createTestEmail()]);

      const summary = await driver.getQuickDaySummary();

      expect(summary.meetingCount).toBeDefined();
      expect(summary.unreadEmails).toBeDefined();
      expect(summary.tasksDueToday).toBeDefined();
    });
  });

  describe('what next', () => {
    it('should suggest what to do next', async () => {
      const suggestion = await driver.getWhatNext();

      expect(suggestion).toBeDefined();
    });
  });

  describe('provider management', () => {
    it('should set providers', () => {
      const newDriver = createDailyDriver();

      newDriver.setEmailProvider(mockEmailProvider);
      newDriver.setCalendarProvider(mockCalendarProvider);
      newDriver.setTaskProvider(mockTaskProvider);

      // Should not throw
      expect(newDriver).toBeDefined();
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Utility Functions', () => {
  describe('getStartOfDay', () => {
    it('should return start of day', () => {
      const now = Date.now();
      const start = getStartOfDay(now);
      const date = new Date(start);

      expect(date.getHours()).toBe(0);
      expect(date.getMinutes()).toBe(0);
      expect(date.getSeconds()).toBe(0);
    });
  });

  describe('getEndOfDay', () => {
    it('should return end of day', () => {
      const now = Date.now();
      const end = getEndOfDay(now);

      expect(end).toBeGreaterThan(getStartOfDay(now));
      expect(end - getStartOfDay(now)).toBe(TIME_CONSTANTS.DAY_MS - 1);
    });
  });

  describe('getStartOfWeek', () => {
    it('should return start of week (Sunday)', () => {
      const start = getStartOfWeek();
      const date = new Date(start);

      expect(date.getDay()).toBe(0); // Sunday
      expect(date.getHours()).toBe(0);
    });
  });

  describe('formatDuration', () => {
    it('should format minutes', () => {
      expect(formatDuration(45)).toBe('45m');
    });

    it('should format hours', () => {
      expect(formatDuration(120)).toBe('2h');
    });

    it('should format hours and minutes', () => {
      expect(formatDuration(90)).toBe('1h 30m');
    });
  });
});
