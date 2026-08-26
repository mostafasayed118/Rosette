import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('order detail KeyValueRow', () => {
  it('uses KeyValueRow for items, payments, and cancel requests', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/orders/[id]/page.tsx'), 'utf-8');
    const keyValueMatches = source.match(/<KeyValueRow/g) ?? [];
    expect(keyValueMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('uses formatDateTime instead of duplicated ternary', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/orders/[id]/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/toLocaleString\(locale === 'ar'/);
    expect(source).toMatch(/formatDateTime/);
  });
});
