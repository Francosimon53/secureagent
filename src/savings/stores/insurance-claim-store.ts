/**
 * Insurance Claim Store
 *
 * Persistence layer for insurance claims with PII encryption support.
 */

import { randomUUID } from 'crypto';
import type {
  InsuranceClaim,
  ClaimDocument,
  ClaimTimelineEvent,
  InsuranceClaimQueryOptions,
  ClaimStatus,
} from '../types.js';

/**
 * Interface for insurance claim storage
 */
export interface InsuranceClaimStore {
  initialize(): Promise<void>;

  // CRUD operations
  create(claim: Omit<InsuranceClaim, 'id' | 'createdAt' | 'updatedAt'>): Promise<InsuranceClaim>;
  get(claimId: string): Promise<InsuranceClaim | null>;
  update(claimId: string, updates: Partial<InsuranceClaim>): Promise<InsuranceClaim | null>;
  delete(claimId: string): Promise<boolean>;

  // Query operations
  list(userId: string, options?: InsuranceClaimQueryOptions): Promise<InsuranceClaim[]>;
  count(userId: string, options?: InsuranceClaimQueryOptions): Promise<number>;

  // Specialized queries
  getByStatus(userId: string, statuses: ClaimStatus[]): Promise<InsuranceClaim[]>;
  getByProvider(userId: string, provider: string): Promise<InsuranceClaim[]>;
  getPending(userId: string): Promise<InsuranceClaim[]>;
  getRecent(userId: string, limit?: number): Promise<InsuranceClaim[]>;

  // Document operations
  addDocument(claimId: string, document: Omit<ClaimDocument, 'id'>): Promise<ClaimDocument | null>;
  removeDocument(claimId: string, documentId: string): Promise<boolean>;
  getDocuments(claimId: string): Promise<ClaimDocument[]>;

  // Timeline operations
  addTimelineEvent(claimId: string, event: Omit<ClaimTimelineEvent, 'id'>): Promise<ClaimTimelineEvent | null>;
  getTimeline(claimId: string): Promise<ClaimTimelineEvent[]>;

  // Status updates
  updateStatus(claimId: string, status: ClaimStatus, notes?: string): Promise<boolean>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Encryption service interface for PII protection
 */
export interface EncryptionService {
  encrypt(data: string): Promise<string>;
  decrypt(encrypted: string): Promise<string>;
}

/**
 * Database-backed insurance claim store with encryption support
 */
export class DatabaseInsuranceClaimStore implements InsuranceClaimStore {
  constructor(
    private readonly db: DatabaseAdapter,
    private readonly encryption?: EncryptionService
  ) {}

  async initialize(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS insurance_claims (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        policy_number_encrypted TEXT NOT NULL,
        status TEXT DEFAULT 'draft',
        claim_number TEXT,
        incident_date INTEGER NOT NULL,
        filed_date INTEGER,
        description TEXT NOT NULL,
        estimated_amount REAL,
        approved_amount REAL,
        paid_amount REAL,
        documents TEXT DEFAULT '[]',
        timeline TEXT DEFAULT '[]',
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_insurance_claims_user_status ON insurance_claims(user_id, status)
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_insurance_claims_user_provider ON insurance_claims(user_id, provider)
    `);
  }

  async create(claim: Omit<InsuranceClaim, 'id' | 'createdAt' | 'updatedAt'>): Promise<InsuranceClaim> {
    const now = Date.now();
    const id = randomUUID();

    // Encrypt policy number
    const encryptedPolicyNumber = this.encryption
      ? await this.encryption.encrypt(claim.policyNumber)
      : claim.policyNumber;

    const item: InsuranceClaim = {
      ...claim,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Add creation event to timeline
    const creationEvent: ClaimTimelineEvent = {
      id: randomUUID(),
      type: 'created',
      description: 'Claim created',
      timestamp: now,
    };
    item.timeline = [creationEvent];

    await this.db.execute(
      `INSERT INTO insurance_claims (
        id, user_id, type, provider, policy_number_encrypted, status, claim_number,
        incident_date, filed_date, description, estimated_amount, approved_amount,
        paid_amount, documents, timeline, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.userId,
        item.type,
        item.provider,
        encryptedPolicyNumber,
        item.status,
        item.claimNumber ?? null,
        item.incidentDate,
        item.filedDate ?? null,
        item.description,
        item.estimatedAmount ?? null,
        item.approvedAmount ?? null,
        item.paidAmount ?? null,
        JSON.stringify(item.documents),
        JSON.stringify(item.timeline),
        item.notes ?? null,
        item.createdAt,
        item.updatedAt,
      ]
    );

    return item;
  }

