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

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
