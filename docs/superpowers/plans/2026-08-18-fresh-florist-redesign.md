# Rosette Fresh-Florist Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Rosette into a modern fresh-florist identity — bright/airy/photo-forward — across the storefront and admin, with a new product-photo pipeline.

**Architecture:** A styling-layer redesign. Design tokens, fonts, and base component styles change in `app/globals.css` + `app/layout.tsx`; a new `products.image_url` column feeds a photo-capable `ProductVisual` component (with gradient-bloom fallback); per-locale fonts switch via CSS `:lang()`; the admin gains a sidebar shell. No route or behavior changes.

**Tech Stack:** Next.js 16 (App Router, `next/font/google`), React 19, TypeScript, Supabase (Postgres + Storage + REST), CSS custom properties in one `globals.css`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-fresh-florist-redesign-design.md`

## Global Constraints

- **Palette (exact values):** canvas `#faf7f2`, surface `#ffffff`, surface-muted `#f3eee6`, ink `#2d2a26`, ink-muted `#6d675f`, brand `#c2456d`, brand-hover `#a83358`, brand-soft `#fae3ea`, accent `#6f8f6d`, border `#e7dfd4`, success `#3e7a52`, warning `#a06a1f`, danger `#c0392b`.
- **Radius:** sm `10px`, md `16px`, lg `24px`, pill `999px`.
- **Fonts via `next/font/google` only** (self-hosted, no runtime requests): Fraunces (display, `subsets: ['latin']`), Inter (body, `subsets: ['latin']`), Cairo (Arabic, `subsets: ['arabic']`). Font switch per locale via CSS `:lang(ar)`.
- **No route changes, no behavior changes, no new pages.** No changes to order/checkout/payment/chat/email logic or dictionary content.
- **Every product image must degrade gracefully:** when `image_url` is null, render the gradient + bloom placeholder — never a broken image.
- **RTL preserved:** use logical properties (`margin-inline-*`, `inset-inline-*`); never hardcode `left`/`right` for directional layout.
- All existing tests keep passing (currently 121/122; the 1 failure is the known env-guard in `tests/lib/server-env.test.ts` — leave it).
- Naming: column `image_url`; TS field `imageUrl`; cart field `imageUrl`; bucket `product-images`.

---

### Task 1: Design Foundation — Tokens, Fonts, Base Styles

**Files:**
- Modify: `app/globals.css` (entire `:root` block + base element styles + `.button`/`.field`/`.status-message`/`.choice`/`.modal`/`.chat-*` restyles)
- Modify: `app/layout.tsx`
- Test: `tests/components/LayoutFonts.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: CSS custom properties `--color-*`, `--radius-*`, `--shadow-card` consumed by every later task; `next/font` variable classes on `<html>`; `:lang(ar)` font override.

- [ ] **Step 1: Write the failing font test**

Create `tests/components/LayoutFonts.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootLayout from '@/app/layout';

