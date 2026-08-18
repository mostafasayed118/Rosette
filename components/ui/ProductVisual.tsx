import type { CSSProperties } from 'react';

type ProductVisualProps = { tone: string; label: string; compact?: boolean; imageUrl?: string | null; className?: string };

export function ProductVisual({ tone, label, compact = false, imageUrl, className = '' }: ProductVisualProps) {
  if (imageUrl) {
    return <div className={`product-visual product-visual-photo ${compact ? 'product-visual-compact' : ''} ${className}`} role="img" aria-label={label}><img src={imageUrl} alt="" loading="lazy" /></div>;
  }
  return <div className={`product-visual ${compact ? 'product-visual-compact' : ''} ${className}`} style={{ '--visual-tone': tone } as CSSProperties} role="img" aria-label={label}><span className="visual-sun" /><span className="visual-stem" /><span className="visual-bloom">✦</span></div>;
}
