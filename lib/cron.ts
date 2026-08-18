import { timingSafeEqual } from 'node:crypto';

export function isCronAuthorized(authorization: string | null, secret: string): boolean {
  const token = (authorization ?? '').startsWith('Bearer ') ? authorization!.slice('Bearer '.length) : '';
  const provided = Buffer.from(token);
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
