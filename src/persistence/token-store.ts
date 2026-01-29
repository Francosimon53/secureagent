import { getDatabase, type DatabaseManager } from './database.js';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'TokenStore' });

// ============================================================================
// Token Types
// ============================================================================

/**
 * Stored access token
 */
export interface StoredAccessToken {
  token: string;
  tokenType: 'Bearer' | 'DPoP';
  clientId: string;
  userId: string;
  scope: string[];
  expiresAt: number;
  issuedAt: number;
  dpopJkt?: string;
}

/**
 * Stored refresh token
 */
export interface StoredRefreshToken {
  token: string;
  clientId: string;
  userId: string;
  scope: string[];
  expiresAt: number;
  family: string;
  rotationCounter: number;
}

/**
 * Stored authorization code
 */
export interface StoredAuthCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  expiresAt: number;
  nonce?: string;
  dpopJkt?: string;
}

// ============================================================================
// Token Store Interface
// ============================================================================

/**
 * Token store interface
 */
export interface TokenStore {
  /** Initialize the store */
  initialize(): Promise<void>;

  // Access Tokens
  saveAccessToken(token: StoredAccessToken): Promise<void>;
  getAccessToken(tokenValue: string): Promise<StoredAccessToken | null>;
  deleteAccessToken(tokenValue: string): Promise<boolean>;
  deleteAccessTokensByUser(userId: string): Promise<number>;
  deleteExpiredAccessTokens(): Promise<number>;

  // Refresh Tokens
  saveRefreshToken(token: StoredRefreshToken): Promise<void>;
  getRefreshToken(tokenValue: string): Promise<StoredRefreshToken | null>;
  deleteRefreshToken(tokenValue: string): Promise<boolean>;
  deleteRefreshTokenFamily(family: string): Promise<number>;
  deleteRefreshTokensByUser(userId: string): Promise<number>;
  deleteExpiredRefreshTokens(): Promise<number>;

  // Authorization Codes
  saveAuthCode(code: StoredAuthCode): Promise<void>;
  getAuthCode(codeValue: string): Promise<StoredAuthCode | null>;
  deleteAuthCode(codeValue: string): Promise<boolean>;
  deleteExpiredAuthCodes(): Promise<number>;

  // Revocation
  revokeTokenFamily(family: string): Promise<void>;
  isTokenFamilyRevoked(family: string): Promise<boolean>;
  clearRevokedFamilies(olderThanMs: number): Promise<number>;
}

// ============================================================================
// Database Token Store
// ============================================================================

/**
 * Database-backed token store
 */
export class DatabaseTokenStore implements TokenStore {
  private readonly db: DatabaseManager;
  private initialized = false;

  constructor() {
    this.db = getDatabase();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Access tokens table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS access_tokens (
        token TEXT PRIMARY KEY,
        token_type TEXT NOT NULL,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        issued_at INTEGER NOT NULL,
        dpop_jkt TEXT
      )
    `);

    // Refresh tokens table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        token TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        family TEXT NOT NULL,
        rotation_counter INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Authorization codes table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS auth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        scope TEXT NOT NULL,
        code_challenge TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        nonce TEXT,
        dpop_jkt TEXT
      )
    `);

