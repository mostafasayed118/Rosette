# shadcn/ui Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled CSS design system with shadcn/ui components on Tailwind CSS v4, migrate all page-layout classes to Tailwind utilities, and add dark mode — preserving the fresh-florist identity.

**Architecture:** Tailwind v4 (`@tailwindcss/postcss`) + shadcn/ui components (Radix primitives) themed by mapping the existing fresh-florist CSS custom properties into shadcn's semantic tokens via `@theme inline`. Legacy classes are retired incrementally per task so every commit stays visually whole. A client `ThemeProvider` (mirroring the existing `I18nProvider` localStorage+cookie pattern) toggles a `.dark` class on `<html>`.

**Tech Stack:** Tailwind CSS v4, shadcn/ui (new-york style, RSC), Radix UI, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `next/font` (unchanged), Vitest + Testing Library, Next.js 16 (Turbopack).

**Spec:** `docs/superpowers/specs/2026-08-18-shadcn-adoption-design.md` — the plan argues from the spec; executors read both.

## Global Constraints

- **Fonts stay on `next/font`** with the existing variable names (`--font-display`, `--font-body`, `--font-arabic`) — the `html[lang='ar']` Cairo switch and the `LayoutFonts` test must keep passing untouched.
- **No route changes, no behavior changes, no data-model changes.** Styling/layout only.
- **Logical properties only** (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`) — never hardcoded `left`/`right`; Arabic RTL must stay correct.
- **Tests assert roles/accessible names, not classes** — the only class-asserting test is `LayoutFonts` (next/font vars), which must not change.
- **`ProductVisual` stays a custom component** (photo + gradient-bloom fallback); migrate its markup to utilities but keep its public props/className API.
- **New runtime deps limited to** Tailwind, Radix, and shadcn's standard companions (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`).
- **Retire a legacy class only when the last usage is migrated** — grep before deleting from `globals.css`.
- `npm run lint` = `tsc --noEmit`; tests = `npx vitest run` (the 1 known env-guard failure in `server-env.test.ts` is by design).

---

### Task 1: Foundation — Tailwind v4, shadcn config, theme tokens, ThemeProvider

**Files:**
- Modify: `package.json` (add devDeps)
- Create: `postcss.config.mjs`, `components.json`, `lib/utils.ts`, `features/theme/ThemeProvider.tsx`, `tests/components/ThemeProvider.test.tsx`
- Modify: `app/globals.css` (prepend Tailwind + theme blocks; keep all legacy rules for now), `app/layout.tsx` (wrap `ThemeProvider`, add `suppressHydrationWarning`)

**Interfaces:**
- Produces: `ThemeProvider` (client, wraps children), `useTheme()` → `{ theme: 'light' | 'dark'; setTheme: (t: 'light' | 'dark') => void }`, theme tokens in `globals.css` (`--color-background`, `--color-primary`, `--color-sage`, `--radius-*`, `--font-sans`, `--font-display`), `cn()` helper in `lib/utils.ts`.

- [ ] **Step 1: Install Tailwind v4**

```bash
npm install -D tailwindcss @tailwindcss/postcss
```

- [ ] **Step 2: Create PostCSS config**

`postcss.config.mjs`:
```js
const config = { plugins: { '@tailwindcss/postcss': {} } };
export default config;
```

- [ ] **Step 3: Create `components.json` and `lib/utils.ts`**

`components.json` (new-york style, RSC, Tailwind v4 — no `tailwind.config` file):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true, "prefix": "" },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" }
}
```

`lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 4: Rewrite the top of `app/globals.css` — Tailwind + theme blocks**

Prepend this to `app/globals.css` (keep every legacy rule below it for now — they retire in Tasks 2–6):
```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

@theme inline {
  --font-sans: var(--font-body);
  --font-display: var(--font-display);

  --color-background: var(--color-canvas);
  --color-foreground: var(--color-ink);
  --color-card: var(--color-surface);
  --color-card-foreground: var(--color-ink);
  --color-popover: var(--color-surface);
  --color-popover-foreground: var(--color-ink);
  --color-primary: var(--color-brand);
  --color-primary-foreground: var(--color-surface);
  --color-secondary: var(--color-surface-muted);
  --color-secondary-foreground: var(--color-ink);
  --color-muted: var(--color-surface-muted);
  --color-muted-foreground: var(--color-ink-muted);
  --color-accent: var(--color-brand-soft);
  --color-accent-foreground: var(--color-brand-hover);
  --color-destructive: var(--color-danger);
  --color-destructive-foreground: var(--color-surface);
  --color-sage: var(--color-accent);
  --color-success: var(--color-success);
  --color-warning: var(--color-warning);
  --color-border: var(--color-border);
  --color-input: var(--color-border);
  --color-ring: var(--color-brand);

  --radius-sm: 10px;
  --radius-md: 13px;
  --radius-lg: 16px;
  --radius-xl: 22px;
  --radius-2xl: 24px;
}

.dark {
  --color-canvas: #1a211e;
  --color-surface: #232a26;
  --color-surface-muted: #2c3530;
  --color-ink: #ece7df;
  --color-ink-muted: #a8a296;
  --color-brand: #d96a8e;
  --color-brand-hover: #e582a2;
  --color-brand-soft: #3a2430;
  --color-accent: #8fa98d;
  --color-border: #333d38;
  --color-success: #5f9c74;
  --color-warning: #c79a5a;
  --color-danger: #e06a5c;
}
```

