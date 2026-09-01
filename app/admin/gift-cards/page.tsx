import { redirect } from 'next/navigation';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/admin/PageHeader';
import { getCurrentAdmin } from '@/features/auth/server';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getAdminServerT } from '@/features/i18n/admin-server';
import { listGiftCards, listGiftCardTransactionsByCard } from '@/features/gift-cards/admin-actions';
import { AdminGiftCardForm } from '@/features/gift-cards/AdminGiftCardForm';
import { AdminGiftCardActions } from '@/features/gift-cards/AdminGiftCardActions';
import { formatMoney } from '@/features/money';
import { formatDate } from '@/lib/date';

export default async function AdminGiftCardsPage() {
  const [admin, tData] = await Promise.all([getCurrentAdmin(), getAdminServerT()]);
  if (!admin) redirect('/login');
  const { t, locale } = tData;
  const client = getAdminSupabase();
  const cards = await listGiftCards(client, admin, {});
  const historyByCard = await listGiftCardTransactionsByCard(client, admin, cards.map((card) => card.id));
  const cardsWithHistory = cards.map((card) => ({ card, transactions: historyByCard.get(card.id) ?? [] }));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow={t('giftCardOperations')} title={t('giftCards')} />
      <Card>
        <CardHeader>
          <CardTitle>{t('issueGiftCard')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminGiftCardForm />
        </CardContent>
      </Card>
      <div className="grid gap-4">
        {cardsWithHistory.length ? (
          cardsWithHistory.map(({ card, transactions }) => (
            <Card key={card.id}>
              <CardContent className="grid gap-3 pt-6">
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="font-mono tabular-nums">•••• {card.codeLast4}</strong>
                  <Badge variant={card.status === 'active' ? 'success' : card.status === 'void' ? 'destructive' : 'secondary'}>{t(`giftCardStatus_${card.status}`)}</Badge>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {formatMoney(card.balanceMinor, locale)} / {formatMoney(card.initialBalanceMinor, locale)} · {card.recipientEmail ?? '—'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('giftCardExpires')}: {formatDate(card.expiresAt, locale)}
                </p>
                <Accordion type="single" collapsible>
                  <AccordionItem value={`history-${card.id}`}>
                    <AccordionTrigger>{t('giftCardHistory')}</AccordionTrigger>
                    <AccordionContent>
                      <ul className="grid gap-1 text-sm text-muted-foreground tabular-nums">
                        {transactions.map((transaction, index) => (
                          <li key={`${transaction.idempotencyKey}-${index}`}>
                            {transaction.type} · {formatMoney(transaction.amountMinor, locale)}
                          </li>
                        ))}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <AdminGiftCardActions cardId={card.id} canVoid={card.status === 'active' && card.balanceMinor > 0} />
              </CardContent>
            </Card>
          ))
        ) : (
          <p className="text-muted-foreground">{t('noGiftCards')}</p>
        )}
      </div>
    </div>
  );
}