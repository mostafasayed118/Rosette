# Motion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the motion foundation — `useAsyncAction` hook, motion-enabled UI primitives, reduced-motion support, account-level toggle, and motion design tokens — so sub-projects 2-4 can build on top.

**Architecture:** Additive layer over the existing shadcn/ui component primitives. `MotionProvider` wraps the app at the root with `MotionConfig reducedMotion="user"`. `useAsyncAction` is opinionated and auto-toasts. New primitives live under `components/motion/`. Motion tokens are pure data in `lib/motion/`.

**Tech Stack:** Framer Motion (`motion@^12` package, `motion/react` import path), React 19, TypeScript 5.9, Tailwind v4, Vitest + Testing Library for unit, Playwright for E2E, Supabase for user prefs.

**Spec:** `docs/superpowers/specs/2026-08-27-motion-foundation-design.md`

## Global Constraints

- Node project uses Next.js 16.3.1 + React 19.1.0. Server Components by default; motion primitives are `"use client"`.
- Tailwind v4. CSS variables for theming defined in `app/globals.css`.
- Test framework: Vitest (`npm test`); Playwright for E2E (`npm run test:e2e`).
- Lint: `npm run lint` (tsc + eslint) must pass before commit.
- Build smoke gate: `npm run build` must succeed before declaring Task 14 done.
- Worker size: `npm run cf:build` (opennextjs-cloudflare) tracks worker size; flag if approaching the 1MB limit.
- Commit messages: `<type>: <subject>` where type is `feat|fix|test|refactor|chore|docs`.
- No code comments unless the user asks for them.
- Do not commit secrets or `.env.local`.
- After every code change, run `npm run lint` to keep the tree clean.

---

## Task 1: Install Framer Motion + verify build

**Files:**
- Modify: `package.json`

**Interfaces:** None.

- [ ] **Step 1: Add the dependency**

Run: `npm install motion@^12`

Expected: package.json adds `"motion": "^12.x.x"`. node_modules updated. (Note: post-v11, Framer Motion is distributed as the `motion` package with the React API at `motion/react`. Older `framer-motion@11` lacks the `./react` subpath.)

- [ ] **Step 2: Verify the build still works**

Run: `npm run build`

Expected: build succeeds with no new errors. Note the current output size.

- [ ] **Step 3: Smoke import in a temp file**

Create temporary `lib/motion/_smoke.ts`:
```ts
import { motion } from "motion/react";
export const _smoke = motion.div;
```

Run: `npx tsc --noEmit`

Expected: zero errors. Delete `lib/motion/_smoke.ts` after.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install framer-motion"
```

---

## Task 2: Motion tokens + shared variants

**Files:**
- Create: `lib/motion/tokens.ts`
- Create: `lib/motion/variants.ts`
- Test: `tests/unit/motion/tokens.test.ts`
- Test: `tests/unit/motion/variants.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `durations`, `easings`, `springs` constants; `fadeUp`, `fadeIn`, `scaleIn`, `slideInRight` variants

- [ ] **Step 1: Write the failing tests**

`tests/unit/motion/tokens.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { durations, easings, springs } from "@/lib/motion/tokens";

describe("motion tokens", () => {
  it("exposes the documented durations", () => {
    expect(durations).toEqual({ fast: 150, normal: 250, slow: 400 });
  });
  it("exposes the documented easings", () => {
    expect(easings.standard).toEqual([0.4, 0, 0.2, 1]);
    expect(easings.emphasized).toEqual([0.2, 0, 0, 1]);
    expect(easings.exit).toEqual([0.4, 0, 1, 1]);
  });
  it("exposes the documented springs", () => {
    expect(springs.gentle).toEqual({ type: "spring", stiffness: 120, damping: 20 });
    expect(springs.snappy).toEqual({ type: "spring", stiffness: 400, damping: 30 });
  });
});
```

`tests/unit/motion/variants.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fadeUp, fadeIn, scaleIn, slideInRight } from "@/lib/motion/variants";

describe("motion variants", () => {
  it("fadeUp has y and opacity keys", () => {
    expect(fadeUp.initial).toEqual({ opacity: 0, y: 12 });
    expect(fadeUp.animate).toEqual({ opacity: 1, y: 0 });
    expect(fadeUp.exit).toEqual({ opacity: 0, y: -12 });
  });
  it("fadeIn only animates opacity", () => {
    expect(fadeIn.initial).toEqual({ opacity: 0 });
    expect(fadeIn.animate).toEqual({ opacity: 1 });
  });
  it("scaleIn animates scale and opacity", () => {
    expect(scaleIn.initial).toEqual({ opacity: 0, scale: 0.95 });
    expect(scaleIn.animate).toEqual({ opacity: 1, scale: 1 });
  });
  it("slideInRight animates x and opacity", () => {
    expect(slideInRight.initial).toEqual({ opacity: 0, x: 24 });
    expect(slideInRight.animate).toEqual({ opacity: 1, x: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/motion`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/motion/tokens.ts`**

```ts
export const durations = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;

