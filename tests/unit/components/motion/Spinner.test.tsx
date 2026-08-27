import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Spinner } from "@/components/motion/Spinner";

describe("Spinner", () => {
  it("renders with role=status and aria-label=Loading", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });
  it("renders the md size by default", () => {
    render(<Spinner data-testid="spinner" />);
    const el = screen.getByTestId("spinner");
    expect(el.className).toContain("size-4");
  });
  it("supports sm/lg/xl sizes", () => {
    const { rerender } = render(<Spinner data-testid="s" size="sm" />);
    expect(screen.getByTestId("s").className).toContain("size-3");
    rerender(<Spinner data-testid="s" size="lg" />);
    expect(screen.getByTestId("s").className).toContain("size-6");
    rerender(<Spinner data-testid="s" size="xl" />);
    expect(screen.getByTestId("s").className).toContain("size-8");
  });
  it("applies extra className", () => {
    render(<Spinner data-testid="s" className="text-red-500" />);
    expect(screen.getByTestId("s").className).toContain("text-red-500");
  });
});