Notes: `@theme inline` inlines `var(--font-display)` at the utility site, so `html[lang='ar'] { --font-display: var(--font-arabic) }` (already in the file) keeps switching Arabic to Cairo. `--color-sage` maps the legacy green accent (`var(--color-accent)` = `#6f8f6d`) so eyebrows/delivery notes keep their sage color after `--color-accent` becomes brand-soft in the shadcn mapping.

- [ ] **Step 5: Write the failing ThemeProvider test**

`tests/components/ThemeProvider.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/features/theme/ThemeProvider';

function Probe() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = 'rosette.theme=; path=/; max-age=0';
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });
  afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove('dark'); });

  it('defaults to system preference and flips the html class', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('light');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('restores a saved preference from localStorage', () => {
    window.localStorage.setItem('rosette.theme.v1', 'dark');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the choice and mirrors it to a cookie', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    await user.click(screen.getByRole('button'));
    expect(window.localStorage.getItem('rosette.theme.v1')).toBe('dark');
    expect(document.cookie).toContain('rosette.theme=dark');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/components/ThemeProvider.test.tsx`
Expected: FAIL — `ThemeProvider` module not found.

- [ ] **Step 7: Implement ThemeProvider**

`features/theme/ThemeProvider.tsx` — mirrors `features/i18n/I18nProvider.tsx` exactly (same storage-key pattern, cookie mirror, useEffect wiring):
```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'rosette.theme.v1';
type Theme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const setTheme = (next: Theme) => {
    setThemeState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.cookie = `rosette.theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  };
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') { setThemeState(saved); return; }
    const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    setThemeState(prefersDark ? 'dark' : 'light');
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const value = { theme, setTheme };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used inside ThemeProvider'); return value; }
```

- [ ] **Step 8: Wire ThemeProvider into the root layout**

`app/layout.tsx` — import `ThemeProvider`, wrap it around `I18nProvider`, and add `suppressHydrationWarning` to `<html>` (the `dark` class is applied client-side):
```tsx
return <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${inter.variable} ${cairo.variable}`}><body><ThemeProvider><I18nProvider><CartProvider>{children}</CartProvider><ChatWidget whatsappNumber={getOptionalServerEnv('WHATSAPP_BUSINESS_NUMBER')} /></I18nProvider></ThemeProvider></body></html>;
```

- [ ] **Step 9: Verify foundation**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; `ThemeProvider` tests pass; `LayoutFonts` still passes (font vars untouched); only the known env-guard fails.

Restart the dev server (new PostCSS pipeline + package changes require it):
```bash
PID=$(netstat -ano | grep ':3000' | grep LISTENING | awk '{print $5}' | head -1); [ -n "$PID" ] && taskkill //PID $PID //F; npx next dev &  # background
```
Then verify the page still renders (legacy CSS intact) and no server errors:
`curl -s http://localhost:3000/ | grep -c 'Rosette'` → non-zero.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json postcss.config.mjs components.json lib/utils.ts features/theme app/layout.tsx app/globals.css tests/components/ThemeProvider.test.tsx
git commit -m "feat: tailwind v4 + shadcn theme foundation with dark-mode ThemeProvider"
```

---

### Task 2: shadcn component inventory + core UI swaps

**Files:**
- Create: `components/ui/{button,card,input,textarea,label,badge,table,skeleton,dialog,sheet,checkbox,radio-group,select,separator,tooltip,sidebar,switch,dropdown-menu,progress,sonner}.tsx` (via CLI), `tests/components/Button.test.tsx`
- Modify: `components/ui/Button.tsx`, `components/ui/Field.tsx`, `components/ui/Modal.tsx`, `components/ui/StatusMessage.tsx` (shadcn-based rewrites, same public APIs), `app/globals.css` (retire `.button*`, `.modal*`, `.field*`, `.field-error`, `.status-message*` rules)

**Interfaces:**
- Consumes: `cn()` from Task 1; theme tokens from Task 1.
- Produces: `Button` (same `ButtonHTMLAttributes` + `className` API, shadcn variants), `Field` (`{ label, error, id, ...inputProps }`), `Modal` (`{ title, children, onClose }`), `StatusMessage` (`{ title, children?, tone }`). All call sites keep compiling unchanged.

- [ ] **Step 1: Add the component inventory via the shadcn CLI**

```bash
npx shadcn@latest add button card input textarea label badge table skeleton dialog sheet checkbox radio-group select separator tooltip sidebar switch dropdown-menu progress sonner -y
```
Expected: components written to `components/ui/`, `lib/utils.ts` confirmed, Radix + `lucide-react` + `tw-animate-css` deps installed. If the CLI prompts, it is safe to accept defaults (detected framework: Next.js; RSC: yes).

- [ ] **Step 2: Replace Button with the shadcn button (same API)**

`components/ui/Button.tsx` — delete the legacy `.button` wrapper, keep the component name and `ButtonHTMLAttributes` signature so all ~27 call sites compile unchanged:
```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-6 py-2',
        sm: 'h-9 rounded-full px-4',
        lg: 'h-12 rounded-full px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
