import { describe, expect, it } from 'vitest';
import { pageWindow } from '@/features/catalog/CatalogPagination';

describe('pageWindow', () => {
  it('lists every page when the count is small', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses distant pages with a gap marker', () => {
    expect(pageWindow(5, 12)).toEqual([1, 'gap', 4, 5, 6, 'gap', 12]);
  });

  it('keeps the first pages contiguous when near the start', () => {
    expect(pageWindow(2, 12)).toEqual([1, 2, 3, 'gap', 12]);
  });

  it('keeps the last pages contiguous when near the end', () => {
    expect(pageWindow(12, 12)).toEqual([1, 'gap', 11, 12]);
  });

  it('never emits pages out of range', () => {
    for (const entry of pageWindow(1, 20)) {
      if (entry !== 'gap') expect(entry).toBeGreaterThanOrEqual(1);
    }
  });
});
