/**
 * Content Creator Suite - Voice Profile Store
 *
 * Persistence layer for voice profiles and writing style samples.
 */

import type {
  VoiceProfile,
  ContentSample,
  VoiceProfileQueryOptions,
  WritingStyle,
  DatabaseAdapter,
} from '../types.js';

// =============================================================================
// Voice Profile Store Interface
// =============================================================================

export interface VoiceProfileStore {
  initialize(): Promise<void>;

  // Profile operations
  createProfile(
    profile: Omit<VoiceProfile, 'id' | 'trainedAt' | 'updatedAt' | 'sampleCount' | 'confidence'>
  ): Promise<VoiceProfile>;
  getProfile(profileId: string): Promise<VoiceProfile | null>;
  updateProfile(profileId: string, updates: Partial<VoiceProfile>): Promise<VoiceProfile | null>;
  deleteProfile(profileId: string): Promise<boolean>;
  listProfiles(options?: VoiceProfileQueryOptions): Promise<VoiceProfile[]>;
  getProfilesByUser(userId: string): Promise<VoiceProfile[]>;

  // Sample operations
  addSample(profileId: string, sample: Omit<ContentSample, 'id' | 'createdAt'>): Promise<ContentSample>;
  getSample(sampleId: string): Promise<ContentSample | null>;
  deleteSample(sampleId: string): Promise<boolean>;
  getSamplesForProfile(profileId: string, limit?: number): Promise<ContentSample[]>;

  // Training operations
  markAsTrained(profileId: string, confidence: number): Promise<boolean>;
}

// =============================================================================
// Database Implementation
// =============================================================================

interface VoiceProfileRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  style: string;
  patterns: string;
  topic_expertise: string;
  trained_at: number;
  updated_at: number;
  sample_count: number;
  confidence: number;
}

interface ContentSampleRow {
  id: string;
  user_id: string;
  profile_id: string;
  content: string;
  platform: string;
  content_type: string;
  engagement_metrics: string | null;
  created_at: number;
  analyzed_at: number | null;
}

export class DatabaseVoiceProfileStore implements VoiceProfileStore {
  constructor(private readonly db: DatabaseAdapter) {}

