import { EventEmitter } from 'events';
import { getLogger } from '../observability/logger.js';

const logger = getLogger().child({ module: 'Bulkhead' });

// ============================================================================
// Bulkhead Types
// ============================================================================

/**
 * Bulkhead configuration
 */
export interface BulkheadConfig {
  /** Name for identification */
  name?: string;
  /** Maximum concurrent executions */
  maxConcurrent?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Queue timeout in ms */
  queueTimeout?: number;
  /** Fair queuing (FIFO) */
  fairQueuing?: boolean;
  // Test-compatible aliases
  maxQueued?: number;
  timeout?: number;
}

/**
 * Bulkhead statistics
 */
export interface BulkheadStats {
  name: string;
  activeCalls: number;
  queuedCalls: number;
  maxConcurrent: number;
  maxQueueSize: number;
  totalAccepted: number;
  totalRejected: number;
  totalTimedOut: number;
}

/**
 * Queued call entry (uses any for internal queue storage)
 */
interface QueueEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operation: () => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId?: NodeJS.Timeout;
}

// ============================================================================
// Bulkhead Errors
// ============================================================================

/**
 * Error thrown when bulkhead is full
 */
export class BulkheadFullError extends Error {
  readonly bulkheadName: string;

  constructor(name: string) {
    super(`Bulkhead '${name}' is full - cannot accept more requests`);
    this.name = 'BulkheadFullError';
    this.bulkheadName = name;
  }
}

/**
 * Error thrown when queue times out
 */
export class BulkheadTimeoutError extends Error {
  readonly bulkheadName: string;
  readonly waitTime: number;

  constructor(name: string, waitTime: number) {
    super(`Request timed out waiting in bulkhead '${name}' queue after ${waitTime}ms`);
    this.name = 'BulkheadTimeoutError';
    this.bulkheadName = name;
    this.waitTime = waitTime;
  }
}

// ============================================================================
// Bulkhead Implementation
// ============================================================================

/**
 * Bulkhead pattern for resource isolation
 *
 * Limits concurrent executions to prevent resource exhaustion.
 * Requests exceeding the limit can be queued up to a maximum size.
 */
export class Bulkhead extends EventEmitter {
  private readonly config: Required<BulkheadConfig>;
  private activeCalls = 0;
  private readonly queue: QueueEntry[] = [];
  private totalAccepted = 0;
  private totalRejected = 0;
  private totalTimedOut = 0;

  constructor(config: BulkheadConfig) {
    super();
    this.config = {
      name: config.name ?? 'default',
      maxConcurrent: config.maxConcurrent ?? 10,
      // Support maxQueued as alias for maxQueueSize
      maxQueueSize: config.maxQueued ?? config.maxQueueSize ?? 100,
      // Support timeout as alias for queueTimeout
      queueTimeout: config.timeout ?? config.queueTimeout ?? 30000,
      fairQueuing: config.fairQueuing ?? true,
    };
  }

  /**
   * Execute an operation through the bulkhead
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.activeCalls < this.config.maxConcurrent) {
      return this.executeOperation(operation);
    }

    // Check if queue is full
    if (this.queue.length >= this.config.maxQueueSize) {
      this.totalRejected++;
      this.emit('rejected');
      throw new BulkheadFullError(this.config.name);
    }

    // Queue the request
    return this.queueOperation(operation);
  }

  /**
   * Execute operation immediately
   */
  private async executeOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.activeCalls++;
    this.totalAccepted++;
    this.emit('acquired');

