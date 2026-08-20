import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { issueGiftCard, resendGiftCard, voidGiftCard } from '@/features/gift-cards/admin-actions';
import type { GiftCardPurchaseInput } from '@/features/gift-cards/types';
import { renderGiftCardEmail, sendGiftCardEmail } from '@/features/gift-cards/purchase-email';

export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Admin authorization required' }, { status: 403 });
  const body = await request.json() as { action?: string; cardId?: string; input?: unknown };
  const client = getAdminSupabase();
  if (body.action === 'issue' && body.input && typeof body.input === 'object') {
    const result = await issueGiftCard(client, admin, body.input as GiftCardPurchaseInput, { deliver: async ({ recipient, code, card }) => sendGiftCardEmail({ recipient, rendered: renderGiftCardEmail({ locale: 'en', recipientName: String(card.recipient_name ?? 'friend'), buyerName: String(card.sender_name ?? 'Rosette'), message: String(card.message ?? ''), amountMinor: Number(card.initial_balance_minor), code, expiresAt: String(card.expires_at), recipientCopy: recipient === String(card.recipient_email ?? '').toLowerCase() }) }) });
    if (result.status === 'issued') return NextResponse.json({ ok: true, card: result.card }, { status: 201 });
    return NextResponse.json({ error: result.status === 'forbidden' ? 'Forbidden' : 'Could not issue gift card' }, { status: result.status === 'forbidden' ? 403 : result.status === 'validation' ? 400 : 500 });
  }
  if ((body.action === 'void' || body.action === 'resend') && body.cardId) {
    if (body.action === 'void') {
      const result = await voidGiftCard(client, admin, body.cardId);
      if (result === 'voided' || result === 'already_void') return NextResponse.json({ ok: true });
      return NextResponse.json({ error: result === 'forbidden' ? 'Forbidden' : 'Could not void gift card' }, { status: result === 'forbidden' ? 403 : result === 'not_found' ? 404 : 409 });
    }
    const result = await resendGiftCard(client, admin, body.cardId, { deliver: async ({ recipient, code, card }) => sendGiftCardEmail({ recipient, rendered: renderGiftCardEmail({ locale: 'en', recipientName: String(card.recipient_name ?? 'friend'), buyerName: 'Rosette', message: '', amountMinor: Number(card.initial_balance_minor), code, expiresAt: String(card.expires_at), recipientCopy: recipient === String(card.recipient_email ?? '').toLowerCase() }) }) });
    if (result === 'sent') return NextResponse.json({ ok: true });
    return NextResponse.json({ error: result === 'forbidden' ? 'Forbidden' : 'Could not resend gift card' }, { status: result === 'forbidden' ? 403 : result === 'not_found' ? 404 : 500 });
  }
  return NextResponse.json({ error: 'Invalid gift-card action' }, { status: 400 });
}
