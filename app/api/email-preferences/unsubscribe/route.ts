import { NextResponse } from 'next/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getRequiredServerEnv } from '@/lib/server-env';
import { logger } from '@/lib/logger';
import { renderUnsubscribeConfirmation, preferenceLocale } from '@/features/email-preferences/engagement-footer';
import { setEngagementPreference, verifyPreferenceToken } from '@/features/email-preferences/preferences-service';

async function values(request: Request) {
  const url = new URL(request.url);
  let email = url.searchParams.get('email');
  let token = url.searchParams.get('token');
  let locale = url.searchParams.get('locale');
  if (request.method === 'POST' && (!email || !token)) {
    const form = await request.formData().catch(() => null);
    email = email ?? form?.get('email')?.toString() ?? null;
    token = token ?? form?.get('token')?.toString() ?? null;
    locale = locale ?? form?.get('locale')?.toString() ?? null;
  }
  return { email, token, locale: preferenceLocale(locale) };
}

async function handle(request: Request) {
  const isPost = request.method === 'POST';
  try {
    const input = await values(request);
    const secret = getRequiredServerEnv('EMAIL_PREFERENCES_SECRET');
    const verifiedEmail = input.email && input.token ? verifyPreferenceToken(input.email, input.token, secret) : null;
    if (!verifiedEmail) {
      return isPost
        ? NextResponse.json({ error: 'Invalid unsubscribe link' }, { status: 400 })
        : new Response('Invalid unsubscribe link', { status: 400 });
    }
    const result = await setEngagementPreference(getAdminSupabase(), verifiedEmail, false);
    if (result !== 'saved') {
      return isPost
        ? NextResponse.json({ error: 'Could not update email preference' }, { status: 503 })
        : new Response('Could not update email preference', { status: 503 });
    }
    if (isPost) return NextResponse.json({ ok: true });
    return new Response(renderUnsubscribeConfirmation(input.locale), { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch (error) {
    logger.error('route.error', { scope: 'email preference unsubscribe', error });
    return isPost
      ? NextResponse.json({ error: 'Could not update email preference' }, { status: 503 })
      : new Response('Could not update email preference', { status: 503 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
