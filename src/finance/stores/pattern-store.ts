/**
 * Pattern Store
 *
 * Persistence layer for trade patterns used in RAG-based trade learning.
 */

import { randomUUID } from 'crypto';
import type {
  TradePattern,
  TradeEvaluation,
  PatternQueryOptions,
  PatternCondition,
} from '../types.js';
import type { DatabaseAdapter } from './trade-store.js';

// =============================================================================
// Pattern Store Interface
// =============================================================================

export interface PatternStore {
  initialize(): Promise<void>;

  // Pattern CRUD
  createPattern(pattern: Omit<TradePattern, 'id' | 'createdAt'>): Promise<TradePattern>;
  getPattern(patternId: string): Promise<TradePattern | null>;
  updatePattern(patternId: string, updates: Partial<TradePattern>): Promise<TradePattern | null>;
  deletePattern(patternId: string): Promise<boolean>;

  // Pattern queries
  listPatterns(options?: PatternQueryOptions): Promise<TradePattern[]>;
  getPatternsByCategory(category: TradePattern['category']): Promise<TradePattern[]>;
  getConfidentPatterns(minConfidence: number): Promise<TradePattern[]>;
  searchPatterns(query: string): Promise<TradePattern[]>;

  // Pattern stats
  recordPatternUsage(patternId: string, success: boolean): Promise<void>;
  updatePatternConfidence(patternId: string, confidence: number): Promise<void>;

  // Evaluations
  saveEvaluation(evaluation: TradeEvaluation): Promise<void>;
  getEvaluation(evaluationId: string): Promise<TradeEvaluation | null>;
  getEvaluationByTrade(tradeId: string): Promise<TradeEvaluation | null>;
  getRecentEvaluations(limit: number): Promise<TradeEvaluation[]>;

  // Embeddings (for similarity search)
  saveEmbedding(patternId: string, embedding: number[]): Promise<void>;
  findSimilarPatterns(embedding: number[], threshold: number, limit: number): Promise<TradePattern[]>;

  // Maintenance
  pruneOldPatterns(minConfidence: number, maxAgeDays: number): Promise<number>;
  getPatternCount(): Promise<number>;
}

// =============================================================================
// Database Row Types
// =============================================================================

interface PatternRow {
  id: string;
  name: string;
  category: string;
  conditions_json: string;
  outcome: string;
  success_rate: number;
  sample_size: number;
  average_return: number;
  average_holding_period: number;
  confidence: number;
  embedding_json: string | null;
  examples_json: string;
  created_at: number;
  last_updated: number;
  last_applied: number | null;
}

interface EvaluationRow {
  id: string;
  trade_id: string;
  trade_json: string;
  entry_score: number;
  exit_score: number;
  timing_score: number;
  risk_management_score: number;
  overall_score: number;
  actual_return: number;
  expected_return: number | null;
  holding_period_hours: number;
  lessons_json: string;
  matched_patterns_json: string;
  new_pattern_suggestions_json: string;
  evaluated_at: number;
}

// =============================================================================
// Database Pattern Store
// =============================================================================

