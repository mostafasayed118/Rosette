import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTransition } from "@/components/motion/PageTransition";

describe("PageTransition", () => {
  it("renders children", () => {
    render(
      <PageTransition routeKey="a">
        <p data-testid="content">hi</p>
      </PageTransition>
    );
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
  it("updates content when routeKey changes", async () => {
    const { rerender } = render(
      <PageTransition routeKey="a">
        <p data-testid="content">page A</p>
      </PageTransition>
    );
    expect(screen.getByTestId("content")).toHaveTextContent("page A");
    rerender(
      <PageTransition routeKey="b">
        <p data-testid="content">page B</p>
      </PageTransition>
    );
    const contents = screen.getAllByTestId("content");
    expect(contents.some((el) => el.textContent === "page B")).toBe(true);
  });
});
