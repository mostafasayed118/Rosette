import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedButton } from "@/components/motion/AnimatedButton";

describe("AnimatedButton", () => {
  it("renders children as button content", () => {
    render(<AnimatedButton>Click me</AnimatedButton>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
  it("shows a spinner when loading=true", () => {
    render(<AnimatedButton loading>Save</AnimatedButton>);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("applies loading precedence over success and error", () => {
    render(<AnimatedButton loading success error>Save</AnimatedButton>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
  it("forwards native button props", () => {
    render(<AnimatedButton type="submit" data-testid="b">x</AnimatedButton>);
    expect(screen.getByTestId("b")).toHaveAttribute("type", "submit");
  });
  it("supports asChild via Slot", () => {
    render(
      <AnimatedButton asChild>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/x" data-testid="link">Go</a>
      </AnimatedButton>
    );
    expect(screen.getByTestId("link").tagName).toBe("A");
  });
  it("renders destructive variant via the underlying Button styles", () => {
    render(<AnimatedButton variant="destructive" data-testid="b">Delete</AnimatedButton>);
    expect(screen.getByTestId("b").className).toContain("bg-destructive");
  });
  it("respects the disabled prop", () => {
    render(<AnimatedButton disabled>x</AnimatedButton>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