export class DatabasePatternStore implements PatternStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Patterns table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trade_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        conditions_json TEXT NOT NULL,
        outcome TEXT NOT NULL,
        success_rate REAL DEFAULT 0,
        sample_size INTEGER DEFAULT 0,
        average_return REAL DEFAULT 0,
        average_holding_period REAL DEFAULT 0,
        confidence REAL DEFAULT 0.5,
        embedding_json TEXT,
        examples_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        last_updated INTEGER NOT NULL,
        last_applied INTEGER
      )
    `);

    // Evaluations table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trade_evaluations (
        id TEXT PRIMARY KEY,
        trade_id TEXT NOT NULL UNIQUE,
        trade_json TEXT NOT NULL,
        entry_score REAL NOT NULL,
        exit_score REAL NOT NULL,
        timing_score REAL NOT NULL,
        risk_management_score REAL NOT NULL,
        overall_score REAL NOT NULL,
        actual_return REAL NOT NULL,
        expected_return REAL,
        holding_period_hours REAL NOT NULL,
        lessons_json TEXT NOT NULL,
        matched_patterns_json TEXT NOT NULL,
        new_pattern_suggestions_json TEXT NOT NULL,
        evaluated_at INTEGER NOT NULL
      )
    `);

    // Create indexes
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_patterns_category ON trade_patterns(category)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_patterns_confidence ON trade_patterns(confidence)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_patterns_outcome ON trade_patterns(outcome)
    `);
    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_evaluations_trade ON trade_evaluations(trade_id)
    `);
  }

  // Pattern CRUD
  async createPattern(pattern: Omit<TradePattern, 'id' | 'createdAt'>): Promise<TradePattern> {
    const now = Date.now();
    const id = randomUUID();

    const item: TradePattern = {
      ...pattern,
      id,
      createdAt: now,
    };

    await this.db.execute(
      `INSERT INTO trade_patterns (
        id, name, category, conditions_json, outcome, success_rate,
        sample_size, average_return, average_holding_period, confidence,
        embedding_json, examples_json, created_at, last_updated, last_applied
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.name,
        item.category,
        JSON.stringify(item.conditions),
        item.outcome,
        item.successRate,
        item.sampleSize,
        item.averageReturn,
        item.averageHoldingPeriod,
        item.confidence,
        item.embedding ? JSON.stringify(item.embedding) : null,
        JSON.stringify(item.examples),
        item.createdAt,
        item.lastUpdated,
        item.lastApplied ?? null,
      ]
    );

    return item;
  }

  async getPattern(patternId: string): Promise<TradePattern | null> {
    const result = await this.db.query<PatternRow>(
      'SELECT * FROM trade_patterns WHERE id = ?',
      [patternId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToPattern(result.rows[0]);
  }

  async updatePattern(
    patternId: string,
    updates: Partial<TradePattern>
  ): Promise<TradePattern | null> {
    const existing = await this.getPattern(patternId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['last_updated = ?'];
    const params: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }
    if (updates.conditions !== undefined) {
      setClauses.push('conditions_json = ?');
      params.push(JSON.stringify(updates.conditions));
    }
    if (updates.outcome !== undefined) {
      setClauses.push('outcome = ?');
      params.push(updates.outcome);
    }
    if (updates.successRate !== undefined) {
      setClauses.push('success_rate = ?');
      params.push(updates.successRate);
    }
    if (updates.sampleSize !== undefined) {
      setClauses.push('sample_size = ?');
      params.push(updates.sampleSize);
    }
    if (updates.averageReturn !== undefined) {
      setClauses.push('average_return = ?');
      params.push(updates.averageReturn);
    }
    if (updates.averageHoldingPeriod !== undefined) {
      setClauses.push('average_holding_period = ?');
      params.push(updates.averageHoldingPeriod);
    }
    if (updates.confidence !== undefined) {
      setClauses.push('confidence = ?');
      params.push(updates.confidence);
    }
    if (updates.embedding !== undefined) {
      setClauses.push('embedding_json = ?');
      params.push(JSON.stringify(updates.embedding));
    }
    if (updates.examples !== undefined) {
      setClauses.push('examples_json = ?');
      params.push(JSON.stringify(updates.examples));
    }
    if (updates.lastApplied !== undefined) {
      setClauses.push('last_applied = ?');
      params.push(updates.lastApplied);
    }

    params.push(patternId);

    await this.db.execute(
      `UPDATE trade_patterns SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getPattern(patternId);
  }

  async deletePattern(patternId: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM trade_patterns WHERE id = ?', [patternId]);
    return result.changes > 0;
  }

  // Pattern queries
  async listPatterns(options: PatternQueryOptions = {}): Promise<TradePattern[]> {
    let sql = 'SELECT * FROM trade_patterns WHERE 1=1';
    const params: unknown[] = [];

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options.outcome) {
      sql += ' AND outcome = ?';
      params.push(options.outcome);
    }
    if (options.minConfidence !== undefined) {
      sql += ' AND confidence >= ?';
      params.push(options.minConfidence);
    }
    if (options.minSuccessRate !== undefined) {
      sql += ' AND success_rate >= ?';
      params.push(options.minSuccessRate);
    }
    if (options.minSampleSize !== undefined) {
      sql += ' AND sample_size >= ?';
      params.push(options.minSampleSize);
    }

    const sortBy = options.sortBy ?? 'confidence';
    const sortColumn = {
      confidence: 'confidence',
      successRate: 'success_rate',
      lastApplied: 'last_applied',
    }[sortBy];

    sql += ` ORDER BY ${sortColumn} DESC`;

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    const result = await this.db.query<PatternRow>(sql, params);
    return result.rows.map(row => this.rowToPattern(row));
  }

  async getPatternsByCategory(category: TradePattern['category']): Promise<TradePattern[]> {
    const result = await this.db.query<PatternRow>(
      'SELECT * FROM trade_patterns WHERE category = ? ORDER BY confidence DESC',
      [category]
    );
    return result.rows.map(row => this.rowToPattern(row));
  }

  async getConfidentPatterns(minConfidence: number): Promise<TradePattern[]> {
    const result = await this.db.query<PatternRow>(
      'SELECT * FROM trade_patterns WHERE confidence >= ? ORDER BY confidence DESC',
      [minConfidence]
    );
    return result.rows.map(row => this.rowToPattern(row));
  }

  async searchPatterns(query: string): Promise<TradePattern[]> {
    const result = await this.db.query<PatternRow>(
      `SELECT * FROM trade_patterns
       WHERE name LIKE ? OR examples_json LIKE ?
       ORDER BY confidence DESC`,
      [`%${query}%`, `%${query}%`]
    );
    return result.rows.map(row => this.rowToPattern(row));
  }

  // Pattern stats
  async recordPatternUsage(patternId: string, success: boolean): Promise<void> {
    const pattern = await this.getPattern(patternId);
    if (!pattern) {
      return;
    }

    const newSampleSize = pattern.sampleSize + 1;
    const successCount = Math.round(pattern.successRate * pattern.sampleSize) + (success ? 1 : 0);
    const newSuccessRate = successCount / newSampleSize;

    // Update confidence based on sample size and success rate
    // More samples = higher confidence, higher success rate = higher confidence
    const sampleConfidence = Math.min(newSampleSize / 50, 1); // Caps at 50 samples
    const performanceConfidence = success ? Math.min(newSuccessRate + 0.1, 1) : newSuccessRate;
    const newConfidence = (sampleConfidence * 0.3 + performanceConfidence * 0.7);

    await this.db.execute(
      `UPDATE trade_patterns
       SET sample_size = ?, success_rate = ?, confidence = ?, last_applied = ?, last_updated = ?
       WHERE id = ?`,
      [newSampleSize, newSuccessRate, newConfidence, Date.now(), Date.now(), patternId]
    );
  }

  async updatePatternConfidence(patternId: string, confidence: number): Promise<void> {
    await this.db.execute(
      'UPDATE trade_patterns SET confidence = ?, last_updated = ? WHERE id = ?',
      [confidence, Date.now(), patternId]
    );
  }

  // Evaluations
  async saveEvaluation(evaluation: TradeEvaluation): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO trade_evaluations (
        id, trade_id, trade_json, entry_score, exit_score, timing_score,
        risk_management_score, overall_score, actual_return, expected_return,
        holding_period_hours, lessons_json, matched_patterns_json,
        new_pattern_suggestions_json, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        evaluation.id,
        evaluation.tradeId,
        JSON.stringify(evaluation.trade),
        evaluation.entryScore,
        evaluation.exitScore,
        evaluation.timingScore,
        evaluation.riskManagementScore,
        evaluation.overallScore,
        evaluation.actualReturn,
        evaluation.expectedReturn ?? null,
        evaluation.holdingPeriodHours,
        JSON.stringify(evaluation.lessonsLearned),
        JSON.stringify(evaluation.matchedPatterns),
        JSON.stringify(evaluation.newPatternSuggestions),
        evaluation.evaluatedAt,
      ]
    );
  }

  async getEvaluation(evaluationId: string): Promise<TradeEvaluation | null> {
    const result = await this.db.query<EvaluationRow>(
      'SELECT * FROM trade_evaluations WHERE id = ?',
      [evaluationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToEvaluation(result.rows[0]);
  }

  async getEvaluationByTrade(tradeId: string): Promise<TradeEvaluation | null> {
    const result = await this.db.query<EvaluationRow>(
      'SELECT * FROM trade_evaluations WHERE trade_id = ?',
      [tradeId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToEvaluation(result.rows[0]);
  }

  async getRecentEvaluations(limit: number): Promise<TradeEvaluation[]> {
    const result = await this.db.query<EvaluationRow>(
      'SELECT * FROM trade_evaluations ORDER BY evaluated_at DESC LIMIT ?',
      [limit]
    );
    return result.rows.map(row => this.rowToEvaluation(row));
  }

  // Embeddings
  async saveEmbedding(patternId: string, embedding: number[]): Promise<void> {
    await this.db.execute(
      'UPDATE trade_patterns SET embedding_json = ?, last_updated = ? WHERE id = ?',
      [JSON.stringify(embedding), Date.now(), patternId]
    );
  }

  async findSimilarPatterns(
    embedding: number[],
    threshold: number,
    limit: number
  ): Promise<TradePattern[]> {
    // Get all patterns with embeddings
    const result = await this.db.query<PatternRow>(
      'SELECT * FROM trade_patterns WHERE embedding_json IS NOT NULL'
    );

    // Calculate cosine similarity for each pattern
    const patternsWithSimilarity: Array<{ pattern: TradePattern; similarity: number }> = [];

    for (const row of result.rows) {
      const pattern = this.rowToPattern(row);
      if (pattern.embedding) {
        const similarity = this.cosineSimilarity(embedding, pattern.embedding);
        if (similarity >= threshold) {
          patternsWithSimilarity.push({ pattern, similarity });
        }
      }
    }

    // Sort by similarity and return top N
    return patternsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.pattern);
  }

  // Maintenance
  async pruneOldPatterns(minConfidence: number, maxAgeDays: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const result = await this.db.execute(
      `DELETE FROM trade_patterns
       WHERE confidence < ? AND last_updated < ?`,
      [minConfidence, cutoffTime]
    );

    return result.changes;
  }

  async getPatternCount(): Promise<number> {
    const result = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM trade_patterns'
    );
    return result.rows[0]?.count ?? 0;
  }

  // Helper methods
  private rowToPattern(row: PatternRow): TradePattern {
    return {
      id: row.id,
      name: row.name,
      category: row.category as TradePattern['category'],
      conditions: JSON.parse(row.conditions_json) as PatternCondition[],
      outcome: row.outcome as TradePattern['outcome'],
      successRate: row.success_rate,
      sampleSize: row.sample_size,
      averageReturn: row.average_return,
      averageHoldingPeriod: row.average_holding_period,
      confidence: row.confidence,
      embedding: row.embedding_json ? JSON.parse(row.embedding_json) : undefined,
      examples: JSON.parse(row.examples_json),
      createdAt: row.created_at,
      lastUpdated: row.last_updated,
      lastApplied: row.last_applied ?? undefined,
    };
  }

  private rowToEvaluation(row: EvaluationRow): TradeEvaluation {
    return {
      id: row.id,
      tradeId: row.trade_id,
      trade: JSON.parse(row.trade_json),
      entryScore: row.entry_score,
      exitScore: row.exit_score,
      timingScore: row.timing_score,
      riskManagementScore: row.risk_management_score,
      overallScore: row.overall_score,
      actualReturn: row.actual_return,
      expectedReturn: row.expected_return ?? undefined,
      holdingPeriodHours: row.holding_period_hours,
      lessonsLearned: JSON.parse(row.lessons_json),
      matchedPatterns: JSON.parse(row.matched_patterns_json),
      newPatternSuggestions: JSON.parse(row.new_pattern_suggestions_json),
      evaluatedAt: row.evaluated_at,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}

// =============================================================================
// In-Memory Pattern Store
// =============================================================================

export class InMemoryPatternStore implements PatternStore {
  private patterns = new Map<string, TradePattern>();
  private evaluations = new Map<string, TradeEvaluation>();
  private evaluationsByTrade = new Map<string, TradeEvaluation>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createPattern(pattern: Omit<TradePattern, 'id' | 'createdAt'>): Promise<TradePattern> {
    const now = Date.now();
    const item: TradePattern = {
      ...pattern,
      id: randomUUID(),
      createdAt: now,
    };
    this.patterns.set(item.id, item);
    return item;
  }

  async getPattern(patternId: string): Promise<TradePattern | null> {
    return this.patterns.get(patternId) ?? null;
  }

  async updatePattern(
    patternId: string,
    updates: Partial<TradePattern>
  ): Promise<TradePattern | null> {
    const existing = this.patterns.get(patternId);
    if (!existing) {
      return null;
    }

    const updated: TradePattern = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      lastUpdated: Date.now(),
    };

    this.patterns.set(patternId, updated);
    return updated;
  }

  async deletePattern(patternId: string): Promise<boolean> {
    return this.patterns.delete(patternId);
  }

  async listPatterns(options: PatternQueryOptions = {}): Promise<TradePattern[]> {
    let result = Array.from(this.patterns.values());

    if (options.category) {
      result = result.filter(p => p.category === options.category);
    }
    if (options.outcome) {
      result = result.filter(p => p.outcome === options.outcome);
    }
    if (options.minConfidence !== undefined) {
      result = result.filter(p => p.confidence >= options.minConfidence!);
    }
    if (options.minSuccessRate !== undefined) {
      result = result.filter(p => p.successRate >= options.minSuccessRate!);
    }
    if (options.minSampleSize !== undefined) {
      result = result.filter(p => p.sampleSize >= options.minSampleSize!);
    }

    const sortBy = options.sortBy ?? 'confidence';
    result.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence;
        case 'successRate':
          return b.successRate - a.successRate;
        case 'lastApplied':
          return (b.lastApplied ?? 0) - (a.lastApplied ?? 0);
        default:
          return 0;
      }
    });

    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getPatternsByCategory(category: TradePattern['category']): Promise<TradePattern[]> {
    return Array.from(this.patterns.values())
      .filter(p => p.category === category)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async getConfidentPatterns(minConfidence: number): Promise<TradePattern[]> {
    return Array.from(this.patterns.values())
      .filter(p => p.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async searchPatterns(query: string): Promise<TradePattern[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.patterns.values())
      .filter(
        p =>
          p.name.toLowerCase().includes(lowerQuery) ||
          p.examples.some(e => e.toLowerCase().includes(lowerQuery))
      )
      .sort((a, b) => b.confidence - a.confidence);
  }

  async recordPatternUsage(patternId: string, success: boolean): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      return;
    }

    const newSampleSize = pattern.sampleSize + 1;
    const successCount = Math.round(pattern.successRate * pattern.sampleSize) + (success ? 1 : 0);
    const newSuccessRate = successCount / newSampleSize;

    const sampleConfidence = Math.min(newSampleSize / 50, 1);
    const performanceConfidence = success ? Math.min(newSuccessRate + 0.1, 1) : newSuccessRate;
    const newConfidence = sampleConfidence * 0.3 + performanceConfidence * 0.7;

    this.patterns.set(patternId, {
      ...pattern,
      sampleSize: newSampleSize,
      successRate: newSuccessRate,
      confidence: newConfidence,
      lastApplied: Date.now(),
      lastUpdated: Date.now(),
    });
  }

  async updatePatternConfidence(patternId: string, confidence: number): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      this.patterns.set(patternId, {
        ...pattern,
        confidence,
        lastUpdated: Date.now(),
      });
    }
  }

  async saveEvaluation(evaluation: TradeEvaluation): Promise<void> {
    this.evaluations.set(evaluation.id, evaluation);
    this.evaluationsByTrade.set(evaluation.tradeId, evaluation);
  }

  async getEvaluation(evaluationId: string): Promise<TradeEvaluation | null> {
    return this.evaluations.get(evaluationId) ?? null;
  }

  async getEvaluationByTrade(tradeId: string): Promise<TradeEvaluation | null> {
    return this.evaluationsByTrade.get(tradeId) ?? null;
  }

  async getRecentEvaluations(limit: number): Promise<TradeEvaluation[]> {
    return Array.from(this.evaluations.values())
      .sort((a, b) => b.evaluatedAt - a.evaluatedAt)
      .slice(0, limit);
  }

  async saveEmbedding(patternId: string, embedding: number[]): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      this.patterns.set(patternId, {
        ...pattern,
        embedding,
        lastUpdated: Date.now(),
      });
    }
  }

  async findSimilarPatterns(
    embedding: number[],
    threshold: number,
    limit: number
  ): Promise<TradePattern[]> {
    const patternsWithSimilarity: Array<{ pattern: TradePattern; similarity: number }> = [];

    for (const pattern of this.patterns.values()) {
      if (pattern.embedding) {
        const similarity = this.cosineSimilarity(embedding, pattern.embedding);
        if (similarity >= threshold) {
          patternsWithSimilarity.push({ pattern, similarity });
        }
      }
    }

    return patternsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.pattern);
  }

  async pruneOldPatterns(minConfidence: number, maxAgeDays: number): Promise<number> {
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [id, pattern] of this.patterns) {
      if (pattern.confidence < minConfidence && pattern.lastUpdated < cutoffTime) {
        this.patterns.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  async getPatternCount(): Promise<number> {
    return this.patterns.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createPatternStore(type: 'memory'): InMemoryPatternStore;
export function createPatternStore(type: 'database', db: DatabaseAdapter): DatabasePatternStore;
export function createPatternStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter
): PatternStore {
  if (type === 'memory') {
    return new InMemoryPatternStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabasePatternStore(db);
}
