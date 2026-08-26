import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('admin imagery', () => {
  it('products list uses ImagePreview for thumbnails', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/products/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('blog list uses ImagePreview for cover thumbnails', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/blog/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('authors list uses ImagePreview for avatars', () => {
    const source = readFileSync(join(process.cwd(), 'app/admin/authors/page.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('ProductForm includes image preview', () => {
    const source = readFileSync(join(process.cwd(), 'components/admin/ProductForm.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });

  it('AuthorForm includes image preview', () => {
    const source = readFileSync(join(process.cwd(), 'components/admin/AuthorForm.tsx'), 'utf-8');
    expect(source).toMatch(/ImagePreview/);
  });
});
