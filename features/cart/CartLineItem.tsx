import { Input } from '@/components/ui/input';
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
  return <article className="grid grid-cols-[130px_1fr_auto] gap-4 border-b py-4 max-md:grid-cols-[90px_1fr]"><ProductVisual compact tone={line.tone} imageUrl={line.imageUrl} label={`${name} visual`} /><div><p className="text-xs font-bold uppercase tracking-[.16em] text-sage">{line.variantName ?? t('signature')}</p><h3 className="font-display text-2xl">{name}</h3><p className="my-2 text-sm text-muted-foreground">{addOnLabels.join(' · ') || t('noAddOns')}{line.message ? ` · “${line.message}”` : ''}</p><strong className="text-sm text-primary">{formatMoney((line.unitPrice + line.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * line.quantity)}</strong></div><div className="grid justify-items-end gap-1.5 text-xs text-muted-foreground"><label htmlFor={`quantity-${line.id}`}>{t('quantity')}</label><Input id={`quantity-${line.id}`} type="number" min={1} max={20} value={line.quantity} onChange={(event) => onQuantityChange(Number(event.target.value))} className="h-9 w-16 text-center" /><button className="text-sm text-destructive underline underline-offset-4" type="button" onClick={onRemove}>{t('remove')}</button></div></article>;
}
