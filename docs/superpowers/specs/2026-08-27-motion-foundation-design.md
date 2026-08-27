# Motion Foundation — Design Spec

**Date:** 2026-08-27
**Sub-project:** 1 of 4 (Motion Foundation) — part of the broader "do all animation feedback" effort
**Status:** Approved via brainstorming, pending written-spec review

---

## 1. Context

The Rosette e-commerce app (Next.js 16.3.1, React 19, Tailwind v4, Supabase) currently has no motion library, no loading-state animations on async-action buttons, and no micro-interaction primitives. `sonner` is already wired for toasts, and `tw-animate-css` is installed for CSS animations.

User has requested comprehensive "animation feedback for all operations" across the app. That request is too large for a single spec, so it is decomposed into four sub-projects. **This document covers only Sub-project 1: Motion Foundation** — the primitives and APIs the other three sub-projects depend on.

The other three sub-projects will be spec'd separately:
- **Sub-project 2** — Forms & critical actions (wire `useAsyncAction` into ~25 async-action components)
- **Sub-project 3** — Cart, checkout, product, catalog (commerce-flow-specific motion)
- **Sub-project 4** — Polish & micro-interactions (page transitions, scroll reveals, etc.)

---

## 2. Goals

1. Provide a single, opinionated hook (`useAsyncAction`) that every async-action component in the app can use to communicate loading / success / error to the user.
2. Provide a set of motion-enabled UI primitives (`AnimatedButton`, `Spinner`, `SpinnerOverlay`, `MotionCard`, `MotionSkeleton`, `PageTransition`) that match existing shadcn/ui conventions.
3. Respect `prefers-reduced-motion: reduce` site-wide via a single root-level `MotionConfig`, plus a CSS-layer override for non-Framer animations.
4. Provide an in-account "Reduce motion" toggle for users who want to disable motion beyond the OS preference.
5. Establish motion design tokens (durations, easings, springs) as a single source of truth.

## 3. Non-Goals

- No per-feature wiring (cart, checkout, auth, account, etc.) — Sub-project 2+
- `PageTransition` ships now but is only mounted in routes in Sub-project 4
- No scroll-reveal animations
- No list-reorder animations
- No image-zoom / carousel transitions
- No theme-toggle animation
- No new design tokens beyond motion timing vars and `--motion-success`
- No SSR streaming-skeleton changes (Next.js `loading.tsx` files)

---

## 4. Architecture & File Layout

### New files

**`components/motion/`** — the new primitives
- `MotionProvider.tsx` — root-level `MotionConfig` wrapper
- `AnimatedButton.tsx` — drop-in upgrade of `Button` with state animations
- `Spinner.tsx` — Lucide-based spinner, 4 sizes
- `SpinnerOverlay.tsx` — semi-transparent full-section loader
- `MotionCard.tsx` — hover-lift wrapper for `Card`
- `MotionSkeleton.tsx` — shimmer upgrade of `Skeleton`
- `PageTransition.tsx` — `AnimatePresence` wrapper for routes
- `index.ts` — barrel export

**`hooks/`**
- `useAsyncAction.ts` — opinionated async-action hook (auto-toast)
- `useReducedMotion.ts` — re-export of motion's hook for call-site consistency

**`lib/motion/`**
- `tokens.ts` — durations, easings, springs
- `variants.ts` — shared Framer Motion variants

**`components/account/`**
- `ReduceMotionToggle.tsx` — new toggle in account preferences

**`lib/supabase/`** or `features/account/` — wire the `reduce_motion` user-pref field. (Exact path decided during implementation; flag for review.)

### Modified files

- `package.json` — add `framer-motion` dependency
- `components/ui/skeleton.tsx` — re-export `MotionSkeleton` (backwards-compatible)
- `app/layout.tsx` — wrap children in `MotionProvider`
- `app/globals.css` — add `@media (prefers-reduced-motion: reduce) { animation: none !important; }` override and `--motion-success` CSS var
- Supabase migration or schema patch — add `reduce_motion` boolean to user-prefs table

### Untouched