  async initialize(): Promise<void> {
    // Create voice profiles table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_voice_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        style TEXT NOT NULL,
        patterns TEXT NOT NULL,
        topic_expertise TEXT NOT NULL DEFAULT '[]',
        trained_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_voice_profiles_user
      ON content_creator_voice_profiles(user_id)
    `);

    // Create content samples table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS content_creator_voice_samples (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        content TEXT NOT NULL,
        platform TEXT NOT NULL,
        content_type TEXT NOT NULL,
        engagement_metrics TEXT,
        created_at INTEGER NOT NULL,
        analyzed_at INTEGER,
        FOREIGN KEY (profile_id) REFERENCES content_creator_voice_profiles(id) ON DELETE CASCADE
      )
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_voice_samples_profile
      ON content_creator_voice_samples(profile_id)
    `);
  }

  async createProfile(
    profile: Omit<VoiceProfile, 'id' | 'trainedAt' | 'updatedAt' | 'sampleCount' | 'confidence'>
  ): Promise<VoiceProfile> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO content_creator_voice_profiles
       (id, user_id, name, description, style, patterns, topic_expertise, trained_at, updated_at, sample_count, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        profile.userId,
        profile.name,
        profile.description ?? null,
        JSON.stringify(profile.style),
        JSON.stringify(profile.patterns),
        JSON.stringify(profile.topicExpertise),
        now,
        now,
        profile.samples.length,
        0,
      ]
    );

    // Add initial samples
    for (const sample of profile.samples) {
      await this.addSample(id, sample);
    }

    return {
      ...profile,
      id,
      trainedAt: now,
      updatedAt: now,
      sampleCount: profile.samples.length,
      confidence: 0,
    };
  }

  async getProfile(profileId: string): Promise<VoiceProfile | null> {
    const result = await this.db.query<VoiceProfileRow>(
      'SELECT * FROM content_creator_voice_profiles WHERE id = ?',
      [profileId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const samples = await this.getSamplesForProfile(profileId);
    return this.rowToProfile(result.rows[0], samples);
  }

  async updateProfile(
    profileId: string,
    updates: Partial<VoiceProfile>
  ): Promise<VoiceProfile | null> {
    const existing = await this.getProfile(profileId);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      params.push(updates.description);
    }
    if (updates.style !== undefined) {
      setClauses.push('style = ?');
      params.push(JSON.stringify(updates.style));
    }
    if (updates.patterns !== undefined) {
      setClauses.push('patterns = ?');
      params.push(JSON.stringify(updates.patterns));
    }
    if (updates.topicExpertise !== undefined) {
      setClauses.push('topic_expertise = ?');
      params.push(JSON.stringify(updates.topicExpertise));
    }
    if (updates.confidence !== undefined) {
      setClauses.push('confidence = ?');
      params.push(updates.confidence);
    }

    params.push(profileId);

    await this.db.execute(
      `UPDATE content_creator_voice_profiles SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );

    return this.getProfile(profileId);
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    // Samples are deleted via CASCADE
    const result = await this.db.execute(
      'DELETE FROM content_creator_voice_profiles WHERE id = ?',
      [profileId]
    );
    return result.changes > 0;
  }

  async listProfiles(options?: VoiceProfileQueryOptions): Promise<VoiceProfile[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const result = await this.db.query<VoiceProfileRow>(
      `SELECT * FROM content_creator_voice_profiles ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const profiles: VoiceProfile[] = [];
    for (const row of result.rows) {
      const samples = await this.getSamplesForProfile(row.id);
      profiles.push(this.rowToProfile(row, samples));
    }

    return profiles;
  }

  async getProfilesByUser(userId: string): Promise<VoiceProfile[]> {
    return this.listProfiles({ userId });
  }

  async addSample(
    profileId: string,
    sample: Omit<ContentSample, 'id' | 'createdAt'>
  ): Promise<ContentSample> {
    const id = crypto.randomUUID();
    const now = Date.now();

    await this.db.execute(
      `INSERT INTO content_creator_voice_samples
       (id, user_id, profile_id, content, platform, content_type, engagement_metrics, created_at, analyzed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        sample.userId,
        profileId,
        sample.content,
        sample.platform,
        sample.contentType,
        sample.engagementMetrics ? JSON.stringify(sample.engagementMetrics) : null,
        now,
        sample.analyzedAt ?? null,
      ]
    );

    // Update sample count
    await this.db.execute(
      `UPDATE content_creator_voice_profiles
       SET sample_count = sample_count + 1, updated_at = ?
       WHERE id = ?`,
      [now, profileId]
    );

    return {
      ...sample,
      id,
      createdAt: now,
    };
  }

  async getSample(sampleId: string): Promise<ContentSample | null> {
    const result = await this.db.query<ContentSampleRow>(
      'SELECT * FROM content_creator_voice_samples WHERE id = ?',
      [sampleId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.rowToSample(result.rows[0]);
  }

  async deleteSample(sampleId: string): Promise<boolean> {
    const sample = await this.getSample(sampleId);
    if (!sample) {
      return false;
    }

    const result = await this.db.execute(
      'DELETE FROM content_creator_voice_samples WHERE id = ?',
      [sampleId]
    );

    if (result.changes > 0) {
      // Get profile_id from sample and update count
      const sampleResult = await this.db.query<{ profile_id: string }>(
        'SELECT profile_id FROM content_creator_voice_samples WHERE id = ?',
        [sampleId]
      );
      if (sampleResult.rows.length > 0) {
        await this.db.execute(
          `UPDATE content_creator_voice_profiles
           SET sample_count = sample_count - 1, updated_at = ?
           WHERE id = ?`,
          [Date.now(), sampleResult.rows[0].profile_id]
        );
      }
    }

    return result.changes > 0;
  }

  async getSamplesForProfile(profileId: string, limit?: number): Promise<ContentSample[]> {
    const result = await this.db.query<ContentSampleRow>(
      `SELECT * FROM content_creator_voice_samples
       WHERE profile_id = ?
       ORDER BY created_at DESC
       ${limit ? `LIMIT ${limit}` : ''}`,
      [profileId]
    );

    return result.rows.map(row => this.rowToSample(row));
  }

  async markAsTrained(profileId: string, confidence: number): Promise<boolean> {
    const now = Date.now();
    const result = await this.db.execute(
      `UPDATE content_creator_voice_profiles
       SET trained_at = ?, confidence = ?, updated_at = ?
       WHERE id = ?`,
      [now, confidence, now, profileId]
    );
    return result.changes > 0;
  }

  private rowToProfile(row: VoiceProfileRow, samples: ContentSample[]): VoiceProfile {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description ?? undefined,
      style: JSON.parse(row.style) as WritingStyle,
      samples,
      patterns: JSON.parse(row.patterns),
      topicExpertise: JSON.parse(row.topic_expertise),
      trainedAt: row.trained_at,
      updatedAt: row.updated_at,
      sampleCount: row.sample_count,
      confidence: row.confidence,
    };
  }

  private rowToSample(row: ContentSampleRow): ContentSample {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      platform: row.platform as ContentSample['platform'],
      contentType: row.content_type as ContentSample['contentType'],
      engagementMetrics: row.engagement_metrics
        ? JSON.parse(row.engagement_metrics)
        : undefined,
      createdAt: row.created_at,
      analyzedAt: row.analyzed_at ?? undefined,
    };
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryVoiceProfileStore implements VoiceProfileStore {
  private profiles = new Map<string, VoiceProfile>();
  private samples = new Map<string, ContentSample & { profileId: string }>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async createProfile(
    profile: Omit<VoiceProfile, 'id' | 'trainedAt' | 'updatedAt' | 'sampleCount' | 'confidence'>
  ): Promise<VoiceProfile> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const newProfile: VoiceProfile = {
      ...profile,
      id,
      trainedAt: now,
      updatedAt: now,
      sampleCount: profile.samples.length,
      confidence: 0,
    };

    this.profiles.set(id, newProfile);

    // Store samples
    for (const sample of profile.samples) {
      const sampleId = crypto.randomUUID();
      this.samples.set(sampleId, {
        ...sample,
        id: sampleId,
        createdAt: now,
        profileId: id,
      });
    }

    return newProfile;
  }

  async getProfile(profileId: string): Promise<VoiceProfile | null> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return null;
    }

    // Get samples
    const samples = await this.getSamplesForProfile(profileId);
    return { ...profile, samples };
  }

  async updateProfile(
    profileId: string,
    updates: Partial<VoiceProfile>
  ): Promise<VoiceProfile | null> {
    const existing = this.profiles.get(profileId);
    if (!existing) {
      return null;
    }

    const updated: VoiceProfile = {
      ...existing,
      ...updates,
      id: existing.id,
      userId: existing.userId,
      trainedAt: existing.trainedAt,
      updatedAt: Date.now(),
    };

    this.profiles.set(profileId, updated);
    return this.getProfile(profileId);
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    // Delete associated samples
    for (const [sampleId, sample] of this.samples) {
      if (sample.profileId === profileId) {
        this.samples.delete(sampleId);
      }
    }

    return this.profiles.delete(profileId);
  }

  async listProfiles(options?: VoiceProfileQueryOptions): Promise<VoiceProfile[]> {
    let items = Array.from(this.profiles.values());

    if (options?.userId) {
      items = items.filter(p => p.userId === options.userId);
    }

    // Sort by updatedAt desc
    items.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    items = items.slice(offset, offset + limit);

    // Populate samples
    const profilesWithSamples: VoiceProfile[] = [];
    for (const profile of items) {
      const samples = await this.getSamplesForProfile(profile.id);
      profilesWithSamples.push({ ...profile, samples });
    }

    return profilesWithSamples;
  }

  async getProfilesByUser(userId: string): Promise<VoiceProfile[]> {
    return this.listProfiles({ userId });
  }

  async addSample(
    profileId: string,
    sample: Omit<ContentSample, 'id' | 'createdAt'>
  ): Promise<ContentSample> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    const newSample: ContentSample & { profileId: string } = {
      ...sample,
      id,
      createdAt: now,
      profileId,
    };

    this.samples.set(id, newSample);

    // Update profile
    this.profiles.set(profileId, {
      ...profile,
      sampleCount: profile.sampleCount + 1,
      updatedAt: now,
    });

    return { ...sample, id, createdAt: now };
  }

  async getSample(sampleId: string): Promise<ContentSample | null> {
    const sample = this.samples.get(sampleId);
    if (!sample) {
      return null;
    }
    const { profileId: _, ...sampleData } = sample;
    return sampleData;
  }

  async deleteSample(sampleId: string): Promise<boolean> {
    const sample = this.samples.get(sampleId);
    if (!sample) {
      return false;
    }

    const profile = this.profiles.get(sample.profileId);
    if (profile) {
      this.profiles.set(sample.profileId, {
        ...profile,
        sampleCount: Math.max(0, profile.sampleCount - 1),
        updatedAt: Date.now(),
      });
    }

    return this.samples.delete(sampleId);
  }

  async getSamplesForProfile(profileId: string, limit?: number): Promise<ContentSample[]> {
    const profileSamples: ContentSample[] = [];

    for (const sample of this.samples.values()) {
      if (sample.profileId === profileId) {
        const { profileId: _, ...sampleData } = sample;
        profileSamples.push(sampleData);
      }
    }

    // Sort by createdAt desc
    profileSamples.sort((a, b) => b.createdAt - a.createdAt);

    if (limit) {
      return profileSamples.slice(0, limit);
    }

    return profileSamples;
  }

  async markAsTrained(profileId: string, confidence: number): Promise<boolean> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return false;
    }

    const now = Date.now();
    this.profiles.set(profileId, {
      ...profile,
      trainedAt: now,
      confidence,
      updatedAt: now,
    });

    return true;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createVoiceProfileStore(
  type: 'database' | 'memory',
  db?: DatabaseAdapter
): VoiceProfileStore {
  if (type === 'database' && db) {
    return new DatabaseVoiceProfileStore(db);
  }
  return new InMemoryVoiceProfileStore();
}
