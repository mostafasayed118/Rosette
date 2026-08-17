import { ProductVisual } from '@/components/ui/ProductVisual';
import { formatMoney } from './CartSummary';
import { useI18n } from '@/features/i18n/I18nProvider';
import type { CartLine } from './types';

type CartLineItemProps = { line: CartLine; onQuantityChange: (quantity: number) => void; onRemove: () => void };

export function CartLineItem({ line, onQuantityChange, onRemove }: CartLineItemProps) {
  const { locale, t } = useI18n();
  const name = locale === 'ar' ? line.productNameAr ?? line.productName : line.productName;
  const addOnLabels = line.addOns.map((addOn) => locale === 'ar' && addOn.id === 'note' ? t('handwrittenNote') : locale === 'ar' && addOn.id === 'chocolate' ? t('darkChocolate') : locale === 'ar' && addOn.id === 'balloon' ? t('balloon') : addOn.name);
  return <article className="cart-line"><ProductVisual compact tone={line.tone} label={`${name} visual`} /><div className="cart-line-copy"><p className="eyebrow">{line.variantName ?? t('signature')}</p><h3>{name}</h3><p>{addOnLabels.join(' · ') || t('noAddOns')}{line.message ? ` · “${line.message}”` : ''}</p><strong>{formatMoney((line.unitPrice + line.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * line.quantity)}</strong></div><div className="quantity-control"><label htmlFor={`quantity-${line.id}`}>{t('quantity')}</label><input id={`quantity-${line.id}`} type="number" min="1" max="20" value={line.quantity} onChange={(event) => onQuantityChange(Number(event.target.value))} /><button className="text-button" type="button" onClick={onRemove}>{t('remove')}</button></div></article>;
}
