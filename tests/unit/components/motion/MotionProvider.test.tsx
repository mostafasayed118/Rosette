import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MotionProvider } from "@/components/motion/MotionProvider";

describe("MotionProvider", () => {
  it("renders children inside a data-motion-root wrapper", () => {
    const { container } = render(
      <MotionProvider>
        <span data-testid="child">x</span>
      </MotionProvider>
    );
    expect(container.querySelector("[data-motion-root]")).toBeInTheDocument();
    expect(container.querySelector("[data-testid=child]")).toBeInTheDocument();
  });
});
