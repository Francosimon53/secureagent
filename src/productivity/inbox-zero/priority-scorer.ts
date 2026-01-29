/**
 * Email Priority Scorer
 *
 * Calculates priority scores for emails based on various signals.
 */

import type { EmailDigest, EmailCategory } from '../types.js';

/**
 * Priority keywords by urgency level
 */
const PRIORITY_KEYWORDS = {
  critical: ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'time-sensitive', 'deadline today'],
  high: ['important', 'priority', 'deadline', 'action required', 'please respond', 'waiting on you', 'blocked'],
  medium: ['please', 'request', 'follow up', 'reminder', 'fyi', 'update', 'review'],
  low: ['newsletter', 'unsubscribe', 'weekly digest', 'monthly report', 'automated'],
};

/**
 * Category base scores
 */
const CATEGORY_SCORES: Record<EmailCategory, number> = {
  primary: 0.5,
  updates: 0.4,
  forums: 0.3,
  social: 0.25,
  promotions: 0.15,
  spam: 0.0,
};

/**
 * Score configuration
 */
export interface PriorityScorerConfig {
  vipSenders: string[];
  importantDomains: string[];
  customKeywords?: {
    critical?: string[];
    high?: string[];
    medium?: string[];
    low?: string[];
  };
}

/**
 * Priority score result
 */
export interface PriorityScore {
  total: number;
  breakdown: {
    keywordScore: number;
    senderScore: number;
    categoryScore: number;
    recencyScore: number;
    engagementScore: number;
  };
  signals: string[];
}

/**
 * Calculate priority score for an email
 */
export function scoreEmailPriority(
  email: EmailDigest,
  config?: Partial<PriorityScorerConfig>
): PriorityScore {
  const signals: string[] = [];
  const vipSenders = config?.vipSenders ?? [];
  const importantDomains = config?.importantDomains ?? [];

  // 1. Keyword score
  const keywordScore = calculateKeywordScore(email, config?.customKeywords, signals);

  // 2. Sender score
  const senderScore = calculateSenderScore(email, vipSenders, importantDomains, signals);

  // 3. Category score
  const categoryScore = CATEGORY_SCORES[email.category] ?? 0.3;

  // 4. Recency score
  const recencyScore = calculateRecencyScore(email, signals);

  // 5. Engagement score
  const engagementScore = calculateEngagementScore(email, signals);

  // Weighted total
  const total = Math.min(
    1.0,
    keywordScore * 0.3 +
    senderScore * 0.25 +
    categoryScore * 0.2 +
    recencyScore * 0.15 +
    engagementScore * 0.1
  );

  return {
    total: Math.round(total * 1000) / 1000,
    breakdown: {
      keywordScore: Math.round(keywordScore * 1000) / 1000,
      senderScore: Math.round(senderScore * 1000) / 1000,
      categoryScore: Math.round(categoryScore * 1000) / 1000,
      recencyScore: Math.round(recencyScore * 1000) / 1000,
      engagementScore: Math.round(engagementScore * 1000) / 1000,
    },
    signals,
  };
}

/**
 * Calculate score based on keywords in subject
 */
function calculateKeywordScore(
  email: EmailDigest,
  customKeywords?: PriorityScorerConfig['customKeywords'],
  signals?: string[]
): number {
  const subjectLower = email.subject.toLowerCase();

  // Merge custom keywords
  const keywords = {
    critical: [...PRIORITY_KEYWORDS.critical, ...(customKeywords?.critical ?? [])],
    high: [...PRIORITY_KEYWORDS.high, ...(customKeywords?.high ?? [])],
    medium: [...PRIORITY_KEYWORDS.medium, ...(customKeywords?.medium ?? [])],
    low: [...PRIORITY_KEYWORDS.low, ...(customKeywords?.low ?? [])],
  };

  // Check for critical keywords
  for (const keyword of keywords.critical) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      signals?.push(`Critical keyword: "${keyword}"`);
      return 1.0;
    }
  }

  // Check for high priority keywords
  for (const keyword of keywords.high) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      signals?.push(`High priority keyword: "${keyword}"`);
      return 0.75;
    }
  }

  // Check for medium priority keywords
  for (const keyword of keywords.medium) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      signals?.push(`Medium priority keyword: "${keyword}"`);
      return 0.5;
    }
  }

  // Check for low priority keywords
  for (const keyword of keywords.low) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      signals?.push(`Low priority keyword: "${keyword}"`);
      return 0.2;
    }
  }

  return 0.4; // Default baseline
}

