import { describe, expect, it } from 'vitest';
import { computeDashboardStats, LOW_STOCK_THRESHOLD, type InventoryRow, type OrderRow } from '@/features/admin/dashboard-stats';

const today = new Date(2026, 7, 18, 12, 0, 0); // Aug 18, 2026 12:00 local
const todayStr = today.toISOString();
const yesterdayStr = new Date(2026, 7, 17, 12, 0, 0).toISOString();

const order = (over: Partial<OrderRow>): OrderRow => ({ payment_status: 'paid', fulfillment_status: 'confirmed', total_minor: 10000, created_at: todayStr, ...over });

const emptyPipeline = { confirmed: 0, preparing: 0, ready_for_delivery: 0, out_for_delivery: 0, delivered: 0 };

describe('computeDashboardStats', () => {
  it('counts awaiting fulfillment as paid, non-delivered, non-cancelled', () => {
    const stats = computeDashboardStats([
      order({ fulfillment_status: 'confirmed' }),
      order({ fulfillment_status: 'preparing' }),
      order({ fulfillment_status: 'delivered' }),
      order({ fulfillment_status: 'cancelled' }),
      order({ payment_status: 'pending', fulfillment_status: 'confirmed' }),
    ], [], today);
    expect(stats.awaitingFulfillment).toBe(2);
  });

  it('sums revenue today from paid orders on the same local date', () => {
    const stats = computeDashboardStats([
      order({ total_minor: 10000 }),
      order({ total_minor: 25000 }),
      order({ total_minor: 5000, created_at: yesterdayStr }),
    ], [], today);
    expect(stats.revenueTodayMinor).toBe(35000);
  });

  it('sums revenue all-time from paid orders only', () => {
    const stats = computeDashboardStats([
      order({ total_minor: 10000 }),
      order({ total_minor: 25000, created_at: yesterdayStr }),
      order({ payment_status: 'pending', total_minor: 90000 }),
      order({ payment_status: 'cancelled', total_minor: 80000 }),
    ], [], today);
    expect(stats.revenueAllTimeMinor).toBe(35000);
  });

  it('excludes unpaid orders from revenue today', () => {
    const stats = computeDashboardStats([
      order({ payment_status: 'payment_started', total_minor: 5000 }),
    ], [], today);
    expect(stats.revenueTodayMinor).toBe(0);
  });

  it('counts the pipeline per status for paid orders, excluding cancelled', () => {
    const stats = computeDashboardStats([
      order({ fulfillment_status: 'confirmed' }),
      order({ fulfillment_status: 'preparing' }),
      order({ fulfillment_status: 'ready_for_delivery' }),
      order({ fulfillment_status: 'out_for_delivery' }),
      order({ fulfillment_status: 'delivered' }),
      order({ fulfillment_status: 'cancelled' }),
      order({ payment_status: 'pending', fulfillment_status: 'confirmed' }),
    ], [], today);
    expect(stats.pipeline).toEqual({ confirmed: 1, preparing: 1, ready_for_delivery: 1, out_for_delivery: 1, delivered: 1 });
  });

  it('lists low stock with available ≤ threshold and carries names', () => {
    const inventory: InventoryRow[] = [
      { variant_name_en: 'Classic', quantity: 5, reserved_quantity: 3 },
      { variant_name_en: 'Deluxe', quantity: 10, reserved_quantity: 0 },
      { variant_name_en: 'Bare', quantity: 0, reserved_quantity: 0 },
    ];
    const stats = computeDashboardStats([], inventory, today);
    expect(stats.lowStock).toEqual([
      { name: 'Bare', available: 0 },
      { name: 'Classic', available: 2 },
    ]);
  });

  it('sorts low stock ascending and caps the list at 10', () => {
    const inventory: InventoryRow[] = Array.from({ length: 15 }, (_, i) => ({ variant_name_en: `V${i}`, quantity: i % 5, reserved_quantity: 0 }));
    const stats = computeDashboardStats([], inventory, today);
    expect(stats.lowStock).toHaveLength(10);
    const available = stats.lowStock.map((row) => row.available);
    expect(available).toEqual([...available].sort((a, b) => a - b));
    expect(stats.lowStock[0]!.available).toBe(0);
    expect(stats.lowStock[9]!.available).toBe(LOW_STOCK_THRESHOLD);
  });

  it('returns zeroed stats for empty inputs', () => {
    expect(computeDashboardStats([], [], today)).toEqual({ awaitingFulfillment: 0, revenueTodayMinor: 0, revenueAllTimeMinor: 0, pipeline: emptyPipeline, lowStock: [] });
  });
});
