/**
 * Intent Classifier
 *
 * Classifies parent questions into intents for routing to appropriate responses.
 * Uses keyword matching and pattern recognition for common ABA-related queries.
 */

import type { FAQStore } from '../../stores/faq-store.js';
import type { FAQCategory } from '../../types.js';

// =============================================================================
// Intent Types
// =============================================================================

export interface Intent {
  name: IntentName;
  confidence: number;
  category?: FAQCategory;
  entities: ExtractedEntity[];
  suggestedFollowUp?: string;
}

export type IntentName =
  | 'schedule_inquiry'
  | 'schedule_change'
  | 'authorization_status'
  | 'authorization_units'
  | 'billing_question'
  | 'payment_inquiry'
  | 'insurance_question'
  | 'therapy_progress'
  | 'goal_inquiry'
  | 'behavior_question'
  | 'session_notes'
  | 'therapist_info'
  | 'contact_staff'
  | 'policy_question'
  | 'emergency'
  | 'greeting'
  | 'thanks'
  | 'unknown';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  start: number;
  end: number;
}

export type EntityType =
  | 'date'
  | 'time'
  | 'therapist_name'
  | 'service_type'
  | 'amount'
  | 'patient_name'
  | 'goal_name'
  | 'behavior_name';

// =============================================================================
// Intent Patterns
// =============================================================================

interface IntentPattern {
  intent: IntentName;
  patterns: RegExp[];
  keywords: string[];
  category?: FAQCategory;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // Scheduling
  {
    intent: 'schedule_inquiry',
    patterns: [
      /when\s+is\s+(my|our|the)\s+(next|upcoming)/i,
      /what\s+(time|day)\s+is/i,
      /schedule\s+for/i,
      /appointment(s)?\s+(this|next)/i,
    ],
    keywords: ['schedule', 'appointment', 'when', 'time', 'session', 'upcoming'],
    category: 'scheduling',
  },
  {
    intent: 'schedule_change',
    patterns: [
      /reschedule/i,
      /cancel\s+(my|our|the)\s+(appointment|session)/i,
      /change\s+(the|my|our)\s+(time|appointment|session)/i,
      /move\s+(my|our|the)\s+(appointment|session)/i,
    ],
    keywords: ['reschedule', 'cancel', 'change', 'move', 'postpone', 'different time'],
    category: 'scheduling',
  },

  // Authorization
  {
    intent: 'authorization_status',
    patterns: [
      /authorization\s+(status|approved|pending)/i,
      /is\s+(my|our)\s+authorization/i,
      /auth(orization)?\s+(ready|approved)/i,
    ],
    keywords: ['authorization', 'approved', 'pending', 'auth', 'status'],
    category: 'insurance',
  },
  {
    intent: 'authorization_units',
    patterns: [
      /how\s+many\s+(units|hours)/i,
      /units\s+(left|remaining|used)/i,
      /authorization\s+units/i,
    ],
    keywords: ['units', 'hours', 'remaining', 'left', 'used'],
    category: 'insurance',
  },

  // Billing & Insurance
  {
    intent: 'billing_question',
    patterns: [
      /bill(ing)?\s+(question|issue|problem)/i,
      /(my|the)\s+bill/i,
      /charge(d|s)?\s+(for|on)/i,
      /statement/i,
    ],
    keywords: ['bill', 'billing', 'charge', 'invoice', 'statement', 'owe'],
    category: 'billing',
  },
  {
    intent: 'payment_inquiry',
    patterns: [
      /how\s+(do|can)\s+i\s+pay/i,
      /payment\s+(options|methods|plan)/i,
      /accept\s+(credit|debit|insurance)/i,
    ],
    keywords: ['pay', 'payment', 'credit card', 'insurance', 'cost', 'price'],
    category: 'billing',
  },
  {
    intent: 'insurance_question',
    patterns: [
      /insurance\s+(cover|coverage|accept)/i,
      /do\s+you\s+(take|accept)\s+.+\s+insurance/i,
      /in-?network/i,
      /out-?of-?pocket/i,
    ],
    keywords: ['insurance', 'coverage', 'covered', 'copay', 'deductible', 'network'],
    category: 'billing',
  },

