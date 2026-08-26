import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin hand-rolled controls removed', () => {
  it('reviews page uses RequestTabs, not hand-rolled nav', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/reviews/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/border-b pb-2/);
    expect(source).toMatch(/RequestTabs/);
  });

  it('notifications page uses shadcn Pagination, not hand-rolled buttons', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/notifications/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/previous.*next/s);
    expect(source).toMatch(/Pagination/);
  });

  it('gift-cards page uses shadcn Accordion, not raw details', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/gift-cards/page.tsx'), 'utf-8');
    expect(source).not.toMatch(/<details/);
    expect(source).toMatch(/Accordion/);
  });
});