    // Revoked token families table
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS revoked_families (
        family TEXT PRIMARY KEY,
        revoked_at INTEGER NOT NULL
      )
    `);

    // Create indexes
    await this.createIndexes();

    this.initialized = true;
    logger.info('Token store initialized');
  }

  private async createIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_access_tokens_user ON access_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family)',
      'CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes(expires_at)',
    ];

    for (const sql of indexes) {
      await this.db.query(sql).catch(() => {});
    }
  }

  // ============================================================================
  // Access Tokens
  // ============================================================================

  async saveAccessToken(token: StoredAccessToken): Promise<void> {
    await this.ensureInitialized();

    await this.db.query(
      `INSERT INTO access_tokens
       (token, token_type, client_id, user_id, scope, expires_at, issued_at, dpop_jkt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        token.token,
        token.tokenType,
        token.clientId,
        token.userId,
        JSON.stringify(token.scope),
        token.expiresAt,
        token.issuedAt,
        token.dpopJkt ?? null,
      ]
    );
  }

  async getAccessToken(tokenValue: string): Promise<StoredAccessToken | null> {
    await this.ensureInitialized();

    const result = await this.db.query<AccessTokenRow>(
      'SELECT * FROM access_tokens WHERE token = ?',
      [tokenValue]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      token: row.token,
      tokenType: row.token_type as 'Bearer' | 'DPoP',
      clientId: row.client_id,
      userId: row.user_id,
      scope: JSON.parse(row.scope),
      expiresAt: row.expires_at,
      issuedAt: row.issued_at,
      dpopJkt: row.dpop_jkt ?? undefined,
    };
  }

  async deleteAccessToken(tokenValue: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM access_tokens WHERE token = ?',
      [tokenValue]
    );

    return result.rowCount > 0;
  }

  async deleteAccessTokensByUser(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM access_tokens WHERE user_id = ?',
      [userId]
    );

    return result.rowCount;
  }

  async deleteExpiredAccessTokens(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM access_tokens WHERE expires_at < ?',
      [Date.now()]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Refresh Tokens
  // ============================================================================

  async saveRefreshToken(token: StoredRefreshToken): Promise<void> {
    await this.ensureInitialized();

    await this.db.query(
      `INSERT INTO refresh_tokens
       (token, client_id, user_id, scope, expires_at, family, rotation_counter)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        token.token,
        token.clientId,
        token.userId,
        JSON.stringify(token.scope),
        token.expiresAt,
        token.family,
        token.rotationCounter,
      ]
    );
  }

  async getRefreshToken(tokenValue: string): Promise<StoredRefreshToken | null> {
    await this.ensureInitialized();

    const result = await this.db.query<RefreshTokenRow>(
      'SELECT * FROM refresh_tokens WHERE token = ?',
      [tokenValue]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      token: row.token,
      clientId: row.client_id,
      userId: row.user_id,
      scope: JSON.parse(row.scope),
      expiresAt: row.expires_at,
      family: row.family,
      rotationCounter: row.rotation_counter,
    };
  }

  async deleteRefreshToken(tokenValue: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM refresh_tokens WHERE token = ?',
      [tokenValue]
    );

    return result.rowCount > 0;
  }

  async deleteRefreshTokenFamily(family: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM refresh_tokens WHERE family = ?',
      [family]
    );

    return result.rowCount;
  }

  async deleteRefreshTokensByUser(userId: string): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM refresh_tokens WHERE user_id = ?',
      [userId]
    );

    return result.rowCount;
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM refresh_tokens WHERE expires_at < ?',
      [Date.now()]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Authorization Codes
  // ============================================================================

  async saveAuthCode(code: StoredAuthCode): Promise<void> {
    await this.ensureInitialized();

    await this.db.query(
      `INSERT INTO auth_codes
       (code, client_id, user_id, redirect_uri, scope, code_challenge,
        code_challenge_method, expires_at, nonce, dpop_jkt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code.code,
        code.clientId,
        code.userId,
        code.redirectUri,
        JSON.stringify(code.scope),
        code.codeChallenge,
        code.codeChallengeMethod,
        code.expiresAt,
        code.nonce ?? null,
        code.dpopJkt ?? null,
      ]
    );
  }

  async getAuthCode(codeValue: string): Promise<StoredAuthCode | null> {
    await this.ensureInitialized();

    const result = await this.db.query<AuthCodeRow>(
      'SELECT * FROM auth_codes WHERE code = ?',
      [codeValue]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      code: row.code,
      clientId: row.client_id,
      userId: row.user_id,
      redirectUri: row.redirect_uri,
      scope: JSON.parse(row.scope),
      codeChallenge: row.code_challenge,
      codeChallengeMethod: row.code_challenge_method as 'S256',
      expiresAt: row.expires_at,
      nonce: row.nonce ?? undefined,
      dpopJkt: row.dpop_jkt ?? undefined,
    };
  }

  async deleteAuthCode(codeValue: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM auth_codes WHERE code = ?',
      [codeValue]
    );

    return result.rowCount > 0;
  }

  async deleteExpiredAuthCodes(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.db.query(
      'DELETE FROM auth_codes WHERE expires_at < ?',
      [Date.now()]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Revocation
  // ============================================================================

  async revokeTokenFamily(family: string): Promise<void> {
    await this.ensureInitialized();

    // Delete all tokens in the family
    await this.deleteRefreshTokenFamily(family);

    // Mark family as revoked
    await this.db.query(
      `INSERT INTO revoked_families (family, revoked_at) VALUES (?, ?)`,
      [family, Date.now()]
    );

    logger.info({ family }, 'Token family revoked');
  }

  async isTokenFamilyRevoked(family: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.db.query<{ family: string }>(
      'SELECT family FROM revoked_families WHERE family = ?',
      [family]
    );

    return result.rows.length > 0;
  }

  async clearRevokedFamilies(olderThanMs: number): Promise<number> {
    await this.ensureInitialized();

    const cutoff = Date.now() - olderThanMs;
    const result = await this.db.query(
      'DELETE FROM revoked_families WHERE revoked_at < ?',
      [cutoff]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Database row types
interface AccessTokenRow {
  token: string;
  token_type: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;
  issued_at: number;
  dpop_jkt: string | null;
}

interface RefreshTokenRow {
  token: string;
  client_id: string;
  user_id: string;
  scope: string;
  expires_at: number;
  family: string;
  rotation_counter: number;
}

interface AuthCodeRow {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  expires_at: number;
  nonce: string | null;
  dpop_jkt: string | null;
}

// ============================================================================
// In-Memory Token Store
// ============================================================================

/**
 * In-memory token store for testing
 */
export class MemoryTokenStore implements TokenStore {
  private readonly accessTokens = new Map<string, StoredAccessToken>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();
  private readonly authCodes = new Map<string, StoredAuthCode>();
  private readonly revokedFamilies = new Map<string, number>();

  async initialize(): Promise<void> {}

  // Access Tokens
  async saveAccessToken(token: StoredAccessToken): Promise<void> {
    this.accessTokens.set(token.token, { ...token });
  }

  async getAccessToken(tokenValue: string): Promise<StoredAccessToken | null> {
    const token = this.accessTokens.get(tokenValue);
    return token ? { ...token } : null;
  }

  async deleteAccessToken(tokenValue: string): Promise<boolean> {
    return this.accessTokens.delete(tokenValue);
  }

  async deleteAccessTokensByUser(userId: string): Promise<number> {
    let count = 0;
    for (const [key, token] of this.accessTokens) {
      if (token.userId === userId) {
        this.accessTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  async deleteExpiredAccessTokens(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, token] of this.accessTokens) {
      if (token.expiresAt < now) {
        this.accessTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  // Refresh Tokens
  async saveRefreshToken(token: StoredRefreshToken): Promise<void> {
    this.refreshTokens.set(token.token, { ...token });
  }

  async getRefreshToken(tokenValue: string): Promise<StoredRefreshToken | null> {
    const token = this.refreshTokens.get(tokenValue);
    return token ? { ...token } : null;
  }

  async deleteRefreshToken(tokenValue: string): Promise<boolean> {
    return this.refreshTokens.delete(tokenValue);
  }

  async deleteRefreshTokenFamily(family: string): Promise<number> {
    let count = 0;
    for (const [key, token] of this.refreshTokens) {
      if (token.family === family) {
        this.refreshTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  async deleteRefreshTokensByUser(userId: string): Promise<number> {
    let count = 0;
    for (const [key, token] of this.refreshTokens) {
      if (token.userId === userId) {
        this.refreshTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, token] of this.refreshTokens) {
      if (token.expiresAt < now) {
        this.refreshTokens.delete(key);
        count++;
      }
    }
    return count;
  }

  // Authorization Codes
  async saveAuthCode(code: StoredAuthCode): Promise<void> {
    this.authCodes.set(code.code, { ...code });
  }

  async getAuthCode(codeValue: string): Promise<StoredAuthCode | null> {
    const code = this.authCodes.get(codeValue);
    return code ? { ...code } : null;
  }

  async deleteAuthCode(codeValue: string): Promise<boolean> {
    return this.authCodes.delete(codeValue);
  }

  async deleteExpiredAuthCodes(): Promise<number> {
    const now = Date.now();
    let count = 0;
    for (const [key, code] of this.authCodes) {
      if (code.expiresAt < now) {
        this.authCodes.delete(key);
        count++;
      }
    }
    return count;
  }

  // Revocation
  async revokeTokenFamily(family: string): Promise<void> {
    await this.deleteRefreshTokenFamily(family);
    this.revokedFamilies.set(family, Date.now());
  }

  async isTokenFamilyRevoked(family: string): Promise<boolean> {
    return this.revokedFamilies.has(family);
  }

  async clearRevokedFamilies(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let count = 0;
    for (const [family, revokedAt] of this.revokedFamilies) {
      if (revokedAt < cutoff) {
        this.revokedFamilies.delete(family);
        count++;
      }
    }
    return count;
  }

  /** Clear all data (for testing) */
  clear(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
    this.authCodes.clear();
    this.revokedFamilies.clear();
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a token store based on type
 */
export function createTokenStore(type: 'memory' | 'database' = 'database'): TokenStore {
  switch (type) {
    case 'memory':
      return new MemoryTokenStore();
    case 'database':
      return new DatabaseTokenStore();
    default:
      throw new Error(`Unknown token store type: ${type}`);
  }
}
