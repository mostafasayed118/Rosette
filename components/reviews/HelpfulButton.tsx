'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';

const VISITOR_KEY = 'rosette.visitor.v1';

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function HelpfulButton({ reviewId }: { reviewId: string }) {
  const { t } = useI18n();
  const [helpful, setHelpful] = useState(0);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const visitor = getVisitorId();
      const response = await fetch(`/api/reviews/${reviewId}/vote?visitor=${encodeURIComponent(visitor)}`);
      if (cancelled) return;
      if (response.ok) {
        const data = await response.json();
        setHelpful(data.helpful);
        setVoted(data.voted);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [reviewId]);

  async function toggle() {
    const visitor = getVisitorId();
    const next = !voted;
    setVoted(next);
    setHelpful((count) => count + (next ? 1 : -1));
    const response = await fetch(`/api/reviews/${reviewId}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visitor }) });
    if (!response.ok) {
      setVoted(!next);
      setHelpful((count) => count + (next ? -1 : 1));
      return;
    }
    const data = await response.json();
    setHelpful(data.helpful);
    setVoted(data.voted);
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={toggle} disabled={loading} aria-label={t('helpfulCount', { count: helpful })} className={voted ? 'text-primary' : ''}>
      <ThumbsUp size={14} className={voted ? 'fill-current' : ''} aria-hidden="true" />
      {t('helpful')} · {helpful}
    </Button>
  );
}