Everything else until Sub-projects 2–4. This includes `components/ui/button.tsx` — `AnimatedButton` is additive, not a replacement.

---

## 5. `useAsyncAction` API

The spine hook. Every async-action component will use this.

### Type signature

```ts
type Action<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

type UseAsyncActionOptions<TArgs, TResult> = {
  action: Action<TArgs, TResult>;
  successMessage?: string | ((result: TResult) => string);
  errorMessage?: string | ((err: unknown) => string);
  silentSuccess?: boolean;
  silentError?: boolean;
  onSuccess?: (result: TResult) => void;
  onError?: (err: unknown) => void;
  onSettled?: () => void;
};

type UseAsyncActionReturn<TArgs, TResult> = {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown | null;
  reset: () => void;
};
```

### Behavior

| Phase | State | Side effects |
|---|---|---|
| `idle` | `isPending=false`, `isSuccess=false`, `isError=false` | — |
| `run()` invoked | `isPending=true` | `run` returns the in-flight promise |
| action resolves | `isSuccess=true` for 1.5s | `successMessage` toast (unless `silentSuccess`); `onSuccess(result)` |
| action rejects | `isError=true` for 1.5s, `error` populated | `errorMessage(err)` toast (unless `silentError`); `onError(err)` |
| after 1.5s settle window | flags reset to idle | `onSettled()` |
| `reset()` called manually | flags reset immediately | — |

### Re-entrancy

While `isPending` is `true`, subsequent `run()` calls are **ignored** (no-op). The first call wins. This prevents double-submit on impatient clicks.

### Concurrency semantics

`run()` returns the in-flight promise. If the caller awaits it, they get the result on resolve or `undefined` on reject (errors are caught internally and surfaced via toast/state, not thrown to the caller). This avoids try/catch boilerplate at every call site.

### Example usage

```tsx
const { run, isPending, isSuccess, isError } = useAsyncAction({
  action: cancelRequest,
  successMessage: "Cancellation submitted",
  errorMessage: (e) => `Couldn't cancel: ${formatError(e)}`,
  onSuccess: () => router.refresh(),
});

return (
  <AnimatedButton
    onClick={() => run(req.id)}
    loading={isPending}
    success={isSuccess}
    error={isError}
  >
    Cancel
  </AnimatedButton>
);
```

---

## 6. Primitive Components

### `MotionProvider`

```tsx
"use client";
import { MotionConfig } from "motion/react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}>
      {children}
    </MotionConfig>
  );
}
```

This is the **single point** that honors `prefers-reduced-motion` for all Framer Motion components. When the user has reduced motion enabled, all `motion.*` durations become ~0.

Also mounted with `data-motion-root` attribute for E2E tests.

### `AnimatedButton`

Wraps `components/ui/button.tsx`. Pass-through props (`variant`, `size`, `asChild`, all native button props).

New props:
- `loading?: boolean` — shows spinner, dimmed, `disabled`
- `success?: boolean` — green checkmark, scale pulse
- `error?: boolean` — shake animation, red flash

The caller passes these explicitly from `useAsyncAction`'s returned booleans (e.g., `loading={isPending} success={isSuccess} error={isError}`). `AnimatedButton` itself does not call `useAsyncAction` — it stays a pure presentational component, so it works with any async pattern, not just the hook.

State precedence: `loading` > `success` > `error` > `disabled` > `idle`.

Animations (all via Framer Motion `motion.create(Button)`):

| State | Animation |
|---|---|
| hover | `whileHover={{ scale: 1.02 }}` (200ms) |
| press | `whileTap={{ scale: 0.97 }}` (150ms) |
| focus | `whileFocus={{ scale: 1.01 }}` — visible alternative to mouse hover |
| loading | icon swap → spinner, label slot fades to "…" or custom loading text via `loadingText` prop |
| success | `animate={{ scale: [1, 1.05, 1] }}` (keyframes), green color flash |
| error | `animate={{ x: [-8, 8, -6, 6, -3, 3, 0] }}` (shake, 400ms), red color flash |

### `Spinner`

```tsx
import { Loader2Icon } from "lucide-react";