```
Note: keep `type` defaulting to `'button'` (the current component renders a plain `<button>` and call sites pass `type="submit"` explicitly — never change default form behavior).

- [ ] **Step 3: Write the Button test**

`tests/components/Button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with the default variant classes and text', () => {
    render(<Button>Buy now</Button>);
    const btn = screen.getByRole('button', { name: 'Buy now' });
    expect(btn.className).toContain('bg-primary');
  });

  it('renders an outline variant when requested', () => {
    render(<Button variant="outline">Cancel</Button>);
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('border-input');
  });
});
```

- [ ] **Step 4: Replace Field with Label + Input composition**

`components/ui/Field.tsx` — same props; label now associates via `htmlFor` (Testing Library's `getByLabelText` keeps working):
```tsx
import type { InputHTMLAttributes } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string };

export function Field({ id, label, error, className = '', ...props }: FieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const errorId = `${fieldId}-error`;
  return (
    <div className={`grid gap-1.5 ${className}`}>
      <Label htmlFor={fieldId}>{label}</Label>
      <Input id={fieldId} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? <small id={errorId} className="text-sm text-destructive">{error}</small> : null}
    </div>
  );
}
```

- [ ] **Step 5: Replace Modal with the shadcn Dialog (same API)**

`components/ui/Modal.tsx`:
```tsx
'use client';
import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ModalProps = { title: string; children: ReactNode; onClose: () => void };

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
```
The `DialogContent` renders its own close button (X) that triggers `onClose` via `onOpenChange`.

- [ ] **Step 6: Replace StatusMessage with a Card-style surface (same API)**

`components/ui/StatusMessage.tsx`:
```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatusMessageProps = { title: string; children?: ReactNode; tone?: 'neutral' | 'error' | 'success' };

