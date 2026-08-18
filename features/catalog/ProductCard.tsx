'use client';

import Link from 'next/link';
import { ProductVisual } from '@/components/ui/ProductVisual';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';
import { formatMoney } from '@/features/money';
import { categoryMessageKeys } from './catalog-labels';
import type { Product } from './types';

export function ProductCard({ product }: { product: Product }) { const { locale, t } = useI18n(); const name = pickLocalized(locale, { en: product.name, ar: product.nameAr, fr: product.nameFr }); const description = pickLocalized(locale, { en: product.description, ar: product.descriptionAr, fr: product.descriptionFr }); const delivery = product.delivery.startsWith('Same-day') ? t('sameDay') : t('nextDay'); return <article className="product-card"><Link href={`/shop/${product.slug}`}><ProductVisual compact tone={product.tone} imageUrl={product.imageUrl} label={`${name} visual`} /><div className="product-card-copy"><div><p className="eyebrow">{t(categoryMessageKeys[product.category] ?? 'category')}</p><h3>{name}</h3></div><strong>{t('from')} {formatMoney(product.price, locale)}</strong></div><p>{description}</p><span className="delivery-note">{delivery}</span></Link></article>; }
