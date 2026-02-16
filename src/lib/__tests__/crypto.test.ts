import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from '../crypto.js';

const TEST_KEY = randomBytes(32).toString('hex'); // 64 hex chars

describe('crypto', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('roundtrips a simple string', () => {
    const plaintext = 'Hello, HIPAA!';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('roundtrips an empty string', () => {
    const ciphertext = encrypt('');
    expect(decrypt(ciphertext)).toBe('');
  });

  it('roundtrips unicode / emoji text', () => {
    const plaintext = 'Patient: Juan \u00d1 \ud83d\udc68\u200d\u2695\ufe0f session notes';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('roundtrips a large payload', () => {
    const plaintext = 'x'.repeat(100_000);
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    // but both decrypt to the same value
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });

  it('fails to decrypt tampered ciphertext', () => {
    const ciphertext = encrypt('secret');
    const buf = Buffer.from(ciphertext, 'base64');
    // flip a byte in the ciphertext region
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('fails to decrypt with a truncated value', () => {
    const ciphertext = encrypt('secret');
    const truncated = Buffer.from(ciphertext, 'base64').subarray(0, 10).toString('base64');
    expect(() => decrypt(truncated)).toThrow('Invalid ciphertext: too short');
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is not set');
  });

  it('throws when ENCRYPTION_KEY is wrong length', () => {
    process.env.ENCRYPTION_KEY = 'abcd';
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be 64 hex characters');
  });

  it('fails to decrypt with a different key', () => {
    const ciphertext = encrypt('secret');
    // switch to a different key
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(() => decrypt(ciphertext)).toThrow();
  });
});
