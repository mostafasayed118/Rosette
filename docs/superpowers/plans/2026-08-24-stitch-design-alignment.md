# Stitch Design Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Rosette storefront's global chrome and collection/product pages to full fidelity with the 13 Stitch screens, and unblock the size-variant selector via an RLS migration.

**Architecture:** Design tokens and most page structures already match the Stitch system; this pass rebuilds the two shared chrome components (header, footer), adds three static pages, fixes track-page chrome, converts the collection grid to the Stitch 3-column staggered layout, and applies an idempotent RLS migration so the anon key can read `product_variants` + `inventory` (the root cause of missing size pills).

**Tech Stack:** Next.js App Router (repo-local docs in `node_modules/next/dist/docs/` — this version has breaking changes vs. training data), Tailwind CSS v4 tokens, vitest + @testing-library/react, Playwright e2e, Supabase (PostgREST + RLS).

**Spec:** `docs/superpowers/specs/2026-08-24-stitch-design-alignment-design.md`

## Global Constraints

- Design tokens are frozen — do not touch `app/globals.css` color/font values (they already match `rosette_boutique_system/DESIGN.md`).
- All user-facing copy goes through `features/i18n/dictionaries.ts` (EN + AR + FR). No hardcoded strings in components. AR copy must be real Arabic, not transliteration.
- No emojis anywhere in UI (master prompt rule).
- Buttons/links keep ≥44px tap targets.
- RTL: new layouts must mirror cleanly (use logical properties / flex, avoid physical `left/right` where direction matters).
- Test commands: unit `npm test`, lint+typecheck `npm run lint`, e2e `npm run test:e2e`.
- The e2e global-setup reuses a running dev server on port 3210 (`http://localhost:3210` is checked first) — start one with `Start-Process cmd "/c npm run dev -- -p 3210"` from the repo root before e2e runs, or let global-setup spawn its own.
- Never access the dev server via `http://127.0.0.1` in a browser/Playwright — `allowedDevOrigins` blocks those chunks and breaks hydration. Use `http://localhost`.
- Commit after each task. Conventional commit messages, lowercase, imperative.

---

### Task 1: RLS migration — public reads for product variants and inventory

**Files:**
- Create: `supabase/migrations/022_variant_inventory_public_reads.sql`

**Interfaces:**
- Consumes: existing tables `public.product_variants`, `public.inventory` (from `supabase/migrations/001_commerce.sql`).
- Produces: anon/authenticated SELECT access to both tables. Later tasks and the existing `features/catalog/supabase-repository.ts` join (`product_variants(id,name_en,name_ar,name_fr,price_delta_minor,inventory(quantity,reserved_quantity))`) begin returning real rows.

- [ ] **Step 1: Write the migration file**

