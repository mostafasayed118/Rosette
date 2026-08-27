import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionCard } from "@/components/motion/MotionCard";

describe("MotionCard", () => {
  it("renders children inside a card", () => {
    render(<MotionCard data-testid="card">Hello</MotionCard>);
    expect(screen.getByTestId("card")).toHaveTextContent("Hello");
  });
  it("passes className through to the wrapper", () => {
    render(<MotionCard data-testid="card" className="bg-pink-500">x</MotionCard>);
    expect(screen.getByTestId("card").className).toContain("bg-pink-500");
  });
});
