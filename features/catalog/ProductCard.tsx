'use client';

import Link from 'next/link';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { useI18n } from '@/features/i18n/I18nProvider';
import { categoryMessageKeys } from './catalog-labels';
import type { Product } from './types';

function formatMoney(minorUnits: number) { return new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(minorUnits / 100); }
export function ProductCard({ product }: { product: Product }) { const { locale, t } = useI18n(); const name = locale === 'ar' ? product.nameAr ?? product.name : product.name; const description = locale === 'ar' ? product.descriptionAr ?? product.description : product.description; const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay'); return <article className="product-card"><Link href={`/shop/${product.slug}`}><ProductVisual compact tone={product.tone} label={`${name} visual`} /><div className="product-card-copy"><div><p className="eyebrow">{t(categoryMessageKeys[product.category] ?? 'category')}</p><h3>{name}</h3></div><strong>{t('from')} {formatMoney(product.price)}</strong></div><p>{description}</p><span className="delivery-note">{delivery}</span></Link></article>; }