export function StatusMessage({ title, children, tone = 'neutral' }: StatusMessageProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-2xl border bg-card p-6 shadow-sm',
        tone === 'error' && 'border-destructive/40 bg-destructive/5',
        tone === 'success' && 'border-success/40 bg-success/5',
      )}
    >
      <strong>{title}</strong>
      {children ? <p className="mt-1 text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}
```
The `role="alert"` on error keeps the login page's hydration-fixed status-message test behavior intact.

- [ ] **Step 7: Retire the swapped legacy classes**

In `app/globals.css`, delete: `.button`, `.button:hover`, `.button:focus-visible`, `.modal`, `.modal-backdrop`, `.modal-heading` (if present), `.field`, `.field > span`, `.field input/select/textarea` + focus rules, `.field textarea`, `.field-error`, `.status-message` + `.status-error` + `.status-success` + `.status-message p`, and the `.request-note`/`.added-note`/`.choice` rules **only if no longer used** (they are used by checkout/product pages — those retire in Task 4; keep them here).
Run `grep -rn "className=\"[^\"]*button\|class=\"button\|status-message\|className=\"field\|className=\"modal" app features components --include="*.tsx" | grep -v "ui/"` first and keep any class still referenced.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; new Button test passes; all existing component tests still pass (they query by role/name, and `Field` labels still associate). Only the known env-guard fails.

- [ ] **Step 9: Commit**

```bash
git add components/ui app/globals.css tests/components/Button.test.tsx package.json package-lock.json lib
git commit -m "feat: adopt shadcn components, swap Button/Field/Modal/StatusMessage"
```

---

### Task 3: Storefront layout — header, home, shop, catalog

**Files:**
- Modify: `components/layout/SiteHeader.tsx` (utilities + theme toggle), `components/layout/SiteFooter.tsx`, `components/layout/LanguageToggle.tsx`, `app/page.tsx`, `app/shop/page.tsx`, `features/catalog/ProductCard.tsx`, `features/catalog/CatalogGrid.tsx`, `features/catalog/CatalogToolbar.tsx`, `app/globals.css` (retire migrated classes)

**Interfaces:**
- Consumes: `useTheme()` (Task 1), `Button`/`Card`/`Badge`/`Input`/`Select` (Task 2).
- Produces: theme toggle button in `SiteHeader` (sun/moon `lucide-react` icons, `aria-label="Toggle theme"`).

- [ ] **Step 1: Add the theme toggle to SiteHeader**

`SiteHeader` is a client component (uses `useI18n` + `CartProvider`). Add:
```tsx
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/features/theme/ThemeProvider';
// inside the component:
const { theme, setTheme } = useTheme();
// next to the existing language toggle:
<button type="button" className="text-ink-muted" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
</button>
```

- [ ] **Step 2: Migrate the layout classes to utilities — mapping table**

Convert markup per this table (page-level classes on the root `<div>` of each page), then delete the corresponding rules from `globals.css`:

| Legacy class | Tailwind utilities |
|---|---|
| `.page-shell` | `flex min-h-screen flex-col` (each page root) |
| `.site-header` | `mx-auto flex w-[min(calc(100%-3rem),80rem)] items-center justify-between gap-8 py-5` (mobile: add `flex-wrap` via `max-md:flex-wrap`) |
| `.brand-mark` | `font-display text-3xl tracking-tight text-primary` |
| `.site-header nav` | `flex items-center gap-5 text-sm` |
| `.header-destination`, `.text-button`, `.language-toggle` | `bg-transparent p-0 text-sm text-muted-foreground` / `.language-toggle` → `text-xs font-bold text-primary` |
| `.cart-link` | `flex items-center gap-2`; count badge → `grid h-6 w-6 min-w-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground` |
| `.hero-section` | `mx-auto grid w-[min(calc(100%-3rem),80rem)] min-h-[620px] grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] items-center gap-20 py-8 pb-20 max-md:grid-cols-1 max-md:gap-8 max-md:pt-4` |
| `.hero-copy h1` | `mt-2 mb-6 max-w-[10ch] font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.06em] text-primary` |
| `.hero-copy > .lede` | `max-w-[34rem]` |
| `.eyebrow` | `text-xs font-bold uppercase tracking-[.16em] text-sage` |
| `.lede` | `max-w-[42rem] text-[1.1rem] text-muted-foreground` |
| `.hero-visual` | `relative overflow-hidden rounded-2xl shadow-lg`; photo min-height → `min-h-[520px]` on the inner visual |
| `.hero-caption` | `flex justify-between pt-3 text-xs uppercase tracking-[.1em] text-muted-foreground` |
| `.editorial-strip` | `mx-auto grid w-[min(calc(100%-3rem),80rem)] grid-cols-2 gap-12 border-t py-16 pb-24 max-md:grid-cols-1` |
| `.editorial-strip h2` | `mt-2 font-display text-5xl leading-none tracking-[-.04em] text-primary` |
| `.mini-visuals` | `grid grid-cols-3 gap-4` |
| `.site-footer` | `mx-auto flex w-[min(calc(100%-3rem),80rem)] justify-between gap-8 border-t py-8 text-sm text-muted-foreground max-md:flex-col` |
| `.footer-links` | `flex flex-wrap items-start gap-5` |
| `.content-frame` | `mx-auto w-[min(calc(100%-3rem),80rem)] py-12 pb-24 max-md:w-[min(calc(100%-2rem),80rem)] max-md:pt-4` |
| `.page-heading` | `flex items-end justify-between gap-8 border-b py-8 pb-12 max-md:flex-col max-md:items-start`; h1 → `font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]` |
| `.catalog-toolbar` | `grid grid-cols-[minmax(14rem,2fr)_repeat(3,1fr)] gap-4 py-6 max-md:grid-cols-2`; search spans full width on tablet → `max-md:col-span-2` on the search field |
| `.product-grid` | `grid grid-cols-4 gap-6 max-lg:grid-cols-2 max-sm:grid-cols-1` |
| `.product-card` | `group min-w-0 transition-transform hover:-translate-y-1` |
| `.product-card .product-visual` | `overflow-hidden rounded-2xl`; visual min-height → `min-h-[270px]` |
| `.product-card-copy` | `mt-4 flex items-baseline justify-between gap-3` |
| `.product-card h3` | `font-display text-2xl leading-tight` |
| `.product-card p:not(.eyebrow)` | `mt-2.5 mb-3 text-sm text-muted-foreground` |
| `.product-card strong` | `whitespace-nowrap text-sm font-bold text-primary` |
| `.delivery-note` | `text-xs text-sage` |
| `.inline-link` | `text-primary underline underline-offset-4` |

- [ ] **Step 3: Migrate ProductCard to Card + Badge**

`features/catalog/ProductCard.tsx` — keep the exact same props and accessible content; wrap in `<Card className="group overflow-hidden">`, image area `<CardContent className="p-0">` with `ProductVisual`, copy in `<CardContent className="pt-4">`:
```tsx
<Card className="group overflow-hidden transition-transform hover:-translate-y-1">
  <div className="overflow-hidden rounded-none">
    <ProductVisual product={product} compact className="min-h-[270px] w-full" />
  </div>
  <CardContent className="pt-4">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-display text-2xl leading-tight">{label}</h3>
      <strong className="whitespace-nowrap text-sm text-primary">{price}</strong>
    </div>
    <p className="mt-2.5 mb-3 text-sm text-muted-foreground">{description}</p>
    <p className="text-xs text-sage">{deliveryNote}</p>
  </CardContent>