type SpinnerProps = {
  size?: "sm" | "md" | "lg" | "xl"; // size-3 / 4 / 6 / 8
  className?: string;
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return <Loader2Icon role="status" aria-label="Loading" className={cn("animate-spin", sizeMap[size], className)} />;
}
```

`animate-spin` already exists in `tw-animate-css` (installed). Color inherits from `currentColor`.

### `SpinnerOverlay`

```tsx
export function SpinnerOverlay({ children }: { children?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <Spinner size="lg" />
      {children}
    </div>
  );
}
```

Used for full-section loading (e.g., checkout step, account update screen).

### `MotionCard`

Wraps `components/ui/card.tsx`:

```tsx
export function MotionCard(props: CardProps) {
  return (
    <m.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={props.className}
    >
      <Card {...props} />
    </m.div>
  );
}
```

### `MotionSkeleton`

Drops into the existing `components/ui/skeleton.tsx` slot. Same API as current `Skeleton`. Adds a shimmer animation using CSS keyframes (defined in `globals.css`).

```css
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.animate-shimmer {
  background: linear-gradient(90deg, var(--muted) 0%, var(--muted-foreground)/10 50%, var(--muted) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}
```

`components/ui/skeleton.tsx` becomes a one-line re-export: `export { MotionSkeleton as Skeleton } from "@/components/motion/MotionSkeleton"`. Backwards compatible.

### `PageTransition`

```tsx
"use client";
import { AnimatePresence, motion } from "motion/react";

export function PageTransition({ children, routeKey }: { children: React.ReactNode; routeKey: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

Shipped now; only mounted in route layouts in Sub-project 4.

---

## 7. Motion Tokens

`lib/motion/tokens.ts`:

```ts
export const durations = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const easings = {
  standard: [0.4, 0, 0.2, 1] as const,   // material standard
  emphasized: [0.2, 0, 0, 1] as const,    // material emphasized
  exit: [0.4, 0, 1, 1] as const,          // material exit
} as const;

export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 20 } as const,
  snappy: { type: "spring", stiffness: 400, damping: 30 } as const,
} as const;
```

`lib/motion/variants.ts` re-exports shared Framer variants: `fadeUp`, `fadeIn`, `scaleIn`, `slideInRight`. Defined inline using the tokens above.

---

## 8. Accessibility

### Reduced motion (already locked)

- Root `<MotionConfig reducedMotion="user" />` → Framer Motion auto-disables for users with OS preference.
- CSS override in `app/globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- Audit task post-implementation: grep all `animate-*` classes and confirm override covers them.

### Keyboard

- `AnimatedButton` inherits Enter/Space from native `<button>`.
- Loading state: `aria-busy="true"`, `disabled`.
- Success/error: announced via existing Sonner toaster (`aria-live="polite"`).
- Focus ring preserved (`focus-visible:ring-ring/50` already in `Button` styles).

### Screen readers

- `Spinner`: `role="status" aria-label="Loading"`.
- `MotionSkeleton`: `aria-hidden="true"` (no change from current `Skeleton`).

### Focus management

- No focus stealing on async actions. Focus stays on the button.
- After error shake, error toast announces via toaster.

---

## 9. Theming

### Light/Dark

- All primitives use Tailwind semantic colors (`bg-primary`, `text-destructive`) — theme-aware via `next-themes`.
- New CSS variable `--motion-success`:
  ```css
  :root { --motion-success: oklch(0.72 0.18 145); }   /* green-500 */
  .dark { --motion-success: oklch(0.78 0.16 145); }      /* green-400 */
  ```
- Error flash: existing `--destructive`.
- Shimmer gradient: existing `--muted` + `--muted-foreground`.

### High contrast

- `Spinner` uses `currentColor` — automatically adapts.
- Button focus ring uses `--ring` — high-contrast safe.

---

## 10. Account-level "Reduce Motion" Toggle

### User pref field

Add `reduce_motion: boolean` (default `false`) to the user-prefs Supabase table. Migration applied during implementation.

### UI

New component `components/account/ReduceMotionToggle.tsx`:
- Lives in `account/email-preferences` route (or a new `account/preferences` sub-page if email-preferences doesn't fit).
- Checkbox + label: "Reduce motion (overrides OS preference)"
- On change: write to Supabase, set a cookie (`rosette-reduce-motion=1`), update a React context that wraps `MotionProvider`.

### Provider integration

`MotionProvider` reads the context:

```tsx
const { reduceMotion } = useMotionPrefs();
return (
  <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
    {children}
  </MotionConfig>
);
```

- `reducedMotion="always"` → force disable motion regardless of OS.
- `reducedMotion="user"` → respect OS preference (default).

---

## 11. Testing Strategy

### Unit (`tests/unit/motion/`, `tests/unit/hooks/`)

- `useAsyncAction.test.tsx`:
  - `isPending` true during execution, false after resolve
  - Success toast called with correct message on resolve
  - Error toast called with formatted message on reject
  - `onSuccess`/`onError` callbacks invoked
  - Concurrent `run()` calls ignored while pending
  - `isSuccess`/`isError` auto-reset after timed window
  - `reset()` clears state immediately
- `MotionProvider.test.tsx` — verify `MotionConfig` props (snapshot).
- `tokens.test.ts` — durations/easings/springs are the documented values.

### Component (`tests/unit/components/motion/`)

- `AnimatedButton.test.tsx` — render in each state (idle, loading, success, error, disabled); assert classes, aria attributes.
- `Spinner.test.tsx` — `role="status"`, sizes.
- `MotionSkeleton.test.tsx` — shimmer class present.
- `MotionCard.test.tsx` — hover/tap variants defined (snapshot motion props).

### A11y

- `tests/a11y/motion.test.ts` — `axe-core` via Testing Library; no violations in any state.

### E2E (`tests/e2e/`)

- `motion-foundation.spec.ts` — visit `/`; assert `MotionProvider` is mounted (`data-motion-root`); confirm Spinner renders when triggered.
- `motion-reduced.spec.ts` — Playwright `emulateMedia({ reducedMotion: 'reduce' })`; assert transitions are 0ms.

### Account toggle

- `tests/unit/account/ReduceMotionToggle.test.tsx` — toggle writes to Supabase.
- E2E: account → preferences → toggle → reload → motion disabled.

### Coverage target

80% lines on new hooks/components (matches existing repo conventions).

---

## 12. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Framer Motion bundle bloat (~30KB gz) | Medium | `motion/react` imports (tree-shake friendly); dynamic-import heavy variants; monitor `cf:build` worker size |
| Breaking existing `Skeleton` consumers | Low | `MotionSkeleton` is backwards-compatible; `skeleton.tsx` re-exports it |
| `useAsyncAction` semantics mismatch with existing callsites | Medium | Sub-project 2 is where we discover; foundation hook is generic |
| Sonner toast spam on parallel actions | Low | `silentSuccess`/`silentError` opt-outs per call |
| `prefers-reduced-motion` not respected on CSS animations | Medium | Tailwind `globals.css` override + post-implementation audit |
| `MotionConfig` SSR hydration mismatch | Low | `MotionProvider` is `"use client"`; root layout stays server |
| Account toggle persists across devices → surprise | Low | Expected behavior; documented in toggle UI |
| Worker size limit (`check-worker-size.mjs`) fails | Medium | Run `pnpm cf:build` early; code-split `MotionProvider` if close to limit |

---

## 13. Estimated Size

- ~18 files created
- ~3 files modified
- ~600–800 LOC (including tests)
- New dep: `framer-motion` (~30KB gz)

---

## 14. Open Questions (to resolve during implementation, non-blocking)

- Exact color values for `--motion-success` (pick from existing Tailwind palette)
- `formatError` helper location — propose `lib/errors/format.ts` if it doesn't already exist
- Whether `useAsyncAction` should also accept a `finally` callback for cleaner cleanup at some call sites (current API has `onSettled` which covers this)
- Exact path for the user-pref field (likely `features/account/` server actions for the toggle)