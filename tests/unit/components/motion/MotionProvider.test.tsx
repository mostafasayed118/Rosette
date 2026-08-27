import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { useMotionPrefs } from "@/lib/motion/MotionPrefsContext";

function Probe() {
  const { reduceMotion } = useMotionPrefs();
  return <span data-testid="probe">{String(reduceMotion)}</span>;
}

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

  it("defaults reduceMotion to false", () => {
    render(
      <MotionProvider>
        <Probe />
      </MotionProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("false");
  });

  it("seeds reduceMotion from initialReduceMotion", () => {
    render(
      <MotionProvider initialReduceMotion>
        <Probe />
      </MotionProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("true");
  });
});