```sql
-- The storefront catalog join (features/catalog/supabase-repository.ts) reads
-- product_variants and their per-variant inventory through the anon key.
-- RLS is enabled on both tables with no SELECT policy, so anon reads return
-- zero rows and product pages render without size selectors. Grant public
-- read access; writes stay server-side (service_role bypasses RLS).
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;

drop policy if exists "public can read product variants" on public.product_variants;
create policy "public can read product variants"
  on public.product_variants for select
  using (true);

drop policy if exists "public can read inventory" on public.inventory;
create policy "public can read inventory"
  on public.inventory for select
  using (true);
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (the project is linked — `supabase/.temp` exists).
If the CLI cannot connect (missing DB password), print the file contents and instruct the user to run it in the Supabase dashboard SQL editor, then continue once they confirm.

- [ ] **Step 3: Verify the anon key now reads variants**

Run (PowerShell, from repo root):

```powershell
$envContent = Get-Content ".env.local"
$url = ($envContent | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_URL=' }) -replace '^NEXT_PUBLIC_SUPABASE_URL=',''
$anon = ($envContent | Where-Object { $_ -match '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' }) -replace '^NEXT_PUBLIC_SUPABASE_ANON_KEY=',''
$h = @{ apikey = $anon; Authorization = "Bearer $anon" }
(Invoke-RestMethod -Uri "$url/rest/v1/product_variants?select=id&limit=50" -Headers $h).Count
```

Expected: a count greater than 0 (the DB currently holds 26 variant rows). If 0, the migration did not apply — stop and fix before proceeding.

- [ ] **Step 4: Verify in the running app**

With the dev server running on port 3210, fetch `http://localhost:3210/en/cairo/shop/rose-hour` and confirm the HTML contains a size-selector legend ("Choose size") — the server-rendered product page includes it when variants exist.

Run: `Invoke-WebRequest -Uri "http://localhost:3210/en/cairo/shop/rose-hour" -UseBasicParsing | Select-Object -ExpandProperty Content | Select-String -Pattern "Choose size" -Quiet`
Expected: `True`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/022_variant_inventory_public_reads.sql
git commit -m "fix: grant anon read access to product variants and inventory so size selectors render"
```

---

### Task 2: SiteHeader rebuild — Stitch brand / center-nav / utility-cluster layout

**Files:**
- Modify: `components/layout/SiteHeader.tsx` (full rebuild, ~72 lines → ~110 lines)
- Modify: `features/i18n/dictionaries.ts` (add 4 nav keys to each of the 3 locale objects, next to the existing `shop:` key)
- Modify: `tests/components/SiteHeader.test.tsx`

**Interfaces:**
- Consumes: `useStorePath().href(path)` (prefixes `/{locale}/{city}`, passes query strings through untouched — verified in `features/i18n/use-store-path.ts:14`); existing `LanguageToggle`, `AccountNavItem`, `WishlistLink`, `useCart`, `useTheme`; shop query param `?category=vase-arrangement` (verified in `features/catalog/catalog-utils.ts:45-50`).
- Produces: exported `SiteHeader({ cityName?, cartCount? })` — same signature as today; all call sites (`(home)/page.tsx`, `cart/page.tsx`, `checkout/page.tsx`, `wishlist/page.tsx`, `shop/(list)/page.tsx`, etc.) keep compiling unchanged.

- [ ] **Step 1: Add the nav dictionary keys**

In `features/i18n/dictionaries.ts`, inside the `en` object (the one containing `shop: 'Shop the collection'`), add immediately after that key:

```ts
navCollections: 'Collections', navBespoke: 'Bespoke', navAtelier: 'Atelier', navGifts: 'Gifts',
```

Inside the `ar` object (contains `shop: 'تصفّح المجموعة'`), add after that key:

```ts
navCollections: 'المجموعات', navBespoke: 'حسب الطلب', navAtelier: 'المرسم', navGifts: 'الهدايا',
```

Inside the `fr` object (contains `shop: 'Parcourir la collection'`), add after that key:

```ts
navCollections: 'Collections', navBespoke: 'Sur mesure', navAtelier: 'Atelier', navGifts: 'Cadeaux',
```

- [ ] **Step 2: Update the failing component test**

Replace the body of `tests/components/SiteHeader.test.tsx` with:

```tsx
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from '@/components/layout/SiteHeader';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo/shop',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
import { CartProvider } from '@/features/cart/CartProvider';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import { renderWithProviders } from '../test-utils';

function renderHeader() {
  return renderWithProviders(<CartProvider><WishlistProvider><SiteHeader /></WishlistProvider></CartProvider>);
}

describe('SiteHeader', () => {
  it('renders the Stitch center nav with mapped routes', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Collections' })).toHaveAttribute('href', '/en/greater-cairo/shop');
    expect(screen.getByRole('link', { name: 'Bespoke' })).toHaveAttribute('href', '/en/greater-cairo/shop?category=vase-arrangement');
    expect(screen.getByRole('link', { name: 'Atelier' })).toHaveAttribute('href', '/en/greater-cairo/blog');
    expect(screen.getByRole('link', { name: 'Gifts' })).toHaveAttribute('href', '/en/greater-cairo/gift-cards');
  });

  it('keeps the utility cluster: bag, wishlist, language, account, theme', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: /bag/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /wishlist|saved/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
  });

  it('marks the active section with the rose underline', () => {
    renderHeader();
    const collections = screen.getByRole('link', { name: 'Collections' });
    expect(collections.className).toContain('border-primary');
    const gifts = screen.getByRole('link', { name: 'Gifts' });
    expect(gifts.className).not.toContain('border-primary');
  });

  it('opens the mobile menu with the Stitch nav items', async () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Collections' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Gifts' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/SiteHeader.test.tsx`
Expected: FAIL — "Collections" link not found (current header renders "Shop the collection").

- [ ] **Step 4: Rebuild the header**

Replace the entire contents of `components/layout/SiteHeader.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/features/cart/CartProvider';
import { WishlistLink } from '@/components/wishlist/WishlistLink';
import { LanguageToggle } from './LanguageToggle';
import { AccountNavItem } from './AccountNavItem';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { useTheme } from '@/features/theme/ThemeProvider';

type SiteHeaderProps = { cityName?: string; cartCount?: number };

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-accent" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t('toggleTheme')}>
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export function SiteHeader({ cityName, cartCount }: SiteHeaderProps) {
  const cart = useCart();
  const { t } = useI18n();
  const { locale, href } = useStorePath();
  const pathname = usePathname();
  const count = cartCount ?? (cart.ready ? cart.itemCount : 0);

  const navItems = [
    { label: t('navCollections'), path: '/shop' },
    { label: t('navBespoke'), path: '/shop?category=vase-arrangement' },
    { label: t('navAtelier'), path: '/blog' },
    { label: t('navGifts'), path: '/gift-cards' },
  ];

  function navClasses(path: string) {
    const base = href(path.split('?')[0] ?? path);
    const active = pathname === base || pathname.startsWith(`${base}/`);
    return `border-b-2 pb-1 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-on-surface hover:text-primary'}`;
  }

  const bag = (
    <Link className="flex items-center gap-2" href={href('/cart')}>{t('bag')} <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 font-mono text-xs text-primary-foreground">{count}</span></Link>
  );
  const wishlist = <WishlistLink />;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex w-[min(calc(100%-3rem),80rem)] items-center justify-between gap-4 py-4">
        <Link className="font-display text-3xl tracking-tight text-primary" href={href('/')}>Rosette</Link>
        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link key={item.path} className={navClasses(item.path)} href={href(item.path)}>{item.label}</Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 text-sm md:flex">
          {cityName ? <Link className="text-xs text-muted-foreground hover:text-primary" href={`/${locale}`}>{t('deliveringTo', { city: cityName })}</Link> : null}
          <AccountNavItem />
          {bag}
          {wishlist}
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {bag}
          {wishlist}
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-foreground hover:bg-accent" aria-label={t('menu')}><Menu className="h-5 w-5" /></button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader><SheetTitle>{t('menu')}</SheetTitle></SheetHeader>
              <nav className="grid gap-1 p-4" aria-label="Mobile navigation">
                {navItems.map((item) => (
                  <Link key={item.path} className="rounded-xl px-4 py-3 hover:bg-accent" href={href(item.path)}>{item.label}</Link>
                ))}
                <div className="rounded-xl px-4 py-3 hover:bg-accent"><AccountNavItem /></div>
                <Link className="rounded-xl px-4 py-3 text-left hover:bg-accent" href={`/${locale}`}>{cityName ? t('deliveringTo', { city: cityName }) : t('chooseDestination')}</Link>
                <div className="flex items-center justify-between rounded-xl px-2 py-2"><LanguageToggle /><ThemeToggle /></div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/SiteHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full unit suite for regressions**

Run: `npm test`
Expected: all suites pass (other tests may reference header text — if any fail on removed strings like "Shop the collection", update those assertions to the new nav labels in the same commit).

- [ ] **Step 7: Commit**

```bash
git add components/layout/SiteHeader.tsx features/i18n/dictionaries.ts tests/components/SiteHeader.test.tsx
git commit -m "feat: rebuild header to Stitch layout with Collections, Bespoke, Atelier, Gifts nav"
```

---

### Task 3: SiteFooter rebuild — Stitch full footer

**Files:**
- Modify: `components/layout/SiteFooter.tsx` (9 lines → ~45 lines)
- Modify: `features/i18n/dictionaries.ts` (7 new keys per locale)
- Create: `tests/components/SiteFooter.test.tsx`

**Interfaces:**
- Consumes: `useI18n`, `useStorePath().href`, `Link`.
- Produces: exported `SiteFooter({ locale = 'en', city = 'cairo' })` — same signature; all call sites unchanged. Footer links point at `/{locale}` (destination gate), `/{locale}/{city}/gift-cards`, `/{locale}/{city}/delivery`, `/{locale}/{city}/about`, `/{locale}/{city}/contact`, `/{locale}/{city}/privacy` (pages created in Task 4).

- [ ] **Step 1: Add the footer dictionary keys**

In the `en` object, next to the existing `footerDelivery`/`footerNotes`/`footerDemo` keys (which stay — other components may use them), add:

```ts
footerCitySelector: 'City Selector', footerGiftServices: 'Gift Services', footerShippingPolicy: 'Shipping Policy', footerOurStory: 'Our Story', footerContactUs: 'Contact Us', footerPrivacy: 'Privacy', footerCopyright: '© {year} Rosette Atelier. Crafted in Cairo.',
```

In the `ar` object:

```ts
footerCitySelector: 'اختر مدينتك', footerGiftServices: 'خدمات الهدايا', footerShippingPolicy: 'سياسة التوصيل', footerOurStory: 'قصتنا', footerContactUs: 'اتصل بنا', footerPrivacy: 'الخصوصية', footerCopyright: '© {year} روزيت أتيليه. صُنع في القاهرة.',
```

In the `fr` object:

```ts
footerCitySelector: 'Sélecteur de ville', footerGiftServices: 'Services cadeaux', footerShippingPolicy: 'Politique de livraison', footerOurStory: 'Notre histoire', footerContactUs: 'Nous contacter', footerPrivacy: 'Confidentialité', footerCopyright: '© {year} Rosette Atelier. Créé au Caire.',
```

- [ ] **Step 2: Write the failing test**

Create `tests/components/SiteFooter.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SiteFooter } from '@/components/layout/SiteFooter';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo',
}));

import { renderWithProviders } from '../test-utils';

describe('SiteFooter', () => {
  it('renders the Stitch link columns with real targets', () => {
    renderWithProviders(<SiteFooter locale="en" city="greater-cairo" />);
    expect(screen.getByRole('link', { name: 'City Selector' })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('link', { name: 'Gift Services' })).toHaveAttribute('href', '/en/greater-cairo/gift-cards');
    expect(screen.getByRole('link', { name: 'Shipping Policy' })).toHaveAttribute('href', '/en/greater-cairo/delivery');
    expect(screen.getByRole('link', { name: 'Our Story' })).toHaveAttribute('href', '/en/greater-cairo/about');
    expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/en/greater-cairo/contact');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/en/greater-cairo/privacy');
  });

  it('renders the brand column with copyright', () => {
    renderWithProviders(<SiteFooter locale="en" city="greater-cairo" />);
    expect(screen.getByText('Rosette')).toBeInTheDocument();
    expect(screen.getByText(/Rosette Atelier\. Crafted in Cairo\./)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/SiteFooter.test.tsx`
Expected: FAIL — "City Selector" link not found.

- [ ] **Step 4: Rebuild the footer**

Replace the entire contents of `components/layout/SiteFooter.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';

export function SiteFooter({ locale = 'en', city = 'cairo' }: { locale?: string; city?: string }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-outline-variant/30 bg-surface-container-low">
      <div className="mx-auto grid w-[min(calc(100%-3rem),80rem)] gap-10 py-12 text-sm md:grid-cols-[2fr_1fr_1fr] md:py-16">
        <div className="flex flex-col gap-2">
          <span className="font-display text-3xl tracking-tight text-primary">Rosette</span>
          <p className="max-w-[36ch] leading-relaxed text-on-surface-variant">{t('brandTagline')}</p>
          <p className="mt-4 font-mono text-xs tracking-[0.05em] text-on-surface-variant">{t('footerCopyright', { year })}</p>
        </div>
        <nav className="flex flex-col gap-3" aria-label="Footer">
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={`/${locale}`}>{t('footerCitySelector')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/gift-cards')}>{t('footerGiftServices')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/delivery')}>{t('footerShippingPolicy')}</Link>
        </nav>
        <nav className="flex flex-col gap-3" aria-label="Company">
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/about')}>{t('footerOurStory')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/contact')}>{t('footerContactUs')}</Link>
          <Link className="text-on-surface-variant transition-colors hover:text-primary" href={href('/privacy')}>{t('footerPrivacy')}</Link>
        </nav>
      </div>
    </footer>
  );
}
```

Note: `t('footerCopyright', { year })` — verify the `useI18n` `t` supports `{param}` interpolation the same way server `t` does (it does for `deliveringTo: 'Delivering to {city}'` — same mechanism). If the client `t` signature differs, match how `SiteHeader` calls `t('deliveringTo', { city })`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/SiteFooter.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add components/layout/SiteFooter.tsx features/i18n/dictionaries.ts tests/components/SiteFooter.test.tsx
git commit -m "feat: rebuild footer to Stitch layout with link columns and copyright"
```

---

### Task 4: Static pages — About, Contact, Privacy

**Files:**
- Create: `app/[locale]/[city]/about/page.tsx`
- Create: `app/[locale]/[city]/contact/page.tsx`
- Create: `app/[locale]/[city]/privacy/page.tsx`
- Create: `components/support/StaticPageShell.tsx` (shared chrome + editorial layout for the three pages)
- Modify: `features/i18n/dictionaries.ts` (page copy keys ×3 locales)
- Modify: `tests/e2e/rosette.playwright.test.ts` (add one navigation test)

**Interfaces:**
- Consumes: `getServerT` (`features/i18n/server`), `SiteHeader`/`SiteFooter`, `getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')` (server-only, may be absent → hide the WhatsApp row), `buildLocalizedPageMetadata` (pattern from `(home)/page.tsx:18-24`).
- Produces: routes `/[locale]/[city]/about`, `/contact`, `/privacy` used by the footer links from Task 3.

- [ ] **Step 1: Add the page copy dictionary keys**

In the `en` object add (grouped near the footer keys):

```ts
aboutTitle: 'Our Story', aboutLede: 'A small floral atelier in Cairo.', aboutBody: 'Rosette began with a simple belief: a bouquet can say what a message cannot. We hand-tie seasonal stems the day they arrive and deliver them across Egypt with care instructions and a handwritten note if you wish. Every arrangement is made to order in our studio — never pulled from a cooler.',
contactTitle: 'Contact Us', contactLede: 'We answer within a few hours, every day.', contactWhatsapp: 'Message us on WhatsApp', contactEmail: 'Email us', contactHours: 'Daily, 9am – 9pm Cairo time.',
privacyTitle: 'Privacy', privacyLede: 'What we keep, and what we never do.', privacyBody: 'We collect only what an order needs: your name, contact details, delivery address, and preferences. We never sell your data. Card payments are processed by Paymob — we store no card numbers. You may request deletion of your account data at any time by contacting us.',
```

In the `ar` object:

```ts
aboutTitle: 'قصتنا', aboutLede: 'مرسم زهور صغير في القاهرة.', aboutBody: 'بدأت روزيت بفكرة بسيطة: الباقة تقول ما تعجز عنه الرسالة. ننسّق أزهاراً موسمية يدوياً في يوم وصولها ونوصلها عبر مصر مع تعليمات عناية وبطاقة مكتوبة بخط اليد إن رغبت. كل تنسيق يُعدّ خصيصاً في المرسم — ولا يُسحب أبداً من ثلاجة.',
contactTitle: 'اتصل بنا', contactLede: 'نرد خلال ساعات قليلة، كل يوم.', contactWhatsapp: 'راسلنا على واتساب', contactEmail: 'راسلنا بالبريد', contactHours: 'يومياً، من 9 صباحاً حتى 9 مساءً بتوقيت القاهرة.',
privacyTitle: 'الخصوصية', privacyLede: 'ما نحفظه، وما لا نفعله أبداً.', privacyBody: 'نجمع فقط ما يحتاجه الطلب: اسمك وبيانات التواصل وعنوان التوصيل وتفضيلاتك. لا نبيع بياناتك أبداً. تُعالج مدفوعات البطاقات عبر Paymob — لا نحتفظ بأرقام البطاقات. يمكنك طلب حذف بيانات حسابك في أي وقت بمراسلتنا.',
```

In the `fr` object:

```ts
aboutTitle: 'Notre histoire', aboutLede: 'Un petit atelier floral au Caire.', aboutBody: 'Rosette est née d’une conviction simple : un bouquet dit ce qu’un message ne peut pas. Nous nouons à la main des fleurs de saison le jour de leur arrivée et les livrons partout en Égypte avec conseils d’entretien et mot manuscrit si vous le souhaitez. Chaque arrangement est créé à la commande dans notre atelier — jamais sorti d’une chambre froide.',
contactTitle: 'Nous contacter', contactLede: 'Nous répondons en quelques heures, chaque jour.', contactWhatsapp: 'Écrivez-nous sur WhatsApp', contactEmail: 'Écrivez-nous par e-mail', contactHours: 'Tous les jours, 9h – 21h heure du Caire.',
privacyTitle: 'Confidentialité', privacyLede: 'Ce que nous gardons, et ce que nous ne faisons jamais.', privacyBody: 'Nous collectons uniquement ce qu’une commande exige : nom, coordonnées, adresse de livraison et préférences. Nous ne vendons jamais vos données. Les paiements par carte sont traités par Paymob — nous ne stockons aucun numéro de carte. Vous pouvez demander la suppression de vos données à tout moment en nous contactant.',
```

- [ ] **Step 2: Create the shared shell**

Create `components/support/StaticPageShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';

export function StaticPageShell({ locale, city, eyebrow, title, lede, children }: {
  locale: string;
  city: string;
  eyebrow: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-[min(calc(100%-3rem),80rem)] flex-1 py-16 md:py-24">
        <article className="max-w-2xl">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-sage">{eyebrow}</span>
          <h1 className="mt-3 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[1.05] tracking-[-0.02em] text-on-surface">{title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-on-surface-variant">{lede}</p>
          <div className="mt-8 border-t border-outline-variant/30 pt-8 text-[1.05rem] leading-[1.8] text-on-surface-variant">{children}</div>
        </article>
      </main>
      <SiteFooter locale={locale} city={city} />
    </div>
  );
}
```

- [ ] **Step 3: Create the three pages**

Create `app/[locale]/[city]/about/page.tsx`:

```tsx
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';

export default async function AboutPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerOurStory')} title={t('aboutTitle')} lede={t('aboutLede')}>
      <p>{t('aboutBody')}</p>
    </StaticPageShell>
  );
}
```

Create `app/[locale]/[city]/contact/page.tsx`:

```tsx
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';
import { getOptionalServerEnv } from '@/lib/server-env';

export default async function ContactPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  const whatsapp = getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER');
  const whatsappDigits = whatsapp?.replace(/\D/g, '');
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerContactUs')} title={t('contactTitle')} lede={t('contactLede')}>
      <p>{t('contactHours')}</p>
      <div className="mt-6 flex flex-col gap-3">
        {whatsappDigits ? (
          <Link href={`https://wa.me/${whatsappDigits}`} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-on-primary-fixed-variant">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t('contactWhatsapp')}
          </Link>
        ) : null}
      </div>
    </StaticPageShell>
  );
}
```

Create `app/[locale]/[city]/privacy/page.tsx`:

```tsx
import { StaticPageShell } from '@/components/support/StaticPageShell';
import { getCityBySlug } from '@/features/destination/data';
import { getServerT } from '@/features/i18n/server';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string; city: string }> }) {
  const { locale, city } = await params;
  const { t } = await getServerT(locale);
  return (
    <StaticPageShell locale={locale} city={getCityBySlug(city)?.slug ?? city} eyebrow={t('footerPrivacy')} title={t('privacyTitle')} lede={t('privacyLede')}>
      <p>{t('privacyBody')}</p>
    </StaticPageShell>
  );
}
```

Note: `getOptionalServerEnv` — verify the exact export name in `lib/server-env.ts` first (`(home)/page.tsx:12` imports `getOptionalServerEnv`, so it exists). If `WHATSAPP_BUSINESS_NUMBER` is not exposed through that helper, read it with the same helper pattern used elsewhere for server envs.

- [ ] **Step 4: Add an e2e navigation test**

In `tests/e2e/rosette.playwright.test.ts`, inside the existing `describe` block, add:

```ts
it('renders the static pages linked from the footer', async () => {
  for (const path of ['/about', '/contact', '/privacy']) {
    await page.goto(`${getBaseUrl()}/en/cairo${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  }
});
```

- [ ] **Step 5: Run lint/typecheck and the unit suite**

Run: `npm run lint`
Expected: no type errors (the three new pages must compile against the repo's Next.js version — consult `node_modules/next/dist/docs/` if the `params` Promise pattern errors).

- [ ] **Step 6: Commit**

```bash
git add app/[locale]/[city]/about "app/[locale]/[city]/contact" "app/[locale]/[city]/privacy" components/support/StaticPageShell.tsx features/i18n/dictionaries.ts tests/e2e/rosette.playwright.test.ts
git commit -m "feat: add about, contact, and privacy pages for the Stitch footer links"
```

---

### Task 5: Track page chrome

**Files:**
- Modify: `app/[locale]/[city]/track/page.tsx` (imports + wrap, ~4 lines changed)

**Interfaces:**
- Consumes: `SiteHeader`, `SiteFooter` (same import pattern as `app/[locale]/[city]/cart/page.tsx:1-2`).
- Produces: `/[locale]/[city]/track` renders inside full site chrome.

- [ ] **Step 1: Wrap the track page in site chrome**

In `app/[locale]/[city]/track/page.tsx`:

Add imports at the top:

```tsx
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
```

Find the page's outermost returned element (a fragment or div directly inside `return`), and wrap it exactly as the cart page does:

```tsx
return (
  <div className="flex min-h-screen flex-col bg-background">
    <SiteHeader />
    <main className="flex-grow">
      {/* ...existing page content, unchanged... */}
    </main>
    <SiteFooter locale={locale} city={city} />
  </div>
);
```

Adjust to the file's actual structure: keep every existing element and prop untouched; the only change is the chrome wrapper and the two imports. The `locale` and `city` values already exist as destructured params in the component.

- [ ] **Step 2: Verify visually**

With the dev server on port 3210: `Invoke-WebRequest -Uri "http://localhost:3210/en/cairo/track" -UseBasicParsing | Select-Object -ExpandProperty Content | Select-String -Pattern "Rosette" -Quiet`
Expected: `True` (header wordmark now present), and the content contains `Track your order`.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/[city]/track/page.tsx"
git commit -m "fix: render the order tracking page inside full site chrome"
```

---

### Task 6: Collection grid — Stitch 3-column staggered layout and card face

**Files:**
- Modify: `features/catalog/CatalogGrid.tsx` (26 lines → ~20 lines)
- Modify: `features/catalog/ProductCard.tsx` (trim card face)
- Create: `tests/components/CatalogGrid.test.tsx`

**Interfaces:**
- Consumes: `Product` type (`features/catalog/types.ts:5` — has `name`, `description`, `price`, `imageUrl`, `tone`, `delivery`, `rating`), `ProductCard({ product, aspectClass?, statusPill?, imageClassName? })`.
- Produces: `CatalogGrid({ products })` — same signature (`shop/(list)/page.tsx` unchanged); `ProductCard` gains an optional `className?: string` prop (stagger hook), keeps all existing props.

- [ ] **Step 1: Write the failing test**

Create `tests/components/CatalogGrid.test.tsx`:

```tsx
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogGrid } from '@/features/catalog/CatalogGrid';
import { WishlistProvider } from '@/features/wishlist/WishlistProvider';
import type { Product } from '@/features/catalog/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en', city: 'greater-cairo' }),
  usePathname: () => '/en/greater-cairo/shop',
}));

