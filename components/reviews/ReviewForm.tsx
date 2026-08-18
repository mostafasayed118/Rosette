'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';

export type ReviewFormState = 'anonymous' | 'not-verified' | 'already-reviewed' | 'can-review';

export function ReviewForm({ productSlug, state }: { productSlug: string; state: ReviewFormState }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  if (state === 'anonymous') {
    return <p className="text-sm text-muted-foreground">{t('reviewSignInPrompt')}</p>;
  }
  if (state === 'not-verified') {
    return <p className="text-sm text-muted-foreground">{t('verifiedPurchaseOnly')}</p>;
  }
  if (state === 'already-reviewed') {
    return <p className="text-sm text-muted-foreground">{t('alreadyReviewed')}</p>;
  }
  if (pending) {
    return <p className="text-sm text-primary" role="status">{t('reviewPending')}</p>;
  }

  async function submit() {
    if (rating < 1 || !body.trim() || busy) return;
    setBusy(true);
    setError(false);
    const response = await fetch(`/api/account/products/${productSlug}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, body: body.trim() }) });
    setBusy(false);
    if (!response.ok) { setError(true); return; }
    setPending(true);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1" role="group" aria-label={t('rating')}>
        {[1, 2, 3, 4, 5].map((index) => (
          <button key={index} type="button" aria-label={`${index} out of 5`} onClick={() => setRating(index)} className="p-0.5">
            <Star size={20} className={index <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'} />
          </button>
        ))}
      </div>
      <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={400} placeholder={t('reviewPlaceholder')} />
      <div>
        <Button type="button" onClick={submit} disabled={busy || rating < 1 || !body.trim()}>{t('submitReview')}</Button>
      </div>
      {error ? <p className="text-sm text-destructive">{t('reviewSubmitFailed')}</p> : null}
    </div>
  );
}