</Card>
```
(`ProductVisual`'s own legacy classes retire in Task 4; its `className` prop passes through to its wrapper so `min-h`/rounded overrides still apply.)

- [ ] **Step 4: Migrate home, shop, catalog toolbar, footer, language toggle**

- `app/page.tsx` (hero + destination card + editorial strip): `Card` for the destination card, `Button` for CTA, `Input` for the phone field — same labels/ids, utility layout per the table.
- `app/shop/page.tsx` + `CatalogGrid`: utility grid per table; keep filter state logic untouched.
- `CatalogToolbar.tsx`: `Input` (search) + `Select` (category/sort) with pill styling (`rounded-full`), `aria-label`s preserved.
- `SiteFooter.tsx` + `LanguageToggle.tsx`: utility layout per table; the footer photo attribution stays.

- [ ] **Step 5: Retire the migrated classes from globals.css**

Delete the rules for every class listed in Step 2's table (grep first — `.text-button` is still used by checkout/login, keep its rule until Task 4). Also delete the now-dead responsive blocks that only targeted these classes (the `.product-grid` media queries, `.site-header` media overrides, `.hero-*` overrides, `.editorial-strip`/`.site-footer` overrides).

- [ ] **Step 6: Verify storefront renders**

Run: `npx tsc --noEmit && npx vitest run` (only the env-guard fails).
Screenshots (dev server running, restart if needed):
```bash
mkdir -p .superpowers/sdd/2026-08-18-shadcn-adoption
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --window-size=1440,900 --screenshot="C:/d/Next.js_Projects/rosette/.superpowers/sdd/2026-08-18-shadcn-adoption/home-t3.png" "http://localhost:3000/" 2>/dev/null
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --window-size=1440,900 --screenshot="C:/d/Next.js_Projects/rosette/.superpowers/sdd/2026-08-18-shadcn-adoption/shop-t3.png" "http://localhost:3000/shop" 2>/dev/null
```
DOM evidence: `curl -s http://localhost:3000/shop | grep -c "object-cover\|rounded"` → non-zero (Tailwind classes present).

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/shop/page.tsx features/catalog app/globals.css components/layout
git commit -m "feat: migrate storefront header/home/shop to tailwind utilities + shadcn cards"
```

---

### Task 4: Storefront pages — product detail, cart, checkout, order, track, login, chat

**Files:**
- Modify: `components/ui/ProductVisual.tsx`, `features/product/ProductDetail.tsx`, `features/cart/CartLineItem.tsx`, `features/cart/CartSummary.tsx`, `features/cart/CartPageContent.tsx`, `app/cart/page.tsx`, `app/checkout/page.tsx`, `features/checkout/CheckoutForm.tsx`, `app/orders/[id]/page.tsx`, `features/order/OrderPageContent.tsx`, `features/order/OrderTimeline.tsx`, `app/track/page.tsx`, `app/login/page.tsx`, `features/chat/ChatWidget.tsx`, `app/globals.css` (retire remaining storefront classes)

**Interfaces:**
- Consumes: `Input`/`Textarea`/`Select`/`Checkbox`/`RadioGroup`/`Card`/`Badge` (Task 2), `Field`/`Button`/`StatusMessage` (Tasks 2), utility patterns from Task 3.
- Produces: `ProductVisual` with utility-based markup (same props: `product`, `compact?`, `className?`).

- [ ] **Step 1: Migrate ProductVisual to utilities**

`components/ui/ProductVisual.tsx` — keep the photo + gradient-bloom fallback behavior and the `role="img"` + `aria-label` wrapper (tests assert it); replace the legacy classes:
- photo path: wrapper `relative overflow-hidden grid place-items-center rounded-2xl` with `min-h` from `compact`/`className`; `<img className="absolute inset-0 h-full w-full object-cover" loading="lazy" />`
- fallback path: `relative grid place-items-center overflow-hidden rounded-2xl` with inline `background: color-mix(in srgb, var(--visual-tone) 25%, var(--color-surface))`, bloom glyph + stem as absolutely-positioned elements (keep the ✦ glyph, `text-primary`).

- [ ] **Step 2: Migrate product detail page**

`features/product/ProductDetail.tsx` + `app/shop/[slug]/page.tsx` per table:
- `.product-detail` → `grid grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-20 py-12 max-md:grid-cols-1 max-md:gap-8`
- h1 → `font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[.95] tracking-[-.02em]`
- `.product-description` → `text-[1.1rem] text-muted-foreground`; `.product-price` → `my-6 text-lg font-bold text-primary`
- `.choice` pill-cards → `RadioGroup`/`Checkbox` inside `<Label>`-wrapped pill divs: `flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent`
- `.added-note` → `rounded-xl bg-accent p-4 text-primary`; `.back-link` → `text-sm text-primary underline underline-offset-4`

- [ ] **Step 3: Migrate cart + checkout**

- `CartLineItem.tsx`: `.cart-line` → `grid grid-cols-[130px_1fr_auto] gap-4 border-b py-4 max-md:grid-cols-[90px_1fr]`; `.quantity-control` → `grid justify-items-end gap-1.5 text-xs text-muted-foreground` with `Input type="number"` (keep `aria-label`); copy h3 → `font-display text-2xl`.
- `CartSummary.tsx`/`CartPageContent.tsx`: `.cart-aside` → `sticky top-4 self-start rounded-2xl border bg-card p-6 shadow-sm max-md:static`; `.cart-summary` rows → `flex justify-between gap-4 py-2`; `.summary-total` → `mt-3 border-t pt-4 font-bold text-primary`; `.demo-disclosure` → `text-xs text-muted-foreground`.
- `CheckoutForm.tsx`: `.checkout-form` → `grid max-w-[60rem] gap-6 pt-8`; `.form-section` → `grid gap-4 border-b py-6`; `.form-grid` → `grid grid-cols-2 gap-4 max-md:grid-cols-1`; `.span-two` → `col-span-2 max-md:col-span-1`; `.auth-card` → `mx-auto grid max-w-[34rem] gap-5 rounded-2xl border bg-card p-8 shadow-sm` (login too).
- Keep every `name`/`id`/`aria-label` — validation and tests depend on them.

- [ ] **Step 4: Migrate order, track, login pages**

- `OrderPageContent.tsx`: `.order-layout` → `grid grid-cols-[minmax(0,1fr)_minmax(260px,0.6fr)] gap-20 py-12 max-md:grid-cols-1`; `.order-card` → `self-start rounded-2xl border bg-card p-6 shadow-sm`; `.order-item` → `flex justify-between gap-4 border-b py-3 text-sm`; h1 → `font-display text-[clamp(3rem,6vw,6rem)] leading-[.9] tracking-[-.06em] text-primary`.
- `OrderTimeline.tsx`: `.order-timeline` → `my-8 grid list-none p-0`; `.timeline-step` → `flex min-h-12 items-center gap-3 text-muted-foreground`; dot → `h-3.5 w-3.5 rounded-full border-2 border-border bg-background`; `.complete` → `font-bold text-primary` with `border-primary bg-primary` dot.
- `app/track/page.tsx` + `app/login/page.tsx`: `.center-state` → `mx-auto grid min-h-[70vh] w-[min(calc(100%-3rem),80rem)] place-content-center justify-items-start`; h1 → `max-w-[12ch]`; login `.status-message` stays `StatusMessage` (already swapped in Task 2); any `.text-button`/`.back-link` on login → `text-sm text-primary underline underline-offset-4`.
- `.request-note` (checkout) → `mb-4 rounded-xl bg-accent p-3 text-sm text-primary`.

- [ ] **Step 5: Migrate the chat widget**

`features/chat/ChatWidget.tsx` — keep the fixed launcher + panel state machine and all `aria-label`s:
- `.chat-widget` → `fixed bottom-5 z-20 grid justify-items-end gap-3 end-5`
- `.chat-launcher` → `grid h-13 w-13 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg` (`h-13 w-13` = `3.25rem`; use `h-[3.25rem] w-[3.25rem]` if the utility isn't generated)
- `.chat-panel` → `w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border bg-card shadow-xl`
- `.chat-panel-header` → `flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground`
- `.chat-message` → `max-w-[90%] rounded-full px-3.5 py-2 text-sm`; user → `justify-self-end bg-accent`; assistant → `justify-self-start bg-secondary`
- `.chat-form` → `flex gap-2 border-t p-3` with `Input` + `Button size="sm"`

- [ ] **Step 6: Retire the remaining storefront classes**

Delete from `globals.css`: `.product-visual*`, `.visual-*`, `.product-detail*`, `.product-description`, `.product-price`, `.customization-form`, `fieldset`/`legend` overrides, `.choice*`, `.added-note`, `.back-link`, `.cart-*`, `.quantity-control`, `.cart-aside`, `.cart-summary*`, `.summary-total`, `.demo-disclosure`, `.auth-card`, `.checkout-form`, `.form-section`, `.form-grid`, `.span-two`, `.order-*`, `.timeline-*`, `.center-state`, `.chat-*`, `.request-note`, `.text-button`, `.destination-*` (home destination card), plus the RTL overrides for `.product-card-copy`, `.cart-summary div`, `.order-item`, `.cart-line-copy`, `.product-detail-copy`, `.hero-caption` (logical utilities replace them).
Run `grep -rn "className=\"[^\"]*\(product-visual\|cart-line\|chat-\|order-\|timeline-\|choice\|span-two\)" app features components --include="*.tsx"` first — anything still referenced must be migrated or kept.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx vitest run` — all component tests pass (they use roles/names, unchanged). Screenshots at desktop + mobile width:
```bash
for p in "shop" "cart" "checkout" "login" "track"; do
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --window-size=1440,900 --screenshot="C:/d/Next.js_Projects/rosette/.superpowers/sdd/2026-08-18-shadcn-adoption/$p-t4.png" "http://localhost:3000/$p" 2>/dev/null
done
SLUG=$(curl -s http://localhost:3000/shop | grep -o '/shop/[a-z0-9-]*' | head -1)
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --window-size=1440,900 --screenshot="C:/d/Next.js_Projects/rosette/.superpowers/sdd/2026-08-18-shadcn-adoption/product-t4.png" "http://localhost:3000$SLUG" 2>/dev/null
```
Spot-check `curl -s http://localhost:3000/cart | grep -c "rounded"` > 0 (Tailwind present, no server errors).

