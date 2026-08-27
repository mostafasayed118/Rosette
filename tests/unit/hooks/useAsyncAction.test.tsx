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
