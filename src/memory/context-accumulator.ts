/**
 * Context Accumulator
 *
 * Extracts preferences, facts, and contextual information from user interactions
 */

import { randomUUID } from 'crypto';
import type {
  Context,
  Preference,
  LearnedFact,
  AccumulatorResult,
  Memory,
  MemoryCreateInput,
} from './types.js';
import { MemoryError } from './types.js';
import type { MemoryStore } from './memory-store.js';
import { CONTEXT_DEFAULTS, TABLE_NAMES, MEMORY_EVENTS } from './constants.js';

// =============================================================================
// Database Adapter Interface
// =============================================================================

export interface DatabaseAdapter {
  execute<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

// =============================================================================
// Context Store Interface
// =============================================================================

export interface ContextStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  /** Add a context entry */
  addContext(context: Omit<Context, 'id'>): Promise<Context>;

  /** Get contexts for a session */
  getContexts(userId: string, sessionId: string, limit?: number): Promise<Context[]>;

  /** Add or update a preference */
  upsertPreference(preference: Omit<Preference, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preference>;

  /** Get preferences for a user */
  getPreferences(userId: string, category?: string): Promise<Preference[]>;

  /** Add or update a learned fact */
  upsertFact(fact: Omit<LearnedFact, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearnedFact>;

  /** Get facts for a user */
  getFacts(userId: string, category?: string): Promise<LearnedFact[]>;

  /** Delete old contexts */
  cleanupContexts(olderThanMs: number): Promise<number>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface ContextRow {
  id: string;
  user_id: string;
  session_id: string;
  type: string;
  content: string;
  source: string;
  confidence: number;
  metadata: string | null;
  timestamp: number;
}

interface PreferenceRow {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sources: string;
  created_at: number;
  updated_at: number;
}

interface FactRow {
  id: string;
  user_id: string;
  category: string;
  fact: string;
  confidence: number;
  sources: string;
  verified_at: number | null;
  created_at: number;
  updated_at: number;
}

// =============================================================================
// Database Context Store
// =============================================================================

export class DatabaseContextStore implements ContextStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create contexts table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.CONTEXTS} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    // Create preferences table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.PREFERENCES} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL,
        sources TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, category, key)
      )
    `);

    // Create learned facts table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.LEARNED_FACTS} (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        fact TEXT NOT NULL,
        confidence REAL NOT NULL,
        sources TEXT NOT NULL,
        verified_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, category, fact)
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_contexts_user_session ON ${TABLE_NAMES.CONTEXTS}(user_id, session_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_preferences_user ON ${TABLE_NAMES.PREFERENCES}(user_id)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_facts_user ON ${TABLE_NAMES.LEARNED_FACTS}(user_id)
    `);
  }

  async addContext(input: Omit<Context, 'id'>): Promise<Context> {
    const context: Context = {
      id: randomUUID(),
      ...input,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.CONTEXTS} (
        id, user_id, session_id, type, content, source, confidence, metadata, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        context.id,
        context.userId,
        context.sessionId,
        context.type,
        context.content,
        context.source,
        context.confidence,
        context.metadata ? JSON.stringify(context.metadata) : null,
        context.timestamp,
      ]
    );

    return context;
  }

  async getContexts(userId: string, sessionId: string, limit?: number): Promise<Context[]> {
    let sql = `SELECT * FROM ${TABLE_NAMES.CONTEXTS} WHERE user_id = ? AND session_id = ? ORDER BY timestamp DESC`;
    const params: unknown[] = [userId, sessionId];

    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }

    const result = await this.db.execute<ContextRow>(sql, params);
    return result.map(row => ({
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      type: row.type as Context['type'],
      content: row.content,
      source: row.source,
      confidence: row.confidence,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    }));
  }

  async upsertPreference(input: Omit<Preference, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preference> {
    const now = Date.now();

    // Check for existing preference
    const existing = await this.db.execute<PreferenceRow>(
      `SELECT * FROM ${TABLE_NAMES.PREFERENCES} WHERE user_id = ? AND category = ? AND key = ?`,
      [input.userId, input.category, input.key]
    );

    if (existing.length > 0) {
      // Update existing preference
      const merged = existing[0];
      const sources = [...new Set([...JSON.parse(merged.sources), ...input.sources])];
      const confidence = Math.max(merged.confidence, input.confidence);

      await this.db.execute(
        `UPDATE ${TABLE_NAMES.PREFERENCES} SET value = ?, confidence = ?, sources = ?, updated_at = ? WHERE id = ?`,
        [input.value, confidence, JSON.stringify(sources), now, merged.id]
      );

      return {
        id: merged.id,
        userId: merged.user_id,
        category: merged.category,
        key: merged.key,
        value: input.value,
        confidence,
        sources,
        createdAt: merged.created_at,
        updatedAt: now,
      };
    }

    // Create new preference
    const preference: Preference = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.PREFERENCES} (
        id, user_id, category, key, value, confidence, sources, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        preference.id,
        preference.userId,
        preference.category,
        preference.key,
        preference.value,
        preference.confidence,
        JSON.stringify(preference.sources),
        preference.createdAt,
        preference.updatedAt,
      ]
    );

    return preference;
  }

  async getPreferences(userId: string, category?: string): Promise<Preference[]> {
    let sql = `SELECT * FROM ${TABLE_NAMES.PREFERENCES} WHERE user_id = ?`;
    const params: unknown[] = [userId];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY confidence DESC';

    const result = await this.db.execute<PreferenceRow>(sql, params);
    return result.map(row => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      sources: JSON.parse(row.sources),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async upsertFact(input: Omit<LearnedFact, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearnedFact> {
    const now = Date.now();

    // Check for existing fact
    const existing = await this.db.execute<FactRow>(
      `SELECT * FROM ${TABLE_NAMES.LEARNED_FACTS} WHERE user_id = ? AND category = ? AND fact = ?`,
      [input.userId, input.category, input.fact]
    );

    if (existing.length > 0) {
      const merged = existing[0];
      const sources = [...new Set([...JSON.parse(merged.sources), ...input.sources])];
      const confidence = Math.max(merged.confidence, input.confidence);

      await this.db.execute(
        `UPDATE ${TABLE_NAMES.LEARNED_FACTS} SET confidence = ?, sources = ?, verified_at = ?, updated_at = ? WHERE id = ?`,
        [confidence, JSON.stringify(sources), input.verifiedAt ?? null, now, merged.id]
      );

      return {
        id: merged.id,
        userId: merged.user_id,
        category: merged.category,
        fact: merged.fact,
        confidence,
        sources,
        verifiedAt: input.verifiedAt ?? merged.verified_at ?? undefined,
        createdAt: merged.created_at,
        updatedAt: now,
      };
    }

    const fact: LearnedFact = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.execute(
      `INSERT INTO ${TABLE_NAMES.LEARNED_FACTS} (
        id, user_id, category, fact, confidence, sources, verified_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fact.id,
        fact.userId,
        fact.category,
        fact.fact,
        fact.confidence,
        JSON.stringify(fact.sources),
        fact.verifiedAt ?? null,
        fact.createdAt,
        fact.updatedAt,
      ]
    );

    return fact;
  }

  async getFacts(userId: string, category?: string): Promise<LearnedFact[]> {
    let sql = `SELECT * FROM ${TABLE_NAMES.LEARNED_FACTS} WHERE user_id = ?`;
    const params: unknown[] = [userId];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY confidence DESC';

    const result = await this.db.execute<FactRow>(sql, params);
    return result.map(row => ({
      id: row.id,
      userId: row.user_id,
      category: row.category,
      fact: row.fact,
      confidence: row.confidence,
      sources: JSON.parse(row.sources),
      verifiedAt: row.verified_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async cleanupContexts(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const result = await this.db.execute(
      `DELETE FROM ${TABLE_NAMES.CONTEXTS} WHERE timestamp < ?`,
      [cutoff]
    );
    return (result as unknown as { changes: number }).changes;
  }
}

// =============================================================================
// In-Memory Context Store
// =============================================================================

export class InMemoryContextStore implements ContextStore {
  private contexts = new Map<string, Context>();
  private preferences = new Map<string, Preference>();
  private facts = new Map<string, LearnedFact>();

  async initialize(): Promise<void> {
    // No-op
  }

  async addContext(input: Omit<Context, 'id'>): Promise<Context> {
    const context: Context = {
      id: randomUUID(),
      ...input,
    };
    this.contexts.set(context.id, context);
    return { ...context };
  }

  async getContexts(userId: string, sessionId: string, limit?: number): Promise<Context[]> {
    let result = Array.from(this.contexts.values())
      .filter(c => c.userId === userId && c.sessionId === sessionId)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (limit) {
      result = result.slice(0, limit);
    }

    return result.map(c => ({ ...c }));
  }

  async upsertPreference(input: Omit<Preference, 'id' | 'createdAt' | 'updatedAt'>): Promise<Preference> {
    const now = Date.now();
    const key = `${input.userId}:${input.category}:${input.key}`;
    const existing = this.preferences.get(key);

    if (existing) {
      const updated: Preference = {
        ...existing,
        value: input.value,
        confidence: Math.max(existing.confidence, input.confidence),
        sources: [...new Set([...existing.sources, ...input.sources])],
        updatedAt: now,
      };
      this.preferences.set(key, updated);
      return { ...updated };
    }

    const preference: Preference = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.preferences.set(key, preference);
    return { ...preference };
  }

  async getPreferences(userId: string, category?: string): Promise<Preference[]> {
    return Array.from(this.preferences.values())
      .filter(p => p.userId === userId && (!category || p.category === category))
      .sort((a, b) => b.confidence - a.confidence)
      .map(p => ({ ...p }));
  }

  async upsertFact(input: Omit<LearnedFact, 'id' | 'createdAt' | 'updatedAt'>): Promise<LearnedFact> {
    const now = Date.now();
    const key = `${input.userId}:${input.category}:${input.fact}`;
    const existing = this.facts.get(key);

    if (existing) {
      const updated: LearnedFact = {
        ...existing,
        confidence: Math.max(existing.confidence, input.confidence),
        sources: [...new Set([...existing.sources, ...input.sources])],
        verifiedAt: input.verifiedAt ?? existing.verifiedAt,
        updatedAt: now,
      };
      this.facts.set(key, updated);
      return { ...updated };
    }

    const fact: LearnedFact = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.facts.set(key, fact);
    return { ...fact };
  }

  async getFacts(userId: string, category?: string): Promise<LearnedFact[]> {
    return Array.from(this.facts.values())
      .filter(f => f.userId === userId && (!category || f.category === category))
      .sort((a, b) => b.confidence - a.confidence)
      .map(f => ({ ...f }));
  }

  async cleanupContexts(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    for (const [id, context] of this.contexts) {
      if (context.timestamp < cutoff) {
        this.contexts.delete(id);
        count++;
      }
    }
    return count;
  }
}

// =============================================================================
// Context Accumulator Service
// =============================================================================

export interface AccumulatorConfig {
  /** Minimum confidence for preferences */
  minPreferenceConfidence: number;
  /** Minimum confidence for facts */
  minFactConfidence: number;
  /** Callback for events */
  onEvent?: (event: string, data: unknown) => void;
}

const DEFAULT_CONFIG: AccumulatorConfig = {
  minPreferenceConfidence: CONTEXT_DEFAULTS.MIN_PREFERENCE_CONFIDENCE,
  minFactConfidence: CONTEXT_DEFAULTS.MIN_FACT_CONFIDENCE,
};

/** Extraction pattern for preferences */
interface PreferencePattern {
  category: string;
  patterns: RegExp[];
  extractor: (match: RegExpMatchArray, content: string) => { key: string; value: string } | null;
}

/** Extraction pattern for facts */
interface FactPattern {
  category: string;
  patterns: RegExp[];
  extractor: (match: RegExpMatchArray, content: string) => string | null;
}

export class ContextAccumulator {
  private readonly config: AccumulatorConfig;
  private readonly preferencePatterns: PreferencePattern[] = [];
  private readonly factPatterns: FactPattern[] = [];

  constructor(
    private readonly contextStore: ContextStore,
    private readonly memoryStore: MemoryStore,
    config?: Partial<AccumulatorConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Preference patterns
    this.preferencePatterns.push(
      {
        category: 'communication',
        patterns: [
          /(?:prefer|like|want)\s+(?:to\s+)?(?:be\s+)?(?:called|addressed\s+as)\s+["']?(\w+)["']?/i,
          /(?:my\s+name\s+is|call\s+me)\s+["']?(\w+)["']?/i,
        ],
        extractor: (match) => match[1] ? { key: 'preferred_name', value: match[1] } : null,
      },
      {
        category: 'communication',
        patterns: [
          /prefer\s+(?:a\s+)?(?:more\s+)?(formal|casual|brief|detailed)\s+(?:tone|style|responses?)/i,
          /(?:keep\s+it|be\s+more)\s+(formal|casual|brief|detailed)/i,
        ],
        extractor: (match) => match[1] ? { key: 'tone', value: match[1].toLowerCase() } : null,
      },
      {
        category: 'schedule',
        patterns: [
          /(?:i\s+)?(?:usually\s+)?(?:work|am\s+available)\s+(?:from\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
        ],
        extractor: (match) => match[1] && match[2]
          ? { key: 'working_hours', value: `${match[1]} - ${match[2]}` }
          : null,
      },
      {
        category: 'location',
        patterns: [
          /(?:i(?:'m|\s+am)\s+(?:in|from|based\s+in|located\s+in))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
          /my\s+(?:timezone|time\s+zone)\s+is\s+([\w\/]+)/i,
        ],
        extractor: (match) => match[1] ? { key: 'location', value: match[1] } : null,
      },
      {
        category: 'technical',
        patterns: [
          /(?:i\s+)?(?:prefer|use|like)\s+(typescript|javascript|python|rust|go|java|c\+\+|ruby)/i,
        ],
        extractor: (match) => match[1] ? { key: 'preferred_language', value: match[1].toLowerCase() } : null,
      },
    );

    // Fact patterns
    this.factPatterns.push(
      {
        category: 'personal',
        patterns: [
          /(?:i\s+have|i've\s+got)\s+(?:a\s+)?(\w+)\s+(?:named|called)\s+["']?(\w+)["']?/i,
        ],
        extractor: (match) => match[1] && match[2]
          ? `Has a ${match[1].toLowerCase()} named ${match[2]}`
          : null,
      },
      {
        category: 'work',
        patterns: [
          /(?:i\s+)?work\s+(?:at|for)\s+([A-Z][\w\s]+?)(?:\.|,|\s+as)/i,
          /(?:i(?:'m|\s+am)\s+(?:a|an))\s+([\w\s]+?)\s+(?:at|for)\s+([A-Z][\w\s]+)/i,
        ],
        extractor: (match) => match[2]
          ? `Works as ${match[1]} at ${match[2]}`
          : match[1]
            ? `Works at ${match[1]}`
            : null,
      },
      {
        category: 'project',
        patterns: [
          /(?:i(?:'m|\s+am)\s+)?(?:working\s+on|building|developing)\s+(?:a\s+)?([^.!?]+)/i,
        ],
        extractor: (match) => match[1] ? `Working on: ${match[1].trim()}` : null,
      },
    );
  }

  /**
   * Add custom preference pattern
   */
  addPreferencePattern(pattern: PreferencePattern): void {
    this.preferencePatterns.push(pattern);
  }

  /**
   * Add custom fact pattern
   */
  addFactPattern(pattern: FactPattern): void {
    this.factPatterns.push(pattern);
  }

  /**
   * Process a user message and accumulate context
   */
  async accumulate(
    userId: string,
    sessionId: string,
    content: string,
    source: string = 'user_message'
  ): Promise<AccumulatorResult> {
    const result: AccumulatorResult = {
      preferences: [],
      facts: [],
      memories: [],
    };

    // Store context
    await this.contextStore.addContext({
      userId,
      sessionId,
      type: 'message',
      content,
      source,
      confidence: 1.0,
      timestamp: Date.now(),
    });

    // Extract preferences
    for (const pattern of this.preferencePatterns) {
      for (const regex of pattern.patterns) {
        const match = content.match(regex);
        if (match) {
          const extracted = pattern.extractor(match, content);
          if (extracted) {
            const preference = await this.contextStore.upsertPreference({
              userId,
              category: pattern.category,
              key: extracted.key,
              value: extracted.value,
              confidence: this.calculateConfidence(content, match[0]),
              sources: [source],
            });

            if (preference.confidence >= this.config.minPreferenceConfidence) {
              result.preferences.push(preference);

              // Also store as memory
              const memory = await this.storeAsMemory(userId, sessionId, 'preference', preference);
              result.memories.push(memory);

              this.emit(MEMORY_EVENTS.PREFERENCE_EXTRACTED, { userId, preference });
            }
          }
        }
      }
    }

    // Extract facts
    for (const pattern of this.factPatterns) {
      for (const regex of pattern.patterns) {
        const match = content.match(regex);
        if (match) {
          const extracted = pattern.extractor(match, content);
          if (extracted) {
            const fact = await this.contextStore.upsertFact({
              userId,
              category: pattern.category,
              fact: extracted,
              confidence: this.calculateConfidence(content, match[0]),
              sources: [source],
            });

            if (fact.confidence >= this.config.minFactConfidence) {
              result.facts.push(fact);

              // Also store as memory
              const memory = await this.storeAsMemory(userId, sessionId, 'fact', fact);
              result.memories.push(memory);

              this.emit(MEMORY_EVENTS.FACT_LEARNED, { userId, fact });
            }
          }
        }
      }
    }

    this.emit(MEMORY_EVENTS.CONTEXT_ACCUMULATED, { userId, sessionId, result });

    return result;
  }

  /**
   * Get accumulated preferences for a user
   */
  async getPreferences(userId: string, category?: string): Promise<Preference[]> {
    return this.contextStore.getPreferences(userId, category);
  }

  /**
   * Get learned facts for a user
   */
  async getFacts(userId: string, category?: string): Promise<LearnedFact[]> {
    return this.contextStore.getFacts(userId, category);
  }

  /**
   * Get recent context for a session
   */
  async getContext(userId: string, sessionId: string, limit?: number): Promise<Context[]> {
    return this.contextStore.getContexts(userId, sessionId, limit);
  }

  /**
   * Build a context summary for prompts
   */
  async buildContextSummary(userId: string): Promise<string> {
    const preferences = await this.getPreferences(userId);
    const facts = await this.getFacts(userId);

    const lines: string[] = [];

    if (preferences.length > 0) {
      lines.push('User Preferences:');
      for (const pref of preferences) {
        lines.push(`- ${pref.category}/${pref.key}: ${pref.value}`);
      }
    }

    if (facts.length > 0) {
      lines.push('\nKnown Facts:');
      for (const fact of facts) {
        lines.push(`- ${fact.fact}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Cleanup old contexts
   */
  async cleanup(): Promise<number> {
    return this.contextStore.cleanupContexts(CONTEXT_DEFAULTS.CONTEXT_RETENTION_MS);
  }

  private calculateConfidence(fullContent: string, matchedPart: string): number {
    // Higher confidence for more explicit statements
    const explicitIndicators = [
      'i prefer', 'i like', 'i want', 'i always', 'i usually',
      'please', 'my', 'i am', "i'm",
    ];

    const lowerContent = fullContent.toLowerCase();
    let confidence = 0.5;

    for (const indicator of explicitIndicators) {
      if (lowerContent.includes(indicator)) {
        confidence += 0.1;
      }
    }

    // Longer matches are more specific
    if (matchedPart.length > 20) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  private async storeAsMemory(
    userId: string,
    sessionId: string,
    type: 'preference' | 'fact',
    data: Preference | LearnedFact
  ): Promise<Memory> {
    const input: MemoryCreateInput = {
      userId,
      sessionId,
      type,
      key: type === 'preference'
        ? `pref:${(data as Preference).category}:${(data as Preference).key}`
        : `fact:${(data as LearnedFact).category}:${(data as LearnedFact).fact.slice(0, 50)}`,
      value: JSON.stringify(data),
      priority: 'normal',
      retention: 'permanent',
      metadata: { extractedFrom: type, confidence: data.confidence },
    };

    return this.memoryStore.store(input);
  }

  private emit(event: string, data: unknown): void {
    this.config.onEvent?.(event, data);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function createContextStore(type: 'memory'): InMemoryContextStore;
export function createContextStore(type: 'database', db: DatabaseAdapter): DatabaseContextStore;
export function createContextStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): ContextStore {
  if (type === 'memory') {
    return new InMemoryContextStore();
  }
  if (!db) {
    throw new MemoryError('VALIDATION_ERROR', 'Database adapter required for database store');
  }
  return new DatabaseContextStore(db);
}

export function createContextAccumulator(
  contextStore: ContextStore,
  memoryStore: MemoryStore,
  config?: Partial<AccumulatorConfig>
): ContextAccumulator {
  return new ContextAccumulator(contextStore, memoryStore, config);
}
