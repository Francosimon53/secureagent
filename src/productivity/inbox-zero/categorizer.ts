/**
 * Email Categorizer
 *
 * Categorizes emails based on content analysis.
 */

import type { EmailDigest, EmailCategory, EmailAction } from '../types.js';

/**
 * Category detection patterns
 */
interface CategoryPattern {
  keywords: string[];
  senderPatterns: string[];
  weight: number;
}

const CATEGORY_PATTERNS: Record<EmailCategory, CategoryPattern> = {
  primary: {
    keywords: ['meeting', 'schedule', 'project', 'deadline', 'review', 'approval', 'feedback'],
    senderPatterns: [],
    weight: 0.6,
  },
  promotions: {
    keywords: ['sale', 'discount', 'offer', 'deal', 'save', 'free', 'limited time', 'exclusive', 'promo'],
    senderPatterns: ['marketing', 'promo', 'newsletter', 'shop', 'store'],
    weight: 0.8,
  },
  social: {
    keywords: ['following', 'mentioned', 'tagged', 'liked', 'commented', 'shared', 'friend request'],
    senderPatterns: ['facebook', 'twitter', 'instagram', 'linkedin', 'social'],
    weight: 0.8,
  },
  updates: {
    keywords: ['confirmation', 'shipped', 'delivered', 'receipt', 'invoice', 'statement', 'alert', 'notification'],
    senderPatterns: ['noreply', 'no-reply', 'notification', 'alert', 'update'],
    weight: 0.7,
  },
  forums: {
    keywords: ['digest', 'discussion', 'thread', 'reply', 'posted', 'forum', 'community'],
    senderPatterns: ['forum', 'community', 'group', 'digest'],
    weight: 0.7,
  },
  spam: {
    keywords: ['viagra', 'lottery', 'winner', 'prince', 'inheritance', 'bitcoin investment'],
    senderPatterns: [],
    weight: 0.9,
  },
};

/**
 * Categorize an email
 */
export function categorizeEmail(email: EmailDigest): EmailCategory {
  // If already has a category from provider, trust it
  if (email.category && email.category !== 'primary') {
    return email.category;
  }

  const scores = new Map<EmailCategory, number>();

  for (const [category, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    const score = calculateCategoryScore(email, pattern);
    scores.set(category as EmailCategory, score);
  }

  // Find highest scoring category
  let bestCategory: EmailCategory = 'primary';
  let bestScore = 0;

  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Only override if score is significant
  if (bestScore < 0.3) {
    return 'primary';
  }

  return bestCategory;
}

/**
 * Calculate category score for an email
 */
function calculateCategoryScore(email: EmailDigest, pattern: CategoryPattern): number {
  let score = 0;
  const subjectLower = email.subject.toLowerCase();
  const snippetLower = email.snippet.toLowerCase();
  const senderLower = email.sender.toLowerCase();

  // Check keywords
  for (const keyword of pattern.keywords) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      score += 0.3;
    }
    if (snippetLower.includes(keyword.toLowerCase())) {
      score += 0.15;
    }
  }

  // Check sender patterns
  for (const senderPattern of pattern.senderPatterns) {
    if (senderLower.includes(senderPattern.toLowerCase())) {
      score += 0.4;
    }
  }

  // Apply category weight
  return Math.min(1, score * pattern.weight);
}

/**
 * Suggest actions for an email
 */
