'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addLine, removeLine, updateLineQuantity } from './cart-utils';
import { calculateCartTotals } from './pricing';
import { clearCartStorage, readCart, writeCart } from './storage';
import { deferToTask } from '@/hooks/use-deferred-task';
import type { AddCartLineInput, Cart, CartLine } from './types';

type CartContextValue = { cart: Cart; ready: boolean; itemCount: number; totals: ReturnType<typeof calculateCartTotals>; addItem: (input: AddCartLineInput) => void; updateQuantity: (lineId: string, quantity: number) => void; removeItem: (lineId: string) => void; clearCart: () => void; restoreCart: (lines: CartLine[]) => void };
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>({ lines: [] });
  const [ready, setReady] = useState(false);
  useEffect(() => {
    deferToTask(() => {
      setCart(readCart());
      setReady(true);
    });
  }, []);
  useEffect(() => { if (ready) writeCart(cart); }, [cart, ready]);
  const value = useMemo<CartContextValue>(() => ({ cart, ready, itemCount: cart.lines.reduce((sum, line) => sum + line.quantity, 0), totals: calculateCartTotals(cart.lines, cart.lines.length ? 1500 : 0), addItem: (input) => setCart((current) => addLine(current, input)), updateQuantity: (lineId, quantity) => setCart((current) => updateLineQuantity(current, lineId, quantity)), removeItem: (lineId) => setCart((current) => removeLine(current, lineId)), clearCart: () => { setCart({ lines: [] }); clearCartStorage(); }, restoreCart: (lines) => setCart({ lines }) }), [cart, ready]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() { const context = useContext(CartContext); if (!context) throw new Error('useCart must be used inside CartProvider'); return context; }
