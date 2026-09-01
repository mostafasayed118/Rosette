export type InventoryState = { quantity: number; reserved: number };
export type ReservationResult =
  | { ok: true; next: InventoryState }
  | { ok: false; reason: 'insufficient_stock' };

export function canReserveInventory(state: InventoryState, requested: number = 1): boolean {
  return reserveInventory(state, requested).ok;
}

export function reserveInventory(state: InventoryState, requested: number): ReservationResult {
  if (!Number.isInteger(requested) || requested <= 0) return { ok: false, reason: 'insufficient_stock' };
  const available = Math.max(0, state.quantity - state.reserved);
  if (requested > available) return { ok: false, reason: 'insufficient_stock' };
  return { ok: true, next: { quantity: state.quantity, reserved: state.reserved + requested } };
}

export function releaseReservation(state: InventoryState, released: number): InventoryState {
  return { quantity: state.quantity, reserved: Math.max(0, state.reserved - Math.max(0, released)) };
}
