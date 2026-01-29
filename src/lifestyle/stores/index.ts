/**
 * Lifestyle Stores
 *
 * Re-exports all lifestyle store implementations.
 */

export {
  type WineStore,
  type WineDatabaseAdapter,
  DatabaseWineStore,
  InMemoryWineStore,
  createWineStore,
} from './wine-store.js';

export {
  type WatchlistStore,
  type WatchlistDatabaseAdapter,
  DatabaseWatchlistStore,
  InMemoryWatchlistStore,
  createWatchlistStore,
} from './watchlist-store.js';

export {
  type EventStore,
  type EventDatabaseAdapter,
  DatabaseEventStore,
  InMemoryEventStore,
  createEventStore,
} from './event-store.js';

/**
 * Common database adapter interface for lifestyle stores
 */
export interface LifestyleDatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ lastID: number; changes: number }>;
}
