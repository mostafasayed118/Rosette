'use client';

/**
 * Move state updates out of the synchronous effect body.
 *
 * React's `react-hooks/set-state-in-effect` rule flags direct setState calls in
 * effects because they cascade renders inside the commit phase. Bootstrap reads
 * (localStorage, cookies, defaults) legitimately run after mount; deferring
 * them by one microtask keeps identical user-visible timing (still pre-paint,
 * like effects) while letting React finish the first commit from the server
 * snapshot. Microtask choice also means `await act(async () => {})` in tests
 * deterministically flushes it.
 */
export function deferToTask(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  setTimeout(callback, 0);
}

