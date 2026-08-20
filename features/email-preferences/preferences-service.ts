import { createHmac, timingSafeEqual } from 'node:crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES = new Set(['en', 'ar', 'fr']);

type PreferenceClient = { from: (table: string) => any };
export type EngagementPreference = { status: 'enabled' | 'disabled' | 'error' };
export type PreferenceLocale = 'en' | 'ar' | 'fr';

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export function createPreferenceToken(email: string, secret: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !secret) throw new Error('Invalid preference token input');
  return createHmac('sha256', secret).update(normalized).digest('base64url');
}

export function verifyPreferenceToken(email: string, token: string, secret: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || !token || !secret) return null;
  const expected = Buffer.from(createPreferenceToken(normalized, secret));
  const provided = Buffer.from(token);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  return normalized;
}

export async function getEngagementPreference(client: PreferenceClient, email: string): Promise<EngagementPreference> {
  const normalized = normalizeEmail(email);
  if (!normalized) return { status: 'error' };
  try {
    const { data, error } = await client.from('email_preferences')
      .select('engagement_enabled')
      .eq('email', normalized)
      .maybeSingle();
    if (error) return { status: 'error' };
    return data?.engagement_enabled === false ? { status: 'disabled' } : { status: 'enabled' };
  } catch {
    return { status: 'error' };
  }
}

export async function setEngagementPreference(client: PreferenceClient, email: string, enabled: boolean): Promise<'saved' | 'failure'> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'failure';
  try {
    const { error } = await client.from('email_preferences').upsert(
      { email: normalized, engagement_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: 'email' },
    );
    return error ? 'failure' : 'saved';
  } catch {
    return 'failure';
  }
}

export function buildUnsubscribeUrl(origin: string, email: string, secret: string, locale?: PreferenceLocale): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !secret) throw new Error('Invalid preference URL input');
  const token = createPreferenceToken(normalized, secret);
  const params = new URLSearchParams({ email: normalized, token });
  if (locale && LOCALES.has(locale)) params.set('locale', locale);
  return `${origin.replace(/\/$/, '')}/api/email-preferences/unsubscribe?${params.toString()}`;
}