/**
 * Calculate score based on sender
 */
function calculateSenderScore(
  email: EmailDigest,
  vipSenders: string[],
  importantDomains: string[],
  signals?: string[]
): number {
  const senderLower = email.sender.toLowerCase();
  const senderNameLower = email.senderName?.toLowerCase() ?? '';

  // Check VIP senders
  for (const vip of vipSenders) {
    const vipLower = vip.toLowerCase();
    if (senderLower.includes(vipLower) || senderNameLower.includes(vipLower)) {
      signals?.push(`VIP sender: ${vip}`);
      return 1.0;
    }
  }

  // Extract domain
  const domain = senderLower.split('@')[1];

  // Check important domains
  for (const importantDomain of importantDomains) {
    if (domain?.includes(importantDomain.toLowerCase())) {
      signals?.push(`Important domain: ${importantDomain}`);
      return 0.7;
    }
  }

  // Check for common low-priority sender patterns
  if (
    senderLower.includes('noreply') ||
    senderLower.includes('no-reply') ||
    senderLower.includes('notification') ||
    senderLower.includes('newsletter')
  ) {
    signals?.push('Automated sender');
    return 0.2;
  }

  return 0.5; // Default
}

/**
 * Calculate score based on recency
 */
function calculateRecencyScore(email: EmailDigest, signals?: string[]): number {
  const now = Date.now();
  const ageHours = (now - email.receivedAt) / (1000 * 60 * 60);

  if (ageHours <= 1) {
    signals?.push('Received within last hour');
    return 1.0;
  }

  if (ageHours <= 4) {
    signals?.push('Received within last 4 hours');
    return 0.8;
  }

  if (ageHours <= 24) {
    signals?.push('Received today');
    return 0.6;
  }

  if (ageHours <= 72) {
    signals?.push('Received within 3 days');
    return 0.4;
  }

  return 0.2;
}

/**
 * Calculate score based on engagement signals
 */
function calculateEngagementScore(email: EmailDigest, signals?: string[]): number {
  let score = 0.5;

  // Starred emails are important
  if (email.isStarred) {
    signals?.push('Email is starred');
    score += 0.3;
  }

  // Already read = slightly lower priority (already seen)
  if (email.isRead) {
    score -= 0.1;
  } else {
    signals?.push('Unread email');
    score += 0.1;
  }

  // Emails with attachments may need action
  if (email.hasAttachments) {
    signals?.push('Has attachments');
    score += 0.1;
  }

  // Emails identified as actionable
  if (email.isActionable) {
    signals?.push('Identified as actionable');
    score += 0.2;
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Check if sender is a VIP
 */
export function isVIPSender(
  email: EmailDigest,
  vipSenders: string[]
): boolean {
  const senderLower = email.sender.toLowerCase();
  const senderNameLower = email.senderName?.toLowerCase() ?? '';

  return vipSenders.some(vip => {
    const vipLower = vip.toLowerCase();
    return senderLower.includes(vipLower) || senderNameLower.includes(vipLower);
  });
}

/**
 * Batch score multiple emails
 */
export function scoreEmails(
  emails: EmailDigest[],
  config?: Partial<PriorityScorerConfig>
): Array<{ email: EmailDigest; score: PriorityScore }> {
  return emails
    .map(email => ({
      email,
      score: scoreEmailPriority(email, config),
    }))
    .sort((a, b) => b.score.total - a.score.total);
}

/**
 * Get emails above a priority threshold
 */
export function getHighPriorityEmails(
  emails: EmailDigest[],
  threshold = 0.6,
  config?: Partial<PriorityScorerConfig>
): EmailDigest[] {
  return emails.filter(email => {
    const score = scoreEmailPriority(email, config);
    return score.total >= threshold;
  });
}
