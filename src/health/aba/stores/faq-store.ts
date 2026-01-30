/**
 * FAQ Store
 *
 * Storage for FAQ knowledge base entries used by parent chatbot.
 */

import type {
  FAQEntry,
  FAQEntryId,
  FAQCategory,
  FAQQueryOptions,
  KeyValueStoreAdapter,
} from '../types.js';

// =============================================================================
// FAQ Store Interface
// =============================================================================

export interface FAQStore {
  // CRUD Operations
  createEntry(entry: Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<FAQEntry>;
  getEntry(id: FAQEntryId): Promise<FAQEntry | null>;
  updateEntry(id: FAQEntryId, updates: Partial<FAQEntry>): Promise<FAQEntry | null>;
  deleteEntry(id: FAQEntryId): Promise<boolean>;
  listEntries(userId: string, options?: FAQQueryOptions): Promise<FAQEntry[]>;

  // Category operations
  getEntriesByCategory(userId: string, category: FAQCategory): Promise<FAQEntry[]>;
  getCategories(userId: string): Promise<FAQCategory[]>;

  // Search operations
  searchEntries(userId: string, query: string): Promise<FAQEntry[]>;
  findSimilarQuestions(userId: string, question: string): Promise<FAQEntry[]>;

  // Popularity tracking
  incrementViewCount(id: FAQEntryId): Promise<void>;
  incrementHelpfulCount(id: FAQEntryId): Promise<void>;
  incrementNotHelpfulCount(id: FAQEntryId): Promise<void>;
  getPopularEntries(userId: string, limit?: number): Promise<FAQEntry[]>;

  // Bulk operations
  importEntries(userId: string, entries: Array<Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>>): Promise<FAQEntry[]>;
  exportEntries(userId: string): Promise<FAQEntry[]>;
}

// =============================================================================
// Database Implementation
// =============================================================================

export class DatabaseFAQStore implements FAQStore {
  constructor(private readonly db: KeyValueStoreAdapter) {}

