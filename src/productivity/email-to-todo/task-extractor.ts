/**
 * Task Extractor
 *
 * NLP-based extraction of tasks from email content.
 */

import type { ExtractedTask, TodoPriority } from '../types.js';

/**
 * Task extraction patterns
 */
interface ExtractionPattern {
  pattern: RegExp;
  priorityHint?: TodoPriority;
  confidenceBoost?: number;
}

/**
 * Common task patterns
 */
const TASK_PATTERNS: ExtractionPattern[] = [
  // Action requests
  { pattern: /(?:please|kindly|could you|can you|would you)\s+(.+?)(?:\.|$)/gi, priorityHint: 'medium' },
  { pattern: /(?:need you to|need to|needs to)\s+(.+?)(?:\.|$)/gi, priorityHint: 'high' },
  { pattern: /(?:action required|action needed|requires action)[:;]?\s*(.+?)(?:\.|$)/gi, priorityHint: 'high', confidenceBoost: 0.2 },

  // Deadlines
  { pattern: /(?:by|before|due|deadline)\s+(\w+day|\d{1,2}\/\d{1,2}|\w+\s+\d{1,2})/gi, priorityHint: 'high', confidenceBoost: 0.15 },
  { pattern: /(?:asap|urgent|immediately|as soon as possible)/gi, priorityHint: 'critical', confidenceBoost: 0.25 },

  // Direct requests
  { pattern: /(?:^|\. )(?:send|submit|complete|finish|review|approve|sign|schedule|book|call|email)\s+(.+?)(?:\.|$)/gim, priorityHint: 'medium' },

  // Todo markers
  { pattern: /(?:todo|to-do|task|action item)[:;]?\s*(.+?)(?:\.|$)/gi, priorityHint: 'medium', confidenceBoost: 0.3 },

  // Meeting follow-ups
  { pattern: /(?:follow up|following up|follow-up)\s+(?:on|about|with)?\s*(.+?)(?:\.|$)/gi, priorityHint: 'medium' },

  // Questions that need action
  { pattern: /(?:can you confirm|please confirm|confirm that|let me know if)\s+(.+?)(?:\?|$)/gi, priorityHint: 'medium' },
];

/**
 * Date extraction patterns
 */
const DATE_PATTERNS: Array<{ pattern: RegExp; extractor: (match: RegExpMatchArray) => number | null }> = [
  // "by tomorrow", "by Friday"
  {
    pattern: /by\s+(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    extractor: (match) => parseDayReference(match[1]),
  },
  // "by January 15", "by Dec 31"
  {
    pattern: /by\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?/i,
    extractor: (match) => parseMonthDay(match[1], parseInt(match[2], 10)),
  },
  // "by 01/15", "by 1/15/25"
  {
    pattern: /by\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
    extractor: (match) => parseNumericDate(match[1], match[2], match[3]),
  },
  // "in 2 days", "in 3 weeks"
  {
    pattern: /in\s+(\d+)\s+(day|week|hour)s?/i,
    extractor: (match) => parseRelativeTime(parseInt(match[1], 10), match[2]),
  },
  // "end of week", "end of day"
  {
    pattern: /(?:end of|eod|eow)\s*(day|week|month)?/i,
    extractor: (match) => parseEndOf(match[1] ?? 'day'),
  },
];

/**
 * Priority keywords
 */
const PRIORITY_KEYWORDS: Record<TodoPriority, string[]> = {
  critical: ['urgent', 'critical', 'emergency', 'asap', 'immediately', 'top priority'],
  high: ['important', 'high priority', 'priority', 'time-sensitive', 'deadline'],
  medium: ['please', 'request', 'when you can', 'soon'],
  low: ['whenever', 'no rush', 'low priority', 'optional', 'nice to have'],
};

/**
 * Extract tasks from email content
 */
export function extractTasksFromEmail(
  subject: string,
  snippet: string,
  body?: string
): ExtractedTask[] {
  const tasks: ExtractedTask[] = [];
  const seenTitles = new Set<string>();

  // Combine text for analysis
  const fullText = [subject, snippet, body ?? ''].join(' ');

  // Extract tasks using patterns
  for (const { pattern, priorityHint, confidenceBoost } of TASK_PATTERNS) {
    const matches = fullText.matchAll(pattern);

    for (const match of matches) {
      const taskText = match[1]?.trim() ?? match[0].trim();

      // Clean up the task text
      const cleanedTitle = cleanTaskTitle(taskText);

      // Skip if too short or duplicate
      if (cleanedTitle.length < 5 || seenTitles.has(cleanedTitle.toLowerCase())) {
        continue;
      }

      seenTitles.add(cleanedTitle.toLowerCase());

      // Calculate confidence
      let confidence = 0.5;
      if (confidenceBoost) {
        confidence += confidenceBoost;
      }
      if (subject.toLowerCase().includes(cleanedTitle.toLowerCase().slice(0, 20))) {
        confidence += 0.1; // Higher confidence if mentioned in subject
      }

      // Detect priority
      const priority = priorityHint ?? detectPriority(fullText);

      // Extract due date if present
      const dueDate = extractDueDate(fullText);

      tasks.push({
        title: cleanedTitle,
        description: `Extracted from email: "${subject}"`,
        dueDate,
        priority,
        confidence: Math.min(confidence, 1.0),
        sourceText: match[0].substring(0, 200),
      });
    }
  }

  // Deduplicate and sort by confidence
  const uniqueTasks = deduplicateTasks(tasks);
  uniqueTasks.sort((a, b) => b.confidence - a.confidence);

  return uniqueTasks.slice(0, 5); // Return top 5 tasks
}

/**
 * Clean up extracted task title
 */
function cleanTaskTitle(text: string): string {
  return text
    .replace(/^(please|kindly|could you|can you|would you)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200); // Limit length
}

/**
 * Detect priority from text
 */
function detectPriority(text: string): TodoPriority {
  const textLower = text.toLowerCase();

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return priority as TodoPriority;
      }
    }
  }

  return 'medium';
}

