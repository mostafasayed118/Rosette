import type { CSSProperties } from 'react';

type ProductVisualProps = { tone: string; label: string; compact?: boolean };

export function ProductVisual({ tone, label, compact = false }: ProductVisualProps) {
  return <div className={`product-visual ${compact ? 'product-visual-compact' : ''}`} style={{ '--visual-tone': tone } as CSSProperties} aria-label={label} role="img"><span className="visual-sun" /><span className="visual-stem" /><span className="visual-bloom">✦</span></div>;
}
