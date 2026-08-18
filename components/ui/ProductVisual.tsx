import type { CSSProperties } from 'react';

type ProductVisualProps = { tone: string; label: string; compact?: boolean; imageUrl?: string | null; className?: string };

export function ProductVisual({ tone, label, compact = false, imageUrl, className = '' }: ProductVisualProps) {
  const minHeight = className.includes('min-h') ? '' : (compact ? 'min-h-[190px]' : 'min-h-[480px]');
  const bloomSize = compact ? 'text-[3.5rem]' : 'text-[7rem]';
  if (imageUrl) {
    return <div className={`relative grid place-items-center overflow-hidden rounded-2xl ${minHeight} ${className}`} role="img" aria-label={label}><img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /></div>;
  }
  return <div className={`relative grid place-items-center overflow-hidden rounded-2xl ${minHeight} ${className}`} style={{ '--visual-tone': tone, background: 'color-mix(in srgb, var(--visual-tone) 25%, var(--color-surface))' } as CSSProperties} role="img" aria-label={label}><span className={`visual-bloom ${bloomSize} text-primary`} aria-hidden="true">✦</span></div>;
}