export function suggestActions(email: EmailDigest): EmailAction[] {
  const actions: EmailAction[] = [];
  const category = categorizeEmail(email);

  // Unsubscribe suggestion for promotions with unsubscribe link
  if (email.hasUnsubscribeLink && (category === 'promotions' || category === 'social')) {
    actions.push({
      type: 'unsubscribe',
      description: 'Unsubscribe from this mailing list',
      confidence: 0.7,
    });
  }

  // Archive suggestion for updates and notifications
  if (category === 'updates' && email.isRead) {
    actions.push({
      type: 'archive',
      description: 'Archive this notification',
      confidence: 0.6,
    });
  }

  // Reply suggestion for primary emails that seem to need response
  if (category === 'primary' && looksLikeNeedsReply(email)) {
    actions.push({
      type: 'reply',
      description: 'This email may need a reply',
      confidence: 0.5,
    });
  }

  // Delete suggestion for spam
  if (category === 'spam') {
    actions.push({
      type: 'delete',
      description: 'Delete this spam email',
      confidence: 0.9,
    });
  }

  // Snooze suggestion for emails that can wait
  if (!email.isStarred && category !== 'primary') {
    actions.push({
      type: 'snooze',
      description: 'Snooze for later',
      confidence: 0.4,
    });
  }

  // Sort by confidence
  actions.sort((a, b) => b.confidence - a.confidence);

  return actions.slice(0, 3); // Return top 3 suggestions
}

/**
 * Check if email looks like it needs a reply
 */
function looksLikeNeedsReply(email: EmailDigest): boolean {
  const subjectLower = email.subject.toLowerCase();
  const snippetLower = email.snippet.toLowerCase();

  const replyIndicators = [
    'can you',
    'could you',
    'would you',
    'please',
    'need your',
    'waiting for',
    'let me know',
    'thoughts?',
    'feedback',
    'review',
    'approve',
    '?', // Questions often need replies
  ];

  for (const indicator of replyIndicators) {
    if (subjectLower.includes(indicator) || snippetLower.includes(indicator)) {
      return true;
    }
  }

  return false;
}

/**
 * Batch categorize emails
 */
export function categorizeEmails(
  emails: EmailDigest[]
): Array<{ email: EmailDigest; category: EmailCategory; suggestedActions: EmailAction[] }> {
  return emails.map(email => ({
    email,
    category: categorizeEmail(email),
    suggestedActions: suggestActions(email),
  }));
}

/**
 * Get email distribution by category
 */
export function getCategoryDistribution(
  emails: EmailDigest[]
): Record<EmailCategory, number> {
  const distribution: Record<EmailCategory, number> = {
    primary: 0,
    promotions: 0,
    social: 0,
    updates: 0,
    forums: 0,
    spam: 0,
  };

  for (const email of emails) {
    const category = categorizeEmail(email);
    distribution[category]++;
  }

  return distribution;
}

/**
 * Identify emails that can be safely archived
 */
export function getArchiveCandidates(
  emails: EmailDigest[],
  maxAgeDays = 7
): EmailDigest[] {
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  return emails.filter(email => {
    // Must be read
    if (!email.isRead) return false;

    // Must not be starred
    if (email.isStarred) return false;

    // Must be old enough
    const age = now - email.receivedAt;
    if (age < maxAgeMs) return false;

    // Must be a low-priority category
    const category = categorizeEmail(email);
    return ['promotions', 'social', 'updates', 'forums'].includes(category);
  });
}

/**
 * Identify unsubscribe candidates
 */
export function getUnsubscribeCandidates(emails: EmailDigest[]): EmailDigest[] {
  // Group by sender
  const senderCounts = new Map<string, { count: number; hasUnsubscribe: boolean; emails: EmailDigest[] }>();

  for (const email of emails) {
    const existing = senderCounts.get(email.sender) ?? { count: 0, hasUnsubscribe: false, emails: [] };
    existing.count++;
    if (email.hasUnsubscribeLink) {
      existing.hasUnsubscribe = true;
    }
    existing.emails.push(email);
    senderCounts.set(email.sender, existing);
  }

  // Find senders with many emails and unsubscribe links
  const candidates: EmailDigest[] = [];

  for (const [, data] of senderCounts) {
    if (data.count >= 3 && data.hasUnsubscribe) {
      // Add the most recent email as the unsubscribe candidate
      const sorted = data.emails.sort((a, b) => b.receivedAt - a.receivedAt);
      if (sorted[0].hasUnsubscribeLink) {
        candidates.push(sorted[0]);
      }
    }
  }

  return candidates;
}
