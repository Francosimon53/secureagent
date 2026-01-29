// Database
export {
  DatabaseManager,
  MemoryDatabaseAdapter,
  getDatabase,
  getDatabaseManager,
  isDatabaseInitialized,
  initDatabase,
  type DatabaseConfig,
  type DatabaseAdapter,
  type QueryResult,
  type Transaction,
} from './database.js';

// SQLite Adapter
export {
  SQLiteDatabaseAdapter,
  type SQLiteConfig,
} from './sqlite-adapter.js';

// Encryption
export {
  EncryptionService,
  encrypt,
  decrypt,
  deriveUserKey,
  generateSalt,
  generateMasterKey,
  initEncryption,
  initEncryptionFromEnv,
  getEncryptionService,
  isEncryptionInitialized,
  type EncryptionConfig,
  type EncryptedData,
  type EncryptedDataWithSalt,
} from './encryption.js';

// Memory Store
export {
  DatabaseMemoryStore,
  InMemoryMemoryStore,
  createMemoryStore,
  type MemoryStore,
  type MemoryQueryOptions,
} from './memory-store.js';

// Session Store
export {
  DatabaseSessionStore,
  MemorySessionStore,
  createSessionStore,
  type SessionStore,
} from './session-store.js';

// Token Store
export {
  DatabaseTokenStore,
  MemoryTokenStore,
  createTokenStore,
  type TokenStore,
  type StoredAccessToken,
  type StoredRefreshToken,
  type StoredAuthCode,
} from './token-store.js';

// Audit Store
export {
  DatabaseAuditStore,
  MemoryAuditStore,
  createAuditStore,
  type AuditStore,
  type AuditQueryFilters,
  type AuditQueryOptions,
  type AuditQueryResult,
  type AuditStats,
} from './audit-store.js';
