'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addLine, addRecipient, assignLineToRecipient, isMultiRecipient, removeLine, removeRecipient, updateLineQuantity, updateRecipient } from './cart-utils';
import { calculateCartTotals } from './pricing';
import { clearCartStorage, readCart, writeCart } from './storage';
import { deferToTask } from '@/hooks/use-deferred-task';
import type { AddCartLineInput, Cart, CartLine, CartRecipient } from './types';

type CartContextValue = {
  cart: Cart; ready: boolean; itemCount: number; totals: ReturnType<typeof calculateCartTotals>;
  multiRecipient: boolean; recipients: CartRecipient[];
  addItem: (input: AddCartLineInput) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  addRecipient: (recipient: CartRecipient) => void;
  updateRecipient: (id: string, patch: Partial<Omit<CartRecipient, 'id'>>) => void;
  removeRecipient: (id: string) => void;
  assignLineToRecipient: (lineId: string, recipientId: string | undefined) => boolean;
  clearCart: () => void;
  restoreCart: (lines: CartLine[]) => void;
};
const CartContext = createContext<CartContextValue | null>(null);

const EMPTY_CART: Cart = { version: 2, lines: [], recipients: [] };

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    deferToTask(() => {
      setCart(readCart());
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) writeCart(cart); }, [cart, ready]);

  const value = useMemo<CartContextValue>(() => ({
    cart,
    ready,
    itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    totals: calculateCartTotals(cart.lines, cart.lines.length ? 1500 : 0),
    multiRecipient: isMultiRecipient(cart),
    recipients: cart.recipients,
    addItem: (input) => setCart((current) => addLine(current, input)),
    updateQuantity: (lineId, quantity) => setCart((current) => updateLineQuantity(current, lineId, quantity)),
    removeItem: (lineId) => setCart((current) => removeLine(current, lineId)),
    addRecipient: (recipient) => setCart((current) => addRecipient(current, recipient)),
    updateRecipient: (id, patch) => setCart((current) => updateRecipient(current, id, patch)),
    removeRecipient: (id) => setCart((current) => removeRecipient(current, id)),
    assignLineToRecipient: (lineId, recipientId) => {
      const next = assignLineToRecipient(cart, lineId, recipientId);
      if (next) setCart(next);
      return Boolean(next);
    },
    clearCart: () => { setCart(EMPTY_CART); clearCartStorage(); },
    restoreCart: (lines) => setCart({ version: 2, lines, recipients: [] }),
  }), [cart, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('useCart must be used inside CartProvider'); return context; }