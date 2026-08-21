import { ProductVisual } from '@/components/ui/ProductVisual';
import { formatMoney } from '@/features/money';
import { useI18n } from '@/features/i18n/I18nProvider';
import { pickLocalized } from '@/features/i18n/pick';
import { addOnLabel } from '@/features/catalog/add-on-labels';
import type { CartLine } from './types';

type CartLineItemProps = { line: CartLine; onQuantityChange: (quantity: number) => void; onRemove: () => void };

export function CartLineItem({ line, onQuantityChange, onRemove }: CartLineItemProps) {
  const { locale, t } = useI18n();
  const name = pickLocalized(locale, { en: line.productName, ar: line.productNameAr, fr: line.productNameFr });
  const addOnLabels = line.addOns.map((addOn) => addOnLabel(addOn, t));
  const lineTotal = (line.unitPrice + line.addOns.reduce((sum, addOn) => sum + addOn.price, 0)) * line.quantity;
  return (
    <article className="flex gap-4 items-start group py-1">
      <div className="w-20 h-20 shrink-0 rounded-md overflow-hidden bg-surface-dim relative border border-outline-variant/30">
        <ProductVisual compact tone={line.tone} imageUrl={line.imageUrl} label={`${name} visual`} className="h-full w-full min-h-0 rounded-md" sizes="80px" />
      </div>
      <div className="flex-grow flex flex-col justify-between min-h-20 py-1 gap-2">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h4 className="font-display text-[18px] leading-tight text-on-surface truncate">{name}</h4>
            <p className="text-[14px] leading-normal text-on-surface-variant mt-1 truncate">
              {line.variantName ?? t('signature')}
              {addOnLabels.length ? ` · ${addOnLabels.join(' · ')}` : ''}
            </p>
            {line.message ? <p className="text-[13px] italic text-on-surface-variant mt-1 line-clamp-2">“{line.message}”</p> : null}
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-[12px] text-on-surface-variant hover:text-error underline decoration-outline-variant/50 underline-offset-2 transition-colors"
          >
            {t('remove')}
          </button>
        </div>
        <div className="flex justify-between items-end gap-3 mt-auto">
          <div className="flex items-center border border-outline-variant rounded-md overflow-hidden bg-surface-container-lowest">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQuantityChange(Math.max(1, line.quantity - 1))}
              className="px-2.5 py-1 text-sm text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-40"
              disabled={line.quantity <= 1}
            >
              −
            </button>
            <span className="font-mono text-[12px] px-2.5 py-1 text-on-surface border-x border-outline-variant/50 min-w-8 text-center">{line.quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQuantityChange(Math.min(20, line.quantity + 1))}
              className="px-2.5 py-1 text-sm text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-40"
              disabled={line.quantity >= 20}
            >
              +
            </button>
          </div>
          <span className="font-mono text-[14px] tracking-[0.05em] text-on-surface shrink-0">{formatMoney(lineTotal, locale)}</span>
        </div>
      </div>
    </article>
  );
}