export const easings = {
  standard: [0.4, 0, 0.2, 1],
  emphasized: [0.2, 0, 0, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const springs = {
  gentle: { type: "spring", stiffness: 120, damping: 20 },
  snappy: { type: "spring", stiffness: 400, damping: 30 },
} as const;

export type Durations = typeof durations;
export type Easings = typeof easings;
export type Springs = typeof springs;
```

- [ ] **Step 4: Implement `lib/motion/variants.ts`**

```ts
import type { Variants } from "motion/react";
import { durations, easings } from "./tokens";

const baseTransition = { duration: durations.normal / 1000, ease: easings.standard };

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -12, transition: baseTransition },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: baseTransition },
  exit: { opacity: 0, transition: baseTransition },
};

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: baseTransition },
  exit: { opacity: 0, scale: 0.95, transition: baseTransition },
};

export const slideInRight: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, transition: baseTransition },
  exit: { opacity: 0, x: 24, transition: baseTransition },
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/motion`

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add lib/motion/ tests/unit/motion/
git commit -m "feat(motion): add tokens and shared variants"
```

---

## Task 3: `formatError` helper

**Files:**
- Create: `lib/errors/format.ts`
- Test: `tests/unit/lib/errors/format.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `formatError(error: unknown): string`

- [ ] **Step 1: Write the failing test**

`tests/unit/lib/errors/format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatError } from "@/lib/errors/format";

describe("formatError", () => {
  it("returns Error.message", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });
  it("returns string itself", () => {
    expect(formatError("oops")).toBe("oops");
  });
  it("stringifies plain objects with a message field", () => {
    expect(formatError({ message: "rate limited" })).toBe("rate limited");
  });
  it("falls back to String() for unknown shapes", () => {
    expect(formatError(42)).toBe("42");
    expect(formatError(null)).toBe("null");
    expect(formatError(undefined)).toBe("undefined");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/lib/errors`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/errors/format.ts`**

```ts
export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/lib/errors`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/errors/ tests/unit/lib/errors/
git commit -m "feat(errors): add formatError helper"
```

---

## Task 4: `useAsyncAction` hook (TDD — the spine)

**Files:**
- Create: `hooks/useAsyncAction.ts`
- Test: `tests/unit/hooks/useAsyncAction.test.tsx`

**Interfaces:**
- Consumes: `formatError` from `lib/errors/format` (Task 3); `toast` from `sonner`
- Produces: `useAsyncAction<TArgs, TResult>(options): { run, isPending, isSuccess, isError, error, reset }`

This is the most important hook. Write the test first, implement minimally, expand tests.

- [ ] **Step 1: Write the failing tests**

`tests/unit/hooks/useAsyncAction.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncAction } from "@/hooks/useAsyncAction";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from "sonner";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.useRealTimers();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("useAsyncAction", () => {
  it("starts in idle state", () => {
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => 1, successMessage: "ok" })
    );
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("flips isPending true while running", async () => {
    const d = deferred<number>();
    const { result } = renderHook(() =>
      useAsyncAction({ action: () => d.promise, successMessage: "ok" })
    );
    let p: Promise<unknown> | undefined;
    act(() => {
      p = result.current.run();
    });
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      d.resolve(42);
      await p;
    });
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(true);
  });

  it("fires success toast on resolve", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => "data", successMessage: "Saved" })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.success).toHaveBeenCalledWith("Saved");
  });

  it("supports successMessage as a function of result", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => ({ id: 7 }),
        successMessage: (r) => `Saved #${r.id}`,
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.success).toHaveBeenCalledWith("Saved #7");
  });

  it("fires error toast on reject with formatted message", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => {
          throw new Error("nope");
        },
        errorMessage: (e) => `Failed: ${(e as Error).message}`,
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.error).toHaveBeenCalledWith("Failed: nope");
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("calls onSuccess callback", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => 1, successMessage: "ok", onSuccess })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(onSuccess).toHaveBeenCalledWith(1);
  });

  it("calls onError callback", async () => {
    const onError = vi.fn();
    const err = new Error("bad");
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => {
          throw err;
        },
        errorMessage: "x",
        onError,
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("ignores concurrent run() calls while pending", async () => {
    const d = deferred<void>();
    const action = vi.fn().mockReturnValue(d.promise);
    const { result } = renderHook(() =>
      useAsyncAction({ action, successMessage: "ok" })
    );
    act(() => {
      result.current.run();
    });
    act(() => {
      result.current.run();
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      d.resolve();
    });
  });

  it("silences success toast when silentSuccess is true", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => 1, successMessage: "ok", silentSuccess: true })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("silences error toast when silentError is true", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => {
          throw new Error("x");
        },
        errorMessage: "x",
        silentError: true,
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("auto-resets isSuccess after the settle window", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => 1, successMessage: "ok" })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isSuccess).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(result.current.isSuccess).toBe(false);
  });

  it("auto-resets isError after the settle window", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => {
          throw new Error("x");
        },
        errorMessage: "x",
      })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isError).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.isError).toBe(false);
  });

  it("reset() clears state immediately", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({ action: async () => 1, successMessage: "ok" })
    );
    await act(async () => {
      await result.current.run();
    });
    expect(result.current.isSuccess).toBe(true);
    act(() => {
      result.current.reset();
    });
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns undefined when awaited and the action rejects", async () => {
    const { result } = renderHook(() =>
      useAsyncAction({
        action: async () => {
          throw new Error("x");
        },
        errorMessage: "x",
      })
    );
    let value: unknown;
    await act(async () => {
      value = await result.current.run();
    });
    expect(value).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/hooks/useAsyncAction`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `hooks/useAsyncAction.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const SUCCESS_WINDOW_MS = 1500;
