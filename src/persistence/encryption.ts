import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'crypto';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Encryption' });

// ============================================================================
// Encryption Types
// ============================================================================

export interface EncryptionConfig {
  /** 32-byte master key */
  masterKey: Buffer;
  /** Salt length in bytes (default 16) */
  saltLength?: number;
  /** IV length in bytes (default 12 for GCM) */
  ivLength?: number;
  /** Auth tag length in bytes (default 16) */
  tagLength?: number;
}

export interface EncryptedData {
  /** Base64 encoded ciphertext */
  ciphertext: string;
  /** Base64 encoded IV */
  iv: string;
  /** Base64 encoded auth tag */
  tag: string;
}

export interface EncryptedDataWithSalt extends EncryptedData {
  /** Base64 encoded user salt */
  salt: string;
}

// ============================================================================
// Encryption Functions
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_SALT_LENGTH = 16;
const DEFAULT_IV_LENGTH = 12;
const DEFAULT_TAG_LENGTH = 16;

/**
 * Derive a user-specific key from master key using HKDF
 */
export function deriveUserKey(
  masterKey: Buffer,
  userId: string,
  salt: Buffer
): Buffer {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes');
  }

  // HKDF-SHA256 to derive user key
  const info = Buffer.from(`secureagent:memory:${userId}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', masterKey, salt, info, 32));
}

/**
 * Generate a random salt
 */
export function generateSalt(length: number = DEFAULT_SALT_LENGTH): Buffer {
  return randomBytes(length);
}

/**
 * Encrypt plaintext using AES-256-GCM
 */
export function encrypt(
  plaintext: string,
  key: Buffer,
  ivLength: number = DEFAULT_IV_LENGTH
): EncryptedData {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes');
  }

  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: DEFAULT_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export function decrypt(encrypted: EncryptedData, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes');
  }

  const iv = Buffer.from(encrypted.iv, 'base64');
  const tag = Buffer.from(encrypted.tag, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: DEFAULT_TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

// ============================================================================
// Encryption Service
// ============================================================================

/**
 * Service for managing encryption with per-user key derivation
 */
export class EncryptionService {
  private readonly masterKey: Buffer;
  private readonly saltLength: number;
  private readonly ivLength: number;
  private readonly userSalts = new Map<string, Buffer>();

  constructor(config: EncryptionConfig) {
    if (config.masterKey.length !== 32) {
      throw new Error('Master key must be 32 bytes (256 bits)');
    }

    this.masterKey = config.masterKey;
    this.saltLength = config.saltLength ?? DEFAULT_SALT_LENGTH;
    this.ivLength = config.ivLength ?? DEFAULT_IV_LENGTH;

    logger.info('Encryption service initialized');
  }

  /**
   * Get or create a salt for a user
   */
  getOrCreateUserSalt(userId: string): Buffer {
    let salt = this.userSalts.get(userId);
    if (!salt) {
      salt = generateSalt(this.saltLength);
      this.userSalts.set(userId, salt);
    }
    return salt;
  }

  /**
   * Set a user's salt (from database)
   */
  setUserSalt(userId: string, salt: Buffer): void {
    this.userSalts.set(userId, salt);
  }

  /**
   * Get a user's salt (if exists)
   */
  getUserSalt(userId: string): Buffer | undefined {
    return this.userSalts.get(userId);
  }

  /**
   * Derive a key for a specific user
   */
  deriveKeyForUser(userId: string, salt?: Buffer): Buffer {
    const userSalt = salt ?? this.getOrCreateUserSalt(userId);
    return deriveUserKey(this.masterKey, userId, userSalt);
  }

  /**
   * Encrypt data for a user
   */
  encryptForUser(userId: string, plaintext: string, salt?: Buffer): EncryptedDataWithSalt {
    const userSalt = salt ?? this.getOrCreateUserSalt(userId);
    const key = deriveUserKey(this.masterKey, userId, userSalt);
    const encrypted = encrypt(plaintext, key, this.ivLength);

    return {
      ...encrypted,
      salt: userSalt.toString('base64'),
    };
  }

  /**
   * Decrypt data for a user
   */
  decryptForUser(userId: string, encrypted: EncryptedDataWithSalt): string {
    const salt = Buffer.from(encrypted.salt, 'base64');
    const key = deriveUserKey(this.masterKey, userId, salt);
    return decrypt(encrypted, key);
  }

  /**
   * Encrypt with a specific salt (for database storage)
   */
  encryptWithSalt(
    userId: string,
    plaintext: string,
    salt: Buffer
  ): EncryptedData {
    const key = deriveUserKey(this.masterKey, userId, salt);
    return encrypt(plaintext, key, this.ivLength);
  }

  /**
   * Decrypt with a specific salt (from database)
   */
  decryptWithSalt(
    userId: string,
    encrypted: EncryptedData,
    salt: Buffer
  ): string {
    const key = deriveUserKey(this.masterKey, userId, salt);
    return decrypt(encrypted, key);
  }

  /**
   * Rotate master key - re-encrypt all data with new key
   * Returns a function to transform encrypted data
   */
  createKeyRotator(
    newMasterKey: Buffer
  ): (userId: string, encrypted: EncryptedDataWithSalt) => EncryptedDataWithSalt {
    if (newMasterKey.length !== 32) {
      throw new Error('New master key must be 32 bytes');
    }

    return (userId: string, encrypted: EncryptedDataWithSalt) => {
      // Decrypt with old key
      const plaintext = this.decryptForUser(userId, encrypted);

      // Generate new salt
      const newSalt = generateSalt(this.saltLength);

      // Encrypt with new key
      const newKey = deriveUserKey(newMasterKey, userId, newSalt);
      const newEncrypted = encrypt(plaintext, newKey, this.ivLength);

      return {
        ...newEncrypted,
        salt: newSalt.toString('base64'),
      };
    };
  }

  /**
   * Verify a master key is correct by attempting decryption
   */
  verifyKey(
    userId: string,
    encrypted: EncryptedDataWithSalt,
    expectedValue?: string
  ): boolean {
    try {
      const decrypted = this.decryptForUser(userId, encrypted);
      if (expectedValue !== undefined) {
        return decrypted === expectedValue;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached user salts
   */
  clearCache(): void {
    this.userSalts.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let globalEncryptionService: EncryptionService | null = null;

/**
 * Initialize the global encryption service
 */
export function initEncryption(config: EncryptionConfig): EncryptionService {
  globalEncryptionService = new EncryptionService(config);
  return globalEncryptionService;
}

/**
 * Initialize encryption from environment variable
 */
export function initEncryptionFromEnv(
  envVar: string = 'SECUREAGENT_MASTER_KEY'
): EncryptionService {
  const keyHex = process.env[envVar];
  if (!keyHex) {
    throw new Error(`Environment variable ${envVar} not set`);
  }

  const masterKey = Buffer.from(keyHex, 'hex');
  if (masterKey.length !== 32) {
    throw new Error(`${envVar} must be 64 hex characters (32 bytes)`);
  }

  return initEncryption({ masterKey });
}

/**
 * Get the global encryption service
 */
export function getEncryptionService(): EncryptionService {
  if (!globalEncryptionService) {
    throw new Error('Encryption service not initialized. Call initEncryption() first.');
  }
  return globalEncryptionService;
}

/**
 * Check if encryption service is initialized
 */
export function isEncryptionInitialized(): boolean {
  return globalEncryptionService !== null;
}

/**
 * Generate a new master key (for initial setup)
 */
export function generateMasterKey(): { hex: string; buffer: Buffer } {
  const key = randomBytes(32);
  return {
    hex: key.toString('hex'),
    buffer: key,
  };
}
