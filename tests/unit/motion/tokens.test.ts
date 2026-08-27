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
