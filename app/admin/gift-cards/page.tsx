import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminShell } from '@/components/admin/AdminShell';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getServerT } from '@/features/i18n/server';
import { listGiftCards, listGiftCardTransactions } from '@/features/gift-cards/admin-actions';
import { AdminGiftCardForm } from '@/features/gift-cards/AdminGiftCardForm';
import { AdminGiftCardActions } from '@/features/gift-cards/AdminGiftCardActions';
import { formatMoney } from '@/features/money';

export default async function AdminGiftCardsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/login');
  const { t, locale } = await getServerT();
  const client = getAdminSupabase();
  const cards = await listGiftCards(client, admin, {});
  const cardsWithHistory = await Promise.all(cards.map(async (card) => ({ card, transactions: await listGiftCardTransactions(client, admin, card.id) })));
  return <AdminShell><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{t('giftCardOperations')}</p><h1 className="font-display text-[clamp(2rem,4vw,3rem)]">{t('giftCards')}</h1><Card className="mt-6"><CardHeader><CardTitle>{t('issueGiftCard')}</CardTitle></CardHeader><CardContent><AdminGiftCardForm /></CardContent></Card><div className="mt-6 grid gap-4">{cardsWithHistory.length ? cardsWithHistory.map(({ card, transactions }) => <Card key={card.id}><CardContent className="grid gap-3"><div className="flex flex-wrap items-center gap-3"><strong>•••• {card.codeLast4}</strong><Badge>{t(`giftCardStatus_${card.status}`)}</Badge><span className="text-sm text-muted-foreground">{formatMoney(card.balanceMinor, locale)} / {formatMoney(card.initialBalanceMinor, locale)} · {card.recipientEmail ?? '—'}</span></div><p className="text-sm text-muted-foreground">{t('giftCardExpires')}: {new Date(card.expiresAt).toLocaleDateString(locale)}</p><details><summary className="cursor-pointer text-sm font-medium">{t('giftCardHistory')}</summary><ul className="mt-2 grid gap-1 text-sm text-muted-foreground">{transactions.map((transaction, index) => <li key={`${transaction.idempotencyKey}-${index}`}>{transaction.type} · {formatMoney(transaction.amountMinor, locale)}</li>)}</ul></details><AdminGiftCardActions cardId={card.id} canVoid={card.status === 'active' && card.balanceMinor > 0} /></CardContent></Card>) : <p className="text-muted-foreground">{t('noGiftCards')}</p>}</div></AdminShell>;
}
