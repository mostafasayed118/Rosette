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