  async get(claimId: string): Promise<InsuranceClaim | null> {
    const result = await this.db.query<InsuranceClaimRow>(
      'SELECT * FROM insurance_claims WHERE id = ?',
      [claimId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToClaim(result.rows[0]);
  }

  async update(claimId: string, updates: Partial<InsuranceClaim>): Promise<InsuranceClaim | null> {
    const existing = await this.get(claimId);
    if (!existing) {
      return null;
    }

    const now = Date.now();

    // Handle policy number encryption if updated
    let encryptedPolicyNumber: string | undefined;
    if (updates.policyNumber) {
      encryptedPolicyNumber = this.encryption
        ? await this.encryption.encrypt(updates.policyNumber)
        : updates.policyNumber;
    }

    const updated: InsuranceClaim = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    // Get current encrypted policy number if not updating it
    let policyNumberForDb: string;
    if (encryptedPolicyNumber) {
      policyNumberForDb = encryptedPolicyNumber;
    } else {
      const row = await this.db.query<{ policy_number_encrypted: string }>(
        'SELECT policy_number_encrypted FROM insurance_claims WHERE id = ?',
        [claimId]
      );
      policyNumberForDb = row.rows[0]?.policy_number_encrypted ?? '';
    }

    await this.db.execute(
      `UPDATE insurance_claims SET
        type = ?, provider = ?, policy_number_encrypted = ?, status = ?, claim_number = ?,
        incident_date = ?, filed_date = ?, description = ?, estimated_amount = ?,
        approved_amount = ?, paid_amount = ?, documents = ?, timeline = ?, notes = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        updated.type,
        updated.provider,
        policyNumberForDb,
        updated.status,
        updated.claimNumber ?? null,
        updated.incidentDate,
        updated.filedDate ?? null,
        updated.description,
        updated.estimatedAmount ?? null,
        updated.approvedAmount ?? null,
        updated.paidAmount ?? null,
        JSON.stringify(updated.documents),
        JSON.stringify(updated.timeline),
        updated.notes ?? null,
        updated.updatedAt,
        claimId,
      ]
    );

    return updated;
  }

  async delete(claimId: string): Promise<boolean> {
    const result = await this.db.execute(
      'DELETE FROM insurance_claims WHERE id = ?',
      [claimId]
    );
    return result.changes > 0;
  }

  async list(userId: string, options: InsuranceClaimQueryOptions = {}): Promise<InsuranceClaim[]> {
    const { sql, params } = this.buildQuerySQL(userId, options);
    const result = await this.db.query<InsuranceClaimRow>(sql, params);
    return Promise.all(result.rows.map(row => this.rowToClaim(row)));
  }

  async count(userId: string, options: InsuranceClaimQueryOptions = {}): Promise<number> {
    const { sql, params } = this.buildQuerySQL(userId, options, true);
    const result = await this.db.query<{ count: number }>(sql, params);
    return result.rows[0]?.count ?? 0;
  }

  async getByStatus(userId: string, statuses: ClaimStatus[]): Promise<InsuranceClaim[]> {
    return this.list(userId, { status: statuses });
  }

  async getByProvider(userId: string, provider: string): Promise<InsuranceClaim[]> {
    return this.list(userId, { provider });
  }

  async getPending(userId: string): Promise<InsuranceClaim[]> {
    return this.list(userId, {
      status: ['draft', 'ready_to_file', 'filed', 'under_review', 'additional_info_requested'],
    });
  }

  async getRecent(userId: string, limit = 10): Promise<InsuranceClaim[]> {
    return this.list(userId, { limit, orderBy: 'createdAt', orderDirection: 'desc' });
  }

  async addDocument(claimId: string, document: Omit<ClaimDocument, 'id'>): Promise<ClaimDocument | null> {
    const claim = await this.get(claimId);
    if (!claim) {
      return null;
    }

    const newDocument: ClaimDocument = {
      ...document,
      id: randomUUID(),
    };

    claim.documents.push(newDocument);

    // Add timeline event
    const event: ClaimTimelineEvent = {
      id: randomUUID(),
      type: 'document_added',
      description: `Document added: ${newDocument.name}`,
      timestamp: Date.now(),
      metadata: { documentId: newDocument.id, documentType: newDocument.type },
    };
    claim.timeline.push(event);

    await this.update(claimId, { documents: claim.documents, timeline: claim.timeline });
    return newDocument;
  }

  async removeDocument(claimId: string, documentId: string): Promise<boolean> {
    const claim = await this.get(claimId);
    if (!claim) {
      return false;
    }

    const initialLength = claim.documents.length;
    claim.documents = claim.documents.filter(d => d.id !== documentId);

    if (claim.documents.length === initialLength) {
      return false;
    }

    await this.update(claimId, { documents: claim.documents });
    return true;
  }

  async getDocuments(claimId: string): Promise<ClaimDocument[]> {
    const claim = await this.get(claimId);
    return claim?.documents ?? [];
  }

  async addTimelineEvent(claimId: string, event: Omit<ClaimTimelineEvent, 'id'>): Promise<ClaimTimelineEvent | null> {
    const claim = await this.get(claimId);
    if (!claim) {
      return null;
    }

    const newEvent: ClaimTimelineEvent = {
      ...event,
      id: randomUUID(),
    };

    claim.timeline.push(newEvent);
    await this.update(claimId, { timeline: claim.timeline });
    return newEvent;
  }

  async getTimeline(claimId: string): Promise<ClaimTimelineEvent[]> {
    const claim = await this.get(claimId);
    return claim?.timeline ?? [];
  }

  async updateStatus(claimId: string, status: ClaimStatus, notes?: string): Promise<boolean> {
    const claim = await this.get(claimId);
    if (!claim) {
      return false;
    }

    const now = Date.now();

    // Add status change event to timeline
    const event: ClaimTimelineEvent = {
      id: randomUUID(),
      type: 'status_changed',
      description: `Status changed to: ${status}`,
      timestamp: now,
      metadata: { previousStatus: claim.status, newStatus: status, notes },
    };

    claim.timeline.push(event);

    // Handle special status updates
    const updates: Partial<InsuranceClaim> = {
      status,
      timeline: claim.timeline,
    };

    if (status === 'filed' && !claim.filedDate) {
      updates.filedDate = now;
    }

    if (notes) {
      updates.notes = claim.notes ? `${claim.notes}\n\n${notes}` : notes;
    }

    await this.update(claimId, updates);
    return true;
  }

  private buildQuerySQL(
    userId: string,
    options: InsuranceClaimQueryOptions,
    countOnly = false
  ): { sql: string; params: unknown[] } {
    const conditions: string[] = ['user_id = ?'];
    const params: unknown[] = [userId];

    if (options.status && options.status.length > 0) {
      const placeholders = options.status.map(() => '?').join(',');
      conditions.push(`status IN (${placeholders})`);
      params.push(...options.status);
    }

    if (options.type && options.type.length > 0) {
      const placeholders = options.type.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...options.type);
    }

    if (options.provider) {
      conditions.push('provider = ?');
      params.push(options.provider);
    }

    const whereClause = conditions.join(' AND ');

    if (countOnly) {
      return {
        sql: `SELECT COUNT(*) as count FROM insurance_claims WHERE ${whereClause}`,
        params,
      };
    }

    let orderBy = 'created_at DESC';
    if (options.orderBy) {
      const direction = options.orderDirection === 'asc' ? 'ASC' : 'DESC';
      const column = {
        createdAt: 'created_at',
        incidentDate: 'incident_date',
        filedDate: 'filed_date',
      }[options.orderBy];
      orderBy = `${column} ${direction}`;
    }

    let sql = `SELECT * FROM insurance_claims WHERE ${whereClause} ORDER BY ${orderBy}`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    if (options.offset) {
      sql += ` OFFSET ?`;
      params.push(options.offset);
    }

    return { sql, params };
  }

  private async rowToClaim(row: InsuranceClaimRow): Promise<InsuranceClaim> {
    // Decrypt policy number
    const policyNumber = this.encryption
      ? await this.encryption.decrypt(row.policy_number_encrypted)
      : row.policy_number_encrypted;

    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as InsuranceClaim['type'],
      provider: row.provider,
      policyNumber,
      status: row.status as ClaimStatus,
      claimNumber: row.claim_number ?? undefined,
      incidentDate: row.incident_date,
      filedDate: row.filed_date ?? undefined,
      description: row.description,
      estimatedAmount: row.estimated_amount ?? undefined,
      approvedAmount: row.approved_amount ?? undefined,
      paidAmount: row.paid_amount ?? undefined,
      documents: JSON.parse(row.documents),
      timeline: JSON.parse(row.timeline),
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * In-memory insurance claim store for testing
 */
export class InMemoryInsuranceClaimStore implements InsuranceClaimStore {
  private claims = new Map<string, InsuranceClaim>();

  async initialize(): Promise<void> {
    // No-op
  }

  async create(claim: Omit<InsuranceClaim, 'id' | 'createdAt' | 'updatedAt'>): Promise<InsuranceClaim> {
    const now = Date.now();
    const item: InsuranceClaim = {
      ...claim,
      id: randomUUID(),
      timeline: [{
        id: randomUUID(),
        type: 'created',
        description: 'Claim created',
        timestamp: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    this.claims.set(item.id, item);
    return item;
  }

  async get(claimId: string): Promise<InsuranceClaim | null> {
    return this.claims.get(claimId) ?? null;
  }

  async update(claimId: string, updates: Partial<InsuranceClaim>): Promise<InsuranceClaim | null> {
    const existing = this.claims.get(claimId);
    if (!existing) return null;

    const updated: InsuranceClaim = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };
    this.claims.set(claimId, updated);
    return updated;
  }

  async delete(claimId: string): Promise<boolean> {
    return this.claims.delete(claimId);
  }

  async list(userId: string, options: InsuranceClaimQueryOptions = {}): Promise<InsuranceClaim[]> {
    let items = Array.from(this.claims.values()).filter(c => c.userId === userId);

    if (options.status && options.status.length > 0) {
      items = items.filter(c => options.status!.includes(c.status));
    }

    if (options.type && options.type.length > 0) {
      items = items.filter(c => options.type!.includes(c.type));
    }

    if (options.provider) {
      items = items.filter(c => c.provider === options.provider);
    }

    items.sort((a, b) => b.createdAt - a.createdAt);

    if (options.offset) {
      items = items.slice(options.offset);
    }

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async count(userId: string, options: InsuranceClaimQueryOptions = {}): Promise<number> {
    const items = await this.list(userId, { ...options, limit: undefined, offset: undefined });
    return items.length;
  }

  async getByStatus(userId: string, statuses: ClaimStatus[]): Promise<InsuranceClaim[]> {
    return this.list(userId, { status: statuses });
  }

  async getByProvider(userId: string, provider: string): Promise<InsuranceClaim[]> {
    return this.list(userId, { provider });
  }

  async getPending(userId: string): Promise<InsuranceClaim[]> {
    return this.list(userId, {
      status: ['draft', 'ready_to_file', 'filed', 'under_review', 'additional_info_requested'],
    });
  }

  async getRecent(userId: string, limit = 10): Promise<InsuranceClaim[]> {
    return this.list(userId, { limit });
  }

  async addDocument(claimId: string, document: Omit<ClaimDocument, 'id'>): Promise<ClaimDocument | null> {
    const claim = this.claims.get(claimId);
    if (!claim) return null;

    const newDocument: ClaimDocument = { ...document, id: randomUUID() };
    claim.documents.push(newDocument);

    claim.timeline.push({
      id: randomUUID(),
      type: 'document_added',
      description: `Document added: ${newDocument.name}`,
      timestamp: Date.now(),
      metadata: { documentId: newDocument.id },
    });

    claim.updatedAt = Date.now();
    return newDocument;
  }

  async removeDocument(claimId: string, documentId: string): Promise<boolean> {
    const claim = this.claims.get(claimId);
    if (!claim) return false;

    const initialLength = claim.documents.length;
    claim.documents = claim.documents.filter(d => d.id !== documentId);
    claim.updatedAt = Date.now();
    return claim.documents.length < initialLength;
  }

  async getDocuments(claimId: string): Promise<ClaimDocument[]> {
    return this.claims.get(claimId)?.documents ?? [];
  }

  async addTimelineEvent(claimId: string, event: Omit<ClaimTimelineEvent, 'id'>): Promise<ClaimTimelineEvent | null> {
    const claim = this.claims.get(claimId);
    if (!claim) return null;

    const newEvent: ClaimTimelineEvent = { ...event, id: randomUUID() };
    claim.timeline.push(newEvent);
    claim.updatedAt = Date.now();
    return newEvent;
  }

  async getTimeline(claimId: string): Promise<ClaimTimelineEvent[]> {
    return this.claims.get(claimId)?.timeline ?? [];
  }

  async updateStatus(claimId: string, status: ClaimStatus, notes?: string): Promise<boolean> {
    const claim = this.claims.get(claimId);
    if (!claim) return false;

    const now = Date.now();

    claim.timeline.push({
      id: randomUUID(),
      type: 'status_changed',
      description: `Status changed to: ${status}`,
      timestamp: now,
      metadata: { previousStatus: claim.status, newStatus: status },
    });

    claim.status = status;
    if (status === 'filed' && !claim.filedDate) {
      claim.filedDate = now;
    }
    if (notes) {
      claim.notes = claim.notes ? `${claim.notes}\n\n${notes}` : notes;
    }
    claim.updatedAt = now;
    return true;
  }
}

// Row type for database
interface InsuranceClaimRow {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  policy_number_encrypted: string;
  status: string;
  claim_number: string | null;
  incident_date: number;
  filed_date: number | null;
  description: string;
  estimated_amount: number | null;
  approved_amount: number | null;
  paid_amount: number | null;
  documents: string;
  timeline: string;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Factory function to create insurance claim store
 */
export function createInsuranceClaimStore(type: 'memory'): InMemoryInsuranceClaimStore;
export function createInsuranceClaimStore(
  type: 'database',
  db: DatabaseAdapter,
  encryption?: EncryptionService
): DatabaseInsuranceClaimStore;
export function createInsuranceClaimStore(
  type: 'memory' | 'database',
  db?: DatabaseAdapter,
  encryption?: EncryptionService
): InsuranceClaimStore {
  if (type === 'memory') {
    return new InMemoryInsuranceClaimStore();
  }
  if (!db) {
    throw new Error('Database adapter required for database store');
  }
  return new DatabaseInsuranceClaimStore(db, encryption);
}
