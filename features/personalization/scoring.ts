import type { Product } from '@/features/catalog/types';
import type { PersonalizationReason } from './types';

export function scoreAffinity(
  products: Product[],
  orderSlugs: string[],
  wishlistSlugs: string[],
  opts: { excludeSlug?: string } = {},
) {
  const freq = new Map<string, number>();
  for (const s of orderSlugs) freq.set(s, (freq.get(s) || 0) + 1);
  const wished = new Set(wishlistSlugs);
  const cat = new Map<string, number>();
  const occ = new Map<string, number>();
  for (const p of products) {
    const f = freq.get(p.slug) || 0;
    const w = wished.has(p.slug) ? 1 : 0;
    const weight = f * 2 + w;
    if (weight > 0) {
      cat.set(p.category, (cat.get(p.category) || 0) + weight);
      for (const o of p.occasions) occ.set(o, (occ.get(o) || 0) + weight);
    }
  }
  const out = new Map<string, { score: number; reason: PersonalizationReason }>();
  for (const p of products) {
    if (p.slug === opts.excludeSlug) continue;
    const f = freq.get(p.slug) || 0;
    if (f > 0) {
      out.set(p.slug, { score: 1000 + f, reason: 'buy_again' });
    }
  }
  const affinity: [Product, number][] = [];
  for (const p of products) {
    if (out.has(p.slug) || p.slug === opts.excludeSlug) continue;
    const c = cat.get(p.category) || 0;
    let o = 0;
    for (const oc of p.occasions) o += occ.get(oc) || 0;
    const s = c * 2 + o;
    if (s > 0) affinity.push([p, s]);
  }
  affinity.sort((a, b) => b[1] - a[1] || b[0].createdAt.localeCompare(a[0].createdAt));
  for (const [p, s] of affinity) out.set(p.slug, { score: s, reason: 'affinity' });
  if (out.size === 0) {
    const newest = [...products].filter((p) => p.slug !== opts.excludeSlug).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const p of newest.slice(0, 8)) out.set(p.slug, { score: 0, reason: 'fallback_newest' });
  }
  return out;
}
