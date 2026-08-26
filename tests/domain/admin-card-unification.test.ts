import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const PAGES = [
  'app/admin/delivery/page.tsx',
  'app/admin/promos/page.tsx',
  'app/admin/blog/page.tsx',
  'app/admin/authors/page.tsx',
];

describe('list card unification', () => {
  it.each(PAGES)('$s uses CardHeader + CardTitle', (rel) => {
    const source = readFileSync(join(process.cwd(), rel), 'utf-8');
    expect(source).toMatch(/CardHeader/);
    expect(source).toMatch(/CardTitle/);
  });
});
