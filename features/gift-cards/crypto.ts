import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_BYTES = 32;
const IV_BYTES = 12;

export function normalizeGiftCardCode(code: string) {
  return code.replace(/[-\s]/g, '').toUpperCase();
}

export function generateGiftCardCode() {
  const bytes = randomBytes(16);
  let raw = '';
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function hashGiftCardCode(code: string, secret: string) {
  return createHmac('sha256', secret).update(normalizeGiftCardCode(code)).digest('hex');
}

function keyFromSecret(secret: string) {
  return createHmac('sha256', secret).update('rosette-gift-card-encryption-v1').digest().subarray(0, KEY_BYTES);
}

export function encryptGiftCardCode(code: string, secret: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptGiftCardCode(ciphertext: string, secret: string) {
  const [version, ivValue, tagValue, dataValue] = ciphertext.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !dataValue) throw new Error('Invalid gift-card ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataValue, 'base64url')), decipher.final()]).toString('utf8');
}

export function maskGiftCardCode(code: string) {
  return `•••• ${normalizeGiftCardCode(code).slice(-4)}`;
}
