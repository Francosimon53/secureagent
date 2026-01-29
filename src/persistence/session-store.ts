import { getDatabase, type DatabaseManager, type QueryResult } from './database.js';
import type { SessionContext } from '../security/types.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'SessionStore' });

// ============================================================================
// Session Store Interface
// ============================================================================

/**
 * Session store interface for pluggable storage backends
 */
export interface SessionStore {
  /** Initialize the store (create tables, etc.) */
  initialize(): Promise<void>;
  /** Create a new session */
  create(session: SessionContext): Promise<void>;
  /** Get a session by ID */
  get(sessionId: string): Promise<SessionContext | null>;
  /** Get all sessions for a user */
  getByUser(userId: string): Promise<SessionContext[]>;
  /** Update a session */
  update(sessionId: string, updates: Partial<SessionContext>): Promise<boolean>;
  /** Delete a session */
  delete(sessionId: string): Promise<boolean>;
  /** Delete all sessions for a user */
  deleteByUser(userId: string): Promise<number>;
  /** Delete expired sessions */
  deleteExpired(): Promise<number>;
  /** Count active sessions for a user */
  countByUser(userId: string): Promise<number>;
  /** Get sessions by device ID */
  getByDevice(deviceId: string): Promise<SessionContext[]>;
  /** Check if session exists */
  exists(sessionId: string): Promise<boolean>;
}

// ============================================================================
// Database Session Store
// ============================================================================

/**
 * Database-backed session store
 */
export class DatabaseSessionStore implements SessionStore {
  private readonly db: DatabaseManager;
  private readonly tableName: string;
  private initialized = false;

  constructor(tableName: string = 'sessions') {
    this.db = getDatabase();
    this.tableName = tableName;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        risk_score INTEGER NOT NULL DEFAULT 0,
        mfa_verified INTEGER NOT NULL DEFAULT 0,
        metadata TEXT
      )
    `);

    // Create indexes for common queries
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_user_id
      ON ${this.tableName}(user_id)
    `).catch(() => {}); // Ignore if not supported

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_device_id
      ON ${this.tableName}(device_id)
    `).catch(() => {});

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires_at
      ON ${this.tableName}(expires_at)
    `).catch(() => {});

    this.initialized = true;
    logger.info({ tableName: this.tableName }, 'Session store initialized');
  }

  async create(session: SessionContext): Promise<void> {
    await this.ensureInitialized();

    await this.db.query(
      `INSERT INTO ${this.tableName}
       (session_id, user_id, device_id, ip_address, user_agent, created_at,
        last_activity_at, expires_at, risk_score, mfa_verified, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.sessionId,
        session.userId,
        session.deviceId,
        session.ipAddress,
        session.userAgent,
        session.createdAt,
        session.lastActivityAt,
        session.expiresAt,
        session.riskScore,
        session.mfaVerified ? 1 : 0,
        session.metadata ? JSON.stringify(session.metadata) : null,
      ]
    );

    logger.debug({ sessionId: session.sessionId, userId: session.userId }, 'Session created');
  }

  async get(sessionId: string): Promise<SessionContext | null> {
    await this.ensureInitialized();

    const result = await this.db.query<SessionRow>(
      `SELECT * FROM ${this.tableName} WHERE session_id = ?`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSession(result.rows[0]);
  }

  async getByUser(userId: string): Promise<SessionContext[]> {
    await this.ensureInitialized();

    const result = await this.db.query<SessionRow>(
      `SELECT * FROM ${this.tableName} WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(row => this.rowToSession(row));
  }

  async update(sessionId: string, updates: Partial<SessionContext>): Promise<boolean> {
    await this.ensureInitialized();

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.lastActivityAt !== undefined) {
      setClauses.push('last_activity_at = ?');
      params.push(updates.lastActivityAt);
    }
    if (updates.expiresAt !== undefined) {
      setClauses.push('expires_at = ?');
      params.push(updates.expiresAt);
    }
    if (updates.riskScore !== undefined) {
      setClauses.push('risk_score = ?');
      params.push(updates.riskScore);
    }
    if (updates.mfaVerified !== undefined) {
      setClauses.push('mfa_verified = ?');
      params.push(updates.mfaVerified ? 1 : 0);
    }
    if (updates.ipAddress !== undefined) {
      setClauses.push('ip_address = ?');
      params.push(updates.ipAddress);
    }
    if (updates.userAgent !== undefined) {
      setClauses.push('user_agent = ?');
      params.push(updates.userAgent);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      params.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      return false;
    }

    params.push(sessionId);

    const result = await this.db.query(
      `UPDATE ${this.tableName} SET ${setClauses.join(', ')} WHERE session_id = ?`,
      params
    );

    return result.rowCount > 0;
  }

  async delete(sessionId: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE session_id = ?`,
      [sessionId]
    );

    if (result.rowCount > 0) {
      logger.debug({ sessionId }, 'Session deleted');
    }

    return result.rowCount > 0;
  }

  async deleteByUser(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );

    if (result.rowCount > 0) {
      logger.info({ userId, count: result.rowCount }, 'User sessions deleted');
    }

    return result.rowCount;
  }

  async deleteExpired(): Promise<number> {
    await this.ensureInitialized();

    const now = Date.now();
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE expires_at < ?`,
      [now]
    );

    if (result.rowCount > 0) {
      logger.debug({ count: result.rowCount }, 'Expired sessions deleted');
    }

    return result.rowCount;
  }

  async countByUser(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE user_id = ?`,
      [userId]
    );

    return result.rows[0]?.count ?? 0;
  }

  async getByDevice(deviceId: string): Promise<SessionContext[]> {
    await this.ensureInitialized();

    const result = await this.db.query<SessionRow>(
      `SELECT * FROM ${this.tableName} WHERE device_id = ? ORDER BY created_at DESC`,
      [deviceId]
    );

    return result.rows.map(row => this.rowToSession(row));
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`,
      [sessionId]
    );

    return (result.rows[0]?.count ?? 0) > 0;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private rowToSession(row: SessionRow): SessionContext {
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      deviceId: row.device_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at,
      riskScore: row.risk_score,
      mfaVerified: row.mfa_verified === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

/**
 * Database row type for sessions
 */
interface SessionRow {
  session_id: string;
  user_id: string;
  device_id: string;
  ip_address: string;
  user_agent: string;
  created_at: number;
  last_activity_at: number;
  expires_at: number;
  risk_score: number;
  mfa_verified: number;
  metadata: string | null;
}

// ============================================================================
// In-Memory Session Store (for testing/development)
// ============================================================================

/**
 * In-memory session store
 */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionContext>();

  async initialize(): Promise<void> {
    // No initialization needed for in-memory store
  }

  async create(session: SessionContext): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
  }

  async get(sessionId: string): Promise<SessionContext | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async getByUser(userId: string): Promise<SessionContext[]> {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async update(sessionId: string, updates: Partial<SessionContext>): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    Object.assign(session, updates);
    return true;
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async deleteByUser(userId: string): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  async deleteExpired(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }

  async countByUser(userId: string): Promise<number> {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId).length;
  }

  async getByDevice(deviceId: string): Promise<SessionContext[]> {
    return Array.from(this.sessions.values())
      .filter(s => s.deviceId === deviceId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a session store based on configuration
 */
export function createSessionStore(type: 'memory' | 'database' = 'database'): SessionStore {
  switch (type) {
    case 'memory':
      return new MemorySessionStore();
    case 'database':
      return new DatabaseSessionStore();
    default:
      throw new Error(`Unknown session store type: ${type}`);
  }
}
