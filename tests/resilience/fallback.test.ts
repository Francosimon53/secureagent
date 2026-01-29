import { describe, it, expect, vi } from 'vitest';
import {
  withFallback,
  FallbackChain,
  FallbackCache,
  GracefulDegradation,
  fallbackOnAny,
  fallbackOnErrorType,
  fallbackOnMessage,
  dontFallbackOn,
} from '../../src/resilience/index.js';

describe('withFallback', () => {
  it('should return primary result on success', async () => {
    const primary = vi.fn().mockResolvedValue('primary');
    const fallback = vi.fn().mockResolvedValue('fallback');

    const result = await withFallback(primary, fallback);

    expect(result).toBe('primary');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('should use fallback on primary failure', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('primary failed'));
    const fallback = vi.fn().mockResolvedValue('fallback');

    const result = await withFallback(primary, fallback);

    expect(result).toBe('fallback');
    expect(fallback).toHaveBeenCalled();
  });

  it('should pass error to fallback function', async () => {
    const error = new Error('primary failed');
    const primary = vi.fn().mockRejectedValue(error);
    const fallback = vi.fn().mockImplementation((err) => `handled: ${err.message}`);

    const result = await withFallback(primary, fallback);

    expect(result).toBe('handled: primary failed');
    expect(fallback).toHaveBeenCalledWith(error);
  });

  it('should support fallback value instead of function', async () => {
    const primary = vi.fn().mockRejectedValue(new Error('failed'));

    const result = await withFallback(primary, 'default-value');

    expect(result).toBe('default-value');
  });
});

describe('FallbackChain', () => {
  it('should try fallbacks in order', async () => {
    const chain = new FallbackChain<string>();

    chain
      .add(async () => { throw new Error('first fails'); })
      .add(async () => { throw new Error('second fails'); })
      .add(async () => 'third succeeds');

    const result = await chain.execute();

    expect(result).toBe('third succeeds');
  });

  it('should stop at first success', async () => {
    const third = vi.fn().mockResolvedValue('third');

    const chain = new FallbackChain<string>()
      .add(async () => { throw new Error('first fails'); })
      .add(async () => 'second succeeds')
      .add(third);

    const result = await chain.execute();

    expect(result).toBe('second succeeds');
    expect(third).not.toHaveBeenCalled();
  });

  it('should use final fallback value', async () => {
    const chain = new FallbackChain<string>()
      .add(async () => { throw new Error('fails'); })
      .finally('final-value');

    const result = await chain.execute();

    expect(result).toBe('final-value');
  });

  it('should throw if all fallbacks fail', async () => {
    const chain = new FallbackChain<string>()
      .add(async () => { throw new Error('first fails'); })
      .add(async () => { throw new Error('second fails'); });

    await expect(chain.execute()).rejects.toThrow('second fails');
  });
});

describe('FallbackCache', () => {
  it('should cache successful results', async () => {
    const cache = new FallbackCache<string>({ ttl: 1000 });
    const operation = vi.fn().mockResolvedValue('cached-value');

    await cache.getOrFetch('key', operation);
    const result = await cache.getOrFetch('key', operation);

    expect(result).toBe('cached-value');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should return stale value on failure', async () => {
    const cache = new FallbackCache<string>({ ttl: 100, staleWhileRevalidate: true });

    // Prime cache
    await cache.getOrFetch('key', async () => 'original');

    // Wait for TTL
    await new Promise(resolve => setTimeout(resolve, 150));

    // Operation fails but should return stale value
    const result = await cache.getOrFetch('key', async () => {
      throw new Error('fetch failed');
    });

    expect(result).toBe('original');
  });

  it('should clear specific keys', async () => {
    const cache = new FallbackCache<string>({ ttl: 10000 });

    await cache.getOrFetch('key1', async () => 'value1');
    await cache.getOrFetch('key2', async () => 'value2');

    cache.clear('key1');

    const operation = vi.fn().mockResolvedValue('new-value');
    await cache.getOrFetch('key1', operation);

    expect(operation).toHaveBeenCalled();
  });
});

describe('GracefulDegradation', () => {
  it('should start at normal level', () => {
    const degradation = new GracefulDegradation();
    expect(degradation.getLevel()).toBe('normal');
  });

  it('should degrade on failures', () => {
    const degradation = new GracefulDegradation({
      thresholds: {
        degraded: 2,
        minimal: 5,
        offline: 10,
      },
    });

    degradation.recordFailure();
    degradation.recordFailure();

    expect(degradation.getLevel()).toBe('degraded');
  });

  it('should recover on success', () => {
    const degradation = new GracefulDegradation({
      thresholds: {
        degraded: 2,
        minimal: 5,
        offline: 10,
      },
      recoveryThreshold: 2,
    });

    // Degrade
    degradation.recordFailure();
    degradation.recordFailure();
    expect(degradation.getLevel()).toBe('degraded');

    // Recover
    degradation.recordSuccess();
    degradation.recordSuccess();
    expect(degradation.getLevel()).toBe('normal');
  });

  it('should execute based on degradation level', async () => {
    const degradation = new GracefulDegradation();

    const handlers = {
      normal: vi.fn().mockResolvedValue('full'),
      degraded: vi.fn().mockResolvedValue('limited'),
      minimal: vi.fn().mockResolvedValue('minimal'),
      offline: vi.fn().mockResolvedValue('cached'),
    };

    const result = await degradation.execute(handlers);

    expect(result).toBe('full');
    expect(handlers.normal).toHaveBeenCalled();
    expect(handlers.degraded).not.toHaveBeenCalled();
  });
});

describe('fallback predicates', () => {
  describe('fallbackOnAny', () => {
    it('should trigger on any error', () => {
      expect(fallbackOnAny(new Error('any'))).toBe(true);
      expect(fallbackOnAny(new TypeError('type'))).toBe(true);
    });
  });

  describe('fallbackOnErrorType', () => {
    it('should trigger on specific error type', () => {
      const predicate = fallbackOnErrorType(TypeError);

      expect(predicate(new TypeError('type error'))).toBe(true);
      expect(predicate(new Error('generic error'))).toBe(false);
    });
  });

  describe('fallbackOnMessage', () => {
    it('should trigger on error message match', () => {
      const predicate = fallbackOnMessage(/network/i);

      expect(predicate(new Error('Network error'))).toBe(true);
      expect(predicate(new Error('Validation error'))).toBe(false);
    });
  });

  describe('dontFallbackOn', () => {
    it('should not trigger on specific errors', () => {
      const predicate = dontFallbackOn((e) => e.message === 'permanent');

      expect(predicate(new Error('permanent'))).toBe(false);
      expect(predicate(new Error('temporary'))).toBe(true);
    });
  });
});