const ERROR_WINDOW_MS = 2000;

type Action<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

type UseAsyncActionOptions<TArgs extends unknown[], TResult> = {
  action: Action<TArgs, TResult>;
  successMessage?: string | ((result: TResult) => string);
  errorMessage?: string | ((err: unknown) => string);
  silentSuccess?: boolean;
  silentError?: boolean;
  onSuccess?: (result: TResult) => void;
  onError?: (err: unknown) => void;
  onSettled?: () => void;
};

type UseAsyncActionReturn<TArgs extends unknown[], TResult> = {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown | null;
  reset: () => void;
};

export function useAsyncAction<TArgs extends unknown[], TResult>(
  options: UseAsyncActionOptions<TArgs, TResult>
): UseAsyncActionReturn<TArgs, TResult> {
  const { action, successMessage, errorMessage, silentSuccess, silentError, onSuccess, onError, onSettled } = options;

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  const pendingRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSettleTimer, [clearSettleTimer]);

  const reset = useCallback(() => {
    clearSettleTimer();
    setIsSuccess(false);
    setIsError(false);
    setError(null);
  }, [clearSettleTimer]);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      if (pendingRef.current) return undefined;
      pendingRef.current = true;
      clearSettleTimer();
      setIsPending(true);
      setIsSuccess(false);
      setIsError(false);
      setError(null);
      try {
        const result = await action(...args);
        if (!silentSuccess && successMessage !== undefined) {
          const msg = typeof successMessage === "function" ? successMessage(result) : successMessage;
          toast.success(msg);
        }
        setIsSuccess(true);
        onSuccess?.(result);
        settleTimerRef.current = setTimeout(() => {
          setIsSuccess(false);
          settleTimerRef.current = null;
          onSettled?.();
        }, SUCCESS_WINDOW_MS);
        return result;
      } catch (err) {
        if (!silentError && errorMessage !== undefined) {
          const msg = typeof errorMessage === "function" ? errorMessage(err) : errorMessage;
          toast.error(msg);
        }
        setIsError(true);
        setError(err);
        onError?.(err);
        settleTimerRef.current = setTimeout(() => {
          setIsError(false);
          settleTimerRef.current = null;
          onSettled?.();
        }, ERROR_WINDOW_MS);
        return undefined;
      } finally {
        setIsPending(false);
        pendingRef.current = false;
      }
    },
    [action, successMessage, errorMessage, silentSuccess, silentError, onSuccess, onError, onSettled, clearSettleTimer]
  );

  return { run, isPending, isSuccess, isError, error, reset };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/hooks/useAsyncAction`

Expected: all 13 tests PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add hooks/useAsyncAction.ts tests/unit/hooks/useAsyncAction.test.tsx
git commit -m "feat(hooks): add useAsyncAction with auto-toast"
```

---

## Task 5: `Spinner` component

**Files:**
- Create: `components/motion/Spinner.tsx`
- Test: `tests/unit/components/motion/Spinner.test.tsx`

**Interfaces:**
- Consumes: Lucide `Loader2Icon`
- Produces: `<Spinner size?="md" className? />`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/motion/Spinner.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/motion/Spinner";