  // Progress & Goals
  {
    intent: 'therapy_progress',
    patterns: [
      /how\s+is\s+(my\s+child|.+)\s+(doing|progressing)/i,
      /progress\s+(report|update)/i,
      /(making|any)\s+progress/i,
    ],
    keywords: ['progress', 'improving', 'better', 'doing', 'development'],
    category: 'treatment',
  },
  {
    intent: 'goal_inquiry',
    patterns: [
      /what\s+(are|is)\s+(the|my\s+child's)\s+goal/i,
      /goal(s)?\s+(for|we're\s+working)/i,
      /treatment\s+(plan|goals)/i,
    ],
    keywords: ['goal', 'goals', 'target', 'objective', 'working on'],
    category: 'treatment',
  },
  {
    intent: 'behavior_question',
    patterns: [
      /behavior\s+(at\s+home|issue|problem)/i,
      /how\s+(do|can|should)\s+i\s+(handle|deal|respond)/i,
      /tantrum|meltdown|hitting|biting/i,
    ],
    keywords: ['behavior', 'tantrum', 'meltdown', 'hitting', 'biting', 'screaming', 'handle'],
    category: 'treatment',
  },

  // Session Info
  {
    intent: 'session_notes',
    patterns: [
      /session\s+notes/i,
      /what\s+(happened|did\s+you\s+do)\s+(in|during)/i,
      /summary\s+of\s+(the|today's)\s+session/i,
    ],
    keywords: ['notes', 'summary', 'session', 'what happened', 'today'],
    category: 'treatment',
  },

  // Staff & Contact
  {
    intent: 'therapist_info',
    patterns: [
      /who\s+is\s+(my|our)\s+(therapist|rbt|bcba)/i,
      /(therapist|rbt|bcba)\s+(name|contact|email)/i,
      /meet\s+(my|the)\s+therapist/i,
    ],
    keywords: ['therapist', 'rbt', 'bcba', 'technician', 'supervisor'],
    category: 'general',
  },
  {
    intent: 'contact_staff',
    patterns: [
      /speak\s+(to|with)\s+(someone|a\s+person)/i,
      /talk\s+to\s+(the|a)\s+(supervisor|manager|bcba)/i,
      /contact\s+(the|your)\s+office/i,
      /call\s+(you|the\s+office)/i,
    ],
    keywords: ['speak', 'talk', 'contact', 'call', 'email', 'reach', 'human'],
    category: 'general',
  },

  // Policy
  {
    intent: 'policy_question',
    patterns: [
      /policy\s+(on|about|regarding)/i,
      /what\s+is\s+your\s+policy/i,
      /(cancellation|no-?show|late)\s+policy/i,
      /sick\s+(child|policy)/i,
    ],
    keywords: ['policy', 'rules', 'cancellation', 'no-show', 'late', 'sick'],
    category: 'general',
  },

  // Special intents
  {
    intent: 'emergency',
    patterns: [
      /emergency/i,
      /crisis/i,
      /urgent/i,
      /immediate\s+help/i,
      /danger/i,
    ],
    keywords: ['emergency', 'crisis', 'urgent', 'danger', 'help', '911'],
    category: 'general',
  },
  {
    intent: 'greeting',
    patterns: [/^(hi|hello|hey|good\s+(morning|afternoon|evening))/i],
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon'],
    category: 'general',
  },
  {
    intent: 'thanks',
    patterns: [/^(thanks|thank\s+you|appreciate)/i],
    keywords: ['thanks', 'thank you', 'appreciate', 'helpful'],
    category: 'general',
  },
];

// =============================================================================
// Entity Patterns
// =============================================================================

const ENTITY_PATTERNS: Array<{ type: EntityType; pattern: RegExp }> = [
  {
    type: 'date',
    pattern:
      /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/gi,
  },
  {
    type: 'time',
    pattern: /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi,
  },
  {
    type: 'amount',
    pattern: /\$?\d+(?:\.\d{2})?/g,
  },
];

// =============================================================================
// Intent Classifier Options
// =============================================================================

export interface IntentClassifierOptions {
  faqStore: FAQStore;
  confidenceThreshold?: number;
}

// =============================================================================
// Intent Classifier
// =============================================================================

export class IntentClassifier {
  private readonly faqStore: FAQStore;
  private readonly confidenceThreshold: number;

  constructor(options: IntentClassifierOptions) {
    this.faqStore = options.faqStore;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.3;
  }

  /**
   * Classify a user message into an intent
   */
  async classify(userId: string, message: string): Promise<Intent> {
    const normalizedMessage = this.normalizeMessage(message);

    // Check for emergency first
    const emergencyIntent = this.checkEmergency(normalizedMessage);
    if (emergencyIntent) {
      return emergencyIntent;
    }

    // Score all intents
    const scores = INTENT_PATTERNS.map((pattern) => ({
      ...pattern,
      score: this.calculateScore(normalizedMessage, pattern),
    }));

    // Get best match
    const bestMatch = scores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    // Extract entities
    const entities = this.extractEntities(message);

    // Check FAQ for additional context
    const faqMatches = await this.faqStore.findSimilarQuestions(userId, message);
    let faqBoost = 0;
    let category = bestMatch.category;

    if (faqMatches.length > 0) {
      faqBoost = 0.1;
      if (!category) {
        category = faqMatches[0].category;
      }
    }

    const confidence = Math.min(1, bestMatch.score + faqBoost);

    // Return unknown if confidence is too low
    if (confidence < this.confidenceThreshold) {
      return {
        name: 'unknown',
        confidence,
        entities,
        suggestedFollowUp: 'I\'m not sure I understand. Could you please rephrase your question?',
      };
    }

    return {
      name: bestMatch.intent,
      confidence,
      category,
      entities,
    };
  }

  /**
   * Classify multiple messages (for conversation context)
   */
  async classifyWithContext(
    userId: string,
    messages: string[]
  ): Promise<Intent> {
    if (messages.length === 0) {
      return {
        name: 'unknown',
        confidence: 0,
        entities: [],
      };
    }

    // Classify each message
    const intents = await Promise.all(
      messages.map((m) => this.classify(userId, m))
    );

    // Weight recent messages more heavily
    let bestIntent = intents[intents.length - 1];
    const bestScore = bestIntent.confidence;

    for (let i = 0; i < intents.length - 1; i++) {
      const weight = (i + 1) / intents.length;
      const adjustedScore = intents[i].confidence * weight;

      // If earlier intent has higher weighted score and matches recent context
      if (adjustedScore > bestScore * 0.8 && intents[i].category === bestIntent.category) {
        // Boost confidence if context matches
        bestIntent = {
          ...bestIntent,
          confidence: Math.min(1, bestIntent.confidence + 0.1),
        };
      }
    }

    // Combine entities from all messages
    const allEntities = intents.flatMap((i) => i.entities);
    const uniqueEntities = this.deduplicateEntities(allEntities);

    return {
      ...bestIntent,
      entities: uniqueEntities,
    };
  }

  /**
   * Get possible intents with scores (for debugging/transparency)
   */
  async getPossibleIntents(
    userId: string,
    message: string
  ): Promise<Array<{ intent: IntentName; score: number }>> {
    const normalizedMessage = this.normalizeMessage(message);

    return INTENT_PATTERNS.map((pattern) => ({
      intent: pattern.intent,
      score: this.calculateScore(normalizedMessage, pattern),
    })).sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate score for an intent pattern
   */
  private calculateScore(message: string, pattern: IntentPattern): number {
    let score = 0;

    // Check regex patterns (high confidence)
    for (const regex of pattern.patterns) {
      if (regex.test(message)) {
        score += 0.5;
        break; // Only count one pattern match
      }
    }

    // Check keywords
    const words = message.toLowerCase().split(/\s+/);
    let keywordMatches = 0;

    for (const keyword of pattern.keywords) {
      if (keyword.includes(' ')) {
        // Multi-word keyword
        if (message.toLowerCase().includes(keyword)) {
          keywordMatches += 2;
        }
      } else {
        // Single word keyword
        if (words.includes(keyword)) {
          keywordMatches++;
        }
      }
    }

    // Normalize keyword score
    const keywordScore = Math.min(0.5, keywordMatches / pattern.keywords.length);
    score += keywordScore;

    return Math.min(1, score);
  }

  /**
   * Check for emergency intent (highest priority)
   */
  private checkEmergency(message: string): Intent | null {
    const emergencyKeywords = ['emergency', 'crisis', '911', 'danger', 'hurt', 'suicide', 'harm'];
    const hasEmergencyKeyword = emergencyKeywords.some((kw) =>
      message.toLowerCase().includes(kw)
    );

    if (hasEmergencyKeyword) {
      return {
        name: 'emergency',
        confidence: 1,
        category: 'general',
        entities: [],
        suggestedFollowUp:
          'If this is a medical emergency, please call 911 immediately. ' +
          'For mental health crisis support, contact the 988 Suicide & Crisis Lifeline.',
      };
    }

    return null;
  }

  /**
   * Extract entities from message
   */
  private extractEntities(message: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const { type, pattern } of ENTITY_PATTERNS) {
      let match;
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      while ((match = pattern.exec(message)) !== null) {
        entities.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return entities;
  }

  /**
   * Deduplicate entities by position
   */
  private deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>();
    return entities.filter((e) => {
      const key = `${e.type}:${e.value}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Normalize message for classification
   */
  private normalizeMessage(message: string): string {
    return message
      .toLowerCase()
      .replace(/[^\w\s?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
