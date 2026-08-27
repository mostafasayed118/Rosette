import { describe, expect, it } from 'vitest';
import { createRecipientId } from '@/features/cart/recipient-types';
import { addRecipient, updateRecipient, removeRecipient, assignLineToRecipient, isMultiRecipient, groupLinesByRecipient } from '@/features/cart/cart-utils';
import { deliveryFeeForGroups, calculateGroupTotals } from '@/features/cart/pricing';
import type { Cart, CartLine, CartRecipient } from '@/features/cart/types';

function line(overrides: Partial<CartLine>): CartLine {
  return { id: overrides.id ?? 'l1', productSlug: 'rose', productName: 'Rose', tone: 'white', unitPrice: 1000, quantity: 1, addOns: [], message: '', deliveryDate: '2026-09-01', ...overrides } as CartLine;
}
function emptyCart(): Cart { return { version: 2, lines: [], recipients: [] }; }
function recipient(id: string): CartRecipient { return { id, recipientName: 'Mom', recipientPhone: '0100', address: 'Cairo', deliveryDate: '2026-09-02', deliveryWindow: '12-3' }; }

describe('cart recipient utilities', () => {
  it('createRecipientId returns a unique non-empty id', () => {
    expect(createRecipientId()).toBeTruthy();
    expect(createRecipientId()).not.toBe(createRecipientId());
  });

  it('addRecipient appends and keeps lines; isMultiRecipient reflects presence', () => {
    const cart = emptyCart();
    expect(isMultiRecipient(cart)).toBe(false);
    const next = addRecipient(cart, recipient('r1'));
    expect(next.recipients).toHaveLength(1);
    expect(isMultiRecipient(next)).toBe(true);
  });

  it('updateRecipient patches by id and keeps order', () => {
    const cart = addRecipient(emptyCart(), recipient('r1'));
    const next = updateRecipient(cart, 'r1', { recipientName: 'Aunt', deliveryDate: '2026-09-05' });
    expect(next.recipients[0]!.recipientName).toBe('Aunt');
    expect(next.recipients[0]!.deliveryDate).toBe('2026-09-05');
  });

  it('updateRecipient resyncs the deliveryDate of its assigned lines', () => {
    const cart = { version: 2 as const, lines: [line({ id: 'l1', deliveryDate: '2026-09-02', recipientId: 'r1' })], recipients: [recipient('r1')] };
    const next = updateRecipient(cart, 'r1', { deliveryDate: '2026-09-10' });
    expect(next.lines[0]!.deliveryDate).toBe('2026-09-10');
  });

  it('removeRecipient unassigns its lines but keeps them', () => {
    const withLine = { version: 2 as const, lines: [{ ...line({ id: 'l1' }), recipientId: 'r1' }], recipients: [recipient('r1')] };
    const next = removeRecipient(withLine, 'r1');
    expect(next.recipients).toHaveLength(0);
    expect(next.lines[0]!.recipientId).toBeUndefined();
    expect(next.lines).toHaveLength(1);
  });

  it('assignLineToRecipient sets recipientId and syncs deliveryDate from the group', () => {
    const cart = { version: 2 as const, lines: [line({ id: 'l1', deliveryDate: '2026-09-01' })], recipients: [recipient('r1')] };
    const next = assignLineToRecipient(cart, 'l1', 'r1')!;
    expect(next.lines[0]!.recipientId).toBe('r1');
    expect(next.lines[0]!.deliveryDate).toBe('2026-09-02');
  });

  it('assignLineToRecipient with undefined unassigns and keeps the current date', () => {
    const cart = { version: 2 as const, lines: [{ ...line({ id: 'l1' }), recipientId: 'r1', deliveryDate: '2026-09-02' }], recipients: [recipient('r1')] };
    const next = assignLineToRecipient(cart, 'l1', undefined)!;
    expect(next.lines[0]!.recipientId).toBeUndefined();
    expect(next.lines[0]!.deliveryDate).toBe('2026-09-02');
  });

  it('groupLinesByRecipient buckets lines by recipientId and returns unassigned separately', () => {
    const cart = {
      version: 2 as const,
      lines: [line({ id: 'l1', recipientId: 'r1' }), line({ id: 'l2', recipientId: 'r2' }), line({ id: 'l3' })],
      recipients: [recipient('r1'), recipient('r2')],
    };
    const buckets = groupLinesByRecipient(cart.lines);
    expect(buckets.get('r1')?.map((l) => l.id)).toEqual(['l1']);
    expect(buckets.get('r2')?.map((l) => l.id)).toEqual(['l2']);
    expect(buckets.get('__unassigned__')?.map((l) => l.id)).toEqual(['l3']);
  });

  it('deliveryFeeForGroups multiplies per group, defaulting to 1', () => {
    expect(deliveryFeeForGroups(1500, 0)).toBe(1500);
    expect(deliveryFeeForGroups(1500, 3)).toBe(4500);
  });

  it('calculateGroupTotals returns subtotal and fee per group plus overall', () => {
    const lines = [
      { ...line({ id: 'l1', unitPrice: 1000, quantity: 2 }), recipientId: 'r1' },
      { ...line({ id: 'l2', unitPrice: 2000, quantity: 1 }), recipientId: 'r1' },
      { ...line({ id: 'l3', unitPrice: 5000, quantity: 1 }), recipientId: 'r2' },
      line({ id: 'l4', unitPrice: 900, quantity: 1 }),
    ];
    const result = calculateGroupTotals(lines, 1500, ['r1', 'r2', '__unassigned__']);
    expect(result.byGroup.get('r1')?.subtotalMinor).toBe(4000);
    expect(result.byGroup.get('r2')?.subtotalMinor).toBe(5000);
    expect(result.byGroup.get('r1')?.feeMinor).toBe(1500);
    expect(result.overallSubtotalMinor).toBe(9900);
  });
});