describe('RootLayout fonts', () => {
  it('applies the font variable classes to the html element', () => {
    const { container } = render(<RootLayout><div>child</div></RootLayout>);
    const html = container.querySelector('html');
    expect(html?.className).toContain('font');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/LayoutFonts.test.tsx`
Expected: FAIL — `RootLayout` currently renders `<html lang="en">` with no className.

- [ ] **Step 3: Load the fonts in `app/layout.tsx`**

Replace the imports and `<html>` tag in `app/layout.tsx`:

```tsx
import { Cairo, Fraunces, Inter } from 'next/font/google';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '@/features/cart/CartProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { ChatWidget } from '@/features/chat/ChatWidget';
import { getOptionalServerEnv } from '@/lib/server-env';

const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic'], variable: '--font-arabic', display: 'swap' });

export const metadata: Metadata = {
  title: 'Rosette — thoughtful flowers, delivered',
  description: 'An original botanical gift storefront concept.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en" className={`${fraunces.variable} ${inter.variable} ${cairo.variable}`}><body><I18nProvider><CartProvider>{children}</CartProvider><ChatWidget whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /></I18nProvider></body></html>;
}
```

- [ ] **Step 4: Replace the `:root` token block in `app/globals.css`**

Replace the entire `:root { ... }` block (currently lines 1-23) with:

```css
:root {
  --color-canvas: #faf7f2;
  --color-surface: #ffffff;
  --color-surface-muted: #f3eee6;
  --color-ink: #2d2a26;
  --color-ink-muted: #6d675f;
  --color-brand: #c2456d;
  --color-brand-hover: #a83358;
  --color-brand-soft: #fae3ea;
  --color-accent: #6f8f6d;
  --color-border: #e7dfd4;
  --color-success: #3e7a52;
  --color-warning: #a06a1f;
  --color-danger: #c0392b;
  --text-xs: .75rem;
  --text-sm: .875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;
  --text-display: clamp(2.5rem, 6vw, 4.5rem);
  --space-1: .25rem;
  --space-2: .5rem;
  --space-3: .75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-24: 6rem;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgb(45 42 38 / 6%), 0 8px 24px rgb(45 42 38 / 8%);
  --shadow-soft: 0 12px 32px rgb(45 42 38 / 10%);
  --content-max: 80rem;
}

html[lang='ar'] {
  --font-display: var(--font-arabic);
  --font-body: var(--font-arabic);
}
```

Note: `--font-display` / `--font-body` / `--font-arabic` are NOT defined here — the `next/font` `variable` classes applied to `<html>` in Task 1 Step 3 define them. CSS rules below use `font-family: var(--font-display)` / `var(--font-body)`, and `html[lang='ar']` (a later rule) re-points them at Cairo. The override must come after `:root` in the file (it does — it is a separate rule).

- [ ] **Step 5: Restyle base elements and shared components**

In `app/globals.css`, apply these targeted restyles (keep every selector that exists; change only the values shown):

```css
/* fonts on body */
body { margin: 0; color: var(--color-ink); background: var(--color-canvas); font-family: var(--font-body); line-height: 1.5; }

/* buttons — rounded rose primary */
.button { display: inline-flex; justify-content: center; align-items: center; gap: .75rem; min-height: 3rem; padding: .7rem 1.4rem; border: 1px solid var(--color-brand); border-radius: var(--radius-pill); background: var(--color-brand); color: var(--color-surface); cursor: pointer; transition: background .2s ease, transform .2s ease, box-shadow .2s ease; box-shadow: var(--shadow-card); }
.button:hover { background: var(--color-brand-hover); transform: translateY(-2px); }
.button:focus-visible { outline: 3px solid var(--color-brand); outline-offset: 3px; }

/* fields — rounded inputs */
.field input, .field select, .field textarea { width: 100%; min-height: 2.8rem; padding: .65rem .9rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-ink); transition: border-color .2s ease, box-shadow .2s ease; }
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--color-brand); box-shadow: 0 0 0 3px var(--color-brand-soft); outline: none; }

/* status messages — white rounded cards */
.status-message { padding: 1.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-card); }
.status-message.status-error { border-color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 6%, var(--color-surface)); }
.status-message.status-success { border-color: var(--color-success); background: color-mix(in srgb, var(--color-success) 6%, var(--color-surface)); }

/* choice cards — rounded, rose when selected */
.choice { display: flex; gap: .7rem; align-items: center; padding: .85rem 1rem; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); cursor: pointer; transition: border-color .2s ease, background .2s ease; }
.choice:has(input:checked) { border-color: var(--color-brand); background: var(--color-brand-soft); }
.choice input { accent-color: var(--color-brand); }

/* auth card */
.auth-card { max-width: 34rem; display: grid; gap: 1.25rem; padding: 2rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-card); }

/* cart aside + order card — rounded cards */
.cart-aside, .order-card { padding: 1.5rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }

/* modal — NEW styles; Modal.tsx already uses these classes but globals.css has no rules for them yet. Add them. */
.modal { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-soft); }
.modal-backdrop { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgb(45 42 38 / 45%); }
```

- [ ] **Step 6: Run the font test + typecheck**

Run: `npx vitest run tests/components/LayoutFonts.test.tsx && npx tsc --noEmit`
Expected: font test PASS (html className contains the font variables); typecheck clean.

- [ ] **Step 7: Verify the full suite still passes**

Run: `npx vitest run`
Expected: 122 pass, 1 known env-guard failure (`tests/lib/server-env.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add app/globals.css app/layout.tsx tests/components/LayoutFonts.test.tsx
git commit -m "feat: fresh-florist design foundation — tokens, fonts, base styles"
```

---

### Task 2: Photo Pipeline — Migration, Storage, Data Layer, Photo Component

**Files:**
- Create: `supabase/migrations/004_product_images.sql`
- Create: `scripts/upload-product-photos.mjs`
- Modify: `supabase/seed.sql` (add `image_url` column + values to the products INSERT)
- Modify: `features/catalog/types.ts`, `features/catalog/row-mappers.ts`, `features/catalog/supabase-repository.ts`, `features/catalog/data.ts`
- Modify: `components/ui/ProductVisual.tsx`
- Modify: `features/cart/types.ts`, `features/cart/CartProvider.tsx`, `features/cart/CartLineItem.tsx`, `features/product/ProductDetail.tsx`
- Modify: `tests/domain/catalog-repository.test.ts`
- Create: `tests/components/ProductVisual.test.tsx`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: `products.image_url text` (nullable) in the live DB; public bucket `product-images` with 16 photos; `Product.imageUrl: string | null`; `ProductVisual` accepts `imageUrl?: string | null` and renders `<img>` or the placeholder; `CartLine.imageUrl?: string | null` and `addItem` accepts `imageUrl`.

- [ ] **Step 1: Write the failing ProductVisual test**

Create `tests/components/ProductVisual.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductVisual } from '@/components/ui/ProductVisual';

