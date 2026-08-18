import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

import { cleanup } from '@testing-library/react';

// jsdom does not implement scrollIntoView; Radix Select calls it when opening.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
