import { describe, expect, it } from 'vitest';
import { decryptGiftCardCode, encryptGiftCardCode, generateGiftCardCode, hashGiftCardCode, maskGiftCardCode, normalizeGiftCardCode } from '@/features/gift-cards/crypto';

describe('gift-card code crypto', () => {
  it('generates a grouped code without ambiguous characters', () => {
    const code = generateGiftCardCode();
    expect(code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
    expect(code).not.toMatch(/[01IO]/);
  });

  it('normalizes and hashes a code deterministically', () => {
    expect(normalizeGiftCardCode(' rose-abcd-2345-zzzz ')).toBe('ROSEABCD2345ZZZZ');
    expect(hashGiftCardCode('rose-abcd-2345-zzzz', 'secret')).toBe(hashGiftCardCode('ROSEABCD2345ZZZZ', 'secret'));
    expect(hashGiftCardCode('ROSEABCD2345ZZZZ', 'secret')).not.toBe(hashGiftCardCode('ROSEABCD2345-ZZZX', 'secret'));
  });

  it('round-trips encrypted code and rejects tampering or another secret', () => {
    const code = generateGiftCardCode();
    const ciphertext = encryptGiftCardCode(code, 'secret');
    expect(decryptGiftCardCode(ciphertext, 'secret')).toBe(code);
    expect(() => decryptGiftCardCode(`${ciphertext}x`, 'secret')).toThrow();
    expect(() => decryptGiftCardCode(ciphertext, 'other-secret')).toThrow();
  });

  it('masks all but the last four characters', () => {
    expect(maskGiftCardCode('ROSEABCD2345ZZZZ')).toBe('•••• ZZZZ');
  });
});
