import { describe, it, expect, vi } from 'vitest';
import {
  retry,
  withRetry,
  retryable,
  RetryBuilder,
  RetryExhaustedError,
  RetryAbortedError,
  retryOnAnyError,
  retryOnNetworkError,
  retryOnTransientError,
} from '../../src/resilience/index.js';

describe('retry', () => {
  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');

    const result = await retry(operation, {
      maxAttempts: 3,
      initialDelay: 100,
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retry(operation, {
      maxAttempts: 3,
      initialDelay: 10,
    });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should throw RetryExhaustedError when max attempts reached', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      retry(operation, {
        maxAttempts: 3,
        initialDelay: 10,
      })
    ).rejects.toThrow(RetryExhaustedError);

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await retry(operation, {
      maxAttempts: 3,
      initialDelay: 50,
      backoffMultiplier: 2,
      strategy: 'exponential',
    });

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
  });

  it('should respect maxDelay', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const startTime = Date.now();

    await retry(operation, {
      maxAttempts: 4,
      initialDelay: 100,
      maxDelay: 150,
      backoffMultiplier: 10,
      strategy: 'exponential',
    });

    const elapsed = Date.now() - startTime;
    // Should not exceed 2 * 150ms significantly
    expect(elapsed).toBeLessThan(500);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('success');

    await retry(operation, {
      maxAttempts: 3,
      initialDelay: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        error: expect.any(Error),
      })
    );
  });
});

describe('withRetry', () => {
  it('should create a retryable function', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) throw new Error('not yet');
      return 'success';
    };

    const retryableOp = withRetry(operation, {
      maxAttempts: 5,
      initialDelay: 10,
    });

    const result = await retryableOp();
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});

describe('retryable decorator', () => {
  it('should make a method retryable', async () => {
    class Service {
      attempts = 0;

      @retryable({ maxAttempts: 3, initialDelay: 10 })
      async unreliableMethod(): Promise<string> {
        this.attempts++;
        if (this.attempts < 2) throw new Error('fail');
        return 'success';
      }
    }

    const service = new Service();
    const result = await service.unreliableMethod();

    expect(result).toBe('success');
    expect(service.attempts).toBe(2);
  });
});

describe('RetryBuilder', () => {
  it('should build retry config fluently', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await new RetryBuilder()
      .maxAttempts(3)
      .initialDelay(10)
      .exponentialBackoff(2)
      .execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should support retryIf condition', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('retryable'))
      .mockRejectedValueOnce(new Error('non-retryable'));

    await expect(
      new RetryBuilder()
        .maxAttempts(5)
        .initialDelay(10)
        .retryIf((error) => error.message === 'retryable')
        .execute(operation)
    ).rejects.toThrow('non-retryable');

    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('retry predicates', () => {
  describe('retryOnAnyError', () => {
    it('should retry on any error', () => {
      expect(retryOnAnyError(new Error('any'))).toBe(true);
      expect(retryOnAnyError(new TypeError('type'))).toBe(true);
    });
  });

  describe('retryOnNetworkError', () => {
    it('should retry on network errors', () => {
      expect(retryOnNetworkError(new Error('ECONNREFUSED'))).toBe(true);
      expect(retryOnNetworkError(new Error('ETIMEDOUT'))).toBe(true);
      expect(retryOnNetworkError(new Error('fetch failed'))).toBe(true);
    });

    it('should not retry on non-network errors', () => {
      expect(retryOnNetworkError(new Error('validation failed'))).toBe(false);
    });
  });

  describe('retryOnTransientError', () => {
    it('should retry on transient errors', () => {
      const error503 = Object.assign(new Error(), { status: 503 });
      const error429 = Object.assign(new Error(), { status: 429 });

      expect(retryOnTransientError(error503)).toBe(true);
      expect(retryOnTransientError(error429)).toBe(true);
    });

    it('should not retry on permanent errors', () => {
      const error400 = Object.assign(new Error(), { status: 400 });
      const error404 = Object.assign(new Error(), { status: 404 });

      expect(retryOnTransientError(error400)).toBe(false);
      expect(retryOnTransientError(error404)).toBe(false);
    });
  });
});
