import { createCipheriv, createHmac, getCiphers, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptGiftCardCode,
  encryptGiftCardCode,
  generateGiftCardCode,
  hashGiftCardCode,
  maskGiftCardCode,
  normalizeGiftCardCode,
} from '@/features/gift-cards/crypto';

// R-28: verify gift-card crypto works under nodejs_compat (Node API polyfilled on Workers).
// The module takes `secret` as a parameter (no env read), so we pass a test secret directly.
const SECRET = 'test-secret-rosette-r28-verify';

describe('gift-card code crypto (R-28 nodejs_compat verification)', () => {
  it('uses aes-256-gcm + sha256 HMAC primitives available in Node', () => {
    const ciphers = getCiphers();
    expect(ciphers).toContain('aes-256-gcm');
    expect(typeof createCipheriv).toBe('function');
    expect(typeof createHmac).toBe('function');
    expect(typeof randomBytes).toBe('function');
    // Prove the exact call shape crypto.ts uses is valid: 32-byte key + 12-byte IV + getAuthTag.
    const key = createHmac('sha256', SECRET).update('k').digest().subarray(0, 32);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    expect(typeof c.getAuthTag).toBe('function');
  });

  it('round-trips an encrypted code via the real exported functions', () => {
    const code = generateGiftCardCode();
    const ct = encryptGiftCardCode(code, SECRET);
    expect(ct.startsWith('v1.')).toBe(true);
    expect(decryptGiftCardCode(ct, SECRET)).toBe(code);
  });

  it('GCM auth-tag path: tampered ciphertext or wrong secret FAILS verification', () => {
    const code = generateGiftCardCode();
    const ct = encryptGiftCardCode(code, SECRET);
    const [, iv, tag, data] = ct.split('.');
    // tamper the encrypted payload -> auth tag mismatch
    expect(() => decryptGiftCardCode(`v1.${iv}.${tag}.${data}x`, SECRET)).toThrow();
    // tamper the auth tag -> fails
    expect(() => decryptGiftCardCode(`v1.${iv}.${tag}x.${data}`, SECRET)).toThrow();
    // wrong secret -> derived key differs -> auth tag mismatch
    expect(() => decryptGiftCardCode(ct, 'wrong-secret')).toThrow();
  });

  it('HMAC code-hash path (createHmac): deterministic and tamper-evident', () => {
    const code = 'ROSEABCD2345ZZZZ';
    const h1 = hashGiftCardCode(code, SECRET);
    expect(h1).toBe(hashGiftCardCode(code, SECRET)); // deterministic
    // one-char change yields a different digest (avalanche / tamper detection)
    const h2 = hashGiftCardCode('ROSEABCD2345ZZZY', SECRET);
    expect(h2).not.toBe(h1);
    expect(h2).toMatch(/^[a-f0-9]{64}$/);
  });

  it('preserves existing normalization + masking + grouping contracts', () => {
    expect(normalizeGiftCardCode(' rose-abcd-2345-zzzz ')).toBe('ROSEABCD2345ZZZZ');
    expect(generateGiftCardCode()).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
    expect(maskGiftCardCode('ROSEABCD2345ZZZZ')).toBe('•••• ZZZZ');
  });
});
