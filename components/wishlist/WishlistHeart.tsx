'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useWishlist } from '@/features/wishlist/WishlistProvider';
import { rosetteToast } from '@/lib/feedback';

export function WishlistHeart({ slug, className = '', productName }: { slug: string; className?: string; productName?: string }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useWishlist();
  const saved = isSaved(slug);
  const [popping, setPopping] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const wasSaved = saved;
        toggle(slug);
        // micro-interaction: pop + subtle haptic on supported devices
        setPopping(true);
        window.setTimeout(() => setPopping(false), 420);
        try {
          if (!wasSaved && 'vibrate' in navigator) navigator.vibrate(18);
        } catch {}
        if (wasSaved) {
          rosetteToast.message(t('toastRemovedFromWishlist'), {
            description: productName,
          })
        } else {
          rosetteToast.success(t('toastSavedToWishlist'), {
            description: productName ? `${productName} — ${t('wishlistPriceDropsHint')}` : t('wishlistPriceDropsHint'),
          })
        }
      }}
      className={`grid h-11 w-11 place-items-center rounded-full border bg-background/80 shadow-sm transition-all hover:border-primary hover:bg-[var(--color-surface-container)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] ${saved ? 'border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 text-destructive' : 'border-[var(--rt-outline-variant)]/20 text-muted-foreground'} ${className}`}
    >
      <Heart
        className={`h-4 w-4 transition-transform ${saved ? 'fill-current text-destructive' : ''} ${popping ? 'animate-heart-pop' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}
