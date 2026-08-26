import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ADMIN_PAGES = [
  'app/admin/page.tsx',
  'app/admin/orders/page.tsx',
  'app/admin/orders/[id]/page.tsx',
  'app/admin/products/page.tsx',
  'app/admin/products/[id]/page.tsx',
  'app/admin/inventory/page.tsx',
  'app/admin/delivery/page.tsx',
  'app/admin/promos/page.tsx',
  'app/admin/gift-cards/page.tsx',
  'app/admin/notifications/page.tsx',
  'app/admin/blog/page.tsx',
  'app/admin/blog/[id]/page.tsx',
  'app/admin/authors/page.tsx',
  'app/admin/authors/[id]/page.tsx',
  'app/admin/cancel-requests/page.tsx',
  'app/admin/change-requests/page.tsx',
  'app/admin/reviews/page.tsx',
];

describe('admin pages no AdminShell wrapper', () => {
  for (const rel of ADMIN_PAGES) {
    it(rel, () => {
      const source = readFileSync(join(process.cwd(), rel), 'utf-8');
      expect(source).not.toMatch(/<AdminShell>/);
      expect(source).not.toMatch(/from ['"]@\/components\/admin\/AdminShell['"]/);
    });
  }
});
