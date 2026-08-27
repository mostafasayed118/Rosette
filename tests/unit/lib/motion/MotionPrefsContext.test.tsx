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
