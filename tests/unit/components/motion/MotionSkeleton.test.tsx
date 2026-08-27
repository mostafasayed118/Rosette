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