/**
 * Extract due date from text
 */
function extractDueDate(text: string): number | undefined {
  for (const { pattern, extractor } of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const date = extractor(match);
      if (date && date > Date.now()) {
        return date;
      }
    }
  }

  return undefined;
}

/**
 * Deduplicate tasks by similarity
 */
function deduplicateTasks(tasks: ExtractedTask[]): ExtractedTask[] {
  const unique: ExtractedTask[] = [];

  for (const task of tasks) {
    const isDuplicate = unique.some(existing =>
      stringSimilarity(existing.title, task.title) > 0.8
    );

    if (!isDuplicate) {
      unique.push(task);
    }
  }

  return unique;
}

/**
 * Simple string similarity (Jaccard index)
 */
function stringSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

// =============================================================================
// Date parsing helpers
// =============================================================================

function parseDayReference(day: string): number | null {
  const now = new Date();
  const dayLower = day.toLowerCase();

  if (dayLower === 'today') {
    return endOfDay(now);
  }

  if (dayLower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return endOfDay(tomorrow);
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDayIndex = days.indexOf(dayLower);

  if (targetDayIndex === -1) {
    return null;
  }

  const currentDayIndex = now.getDay();
  let daysUntil = targetDayIndex - currentDayIndex;

  if (daysUntil <= 0) {
    daysUntil += 7; // Next week
  }

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + daysUntil);
  return endOfDay(targetDate);
}

function parseMonthDay(month: string, day: number): number | null {
  const months: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };

  const monthIndex = months[month.toLowerCase()];
  if (monthIndex === undefined) {
    return null;
  }

  const now = new Date();
  let year = now.getFullYear();

  // If the date has passed this year, assume next year
  const targetDate = new Date(year, monthIndex, day);
  if (targetDate < now) {
    year++;
  }

  return endOfDay(new Date(year, monthIndex, day));
}

function parseNumericDate(month: string, day: string, year?: string): number | null {
  const now = new Date();
  let targetYear = now.getFullYear();

  if (year) {
    targetYear = parseInt(year, 10);
    if (targetYear < 100) {
      targetYear += 2000; // Convert 25 to 2025
    }
  }

  const monthNum = parseInt(month, 10) - 1;
  const dayNum = parseInt(day, 10);

  const targetDate = new Date(targetYear, monthNum, dayNum);

  if (targetDate < now && !year) {
    targetDate.setFullYear(targetDate.getFullYear() + 1);
  }

  return endOfDay(targetDate);
}

function parseRelativeTime(amount: number, unit: string): number | null {
  const now = new Date();
  const unitLower = unit.toLowerCase();

  if (unitLower === 'hour' || unitLower === 'hours') {
    now.setHours(now.getHours() + amount);
  } else if (unitLower === 'day' || unitLower === 'days') {
    now.setDate(now.getDate() + amount);
  } else if (unitLower === 'week' || unitLower === 'weeks') {
    now.setDate(now.getDate() + amount * 7);
  }

  return now.getTime();
}

function parseEndOf(period: string): number | null {
  const now = new Date();

  switch (period.toLowerCase()) {
    case 'day':
      return endOfDay(now);
    case 'week': {
      const dayOfWeek = now.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
      const friday = new Date(now);
      friday.setDate(friday.getDate() + daysUntilFriday);
      return endOfDay(friday);
    }
    case 'month': {
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return endOfDay(endOfMonth);
    }
    default:
      return endOfDay(now);
  }
}

function endOfDay(date: Date): number {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/**
 * Check if text likely contains actionable content
 */
export function isLikelyActionable(text: string): boolean {
  const actionIndicators = [
    /please\s+\w+/i,
    /need\s+(?:you\s+)?to/i,
    /action\s+required/i,
    /deadline/i,
    /by\s+(?:tomorrow|friday|\d)/i,
    /can\s+you/i,
    /follow\s*up/i,
    /todo/i,
    /asap/i,
  ];

  return actionIndicators.some(pattern => pattern.test(text));
}

/**
 * Calculate actionability score
 */
export function calculateActionabilityScore(subject: string, snippet: string): number {
  const text = `${subject} ${snippet}`.toLowerCase();
  let score = 0;

  // Action verbs
  const actionVerbs = ['send', 'submit', 'review', 'approve', 'complete', 'schedule', 'call', 'email', 'update'];
  for (const verb of actionVerbs) {
    if (text.includes(verb)) {
      score += 0.15;
    }
  }

  // Urgency indicators
  if (/urgent|asap|immediately/i.test(text)) {
    score += 0.3;
  }

  // Deadline mentions
  if (/by\s+(tomorrow|friday|monday|\d{1,2})/i.test(text)) {
    score += 0.25;
  }

  // Direct requests
  if (/please\s+\w+|need\s+you\s+to|can\s+you/i.test(text)) {
    score += 0.2;
  }

  // Question marks (often need response)
  if (text.includes('?')) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
}
