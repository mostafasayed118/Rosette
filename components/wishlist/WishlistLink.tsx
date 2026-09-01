'use client';

import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useWishlist } from '@/features/wishlist/WishlistProvider';

export function WishlistLink() {
  const { t } = useI18n();
  const { href } = useStorePath();
  const { ready, count } = useWishlist();
  return (
    <Link className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-1" href={href('/wishlist')} aria-label={`${t('wishlist')} (${count})`}>
      <Heart className="h-4 w-4" aria-hidden="true" />
      <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{ready ? count : 0}</span>
    </Link>
  );
}
