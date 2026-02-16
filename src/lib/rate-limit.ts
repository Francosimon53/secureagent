/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key and enforces a max count
 * within a rolling window. Auto-cleans expired entries.
 */

export interface RateLimitResponse {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window resets for the oldest request
}

const windows = new Map<string, number[]>();

// Auto-cleanup every 60 s
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of windows) {
    // Remove keys whose newest timestamp is older than 2 minutes
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 120_000) {
      windows.delete(key);
    }
  }
}, 60_000);

// Allow the process to exit even if the timer is still running
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Check (and consume) a rate limit slot for the given key.
 *
 * @param key       Unique identifier (e.g. userId or IP)
 * @param limit     Max requests allowed in the window (default 100)
 * @param windowMs  Window size in milliseconds (default 60 000 = 1 min)
 */
export function checkRateLimit(
  key: string,
  limit = 100,
  windowMs = 60_000,
): RateLimitResponse {
  const now = Date.now();
  const windowStart = now - windowMs;

  let timestamps = windows.get(key) ?? [];

  // Evict timestamps outside the window
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= limit) {
    // Denied — calculate when the oldest in-window entry expires
    const resetAt = timestamps[0] + windowMs;
    windows.set(key, timestamps);
    return { allowed: false, remaining: 0, resetAt };
  }

  // Allowed — record this request
  timestamps.push(now);
  windows.set(key, timestamps);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    resetAt: now + windowMs,
  };
}