import { renderWithProviders } from '../test-utils';

const product = (slug: string): Product => ({
  slug, name: `Bouquet ${slug}`, description: 'Soft seasonal stems', category: 'hand-bouquet',
  occasions: ['love'], price: 12500, tone: '#bc6d63', imageUrl: null, inventory: 5,
  delivery: 'Same-day in Cairo', createdAt: '2026-01-01', variants: [], addOns: [],
});

function renderGrid(products: Product[]) {
  return renderWithProviders(<WishlistProvider><CatalogGrid products={products} /></WishlistProvider>);
}

describe('CatalogGrid', () => {
  it('renders one card per product in a responsive grid', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d')]);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
  });

  it('staggers every middle-column card on desktop', () => {
    renderGrid([product('a'), product('b'), product('c'), product('d'), product('e'), product('f')]);
    const articles = screen.getAllByRole('article');
    expect(articles[1]?.className).toContain('lg:mt-16');
    expect(articles[4]?.className).toContain('lg:mt-16');
    expect(articles[0]?.className).not.toContain('lg:mt-16');
  });

  it('renders the Stitch card face: name, subtitle, price — no category eyebrow or delivery line', () => {
    renderGrid([product('a')]);
    expect(screen.getByText('Bouquet a')).toBeInTheDocument();
    expect(screen.getByText('Soft seasonal stems')).toBeInTheDocument();
    expect(screen.getByText(/EGP/)).toBeInTheDocument();
    expect(screen.queryByText(/hand bouquet/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/CatalogGrid.test.tsx`
Expected: FAIL — no `lg:mt-16` stagger; category eyebrow ("Hand bouquet") currently renders.

- [ ] **Step 3: Rebuild the grid**

Replace the entire contents of `features/catalog/CatalogGrid.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { StatusMessage } from '@/components/ui/status-message';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useStorePath } from '@/features/i18n/use-store-path';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

const ASPECTS = ['aspect-[4/5]', 'aspect-square', 'aspect-[4/5]'] as const;

export function CatalogGrid({ products }: { products: Product[] }) {
  const { t } = useI18n();
  const { href } = useStorePath();
  if (products.length === 0) return <StatusMessage title={t('emptyTitle')}>{t('emptyHint')} <Link className="text-primary underline underline-offset-4" href={href('/shop')}>{t('resetCollection')}</Link>.</StatusMessage>;
  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-12 lg:grid-cols-3">
      {products.map((product, index) => (
        <ProductCard
          key={product.slug}
          product={product}
          aspectClass={ASPECTS[index % 3]}
          className={index % 3 === 1 ? 'lg:mt-16' : ''}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Trim the ProductCard face and add the stagger prop**

In `features/catalog/ProductCard.tsx`:

Change the props type and signature (add `className`):

```tsx
type ProductCardProps = {
  product: Product;
  aspectClass?: string;
  statusPill?: { label: string; variant: 'sage' | 'neutral' } | null;
  imageClassName?: string;
  className?: string;
};

export function ProductCard({ product, aspectClass = 'aspect-[3/4]', statusPill, imageClassName, className = '' }: ProductCardProps) {
```

Change the outer `<article>` to merge the new prop:

```tsx
    <article className={`product-card stagger-item group cursor-pointer ${className}`}>
```

Replace the entire card-face `<Link>` block (currently lines 53-61, from `<Link href={href(`/shop/${product.slug}`)} className="mt-4 flex items-start justify-between gap-4">` through its closing `</Link>`) with:

```tsx
      <Link href={href(`/shop/${product.slug}`)} className="mt-4 flex items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block font-display text-[22px] leading-tight text-on-surface transition-colors group-hover:text-primary">{name}</span>
          <span className="mt-1 block truncate text-sm text-on-surface-variant">{description}</span>
        </span>
        <span className="price shrink-0 text-sm font-semibold text-on-surface">{t('from')} {formatMoney(product.price, locale)}</span>
      </Link>
```

This removes the category eyebrow (`categoryMessageKeys`), the delivery sentence, and the `max-w-[24ch]` wrapping in favor of a single-line truncate. Keep the rating line (line 62) and everything inside the image container unchanged. The `categoryMessageKeys` import becomes unused — remove it from the import list.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/components/CatalogGrid.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: pass. If wishlist/account tests asserted on the removed card-face lines, update those assertions to the new face in the same commit.

- [ ] **Step 7: Commit**

```bash
git add features/catalog/CatalogGrid.tsx features/catalog/ProductCard.tsx tests/components/CatalogGrid.test.tsx
git commit -m "feat: convert collection to Stitch 3-column staggered grid with trimmed card face"
```

---

### Task 7: Trust-row icon contrast on product detail

**Files:**
- Modify: `features/product/ProductDetail.tsx:123-126`

**Interfaces:**
- Consumes/Produces: nothing new — visual-only change to the trust row.

- [ ] **Step 1: Bump icon weight and label contrast**

In `features/product/ProductDetail.tsx`, replace the trust-row block (the `grid grid-cols-3` section around lines 123-126):

```tsx
        <div className="grid grid-cols-3 gap-6 border-t border-outline-variant/20 pt-6">
          <span className="flex flex-col items-center gap-2 text-center"><Truck className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeSameDay')}</span></span>
          <span className="flex flex-col items-center gap-2 text-center"><Flower2 className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeHandTied')}</span></span>
          <span className="flex flex-col items-center gap-2 text-center"><Droplets className="h-8 w-8 text-secondary" strokeWidth={1.75} /><span className="text-xs leading-tight text-on-surface-variant">{t('badgeCare')}</span></span>
        </div>
```

(Change from the current: `h-7 w-7` → `h-8 w-8` and add `strokeWidth={1.75}`; labels keep `text-on-surface-variant`.)

- [ ] **Step 2: Lint and commit**

Run: `npm run lint`
Expected: clean.

```bash
git add features/product/ProductDetail.tsx
git commit -m "style: raise trust-row icon weight on product detail to Stitch contrast"
```

---

### Task 8: E2E regression pass and visual verification

**Files:**
- Modify: `tests/e2e/rosette.playwright.test.ts` (add header/footer/size-pill assertions)
- No production code expected — fix forward if the capture reveals small deviations.

**Interfaces:**
- Consumes: everything built in Tasks 1-7.
- Produces: green e2e suite + a fresh set of audit screenshots compared against the 13 Stitch screens.

- [ ] **Step 1: Add e2e assertions for the new chrome and size pills**

In `tests/e2e/rosette.playwright.test.ts`, inside the existing `describe`, add:

```ts
it('shows the Stitch header nav and full footer on the storefront', async () => {
  await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: 'domcontentloaded' });
  for (const name of ['Collections', 'Bespoke', 'Atelier', 'Gifts']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});

it('renders the size selector once variants are readable', async () => {
  await page.goto(`${getBaseUrl()}/en/cairo/shop/rose-hour`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/choose size/i)).toBeVisible();
});

it('renders the tracking page inside site chrome', async () => {
  await page.goto(`${getBaseUrl()}/en/cairo/track`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('contentinfo')).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e suite**

Start a dev server if none is running (global-setup reuses it):

```powershell
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev -- -p 3210" -WorkingDirectory "D:\Next.js_Projects\rosette" -WindowStyle Hidden
```

Run: `npm run test:e2e`
Expected: all tests pass, including the pre-existing purchase flow. If the size-pill test fails, revisit Task 1 Step 3 (anon read verification).

- [ ] **Step 3: Re-capture all audit screenshots**

Write a capture script to `.audit-capture.mjs` in the repo root (delete it after), reusing the audit approach: Playwright chromium, viewport 1440×900, `http://localhost:3210`, routes `/en`, `/en/cairo`, `/en/cairo/shop`, `/en/cairo/shop/rose-hour`, `/en/cairo/track`, `/en/cairo/gift-cards`, `/en/cairo/checkout`, `/en/cairo/wishlist`. For each route: `goto` with `waitUntil: 'networkidle'`, then scroll to the bottom and back (`page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))`, wait 800ms, scroll back, wait 400ms) so lazy images resolve, then `page.screenshot({ fullPage: true })` into `C:/Users/ASUS/AppData/Local/Temp/opencode/rosette-audit2/`.

- [ ] **Step 4: Compare against the Stitch screens side-by-side**

For each captured screenshot, open it next to its screen PNG in `stitch_rosette_floral_e_commerce_system/<screen>/screen.png` and check: header structure (wordmark left, 4 center links, utility right), footer columns, collection 3-column stagger, size pills present, track-page chrome. Note any deviation that is a *layout* gap (not imagery/content).

- [ ] **Step 5: Fix small deviations found in Step 4**

Apply minimal fixes for any layout-level deviations (spacing, alignment, order). Re-run the affected unit tests plus `npm run lint`. If a deviation would require new scope beyond small fixes, stop and report instead of expanding scope.

- [ ] **Step 6: Final gate and cleanup**

Run: `npm run lint && npm test`
Expected: clean.
Delete `.audit-capture.mjs`. Commit any fix-forward changes:

```bash
git add -A
git commit -m "fix: address visual deviations from the Stitch screen comparison"
```

(Only commit if there are changes; `git status` must be clean of temp files before finishing.)