- [ ] **Step 8: Commit**

```bash
git add app/cart app/checkout app/orders app/shop app/track app/login features/product features/cart features/checkout features/order features/chat components/ui/ProductVisual.tsx app/globals.css
git commit -m "feat: migrate product/cart/checkout/order/chat storefront pages to shadcn + utilities"
```

---

### Task 5: Admin migration — Sidebar shell, tables, forms

**Files:**
- Create: `components/admin/AppSidebar.tsx` (client)
- Modify: `components/admin/AdminShell.tsx` (server, renders `SidebarProvider` + `AppSidebar` + `SidebarInset`), `app/admin/page.tsx`, `app/admin/orders/page.tsx`, `app/admin/orders/[id]/page.tsx`, `app/admin/products/page.tsx`, `app/admin/products/new/page.tsx`, `app/admin/products/[id]/page.tsx`, `app/admin/inventory/page.tsx`, `app/admin/delivery/page.tsx`, `components/admin/ProductForm.tsx`, `app/globals.css` (retire `.admin-*` classes)

**Interfaces:**
- Consumes: `useI18n` NOT used here — AdminShell stays a server component so nav labels come from `getServerT()` (cookie locale). `AppSidebar` is a client component receiving plain props.
- Produces: `AppSidebar({ items }: { items: { href: string; label: string; icon: LucideIcon }[] })`; `AdminShell({ children })` same signature as today.

