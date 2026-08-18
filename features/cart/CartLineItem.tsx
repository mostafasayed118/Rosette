import { ProductVisual } from '@/components/ui/ProductVisual';
import { formatMoney } from './CartSummary';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';
import type { CartLine } from './types';

type CartLineItemProps = { line: CartLine; onQuantityChange: (quantity: number) => void; onRemove: () => void };

function addOnLabel(addOn: CartLine['addOns'][number], t: (key: string) => string) {
  return addOn.id === 'note' ? t('handwrittenNote') : addOn.id === 'chocolate' ? t('darkChocolate') : addOn.id === 'balloon' ? t('balloon') : addOn.name;
}

export function CartLineItem({ line, onQuantityChange, onRemove }: CartLineItemProps) {
  const { locale, t } = useI18n();
  const name = pickLocalized(locale, { en: line.productName, ar: line.productNameAr, fr: line.productNameFr });
  const addOnLabels = line.addOns.map((addOn) => addOnLabel(addOn, t));
  return <article className="cart-line"><ProductVisual compact tone={line.tone} imageUrl={line.imageUrl} label={`${name} visual`} /><div className="cart-line-copy"><p className="eyebrow">{line.variantName ?? t('signature')}</p><h3>{name}</h3><p>{addOnLabels.join(' · ') || t('noAddOns')}{line.message ? ` · “${line.message}”` : ''}</p><strong>{formatMoney((line.unitPrice + line.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * line.quantity)}</strong></div><div className="quantity-control"><label htmlFor={`quantity-${line.id}`}>{t('quantity')}</label><input id={`quantity-${line.id}`} type="number" min="1" max="20" value={line.quantity} onChange={(event) => onQuantityChange(Number(event.target.value))} /><button className="text-button" type="button" onClick={onRemove}>{t('remove')}</button></div></article>;
}
