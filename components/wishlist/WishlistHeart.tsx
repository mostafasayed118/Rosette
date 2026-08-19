'use client';

import { Heart } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useWishlist } from '@/features/wishlist/WishlistProvider';

export function WishlistHeart({ slug, className = '' }: { slug: string; className?: string }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(slug);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle(slug); }}
      className={`grid h-9 w-9 place-items-center rounded-full border bg-background/80 shadow-sm transition-colors hover:border-primary ${saved ? 'text-destructive' : 'text-muted-foreground'} ${className}`}
    >
      <Heart className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} aria-hidden="true" />
    </button>
  );
}