  async createEntry(
    entry: Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FAQEntry> {
    const now = Date.now();
    const newEntry: FAQEntry = {
      ...entry,
      id: crypto.randomUUID() as FAQEntryId,
      matchCount: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const userIdKey = entry.userId ?? 'system';
    await this.db.set(`faq:${newEntry.id}`, newEntry);
    await this.addToIndex('faq', userIdKey, newEntry.id);
    await this.addToIndex(`faq:category:${entry.category}`, userIdKey, newEntry.id);

    // Index keywords for search
    for (const keyword of entry.keywords ?? []) {
      await this.addToIndex(`faq:keyword:${keyword.toLowerCase()}`, userIdKey, newEntry.id);
    }

    return newEntry;
  }

  async getEntry(id: FAQEntryId): Promise<FAQEntry | null> {
    return this.db.get<FAQEntry>(`faq:${id}`);
  }

  async updateEntry(id: FAQEntryId, updates: Partial<FAQEntry>): Promise<FAQEntry | null> {
    const existing = await this.getEntry(id);
    if (!existing) return null;

    const updated: FAQEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await this.db.set(`faq:${id}`, updated);

    // Update category index if category changed
    if (updates.category && updates.category !== existing.category) {
      const userIdKey = existing.userId ?? 'system';
      await this.removeFromIndex(`faq:category:${existing.category}`, userIdKey, id);
      await this.addToIndex(`faq:category:${updates.category}`, userIdKey, id);
    }

    return updated;
  }

  async deleteEntry(id: FAQEntryId): Promise<boolean> {
    const entry = await this.getEntry(id);
    if (!entry) return false;

    const userIdKey = entry.userId ?? 'system';
    await this.db.delete(`faq:${id}`);
    await this.removeFromIndex('faq', userIdKey, id);
    await this.removeFromIndex(`faq:category:${entry.category}`, userIdKey, id);

    for (const keyword of entry.keywords ?? []) {
      await this.removeFromIndex(`faq:keyword:${keyword.toLowerCase()}`, userIdKey, id);
    }

    return true;
  }

  async listEntries(userId: string, options?: FAQQueryOptions): Promise<FAQEntry[]> {
    const entryIds = await this.getIndex('faq', userId);
    const entries: FAQEntry[] = [];

    for (const id of entryIds) {
      const entry = await this.getEntry(id as FAQEntryId);
      if (entry && this.matchesQuery(entry, options)) {
        entries.push(entry);
      }
    }

    return this.sortEntries(entries, options?.orderBy, options?.orderDirection);
  }

  async getEntriesByCategory(userId: string, category: FAQCategory): Promise<FAQEntry[]> {
    const entryIds = await this.getIndex(`faq:category:${category}`, userId);
    const entries: FAQEntry[] = [];

    for (const id of entryIds) {
      const entry = await this.getEntry(id as FAQEntryId);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries.sort((a, b) => b.matchCount - a.matchCount);
  }

  async getCategories(userId: string): Promise<FAQCategory[]> {
    const entries = await this.listEntries(userId);
    const categories = new Set<FAQCategory>();

    for (const entry of entries) {
      categories.add(entry.category);
    }

    return Array.from(categories);
  }

  async searchEntries(userId: string, query: string): Promise<FAQEntry[]> {
    const entries = await this.listEntries(userId);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scored = entries.map((entry) => {
      let score = 0;

      // Check question match (questions is an array of question variations)
      for (const question of entry.questions) {
        const questionLower = question.toLowerCase();
        if (questionLower.includes(queryLower)) {
          score += 10;
        }
        // Check word matches
        for (const word of queryWords) {
          if (questionLower.includes(word)) score += 1;
        }
      }

      // Check answer match
      const answerLower = entry.answer.toLowerCase();
      if (answerLower.includes(queryLower)) {
        score += 5;
      }

      // Check keyword matches
      for (const keyword of entry.keywords ?? []) {
        if (queryWords.includes(keyword.toLowerCase())) {
          score += 3;
        }
      }

      // Check word matches in answer
      for (const word of queryWords) {
        if (answerLower.includes(word)) score += 0.5;
      }

      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.entry);
  }

  async findSimilarQuestions(userId: string, question: string): Promise<FAQEntry[]> {
    const entries = await this.listEntries(userId);
    const questionWords = this.extractKeywords(question);

    const scored = entries.map((entry) => {
      // Check similarity against all question variations
      let maxSimilarity = 0;
      for (const q of entry.questions) {
        const entryWords = this.extractKeywords(q);
        const commonWords = questionWords.filter((w) => entryWords.includes(w));
        const similarity = commonWords.length / Math.max(questionWords.length, entryWords.length);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }

      // Also check keywords
      const keywordMatches = (entry.keywords ?? []).filter((k) =>
        questionWords.includes(k.toLowerCase())
      ).length;

      return { entry, score: maxSimilarity + keywordMatches * 0.2 };
    });

    return scored
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((s) => s.entry);
  }

  async incrementViewCount(id: FAQEntryId): Promise<void> {
    const entry = await this.getEntry(id);
    if (entry) {
      entry.matchCount = entry.matchCount + 1;
      await this.db.set(`faq:${id}`, entry);
    }
  }

  async incrementHelpfulCount(id: FAQEntryId): Promise<void> {
    const entry = await this.getEntry(id);
    if (entry) {
      entry.helpfulCount = (entry.helpfulCount ?? 0) + 1;
      await this.db.set(`faq:${id}`, entry);
    }
  }

  async incrementNotHelpfulCount(id: FAQEntryId): Promise<void> {
    const entry = await this.getEntry(id);
    if (entry) {
      entry.notHelpfulCount = (entry.notHelpfulCount ?? 0) + 1;
      await this.db.set(`faq:${id}`, entry);
    }
  }

  async getPopularEntries(userId: string, limit = 10): Promise<FAQEntry[]> {
    const entries = await this.listEntries(userId);
    return entries
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, limit);
  }

  async importEntries(
    userId: string,
    entries: Array<Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FAQEntry[]> {
    const created: FAQEntry[] = [];

    for (const entry of entries) {
      const newEntry = await this.createEntry({
        ...entry,
        userId,
      });
      created.push(newEntry);
    }

    return created;
  }

  async exportEntries(userId: string): Promise<FAQEntry[]> {
    return this.listEntries(userId);
  }

  // Helper methods

  private matchesQuery(entry: FAQEntry, options?: FAQQueryOptions): boolean {
    if (!options) return true;

    if (options.category && entry.category !== options.category) return false;
    if (options.active !== undefined && entry.active !== options.active) return false;

    if (options.language && entry.language !== options.language) return false;

    return true;
  }

  private sortEntries(
    entries: FAQEntry[],
    orderBy?: FAQQueryOptions['orderBy'],
    orderDirection?: 'asc' | 'desc'
  ): FAQEntry[] {
    const order = orderDirection === 'asc' ? 1 : -1;

    return entries.sort((a, b) => {
      switch (orderBy) {
        case 'matchCount':
          return (a.matchCount - b.matchCount) * order;
        case 'priority':
          return (a.priority - b.priority) * order;
        case 'createdAt':
        default:
          return (a.createdAt - b.createdAt) * order;
      }
    });
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
      'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here',
      'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
      'because', 'until', 'while', 'although', 'though', 'what', 'which', 'who',
      'this', 'that', 'these', 'those', 'i', 'me', 'my', 'myself', 'we', 'our',
      'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));
  }

  private async getIndex(name: string, userId: string): Promise<string[]> {
    const index = await this.db.get<string[]>(`index:${name}:${userId}`);
    return index ?? [];
  }

  private async addToIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    if (!index.includes(id)) {
      index.push(id);
      await this.db.set(`index:${name}:${userId}`, index);
    }
  }

  private async removeFromIndex(name: string, userId: string, id: string): Promise<void> {
    const index = await this.getIndex(name, userId);
    const newIndex = index.filter((i) => i !== id);
    await this.db.set(`index:${name}:${userId}`, newIndex);
  }
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

export class InMemoryFAQStore implements FAQStore {
  private entries = new Map<string, FAQEntry>();

  async createEntry(
    entry: Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<FAQEntry> {
    const now = Date.now();
    const newEntry: FAQEntry = {
      ...entry,
      id: crypto.randomUUID() as FAQEntryId,
      matchCount: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(newEntry.id, newEntry);
    return newEntry;
  }

  async getEntry(id: FAQEntryId): Promise<FAQEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async updateEntry(id: FAQEntryId, updates: Partial<FAQEntry>): Promise<FAQEntry | null> {
    const existing = this.entries.get(id);
    if (!existing) return null;

    const updated: FAQEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    this.entries.set(id, updated);
    return updated;
  }

  async deleteEntry(id: FAQEntryId): Promise<boolean> {
    return this.entries.delete(id);
  }

  async listEntries(userId: string, options?: FAQQueryOptions): Promise<FAQEntry[]> {
    const entries = Array.from(this.entries.values()).filter(
      (e) => e.userId === userId
    );

    return entries.filter((e) => {
      if (options?.category && e.category !== options.category) return false;
      if (options?.active !== undefined && e.active !== options.active) return false;
      if (options?.language && e.language !== options.language) return false;
      return true;
    });
  }

  async getEntriesByCategory(userId: string, category: FAQCategory): Promise<FAQEntry[]> {
    return this.listEntries(userId, { category });
  }

  async getCategories(userId: string): Promise<FAQCategory[]> {
    const entries = await this.listEntries(userId);
    return [...new Set(entries.map((e) => e.category))];
  }

  async searchEntries(userId: string, query: string): Promise<FAQEntry[]> {
    const entries = await this.listEntries(userId);
    const queryLower = query.toLowerCase();

    return entries.filter(
      (e) =>
        e.questions.some(q => q.toLowerCase().includes(queryLower)) ||
        e.answer.toLowerCase().includes(queryLower) ||
        (e.keywords ?? []).some((k) => k.toLowerCase().includes(queryLower))
    );
  }

  async findSimilarQuestions(userId: string, question: string): Promise<FAQEntry[]> {
    return this.searchEntries(userId, question);
  }

  async incrementViewCount(id: FAQEntryId): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.matchCount = entry.matchCount + 1;
    }
  }

  async incrementHelpfulCount(id: FAQEntryId): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.helpfulCount = (entry.helpfulCount ?? 0) + 1;
    }
  }

  async incrementNotHelpfulCount(id: FAQEntryId): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      entry.notHelpfulCount = (entry.notHelpfulCount ?? 0) + 1;
    }
  }

  async getPopularEntries(userId: string, limit = 10): Promise<FAQEntry[]> {
    const entries = await this.listEntries(userId);
    return entries
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, limit);
  }

  async importEntries(
    userId: string,
    entries: Array<Omit<FAQEntry, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<FAQEntry[]> {
    const created: FAQEntry[] = [];
    for (const entry of entries) {
      const newEntry = await this.createEntry({ ...entry, userId });
      created.push(newEntry);
    }
    return created;
  }

  async exportEntries(userId: string): Promise<FAQEntry[]> {
    return this.listEntries(userId);
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createFAQStore(type: 'memory' | 'database', db?: KeyValueStoreAdapter): FAQStore {
  if (type === 'database') {
    if (!db) throw new Error('Key-value store adapter required for database store');
    return new DatabaseFAQStore(db);
  }
  return new InMemoryFAQStore();
}
