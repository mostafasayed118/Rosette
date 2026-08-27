import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

import { cleanup } from '@testing-library/react';

// jsdom does not implement scrollIntoView; Radix Select calls it when opening.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Default App Router hooks so providers using them render outside a router.
// Per-file vi.mock('next/navigation') declarations still take precedence.
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

// Tests inject sendNotification directly via the third arg of deliverOrderNotification.
// Ensure RESEND_API_KEY is unset so the Resend branch in notification-delivery.ts is
// skipped and the injected sendNotification is exercised instead.
delete process.env.RESEND_API_KEY;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
