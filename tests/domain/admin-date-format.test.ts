import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const DATE_PAGES = [
  'app/admin/reviews/page.tsx',
  'app/admin/cancel-requests/page.tsx',
  'app/admin/change-requests/page.tsx',
  'app/admin/orders/[id]/page.tsx',
];

describe('no duplicated date formatting', () => {
  it.each(DATE_PAGES)('$s uses formatDateTime', (rel) => {
    const source = readFileSync(join(process.cwd(), rel), 'utf-8');
    expect(source).not.toMatch(/toLocaleString\(locale === 'ar'/);
    expect(source).toMatch(/formatDateTime/);
  });
});