    try {
      const result = await operation();
      return result;
    } finally {
      this.activeCalls--;
      this.emit('released');
      this.processQueue();
    }
  }

  /**
   * Queue an operation for later execution
   */
  private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueueEntry = {
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      // Set timeout for queued request
      if (this.config.queueTimeout > 0) {
        entry.timeoutId = setTimeout(() => {
          this.removeFromQueue(entry);
          this.totalTimedOut++;
          this.emit('timeout');
          reject(new BulkheadTimeoutError(
            this.config.name,
            Date.now() - entry.timestamp
          ));
        }, this.config.queueTimeout);
      }

      this.queue.push(entry);
      this.emit('queued', this.queue.length);

      logger.debug({
        bulkhead: this.config.name,
        queueSize: this.queue.length,
        activeCalls: this.activeCalls,
      }, 'Request queued in bulkhead');
    });
  }

  /**
   * Process next item in queue
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;
    if (this.activeCalls >= this.config.maxConcurrent) return;

    const entry = this.config.fairQueuing
      ? this.queue.shift()
      : this.queue.pop();

    if (!entry) return;

    // Clear timeout
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }

    // Execute the queued operation
    this.activeCalls++;
    this.totalAccepted++;
    this.emit('dequeued', this.queue.length);

    entry.operation()
      .then(result => entry.resolve(result))
      .catch(error => entry.reject(error))
      .finally(() => {
        this.activeCalls--;
        this.emit('released');
        this.processQueue();
      });
  }

  /**
   * Remove entry from queue
   */
  private removeFromQueue(entry: QueueEntry): void {
    const index = this.queue.indexOf(entry);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }
  }

  /**
   * Get current statistics
   */
  getStats(): BulkheadStats & { queued: number; active: number; totalExecuted: number } {
    return {
      name: this.config.name,
      activeCalls: this.activeCalls,
      queuedCalls: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
      totalAccepted: this.totalAccepted,
      totalRejected: this.totalRejected,
      totalTimedOut: this.totalTimedOut,
      // Test-compatible aliases
      queued: this.queue.length,
      active: this.activeCalls,
      totalExecuted: this.totalAccepted,
    };
  }

  /**
   * Check if bulkhead can accept more requests
   */
  isAccepting(): boolean {
    return this.activeCalls < this.config.maxConcurrent ||
           this.queue.length < this.config.maxQueueSize;
  }

  /**
   * Get available capacity
   */
  getAvailableCapacity(): number {
    return Math.max(0, this.config.maxConcurrent - this.activeCalls);
  }

  /**
   * Get queue space available
   */
  getQueueCapacity(): number {
    return Math.max(0, this.config.maxQueueSize - this.queue.length);
  }

  /**
   * Clear the queue (rejects all queued requests)
   */
  clearQueue(): number {
    const cleared = this.queue.length;
    while (this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry) {
        if (entry.timeoutId) {
          clearTimeout(entry.timeoutId);
        }
        entry.reject(new Error('Bulkhead queue cleared'));
      }
    }
    return cleared;
  }
}

// ============================================================================
// Semaphore (Simpler Alternative)
// ============================================================================

/**
 * Simple semaphore for limiting concurrency
 */
export class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
    this.maxPermits = permits;
  }

  /**
   * Acquire a permit
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Try to acquire a permit without waiting (or with optional timeout)
   */
  tryAcquire(timeout?: number): boolean | Promise<boolean> {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }

    // If no timeout, return false immediately
    if (!timeout || timeout <= 0) {
      return false;
    }

    // With timeout, return a promise
    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        // Remove from waiters if still waiting
        const idx = this.waiters.indexOf(onAcquire);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
        }
        resolve(false);
      }, timeout);

      const onAcquire = () => {
        clearTimeout(timer);
        resolve(true);
      };

      this.waiters.push(onAcquire);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.();
    } else if (this.permits < this.maxPermits) {
      this.permits++;
    }
  }

  /**
   * Get available permits
   */
  available(): number {
    return this.permits;
  }

  /**
   * Get number of waiters
   */
  waiting(): number {
    return this.waiters.length;
  }

  /**
   * Execute with automatic acquire/release
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ============================================================================
// Bulkhead Registry
// ============================================================================

/**
 * Registry for managing multiple bulkheads
 */
export class BulkheadRegistry {
  private readonly bulkheads = new Map<string, Bulkhead>();
  private readonly defaultConfig: Partial<BulkheadConfig>;

  constructor(defaultConfig: Partial<BulkheadConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create a bulkhead
   */
  getOrCreate(name: string, config?: Partial<BulkheadConfig>): Bulkhead {
    let bulkhead = this.bulkheads.get(name);
    if (!bulkhead) {
      bulkhead = new Bulkhead({
        ...this.defaultConfig,
        ...config,
        name,
      });
      this.bulkheads.set(name, bulkhead);
    }
    return bulkhead;
  }

  /**
   * Get a bulkhead by name
   */
  get(name: string): Bulkhead | undefined {
    return this.bulkheads.get(name);
  }

  /**
   * Remove a bulkhead
   */
  remove(name: string): boolean {
    const bulkhead = this.bulkheads.get(name);
    if (bulkhead) {
      bulkhead.clearQueue();
    }
    return this.bulkheads.delete(name);
  }

  /**
   * Get all bulkhead statistics
   */
  getAllStats(): BulkheadStats[] {
    return Array.from(this.bulkheads.values()).map(b => b.getStats());
  }

  /**
   * List all registered bulkhead names (test-compatible)
   */
  list(): string[] {
    return Array.from(this.bulkheads.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalBulkheadRegistry: BulkheadRegistry | null = null;

/**
 * Get the global bulkhead registry
 */
export function getBulkheadRegistry(): BulkheadRegistry {
  if (!globalBulkheadRegistry) {
    globalBulkheadRegistry = new BulkheadRegistry();
  }
  return globalBulkheadRegistry;
}

/**
 * Create a bulkhead with default registry
 */
export function createBulkhead(
  name: string,
  config?: Partial<BulkheadConfig>
): Bulkhead {
  return getBulkheadRegistry().getOrCreate(name, config);
}