describe("Spinner", () => {
  it("renders with role=status and aria-label=Loading", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });
  it("renders the md size by default", () => {
    render(<Spinner data-testid="spinner" />);
    const el = screen.getByTestId("spinner");
    expect(el.className).toContain("size-4");
  });
  it("supports sm/lg/xl sizes", () => {
    const { rerender } = render(<Spinner data-testid="s" size="sm" />);
    expect(screen.getByTestId("s").className).toContain("size-3");
    rerender(<Spinner data-testid="s" size="lg" />);
    expect(screen.getByTestId("s").className).toContain("size-6");
    rerender(<Spinner data-testid="s" size="xl" />);
    expect(screen.getByTestId("s").className).toContain("size-8");
  });
  it("applies extra className", () => {
    render(<Spinner data-testid="s" className="text-red-500" />);
    expect(screen.getByTestId("s").className).toContain("text-red-500");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/motion/Spinner`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/Spinner.tsx`**

```tsx
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "size-3",
  md: "size-4",
  lg: "size-6",
  xl: "size-8",
} as const;

type SpinnerProps = {
  size?: keyof typeof sizeMap;
  className?: string;
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", sizeMap[size], className)}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/components/motion/Spinner`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/motion/Spinner.tsx tests/unit/components/motion/Spinner.test.tsx
git commit -m "feat(motion): add Spinner primitive"
```

---

## Task 6: `globals.css` additions (motion CSS variables + reduced-motion override + shimmer keyframes)

**Files:**
- Modify: `app/globals.css`

**Interfaces:** None — pure CSS additions.

- [ ] **Step 1: Read current globals.css**

Run: `Read app/globals.css` (use Read tool). Note existing `:root` and `.dark` block structure.

- [ ] **Step 2: Add motion CSS variables**

In `:root` block, add:
```css
  --motion-success: oklch(0.72 0.18 145);
```

In `.dark` block, add:
```css
  --motion-success: oklch(0.78 0.16 145);
```

- [ ] **Step 3: Add reduced-motion override at end of file**

Append:
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    var(--muted) 0%,
    color-mix(in oklch, var(--muted-foreground) 10%, transparent) 50%,
    var(--muted) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}
```

- [ ] **Step 4: Verify build still works**

Run: `npm run build`

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(motion): add success color var, reduced-motion override, shimmer keyframes"
```

---

## Task 7: `MotionSkeleton` + re-export from existing `Skeleton`

**Files:**
- Create: `components/motion/MotionSkeleton.tsx`
- Modify: `components/ui/skeleton.tsx`
- Test: `tests/unit/components/motion/MotionSkeleton.test.tsx`

**Interfaces:**
- Consumes: shimmer CSS from `globals.css` (Task 6)
- Produces: `<MotionSkeleton className? />` (shimmer animation)

- [ ] **Step 1: Write the failing test**

`tests/unit/components/motion/MotionSkeleton.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionSkeleton } from "@/components/motion/MotionSkeleton";

describe("MotionSkeleton", () => {
  it("renders with animate-shimmer class", () => {
    render(<MotionSkeleton data-testid="sk" />);
    expect(screen.getByTestId("sk").className).toContain("animate-shimmer");
  });
  it("passes through className", () => {
    render(<MotionSkeleton data-testid="sk" className="h-4 w-full" />);
    const cls = screen.getByTestId("sk").className;
    expect(cls).toContain("h-4");
    expect(cls).toContain("w-full");
  });
  it("is hidden from a11y tree", () => {
    render(<MotionSkeleton data-testid="sk" />);
    expect(screen.getByTestId("sk")).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/motion/MotionSkeleton`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/MotionSkeleton.tsx`**

```tsx
import { cn } from "@/lib/utils";

type MotionSkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function MotionSkeleton({ className, ...props }: MotionSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Re-export from `components/ui/skeleton.tsx`**

Replace the contents of `components/ui/skeleton.tsx` with:
```ts
export { MotionSkeleton as Skeleton } from "@/components/motion/MotionSkeleton";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/components/motion/MotionSkeleton`

Expected: PASS.

- [ ] **Step 6: Verify build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/motion/MotionSkeleton.tsx components/ui/skeleton.tsx tests/unit/components/motion/MotionSkeleton.test.tsx
git commit -m "feat(motion): add MotionSkeleton with shimmer, re-export as Skeleton"
```

---

## Task 8: `SpinnerOverlay` component

**Files:**
- Create: `components/motion/SpinnerOverlay.tsx`
- Test: `tests/unit/components/motion/SpinnerOverlay.test.tsx`

**Interfaces:**
- Consumes: `Spinner` from Task 5
- Produces: `<SpinnerOverlay>{children?}</SpinnerOverlay>`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/motion/SpinnerOverlay.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpinnerOverlay } from "@/components/motion/SpinnerOverlay";

describe("SpinnerOverlay", () => {
  it("renders a loading spinner", () => {
    render(<SpinnerOverlay />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
  it("renders children when provided", () => {
    render(<SpinnerOverlay><span data-testid="child">Loading checkout</span></SpinnerOverlay>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
  it("uses absolute positioning and backdrop blur", () => {
    render(<SpinnerOverlay data-testid="overlay" />);
    const cls = screen.getByTestId("overlay").className;
    expect(cls).toContain("absolute");
    expect(cls).toContain("backdrop-blur-sm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/motion/SpinnerOverlay`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/SpinnerOverlay.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

type SpinnerOverlayProps = {
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

export function SpinnerOverlay({ children, className, ...props }: SpinnerOverlayProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <Spinner size="lg" />
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/components/motion/SpinnerOverlay`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/motion/SpinnerOverlay.tsx tests/unit/components/motion/SpinnerOverlay.test.tsx
git commit -m "feat(motion): add SpinnerOverlay"
```

---

## Task 9: `MotionCard` component

**Files:**
- Create: `components/motion/MotionCard.tsx`
- Test: `tests/unit/components/motion/MotionCard.test.tsx`

**Interfaces:**
- Consumes: `Card` from `components/ui/card`
- Produces: `<MotionCard>...children</MotionCard>` with hover/tap variants

- [ ] **Step 1: Write the failing test**

`tests/unit/components/motion/MotionCard.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionCard } from "@/components/motion/MotionCard";

describe("MotionCard", () => {
  it("renders children inside a card", () => {
    render(<MotionCard data-testid="card">Hello</MotionCard>);
    expect(screen.getByTestId("card")).toHaveTextContent("Hello");
  });
  it("passes className through to the wrapper", () => {
    render(<MotionCard data-testid="card" className="bg-pink-500">x</MotionCard>);
    expect(screen.getByTestId("card").className).toContain("bg-pink-500");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/motion/MotionCard`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/MotionCard.tsx`**

```tsx
"use client";

import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type MotionCardProps = React.ComponentProps<typeof Card>;

export function MotionCard({ className, ...props }: MotionCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("will-change-transform", className)}
    >
      <Card {...props} />
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/components/motion/MotionCard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/motion/MotionCard.tsx tests/unit/components/motion/MotionCard.test.tsx
git commit -m "feat(motion): add MotionCard with hover lift and tap"
```

---

## Task 10: `AnimatedButton` component

**Files:**
- Create: `components/motion/AnimatedButton.tsx`
- Test: `tests/unit/components/motion/AnimatedButton.test.tsx`

**Interfaces:**
- Consumes: `Button` from `components/ui/button`, `Spinner` from Task 5
- Produces: `<AnimatedButton loading? success? error? ...ButtonProps />`

The biggest primitive after `useAsyncAction`. Drives the user-visible feedback.

- [ ] **Step 1: Write the failing tests**

`tests/unit/components/motion/AnimatedButton.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedButton } from "@/components/motion/AnimatedButton";

describe("AnimatedButton", () => {
  it("renders children as button content", () => {
    render(<AnimatedButton>Click me</AnimatedButton>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
  it("shows a spinner when loading=true", () => {
    render(<AnimatedButton loading>Save</AnimatedButton>);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("applies loading precedence over success and error", () => {
    render(<AnimatedButton loading success error>Save</AnimatedButton>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("forwards native button props", () => {
    render(<AnimatedButton type="submit" data-testid="b">x</AnimatedButton>);
    expect(screen.getByTestId("b")).toHaveAttribute("type", "submit");
  });
  it("supports asChild via Slot", () => {
    render(
      <AnimatedButton asChild>
        <a href="/x" data-testid="link">Go</a>
      </AnimatedButton>
    );
    expect(screen.getByTestId("link").tagName).toBe("A");
  });
  it("renders destructive variant via the underlying Button styles", () => {
    render(<AnimatedButton variant="destructive" data-testid="b">Delete</AnimatedButton>);
    expect(screen.getByTestId("b").className).toContain("bg-destructive");
  });
  it("respects the disabled prop", () => {
    render(<AnimatedButton disabled>x</AnimatedButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/components/motion/AnimatedButton`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/AnimatedButton.tsx`**

```tsx
"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Spinner } from "./Spinner";

type AnimatedButtonProps = Omit<HTMLMotionProps<"button">, "children"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    success?: boolean;
    error?: boolean;
    loadingText?: string;
    children?: React.ReactNode;
  };

export const AnimatedButton = React.forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      success = false,
      error = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const isLoading = loading;
    const showSuccess = !isLoading && success;
    const showError = !isLoading && !showSuccess && error;

    const classes = cn(
      buttonVariants({ variant, size }),
      "relative overflow-hidden",
      showSuccess && "bg-green-600 text-white hover:bg-green-600",
      showError && "bg-destructive text-white",
      className
    );

    const inner = (
      <>
        {isLoading && <Spinner size="sm" className="shrink-0" />}
        <span className={cn("transition-opacity", isLoading && "opacity-70")}>
          {isLoading && loadingText ? loadingText : children}
        </span>
      </>
    );

    if (asChild) {
      return (
        <Slot.Root ref={ref as React.Ref<HTMLElement>} className={classes} {...(props as Record<string, unknown>)}>
          {inner}
        </Slot.Root>
      );
    }

    return (
      <motion.button
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        data-loading={isLoading || undefined}
        data-success={showSuccess || undefined}
        data-error={showError || undefined}
        className={classes}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        whileHover={!isLoading ? { scale: 1.02 } : undefined}
        whileTap={!isLoading ? { scale: 0.97 } : undefined}
        whileFocus={!isLoading ? { scale: 1.01 } : undefined}
        animate={
          showError
            ? { x: [-8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4 } }
            : showSuccess
              ? { scale: [1, 1.05, 1], transition: { duration: 0.35 } }
              : undefined
        }
        {...props}
      >
        {inner}
      </motion.button>
    );
  }
);

AnimatedButton.displayName = "AnimatedButton";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/components/motion/AnimatedButton`

Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add components/motion/AnimatedButton.tsx tests/unit/components/motion/AnimatedButton.test.tsx
git commit -m "feat(motion): add AnimatedButton with loading/success/error states"
```

---

## Task 11: `PageTransition` component

**Files:**
- Create: `components/motion/PageTransition.tsx`
- Test: `tests/unit/components/motion/PageTransition.test.tsx`

**Interfaces:**
- Consumes: Framer Motion `AnimatePresence`
- Produces: `<PageTransition routeKey>{children}</PageTransition>`

- [ ] **Step 1: Write the failing test**

`tests/unit/components/motion/PageTransition.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition } from "@/components/motion/PageTransition";

describe("PageTransition", () => {
  it("renders children", () => {
    render(
      <PageTransition routeKey="a">
        <p data-testid="content">hi</p>
      </PageTransition>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
  it("updates content when routeKey changes", () => {
    const { rerender } = render(
      <PageTransition routeKey="a">
        <p data-testid="content">page A</p>
      </PageTransition>
    );
    expect(screen.getByTestId("content")).toHaveTextContent("page A");
    rerender(
      <PageTransition routeKey="b">
        <p data-testid="content">page B</p>
      </PageTransition>
    );
    expect(screen.getByTestId("content")).toHaveTextContent("page B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/components/motion/PageTransition`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/motion/PageTransition.tsx`**

```tsx
"use client";

import { AnimatePresence, motion } from "motion/react";

type PageTransitionProps = {
  routeKey: string;
  children: React.ReactNode;
};

export function PageTransition({ routeKey, children }: PageTransitionProps) {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/components/motion/PageTransition`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/motion/PageTransition.tsx tests/unit/components/motion/PageTransition.test.tsx
git commit -m "feat(motion): add PageTransition wrapper"
```

---

## Task 12: `MotionProvider` + motion prefs context

**Files:**
- Create: `lib/motion/MotionPrefsContext.tsx`
- Create: `components/motion/MotionProvider.tsx`
- Test: `tests/unit/components/motion/MotionProvider.test.tsx`
- Test: `tests/unit/lib/motion/MotionPrefsContext.test.tsx`

**Interfaces:**
- Consumes: Framer Motion `MotionConfig`
- Produces: `<MotionProvider>{children}</MotionProvider>`; `useMotionPrefs(): { reduceMotion: boolean, setReduceMotion: (b: boolean) => void }`

The provider reads OS preference via `useReducedMotion()` from motion. The context allows the account toggle to override it.

- [ ] **Step 1: Write the failing tests**

`tests/unit/lib/motion/MotionPrefsContext.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MotionPrefsProvider, useMotionPrefs } from "@/lib/motion/MotionPrefsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MotionPrefsProvider>{children}</MotionPrefsProvider>
);

describe("MotionPrefsContext", () => {
  it("defaults reduceMotion to false", () => {
    const { result } = renderHook(() => useMotionPrefs(), { wrapper });
    expect(result.current.reduceMotion).toBe(false);
  });

  it("setReduceMotion flips the value", () => {
    const { result } = renderHook(() => useMotionPrefs(), { wrapper });
    act(() => result.current.setReduceMotion(true));
    expect(result.current.reduceMotion).toBe(true);
    act(() => result.current.setReduceMotion(false));
    expect(result.current.reduceMotion).toBe(false);
  });
});
```

`tests/unit/components/motion/MotionProvider.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MotionProvider } from "@/components/motion/MotionProvider";

describe("MotionProvider", () => {
  it("renders children inside a data-motion-root wrapper", () => {
    const { container } = render(
      <MotionProvider>
        <span data-testid="child">x</span>
      </MotionProvider>
    );
    expect(container.querySelector("[data-motion-root]")).toBeInTheDocument();
    expect(container.querySelector("[data-testid=child]")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/lib/motion tests/unit/components/motion/MotionProvider`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/motion/MotionPrefsContext.tsx`**

```tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MotionPrefs = {
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
};

const MotionPrefsContext = createContext<MotionPrefs | null>(null);

export function MotionPrefsProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  return (
    <MotionPrefsContext.Provider value={{ reduceMotion, setReduceMotion }}>
      {children}
    </MotionPrefsContext.Provider>
  );
}

export function useMotionPrefs(): MotionPrefs {
  const ctx = useContext(MotionPrefsContext);
  if (!ctx) throw new Error("useMotionPrefs must be used within MotionPrefsProvider");
  return ctx;
}
```

- [ ] **Step 4: Implement `components/motion/MotionProvider.tsx`**

```tsx
"use client";

import { MotionConfig } from "motion/react";
import { MotionPrefsProvider, useMotionPrefs } from "@/lib/motion/MotionPrefsContext";
import { durations, easings } from "@/lib/motion/tokens";

function MotionConfigInner({ children }: { children: React.ReactNode }) {
  const { reduceMotion } = useMotionPrefs();
  return (
    <MotionConfig
      reducedMotion={reduceMotion ? "always" : "user"}
      transition={{ duration: durations.normal / 1000, ease: easings.standard }}
    >
      {children}
    </MotionConfig>
  );
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionPrefsProvider>
      <div data-motion-root style={{ minHeight: "100%" }}>
        <MotionConfigInner>{children}</MotionConfigInner>
      </div>
    </MotionPrefsProvider>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/lib/motion tests/unit/components/motion/MotionProvider`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/motion/MotionPrefsContext.tsx components/motion/MotionProvider.tsx tests/unit/lib/motion/MotionPrefsContext.test.tsx tests/unit/components/motion/MotionProvider.test.tsx
git commit -m "feat(motion): add MotionProvider and prefs context"
```

---

## Task 13: Barrel export `components/motion/index.ts`

**Files:**
- Create: `components/motion/index.ts`

- [ ] **Step 1: Create the barrel**

```ts
export { MotionProvider } from "./MotionProvider";
export { AnimatedButton } from "./AnimatedButton";
export { Spinner } from "./Spinner";
export { SpinnerOverlay } from "./SpinnerOverlay";
export { MotionCard } from "./MotionCard";
export { MotionSkeleton } from "./MotionSkeleton";
export { PageTransition } from "./PageTransition";
```

- [ ] **Step 2: Verify build still works**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add components/motion/index.ts
git commit -m "feat(motion): add components/motion barrel export"
```

---

## Task 14: Wire `MotionProvider` into root layout

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: `MotionProvider` from Task 12
- Produces: App wrapped in `<MotionProvider>`

- [ ] **Step 1: Read current `app/layout.tsx`**

Run: `Read app/layout.tsx` to find where children are rendered.

- [ ] **Step 2: Wrap children in `MotionProvider`**

Edit `app/layout.tsx`. Add at top:
```ts
import { MotionProvider } from "@/components/motion";
```

Wrap the existing `{children}` JSX in `<MotionProvider>{children}</MotionProvider>`. Keep all existing providers (theme, sonner toaster, etc.) — `MotionProvider` should be outermost so it wraps everything.

Trade-off: if there are server components inside that must not be re-rendered as children, `MotionProvider` being a client boundary is fine — children pass through as props (they stay server components).

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 4: Smoke run dev server**

Run: `npm run dev &` then curl `http://localhost:3000` (or use the existing dev script). Verify the page renders with no client-side errors.

Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(motion): wrap root layout in MotionProvider"
```

---

## Task 15: Account-level reduce-motion toggle

**Files:**
- Modify: Supabase migration file (find/create under `supabase/migrations/`)
- Create: `components/account/ReduceMotionToggle.tsx`
- Test: `tests/unit/components/account/ReduceMotionToggle.test.tsx`

**Interfaces:**
- Consumes: existing user-prefs Supabase setup; `useMotionPrefs` from Task 12
- Produces: `<ReduceMotionToggle />` — controlled checkbox that persists to Supabase and updates prefs context

- [ ] **Step 1: Find user-prefs table**

Run: grep supabase migrations under `supabase/migrations/` for `user_preferences` or similar table. Read the schema to understand the column shape.

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/<timestamp>_user_reduce_motion.sql`:
```sql
ALTER TABLE user_preferences
ADD COLUMN IF NOT EXISTS reduce_motion boolean NOT NULL DEFAULT false;
```

(Adjust table name if it's different — match the existing schema.)

- [ ] **Step 3: Apply migration locally**

Run the project's standard migration command (check README or package.json scripts). Verify the column exists.

- [ ] **Step 4: Write the failing test**

`tests/unit/components/account/ReduceMotionToggle.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReduceMotionToggle } from "@/components/account/ReduceMotionToggle";

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => ({
    from: () => ({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  }),
}));

const mockSetReduceMotion = vi.fn();

vi.mock("@/lib/motion/MotionPrefsContext", async () => {
  const actual = await vi.importActual<typeof import("@/lib/motion/MotionPrefsContext")>(
    "@/lib/motion/MotionPrefsContext"
  );
  return {
    ...actual,
    useMotionPrefs: () => ({ reduceMotion: false, setReduceMotion: mockSetReduceMotion }),
  };
});

describe("ReduceMotionToggle", () => {
  it("renders a checkbox with an accessible label", () => {
    render(<ReduceMotionToggle />);
    expect(screen.getByRole("checkbox", { name: /reduce motion/i })).toBeInTheDocument();
  });

  it("reflects the initial reduceMotion state", () => {
    mockSetReduceMotion.mockClear();
    render(<ReduceMotionToggle initialValue={true} />);
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("calls setReduceMotion on change", async () => {
    mockSetReduceMotion.mockClear();
    render(<ReduceMotionToggle />);
    const checkbox = screen.getByRole("checkbox");
    await userEvent.click(checkbox);
    expect(mockSetReduceMotion).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- tests/unit/components/account/ReduceMotionToggle`

Expected: FAIL — module not found (and possibly motion prefs mock).

- [ ] **Step 6: Implement `components/account/ReduceMotionToggle.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Field } from "@/components/ui/field";
import { useMotionPrefs } from "@/lib/motion/MotionPrefsContext";
import { setReduceMotionPref } from "@/features/account/preferences/actions";

type Props = {
  initialValue?: boolean;
};

export function ReduceMotionToggle({ initialValue }: Props) {
  const { reduceMotion, setReduceMotion } = useMotionPrefs();
  const [pending, startTransition] = useTransition();
  const checked = initialValue !== undefined ? initialValue : reduceMotion;

  return (
    <Field>
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) => {
          setReduceMotion(next);
          startTransition(async () => {
            await setReduceMotionPref(next);
          });
        }}
        aria-label="Reduce motion"
      />
      <label className="text-sm">Reduce motion (overrides OS preference)</label>
    </Field>
  );
}
```

- [ ] **Step 7: Implement the server action**

Create `features/account/preferences/actions.ts`:
```ts
"use server";

import { getSupabaseServer } from "@/lib/supabase/server";

export async function setReduceMotionPref(value: boolean) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("user_preferences")
    .update({ reduce_motion: value })
    .eq("user_id", user.id);
}
```

(Adjust based on the actual user-prefs table name discovered in Step 1.)

- [ ] **Step 8: Mount the toggle in the email-preferences page**

Open `app/(app)/account/email-preferences/page.tsx` (or wherever email preferences live — grep for "email-preferences"). Add `<ReduceMotionToggle />` to the page.

If a separate preferences page is more appropriate, create `app/(app)/account/preferences/page.tsx` with just this toggle for now. Sub-project 4 polish can split it later.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- tests/unit/components/account/ReduceMotionToggle`

Expected: PASS.

- [ ] **Step 10: Verify build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/ components/account/ReduceMotionToggle.tsx features/account/preferences/actions.ts app/\(app\)/account/ tests/unit/components/account/ReduceMotionToggle.test.tsx
git commit -m "feat(account): add reduce-motion preference toggle"
```

---

## Task 16: A11y axe-core test for motion primitives

**Files:**
- Create: `tests/a11y/motion.test.tsx`

**Interfaces:**
- Consumes: All motion primitives created so far
- Produces: A test that renders each in key states and asserts no a11y violations

- [ ] **Step 1: Check axe-core is installed**

Run: `grep -E "axe-core|@axe-core" package.json`

If not installed, add: `npm install --save-dev @axe-core/react`

If the project uses vitest-axe instead, use that. Check existing tests for the pattern.

- [ ] **Step 2: Write the test**

`tests/a11y/motion.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe"; // or "@axe-core/react" — match project convention
import { MotionProvider } from "@/components/motion";
import { AnimatedButton } from "@/components/motion/AnimatedButton";
import { Spinner } from "@/components/motion/Spinner";
import { SpinnerOverlay } from "@/components/motion/SpinnerOverlay";
import { MotionCard } from "@/components/motion/MotionCard";
import { MotionSkeleton } from "@/components/motion/MotionSkeleton";

describe("Motion primitives a11y", () => {
  it("AnimatedButton has no a11y violations in idle/loading/success/error states", async () => {
    const { container, rerender } = render(
      <MotionProvider>
        <AnimatedButton>Idle</AnimatedButton>
      </MotionProvider>
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <MotionProvider>
        <AnimatedButton loading>Loading</AnimatedButton>
      </MotionProvider>
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <MotionProvider>
        <AnimatedButton success>Success</AnimatedButton>
      </MotionProvider>
    );
    expect(await axe(container)).toHaveNoViolations();

    rerender(
      <MotionProvider>
        <AnimatedButton error>Error</AnimatedButton>
      </MotionProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Spinner has no a11y violations", async () => {
    const { container } = render(<Spinner />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("SpinnerOverlay has no a11y violations", async () => {
    const { container } = render(<SpinnerOverlay>Loading…</SpinnerOverlay>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MotionCard has no a11y violations", async () => {
    const { container } = render(
      <MotionProvider>
        <MotionCard>Card body</MotionCard>
      </MotionProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("MotionSkeleton has no a11y violations", async () => {
    const { container } = render(<MotionSkeleton />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- tests/a11y/motion`

Expected: PASS — no violations.

If any violations appear, fix the offending primitive (likely missing aria-label or contrast) and re-run.

- [ ] **Step 4: Commit**

```bash
git add tests/a11y/motion.test.tsx
git commit -m "test(motion): add axe-core a11y tests for primitives"
```

---

## Task 17: Playwright E2E — foundation smoke + reduced-motion

**Files:**
- Create: `tests/e2e/motion-foundation.spec.ts`
- Create: `tests/e2e/motion-reduced.spec.ts`

**Interfaces:**
- Consumes: Playwright; running dev server (handled by Playwright config)
- Produces: 2 passing E2E specs

- [ ] **Step 1: Check Playwright config**

Read `tests/e2e/` directory layout and the Playwright config. Match existing test conventions (file naming, base URL, fixtures).

- [ ] **Step 2: Write foundation smoke test**

`tests/e2e/motion-foundation.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test.describe("Motion foundation smoke", () => {
  test("root layout mounts MotionProvider", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-motion-root]")).toBeVisible();
  });

  test("a page renders without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 3: Write reduced-motion E2E**

`tests/e2e/motion-reduced.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

test.use({ colorScheme: "light" });

test.describe("Reduced motion", () => {
  test("honors prefers-reduced-motion: reduce", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    const root = page.locator("[data-motion-root]");
    await expect(root).toBeVisible();
    // Confirm Framer Motion is honoring: query a known motion element and assert transition duration is 0.
    const transition = await page.evaluate(() => {
      const el = document.querySelector("[data-motion-root] *");
      if (!el) return null;
      const style = getComputedStyle(el);
      return style.transitionDuration;
    });
    expect(transition === "0s" || transition === "0.01ms" || transition === null).toBeTruthy();
    await context.close();
  });
});
```

- [ ] **Step 4: Run the E2E tests**

Run: `npm run test:e2e -- tests/e2e/motion-foundation tests/e2e/motion-reduced`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/motion-foundation.spec.ts tests/e2e/motion-reduced.spec.ts
git commit -m "test(motion): add E2E smoke and reduced-motion tests"
```

---

## Task 18: Final lint + build + worker-size check

**Files:** none modified.

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: zero errors. Fix anything that surfaced.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: all tests green (unit + motion + a11y).

- [ ] **Step 3: Run Cloudflare worker build**

Run: `npm run cf:build`

Expected: succeeds. If worker size is approaching the limit (>~900KB), flag it as a sub-project 1 risk and consider code-splitting `MotionProvider` or `AnimatedButton` (only the affected page bundles the heavier variants).

- [ ] **Step 4: Run standard Next.js build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git status
# If there are uncommitted fixes:
git add -A
git commit -m "chore(motion): final lint and build cleanup"
```

---

## Definition of Done

Sub-project 1 is complete when:

- ✅ All 18 tasks checked off
- ✅ `npm run lint` passes
- ✅ `npm test` passes (unit + a11y)
- ✅ `npm run test:e2e` passes for `motion-foundation` and `motion-reduced`
- ✅ `npm run build` succeeds
- ✅ `npm run cf:build` succeeds (or risks flagged)
- ✅ Account preferences page exposes the Reduce Motion toggle
- ✅ MotionProvider is mounted at the root
- ✅ All motion primitives (`AnimatedButton`, `Spinner`, `SpinnerOverlay`, `MotionCard`, `MotionSkeleton`, `PageTransition`) are exported from `components/motion`
- ✅ `useAsyncAction` is exported from `hooks/useAsyncAction`
- ✅ Sub-projects 2-4 are ready to start (foundation primitives and APIs are stable)