- [ ] **Step 1: Write the client AppSidebar**

`components/admin/AppSidebar.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export function AppSidebar({ items }: { items: { href: string; label: string; icon: LucideIcon }[] }) {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader><span className="px-2 font-display text-2xl tracking-tight text-primary">Rosette</span></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)}>
                  <Link href={href}><Icon /><span>{label}</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 2: Rewrite AdminShell as a server component wrapping the sidebar**

`components/admin/AdminShell.tsx` — keeps `getServerT()` (cookie locale) for nav labels; the mobile Sheet/top-bar behavior comes from shadcn `Sidebar`:
```tsx
import type { ReactNode } from 'react';
import { Home, Package, ShoppingCart, Boxes, Truck } from 'lucide-react';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/admin/AppSidebar';
import { getServerT } from '@/features/i18n/server';

const NAV_ITEMS = [
  { href: '/admin', key: 'adminDashboard', icon: Home },
  { href: '/admin/orders', key: 'orders', icon: ShoppingCart },
  { href: '/admin/products', key: 'products', icon: Package },
  { href: '/admin/inventory', key: 'inventory', icon: Boxes },
  { href: '/admin/delivery', key: 'deliveryRules', icon: Truck },
] as const;

export async function AdminShell({ children }: { children: ReactNode }) {
  const { t } = await getServerT();
  const items = NAV_ITEMS.map((item) => ({ href: item.href, label: t(item.key), icon: item.icon }));
  return (
    <SidebarProvider>
      <AppSidebar items={items} />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ms-2" />
          <span className="font-display text-lg text-primary max-md:block">Rosette</span>
        </header>
        <main className="p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
```
The sign-out form moves into the page header area: render `<form action={signOut}>` with a `Button variant="outline" size="sm"` inside the `<header>` (right side, `ms-auto`).

- [ ] **Step 3: Migrate the dashboard stat cards**

`app/admin/page.tsx` — keep the data fetching exactly as-is; restyle output:
- `.admin-stats` → `<div className="mb-8 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">`; each stat → `<Card>` with `CardHeader`/`CardTitle`/`CardContent`, icon in `<span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary">`.
- Pipeline/fulfillment blocks → `Card` + `Progress` (`<Progress value={pct} className="h-2" />`).
- `.admin-table` low-stock list → `Table` (`TableHeader`/`TableBody`/`TableRow`/`TableCell`) with `Badge` for available counts, keeping `key={row.variant_id}`.
- Nav + sign-out removed (now in AdminShell header).

- [ ] **Step 4: Migrate the remaining admin pages**

- Orders (`app/admin/orders/page.tsx`), products list, inventory: card-styled tables → shadcn `Table` inside `Card` (`<Card><Table>…`), status cells → `Badge variant="secondary"` / rose `Badge`, action links → `Button variant="ghost" size="sm"` with `asChild`.
- Order detail (`app/admin/orders/[id]/page.tsx`): keep both `<main>` returns inside `AdminShell`; timeline → `OrderTimeline` utilities from Task 4; info cards → `Card`.
- Product form (`components/admin/ProductForm.tsx`, new + edit pages): `.field` → `Field` (already swapped), `.form-grid`/`.span-two` → utility grid, image URL + tone fields as `Input` type color/text, submit → `Button`, cancel → `Button variant="outline"`.
- Delivery rules + add-city modal (`app/admin/delivery/page.tsx`): `Modal` already swapped (Task 2); form rows → utility grid.

- [ ] **Step 5: Retire the admin legacy classes**

Delete from `globals.css`: `.admin-shell`, `.admin-sidebar`, `.admin-nav-link`, `.admin-content`, `.admin-table*`, `.admin-stats`, and the `@media (max-width: 800px)` admin overrides. Grep first: `grep -rn "admin-shell\|admin-sidebar\|admin-nav-link\|admin-content\|admin-table\|admin-stats" app features components --include="*.tsx"` — all must be migrated.

- [ ] **Step 6: Verify — typecheck, tests, live authenticated render**

Run: `npx tsc --noEmit && npx vitest run`.
Live admin check (the established mechanism from the redesign — sign in via Supabase, set the `sb-<project-ref>-auth-token` cookie as `base64-` + base64url(JSON.stringify(session)), fetch each admin route):
```bash
# script: sign in with the admin credentials, build the cookie, then for each of
# /admin /admin/orders /admin/products /admin/inventory /admin/delivery
# assert HTTP 200 and that the response contains the SidebarTrigger button + localized heading.
```
All 5 routes must return 200 with the sidebar shell markup. Also verify `/admin?locale=fr` (cookie `rosette.locale=fr`) renders French labels in the sidebar.

- [ ] **Step 7: Commit**

```bash
git add components/admin app/admin components/admin/ProductForm.tsx app/globals.css
git commit -m "feat: migrate admin to shadcn sidebar, tables, stat cards"
```

---

### Task 6: Dark-mode pass, final class sweep, full verification

**Files:**
- Modify: `app/globals.css` (final sweep — delete any remaining legacy rules; keep base element rules, RTL `html[lang='ar']` font switch, reduced-motion, `.dark` block), `tests/components/ThemeTokens.test.ts` (new), any straggler components found by the sweep

**Interfaces:**
- Consumes: everything from Tasks 1–5.

- [ ] **Step 1: Final legacy-class sweep**

```bash
grep -rnoE 'className="[^"]*"|className=\{`[^`]*`\}' app features components --include="*.tsx" | grep -oE '\.[a-z][a-z0-9-]*' | sort -u
```
Cross-check against the rules remaining in `globals.css`; migrate any stragglers to utilities, then delete every remaining legacy class rule. Keep only: the `@import`/`@custom-variant` header, `@theme inline`, `.dark` token block, `html[lang='ar']` font override, `* { box-sizing }`, `html`/`body` base (restyle body with `bg-background text-foreground font-sans` via `@apply` or keep the legacy vars), `a`/focus-visible base rules, and the `prefers-reduced-motion` rule.

- [ ] **Step 2: Dark-token content test**

`tests/components/ThemeTokens.test.ts` — reads the actual stylesheet (jsdom can't evaluate CSS; assert the source contains the tokens):
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');

describe('theme tokens', () => {
  it('defines the fresh-florist light tokens in the theme', () => {
    expect(css).toContain('--color-primary: var(--color-brand)');
    expect(css).toContain('--color-background: var(--color-canvas)');
    expect(css).toContain('--color-sage: var(--color-accent)');
  });
  it('defines dark-mode tokens', () => {
    expect(css).toContain('.dark');
    expect(css).toContain('--color-canvas: #1a211e');
    expect(css).toContain('--color-brand: #d96a8e');
  });
  it('keeps the per-locale font switch', () => {
    expect(css).toContain("html[lang='ar']");
    expect(css).toContain('--font-arabic');
  });
});
```

- [ ] **Step 3: Run the full verification suite**

Run: `npm run lint && npx vitest run` — typecheck clean; full suite passes (135 tests + ThemeProvider/Button/ThemeTokens; only the known env-guard fails).

- [ ] **Step 4: Dark + RTL + responsive screenshots**

Dark (system-preference path via Chrome's `--force-dark-mode`, which sets `prefers-color-scheme: dark` so ThemeProvider applies the `.dark` class):
```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --force-dark-mode --window-size=1440,900 --screenshot="C:/d/Next.js_Projects/rosette/.superpowers/sdd/2026-08-18-shadcn-adoption/home-dark-t6.png" "http://localhost:3000/" 2>/dev/null
```
Mobile: `--window-size=390,844` for home + shop. RTL: the storefront locale is localStorage-driven (headless can't seed it — known limitation from the redesign); verify the server-rendered admin RTL path instead by fetching `/admin` with cookies `rosette.locale=ar` + the session cookie and asserting the sidebar renders with `dir="rtl"` on `<html>` and Cairo-backed `--font-display`.
Admin dark: fetch `/admin` with the session cookie + `rosette.theme=dark` — assert the response includes `class="dark"` on `<html>` (the ThemeProvider client effect applies it post-hydration, so assert on the hydrated DOM via the admin-check script's live fetch + `dark` class presence after scripted reload if possible; otherwise rely on the unit tests + `--force-dark-mode` screenshot).

- [ ] **Step 5: Whole-branch review against the spec**

- Palette/tokens match the spec mapping (`--background` ← canvas, `--primary` ← rose `#c2456d`, `--border` ← `#e7dfd4`, `--radius` 16px family).
- Zero hardcoded `left`/`right` in new markup: `grep -rn "\bleft-\|right-\|text-left\|text-right" app features components --include="*.tsx"` → none (logical utilities only).
- Font test still green (next/font vars untouched); `ProductVisual` still photo-capable with fallback (live check: `curl -s http://localhost:3000/shop | grep -c "product-images"` > 0).
- No route/behavior files changed: `git diff --stat origin/master...HEAD` shows only styling files + the new theme/component files.
- Fetch + rebase check: `git fetch origin` — if the remote moved, rebase onto `origin/master` and re-run the suite.

- [ ] **Step 6: Commit + ledger**

```bash
git add -A
git commit -m "feat: dark-mode pass, retire remaining legacy classes, verify"
```
Update `.superpowers/sdd/2026-08-18-shadcn-adoption/progress.md` with completion notes and rulings.

---

## Self-Review Notes

- **Spec coverage:** §1 Foundation → Task 1; §2 Component inventory → Task 2; §3 Layout layer → Tasks 3–5 (mapping table); §4 Page coverage → Tasks 3–5; §5 Verification (theme test, dark tokens, screenshots light/dark EN/AR, admin auth check) → Tasks 3, 5, 6. No gaps.
- **Deviations from spec (flagged):** `sonner` is added per the spec inventory but no page wires toasts yet (available on demand); `--color-sage` extends the spec's mapping so the legacy green accent survives the `--color-accent` remap.
- **Type/name consistency:** `useTheme()`/`setTheme`/`ThemeProvider` match across Task 1, 3; `AppSidebar({ items })` matches Task 5; `Button`/`Field`/`Modal`/`StatusMessage` keep their exact public APIs in Task 2 so no call-site churn; `ProductVisual` props unchanged through Task 4.
- **CRLF:** `globals.css` and `*.tsx` are CRLF — use `str_replace` with exact strings from the files (the fresh-florist session's regex scripts failed on `\n` vs `\r\n`).
- **Known env-guard:** `tests/lib/server-env.test.ts` fails by design (requires env vars); never "fix" it.
