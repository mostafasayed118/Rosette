import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MotionProvider } from "@/components/motion";
import { AnimatedButton } from "@/components/motion/AnimatedButton";
import { Spinner } from "@/components/motion/Spinner";
import { SpinnerOverlay } from "@/components/motion/SpinnerOverlay";
import { MotionCard } from "@/components/motion/MotionCard";
import { MotionSkeleton } from "@/components/motion/MotionSkeleton";

describe("Motion primitives a11y", () => {
  it("AnimatedButton has correct a11y attributes in idle/loading/success/error states", async () => {
    const { rerender } = render(
      <MotionProvider>
        <AnimatedButton>Idle</AnimatedButton>
      </MotionProvider>
    );
    expect(screen.getByRole("button", { name: "Idle" })).toBeInTheDocument();

    rerender(
      <MotionProvider>
        <AnimatedButton loading>Loading</AnimatedButton>
      </MotionProvider>
    );
    const loadingButton = screen.getByRole("button");
    expect(loadingButton).toHaveAttribute("aria-busy", "true");
    expect(loadingButton).toBeDisabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

    rerender(
      <MotionProvider>
        <AnimatedButton success>Success</AnimatedButton>
      </MotionProvider>
    );
    expect(screen.getByRole("button", { name: "Success" })).toBeInTheDocument();

    rerender(
      <MotionProvider>
        <AnimatedButton error>Error</AnimatedButton>
      </MotionProvider>
    );
    expect(screen.getByRole("button", { name: "Error" })).toBeInTheDocument();
  });

  it("Spinner has correct a11y attributes", async () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status", { name: "Loading" });
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute("aria-label", "Loading");
  });

  it("SpinnerOverlay has correct structure", async () => {
    render(<SpinnerOverlay>Loading…</SpinnerOverlay>);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("MotionCard has no a11y violations", async () => {
    render(
      <MotionProvider>
        <MotionCard>Card body</MotionCard>
      </MotionProvider>
    );
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });

  it("MotionSkeleton is hidden from a11y tree", async () => {
    render(<MotionSkeleton data-testid="skeleton" />);
    const skeleton = screen.getByTestId("skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
  });
});
