import { act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoRefresh } from '@/components/admin/AutoRefresh';
import { renderWithProviders } from '../test-utils';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

describe('AutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('does not refresh immediately, then polls every interval while visible', () => {
    renderWithProviders(<AutoRefresh intervalMs={30000} />);
    expect(refresh).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(30000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('skips refreshes while the tab is hidden', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    renderWithProviders(<AutoRefresh intervalMs={30000} />);
    act(() => { vi.advanceTimersByTime(90000); });
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { vi.advanceTimersByTime(30000); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops polling after unmount', () => {
    const { unmount } = renderWithProviders(<AutoRefresh intervalMs={30000} />);
    unmount();
    act(() => { vi.advanceTimersByTime(120000); });
    expect(refresh).not.toHaveBeenCalled();
  });
});