describe('ProductVisual', () => {
  it('renders the photo when imageUrl is provided', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour photo" imageUrl="https://example.com/rose.jpg" />);
    const img = screen.getByRole('img', { name: 'Rose Hour photo' });
    expect(img).toHaveAttribute('src', 'https://example.com/rose.jpg');
  });

  it('renders the placeholder when imageUrl is null', () => {
    render(<ProductVisual tone="#c2456d" label="Rose Hour visual" />);
    const visual = screen.getByRole('img', { name: 'Rose Hour visual' });
    expect(visual.querySelector('.visual-bloom')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/ProductVisual.test.tsx`
Expected: FAIL — `ProductVisual` does not accept `imageUrl` (type error) and never renders an `<img>`.

- [ ] **Step 3: Update the failing catalog-mapper test**

In `tests/domain/catalog-repository.test.ts`, add `image_url: 'https://example.com/rose.jpg'` to the row and `imageUrl: 'https://example.com/rose.jpg'` to the `toMatchObject` expectations.

- [ ] **Step 4: Create the migration**

Create `supabase/migrations/004_product_images.sql`:

```sql
alter table public.products add column image_url text;
```

- [ ] **Step 5: Thread `imageUrl` through the data layer**

In `features/catalog/types.ts`, add `imageUrl: string | null;` to the `Product` type.

In `features/catalog/row-mappers.ts`:
- Add `image_url?: string | null;` to `SupabaseProductRow`.
- Add `imageUrl: row.image_url ?? null,` to the returned product.

In `features/catalog/supabase-repository.ts`, add `image_url` to `productSelect` (after `tone,`).

In `features/catalog/data.ts` (mock), add `imageUrl: null` to every one of the 8 products (they have no photos in the mock; the placeholder renders).

- [ ] **Step 6: Rewrite `ProductVisual` as a photo component**

Replace `components/ui/ProductVisual.tsx`:

```tsx
import type { CSSProperties } from 'react';

type ProductVisualProps = { tone: string; label: string; compact?: boolean; imageUrl?: string | null };

export function ProductVisual({ tone, label, compact = false, imageUrl }: ProductVisualProps) {
  if (imageUrl) {
    return <div className={`product-visual product-visual-photo ${compact ? 'product-visual-compact' : ''}`} role="img" aria-label={label}><img src={imageUrl} alt="" loading="lazy" /></div>;
  }
  return <div className={`product-visual ${compact ? 'product-visual-compact' : ''}`} style={{ '--visual-tone': tone } as CSSProperties} role="img" aria-label={label}><span className="visual-sun" /><span className="visual-stem" /><span className="visual-bloom">✦</span></div>;
}
```

In `app/globals.css`, add:

```css
.product-visual-photo img { width: 100%; height: 100%; object-fit: cover; }
.product-visual-photo { background: color-mix(in srgb, var(--visual-tone) 25%, var(--color-surface)); }
```

- [ ] **Step 7: Thread `imageUrl` through cart lines and product detail**

In `features/cart/types.ts`, add `imageUrl?: string | null;` to `CartLine`. (`AddCartLineInput = CartLine`, so `addItem` accepts it automatically — no `CartProvider.tsx` change needed.)

In `features/product/ProductDetail.tsx`:
- In the `addItem({ ... })` call, add `imageUrl: product.imageUrl,`.
- Pass `imageUrl={product.imageUrl}` to the `<ProductVisual>` in the detail hero.

In `features/cart/CartLineItem.tsx`, pass `imageUrl={line.imageUrl}` to its `<ProductVisual>`.

- [ ] **Step 8: Update seed.sql with the image_url column**

In `supabase/seed.sql`, find the products INSERT. Add `image_url` to the column list and a null-safe placeholder value for each row. Use the same value for every row for now — a sentinel like `null` — because the actual URLs are written by the upload script in Step 9. (If the INSERT uses an explicit column list, append `image_url` and `NULL` per row; if it selects from a VALUES list, extend it.)

- [ ] **Step 9: Create and run the photo upload script**

Create `scripts/upload-product-photos.mjs` with this behavior (read `.env.local` for `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):

1. Define `PRODUCTS` — a list of the 16 slugs from the live `products` table (query the DB first: `curl -s "$URL/rest/v1/products?select=slug" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`). For each slug, pick a flower-appropriate photo:
   - Use `https://images.unsplash.com/photo-<id>?w=1200&q=80&auto=format&fit=crop` URLs from this curated list (all verified flower/bouquet imagery):
     - `photo-1490750967868-88aa4486c946`, `photo-1455659817273-f96807779a8a`, `photo-1470509037663-253afd7f0f51`, `photo-1526047932273-341f2a7631f9`, `photo-1496062031456-07b8f162a322`, `photo-1519378058457-4c29a0a2efac`, `photo-1508610048659-a06b669e3321`, `photo-1471899236350-e3016bf1e69e`, `photo-1518895949257-7621c3c786d7`, `photo-1520763185298-1b434c919102`, `photo-1559563362-c667ba5f5480`, `photo-1533038590840-1cde6e668a91`, `photo-1501492675107-47cf4d66f6f1`, `photo-1519225421980-715cb0215aed`, `photo-1416879595882-3373a0480b5b`, `photo-1441974231531-c6227db76b6e`
   - Assign them round-robin to the 16 slugs (slug `i` gets `PHOTO_IDS[i % 16]`).
2. For each product: download the image with `fetch`, verify `content-type` starts with `image/` and the body length is > 10 KB; if it fails, try the next photo id in the list; if all fail, skip (leave `image_url` null).
3. Upload to the bucket via the Storage REST API:

```bash
curl -X POST "$URL/storage/v1/object/product-images/<slug>.jpg" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: image/jpeg" \
  --data-binary @<downloaded-file>
```

4. Update the row via the REST API:

```bash
curl -X PATCH "$URL/rest/v1/products?slug=eq.<slug>" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"image_url": "'"$URL"'/storage/v1/object/public/product-images/<slug>.jpg"}'
```

5. Ensure the bucket exists first (create with `POST /storage/v1/bucket` `{"id": "product-images", "name": "product-images", "public": true}`).

The script must use `node --experimental-fetch` (Node 24 has global fetch — plain `node` is fine) and print one line per product: `slug → ok <url>` or `slug → skipped`.

Run it: `node scripts/upload-product-photos.mjs`
Expected: each of the 16 slugs either prints `ok` with a public URL or `skipped`.

- [ ] **Step 10: Push the migration and verify live data**

Run: `supabase db push` (apply `004_product_images.sql` to the live project; answer any prompt with `y`).
Then verify:
`curl -s "$URL/rest/v1/products?select=slug,image_url" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"` — every slug shows either a `https://.../storage/v1/object/public/product-images/...` URL or `null`, and no row errors.
Also verify one public URL actually serves an image: `curl -sI "<first image_url>" | head -3` should return `200` and `content-type: image/jpeg`.

- [ ] **Step 11: Run the tests + typecheck**

Run: `npx vitest run tests/components/ProductVisual.test.tsx tests/domain/catalog-repository.test.ts && npx tsc --noEmit`
Expected: both new tests PASS; typecheck clean. Then `npx vitest run` for the full suite (122 pass, 1 known env-guard failure).

- [ ] **Step 12: Commit**

```bash
git add supabase/migrations/004_product_images.sql supabase/seed.sql scripts/upload-product-photos.mjs features/catalog features/cart components/ui/ProductVisual.tsx tests/domain/catalog-repository.test.ts tests/components/ProductVisual.test.tsx
git commit -m "feat: product photo pipeline — image_url column, storage bucket, photo-capable visuals"
```

---

### Task 3: Admin Product Editor — Image URL Field

**Files:**
- Modify: `features/admin/catalog-validation.ts`
- Modify: `features/admin/catalog-actions.ts`
- Modify: `components/admin/ProductForm.tsx`
- Modify: `tests/domain/catalog-actions.test.ts`, `tests/domain/catalog-validation.test.ts`
- Modify: `features/i18n/dictionaries.ts` (one new key ×3 locales)

**Interfaces:**
- Consumes: `SaveProductInput` from Task 3's own edits; `products.image_url` from Task 2.
- Produces: `SaveProductInput.imageUrl: string`; `saveProduct` writes `image_url`; `ProductForm` field `imageUrl`.

- [ ] **Step 1: Extend the failing tests**

In `tests/domain/catalog-validation.test.ts`, add:

```ts
it('accepts an empty or valid image URL', () => {
  expect(validateProductInput(validInputWith({ imageUrl: '' }))).toBeNull();
  expect(validateProductInput(validInputWith({ imageUrl: 'https://example.com/a.jpg' }))).toBeNull();
  expect(validateProductInput(validInputWith({ imageUrl: 'not a url' }))).toBe('invalid_image_url');
});
```

Read the file first to match its existing `validInputWith` helper (or build the base input inline if no helper exists — repeat the full base object if needed).

In `tests/domain/catalog-actions.test.ts`, after the existing save assertions, add an assertion that a product saved with `imageUrl: 'https://example.com/rose.jpg'` inserts `image_url: 'https://example.com/rose.jpg'` into the products table. (Read the file first to match its fake-client shape; assert on the captured insert payload.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/domain/catalog-validation.test.ts tests/domain/catalog-actions.test.ts`
Expected: FAIL — `imageUrl` is not part of `SaveProductInput` and `image_url` is not in the insert row.

- [ ] **Step 3: Add `imageUrl` to validation**

In `features/admin/catalog-validation.ts`:
- Add `imageUrl: string;` to `SaveProductInput`.
- Add `const IMAGE_URL_PATTERN = /^https?:\/\/.+/;`
- Add to `validateProductInput`: `if (input.imageUrl && !IMAGE_URL_PATTERN.test(input.imageUrl)) return 'invalid_image_url';`

- [ ] **Step 4: Write `image_url` in saveProduct**

In `features/admin/catalog-actions.ts`, `toProductRow` — add `image_url: input.imageUrl || null,`.

- [ ] **Step 5: Add the form field**

In `components/admin/ProductForm.tsx`:
- Add `imageUrl: ''` to the `initial ?? { ... }` default object.
- Add a `Field` after the `deliveryCopy` field:

```tsx
<Field id="imageUrl" label={t('imageUrl')} className="span-two" type="url" value={product.imageUrl} onChange={(e) => patch({ imageUrl: e.target.value })} placeholder="https://…" />
```

- [ ] **Step 6: Add the dictionary key**

In `features/i18n/dictionaries.ts`, add to all three locale objects (after the existing admin-form keys):
- en: `imageUrl: 'Image URL (optional)'`
- ar: `imageUrl: 'رابط الصورة (اختياري)'`
- fr: `imageUrl: 'URL de l’image (optionnel)'`

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run tests/domain/catalog-validation.test.ts tests/domain/catalog-actions.test.ts tests/domain/i18n-dictionary.test.ts && npx tsc --noEmit`
Expected: all PASS (i18n-dictionary test enforces the new key in every locale), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add features/admin/catalog-validation.ts features/admin/catalog-actions.ts components/admin/ProductForm.tsx features/i18n/dictionaries.ts tests/domain/catalog-validation.test.ts tests/domain/catalog-actions.test.ts
git commit -m "feat: image URL field in the admin product editor"
```

---

### Task 4: Storefront Redesign

**Files:**
- Modify: `app/globals.css` (hero, header, footer, product grid/card, product detail, cart, checkout, order, chat)
- Modify: `app/page.tsx` (hero photo + editorial strip photos), `components/layout/SiteHeader.tsx` (rounded cart badge), `features/catalog/ProductCard.tsx` (pass `imageUrl`), `components/layout/SiteFooter.tsx` (attribution line)

**Interfaces:**
- Consumes: `Product.imageUrl` (Task 2), tokens (Task 1).
- Produces: restyled storefront; `HERO_IMAGE_URL` constant exported from `app/page.tsx`? No — keep it a local constant in `app/page.tsx`.

- [ ] **Step 1: Pass imageUrl through the product card**

In `features/catalog/ProductCard.tsx`, add `imageUrl={product.imageUrl}` to its `<ProductVisual compact ... />`.

- [ ] **Step 2: Restyle the hero, header, and footer in `globals.css`**

Apply these replacements in `app/globals.css` (keep every other existing rule):

```css
/* header — surface bar with rounded brand */
.site-header { width: min(calc(100% - 3rem), var(--content-max)); margin: 0 auto; padding: 1.25rem 0; display: flex; align-items: center; justify-content: space-between; gap: 2rem; }
.brand-mark { font: 1.75rem var(--font-display); letter-spacing: -.02em; color: var(--color-brand); }
.site-header nav { display: flex; align-items: center; gap: 1.25rem; font-size: var(--text-sm); }
.cart-link span { min-width: 1.4rem; height: 1.4rem; display: grid; place-items: center; border-radius: var(--radius-pill); background: var(--color-brand); color: var(--color-surface); font-size: .7rem; }

/* hero — photo-led */
.hero-section { width: min(calc(100% - 3rem), var(--content-max)); margin: 0 auto; min-height: 620px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .85fr); align-items: center; gap: 5rem; padding: 2rem 0 5rem; }
.hero-visual { position: relative; border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-soft); }
.hero-visual .product-visual-photo { min-height: 520px; }

/* footer attribution */
.site-footer { width: min(calc(100% - 3rem), var(--content-max)); margin: auto; padding: 2rem 0; border-top: 1px solid var(--color-border); display: flex; justify-content: space-between; gap: 2rem; color: var(--color-ink-muted); font-size: var(--text-sm); }

/* product cards — rounded photos, hover lift */
.product-card { min-width: 0; transition: transform .2s ease, box-shadow .2s ease; }
.product-card:hover { transform: translateY(-3px); }
.product-card .product-visual { min-height: 270px; border-radius: var(--radius-md); overflow: hidden; }
.product-card h3 { margin: .25rem 0 0; color: var(--color-ink); font: 1.6rem var(--font-display); line-height: 1.1; }

/* catalog toolbar — rounded controls */
.catalog-toolbar { display: grid; grid-template-columns: minmax(14rem, 2fr) repeat(3, 1fr); gap: 1rem; padding: 1.5rem 0; }
.catalog-toolbar .field select, .catalog-toolbar .field input { border-radius: var(--radius-pill); }

/* product detail — rounded hero photo */
.product-detail .product-visual { min-height: 600px; border-radius: var(--radius-lg); overflow: hidden; }
.product-detail-copy h1 { margin: .5rem 0 1rem; color: var(--color-ink); font: clamp(2.5rem, 6vw, 4.5rem) var(--font-display); line-height: .95; letter-spacing: -.02em; }
.product-price { margin: 1.5rem 0; color: var(--color-brand); font-size: 1.2rem; font-weight: 700; }

/* cart lines — rounded thumbnails */
.cart-line .product-visual { min-height: 130px; border-radius: var(--radius-md); overflow: hidden; }
.cart-line-copy h3 { margin: .2rem 0; color: var(--color-ink); font: 1.6rem var(--font-display); }

/* page headings */
.page-heading h1 { max-width: 12ch; margin: .5rem 0 1rem; color: var(--color-ink); font: clamp(2.5rem, 6vw, 4.5rem) var(--font-display); line-height: .95; letter-spacing: -.02em; }

/* chat widget — rose, rounded */
.chat-launcher { width: 3.25rem; height: 3.25rem; border: 0; border-radius: 50%; background: var(--color-brand); color: var(--color-surface); box-shadow: var(--shadow-soft); cursor: pointer; font-size: 1.3rem; }
.chat-panel { width: min(22rem, calc(100vw - 2rem)); overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-soft); }
.chat-panel-header { display: flex; justify-content: space-between; align-items: center; padding: .85rem 1rem; background: var(--color-brand); color: var(--color-surface); }
.chat-message { max-width: 90%; margin: 0; padding: .55rem .9rem; border-radius: var(--radius-pill); font-size: var(--text-sm); }
.chat-message-user { justify-self: end; background: var(--color-brand-soft); }
.chat-message-assistant { justify-self: start; background: var(--color-surface-muted); }
.chat-form button { border: 0; padding: .55rem .9rem; border-radius: var(--radius-pill); background: var(--color-brand); color: var(--color-surface); cursor: pointer; }
```

- [ ] **Step 3: Photo-led home page**

In `app/page.tsx`:
- Add a module-level constant above the component:

```tsx
const HERO_IMAGE_URL = 'https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=1400&q=80&auto=format&fit=crop';
```

- Replace the hero `<ProductVisual tone="#d19a82" ... />` with `<ProductVisual tone="#d19a82" imageUrl={HERO_IMAGE_URL} label="Fresh bouquet hero photo" />`.
- Replace the three mini-visuals with the first three uploaded bucket photos. Read the live `image_url` values with one curl (see Task 2 Step 10) and inline the three URLs as constants:

```tsx
const MINI_IMAGES = ['<bucket-url-1>', '<bucket-url-2>', '<bucket-url-3>'];
```

Then map them: `{MINI_IMAGES.map((url) => <ProductVisual key={url} compact tone="#6f8b73" imageUrl={url} label="Botanical photo" />)}`

- [ ] **Step 4: Footer attribution**

In `components/layout/SiteFooter.tsx`, add a line under the tagline paragraph: `<p>{t('photoCredit')}</p>` and add the dictionary key ×3 locales in `features/i18n/dictionaries.ts`:
- en: `photoCredit: 'Photos from Unsplash'`
- ar: `photoCredit: 'الصور من Unsplash'`
- fr: `photoCredit: 'Photos d’Unsplash'`

- [ ] **Step 5: Verify — typecheck, tests, screenshots**

Run: `npx tsc --noEmit && npx vitest run` (122 pass, 1 env-guard failure).

Start the dev server (background): `npm run dev` (or reuse a running one). Take screenshots with headless Chrome:

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless --disable-gpu --screenshot=/d/Next.js_Projects/rosette/.superpowers/redesign/home.png --window-size=1440,2400 http://localhost:3000/
"$CHROME" --headless --disable-gpu --screenshot=/d/Next.js_Projects/rosette/.superpowers/redesign/shop.png --window-size=1440,2400 http://localhost:3000/shop
"$CHROME" --headless --disable-gpu --screenshot=/d/Next.js_Projects/rosette/.superpowers/redesign/product.png --window-size=1440,2400 http://localhost:3000/shop/rose-hour
```

Inspect each PNG (open or use `--dump-dom` spot checks): hero shows the bouquet photo, cards show rounded photo tiles, no layout overflow, text is legible. If a page looks broken, fix the CSS and re-shoot. Note: home/shop may need a saved destination cookie to show the CTA — for screenshots, add `--cookie="rosette.destination.v1=%7B%22countryCode%22%3A%22EG%22%2C%22cityCode%22%3A%22alexandria%22%7D"` to the home screenshot command.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/page.tsx components/layout/SiteHeader.tsx components/layout/SiteFooter.tsx features/catalog/ProductCard.tsx features/i18n/dictionaries.ts
git commit -m "feat: fresh-florist storefront redesign — photo-led hero, rounded cards, rose chat"
```

---

### Task 5: Admin Redesign — Sidebar Shell, Dashboard Cards, Tables

**Files:**
- Create: `components/admin/AdminShell.tsx`
- Modify: all 8 admin pages (`app/admin/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/[id]/page.tsx`, `app/admin/products/page.tsx`, `app/admin/products/new/page.tsx`, `app/admin/products/[id]/page.tsx`, `app/admin/inventory/page.tsx`, `app/admin/delivery/page.tsx`) — wrap content in `AdminShell`
- Modify: `app/globals.css` (admin nav/table/stat styles)
- Modify: `app/admin/page.tsx` (stat cards markup)

**Interfaces:**
- Consumes: `getServerT()` from `@/features/i18n/server` (already used on every admin page), tokens from Task 1.
- Produces: `<AdminShell>{children}</AdminShell>` — a server-compatible shell rendering a sidebar nav (desktop) / top bar (mobile) with localized links and sign-out.

- [ ] **Step 1: Write the AdminShell component**

Create `components/admin/AdminShell.tsx` (server component — no `'use client'`):

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { signOut } from '@/features/auth/actions';
import { getServerT } from '@/features/i18n/server';

const NAV_ITEMS = [
  { href: '/admin', key: 'adminDashboard' },
  { href: '/admin/orders', key: 'orders' },
  { href: '/admin/products', key: 'products' },
  { href: '/admin/inventory', key: 'inventory' },
  { href: '/admin/delivery', key: 'deliveryRules' },
] as const;

export async function AdminShell({ children }: { children: ReactNode }) {
  const { t } = await getServerT();
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <span className="brand-mark">Rosette</span>
      <nav aria-label="Admin navigation">
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className="admin-nav-link">{t(item.key)}</Link>)}
      </nav>
      <form action={signOut}><Button type="submit">{t('signOut')}</Button></form>
    </aside>
    <main className="admin-content">{children}</main>
  </div>;
}
```

- [ ] **Step 2: Add the admin layout CSS**

In `app/globals.css`, add:

```css
.admin-shell { display: grid; grid-template-columns: 15rem minmax(0, 1fr); min-height: 100vh; }
.admin-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 1.5rem; padding: 1.5rem; background: var(--color-surface); border-inline-end: 1px solid var(--color-border); }
.admin-sidebar nav { display: grid; gap: .35rem; }
.admin-nav-link { padding: .6rem .8rem; border-radius: var(--radius-sm); color: var(--color-ink-muted); transition: background .2s ease, color .2s ease; }
.admin-nav-link:hover { background: var(--color-brand-soft); color: var(--color-brand); }
.admin-content { padding: 2.5rem max(2rem, calc((100vw - var(--content-max)) / 2)); min-width: 0; }
.admin-table { display: grid; gap: .75rem; }
.admin-table .status-message { display: flex; flex-wrap: wrap; gap: .5rem 1.5rem; align-items: baseline; }
.admin-table .status-message strong { color: var(--color-ink); }
.admin-table .status-message span { color: var(--color-ink-muted); font-size: var(--text-sm); }
.admin-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; margin-bottom: 2rem; }
@media (max-width: 800px) {
  .admin-shell { grid-template-columns: 1fr; }
  .admin-sidebar { position: static; height: auto; flex-direction: row; align-items: center; flex-wrap: wrap; border-inline-end: 0; border-bottom: 1px solid var(--color-border); }
  .admin-sidebar nav { display: flex; flex-wrap: wrap; gap: .35rem; }
  .admin-sidebar form { margin-inline-start: auto; }
  .admin-content { padding: 1.5rem 1rem; }
}
```

- [ ] **Step 3: Wrap the admin pages in AdminShell**

For each of the 8 admin pages: remove the existing `<main className="content-frame">…</main>` wrapper and wrap the inner content in `<AdminShell>…</AdminShell>`. Each page already calls `getServerT()` and `getCurrentAdmin()` — keep those; the `AdminShell` handles nav + sign-out. Remove the now-duplicated `signOut` form and the `nav.admin-links` from `app/admin/page.tsx` (AdminShell replaces them).

- [ ] **Step 4: Dashboard stat cards**

In `app/admin/page.tsx`, replace the `<div className="admin-table">` stat block with:

```tsx
<div className="admin-stats">
  <article className="status-message"><strong>{t('awaitingFulfillment')}</strong><span>{stats.awaitingFulfillment}</span><Link href="/admin/orders">{t('openOrders')}</Link></article>
  <article className="status-message"><strong>{t('revenueToday')}</strong><span>{egp(stats.revenueTodayMinor)}</span></article>
  <article className="status-message"><strong>{t('revenueAllTime')}</strong><span>{egp(stats.revenueAllTimeMinor)}</span></article>
</div>
```

- [ ] **Step 5: Verify — typecheck, tests, live render check**

Run: `npx tsc --noEmit && npx vitest run` (122 pass, 1 env-guard failure).

Live check with an authenticated admin session. The admin session is a Supabase auth cookie (`sb-auth-token`) set by `signInWithPassword` on the `/login` page. Sign in programmatically with a one-off script (`scripts/admin-render-check.mjs`, delete after use) that:

1. Reads `NEXT_PUBLIC_SUPABASE_URL` + `ADMIN_EMAIL` + `ADMIN_PASSWORD` from `.env.local` (the credentials used earlier in this project — the admin user created in the setup runbook; if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are not in `.env.local`, ask the owner for them).
2. Creates a browser supabase client (`createClient(url, anonKey, { auth: { persistSession: false } })` with the anon key from `.env.local`) and calls `supabase.auth.signInWithPassword({ email, password })`.
3. Reads the `sb-auth-token` from the returned session (the cookie value is `base64<json>.<sig>` — with `@supabase/ssr` the cookie is the raw `data.session` encoded; simplest: use `@supabase/ssr`'s `createServerClient` against a running dev server, or extract `sb-auth-token` the way the earlier sessions did — if the earlier `admin-fr-check.mjs` pattern exists in git history (`git log -p --all -- .superpowers/sdd/2026-08-18-french-localization/admin-fr-check.mjs`), copy it).
4. Fetches `http://localhost:3000/admin` with `Cookie: sb-auth-token=<token>` (plus the `rosette.locale` cookie for a localized pass) and asserts the HTML contains `admin-sidebar`, `Admin navigation`, and the sidebar link labels.

Expected: the fetch returns 200 (not a redirect to `/login`), the HTML contains the sidebar markup and localized labels. If the dev server is not running, start it first (`npm run dev` in the background).

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminShell.tsx app/admin app/globals.css
git commit -m "feat: admin redesign — sidebar shell, stat cards, rounded tables"
```

---

### Task 6: RTL Pass, Final Verification, Whole-Branch Review

**Files:**
- Verify: all redesigned pages; fix any RTL regressions in `app/globals.css`
- Modify: nothing unless the RTL pass finds a regression

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a verified, reviewed branch.

- [ ] **Step 1: RTL verification**

Start the dev server (or reuse). Set the Arabic locale cookie and screenshot the key pages:

```bash
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless --disable-gpu --screenshot=/d/Next.js_Projects/rosette/.superpowers/redesign/home-ar.png --window-size=1440,2400 --cookie="rosette.locale=ar" http://localhost:3000/
"$CHROME" --headless --disable-gpu --screenshot=/d/Next.js_Projects/rosette/.superpowers/redesign/shop-ar.png --window-size=1440,2400 --cookie="rosette.locale=ar" http://localhost:3000/shop
```

Check: layout mirrors correctly (no clipped text, sidebar/header alignment sane, product cards right-aligned), Arabic font renders (not fallback boxes). Fix any hardcoded `left`/`right`/`margin-left`-style regressions with logical properties.

Also screenshot one French page (`--cookie="rosette.locale=fr"`) to confirm Fraunces/Inter render.

- [ ] **Step 2: Full verification suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: typecheck clean, lint clean, 122 pass + 1 known env-guard failure.

- [ ] **Step 3: Whole-branch review against the spec**

Walk the spec section by section:
1. Palette values match the spec table exactly (grep `--color-brand:` etc. in `app/globals.css`).
2. Radius values match (`--radius-sm: 10px` etc.).
3. Fonts loaded via `next/font/google` only; `:lang(ar)` override present.
4. `products.image_url` exists in the live DB; bucket `product-images` public; all 16 slugs have a URL or placeholder works.
5. Storefront pages photo-led (home hero, shop cards, product detail, cart thumbs).
6. Admin has sidebar shell + stat cards + rounded tables.
7. Footer attribution line present.
8. RTL screenshots look correct.
9. No route/behavior changes: `git diff origin/master --stat` shows only CSS/components/data-layer files + the migration + scripts — no route files beyond wrappers.

- [ ] **Step 4: Commit any RTL fixes (if Step 1 found any)**

```bash
git add app/globals.css
git commit -m "fix: RTL alignment pass on the fresh-florist redesign"
```

If no fixes were needed, skip this step.

- [ ] **Step 5: Final summary**

Report: what changed per task, verification evidence (test counts, screenshots, live bucket check), any rulings made, and the commit list. Offer to sync and push.
