/**
 * Vitest Global Setup
 *
 * Polyfills and global setup for test environment.
 */

import { webcrypto } from 'crypto';

// Polyfill global crypto for Node.js 18 compatibility
// Node.js 18 doesn't have crypto as a global, but Node.js 20+ does
if (typeof globalThis.crypto === 'undefined') {
  // @ts-expect-error - webcrypto is compatible with global crypto
  globalThis.crypto = webcrypto;
}
