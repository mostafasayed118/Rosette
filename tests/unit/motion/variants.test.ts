import { describe, it, expect } from "vitest";
import { fadeUp, fadeIn, scaleIn, slideInRight } from "@/lib/motion/variants";

describe("motion variants", () => {
  it("fadeUp has y and opacity keys", () => {
    expect(fadeUp.initial).toMatchObject({ opacity: 0, y: 12 });
    expect(fadeUp.animate).toMatchObject({ opacity: 1, y: 0 });
    expect(fadeUp.exit).toMatchObject({ opacity: 0, y: -12 });
  });
  it("fadeIn only animates opacity", () => {
    expect(fadeIn.initial).toMatchObject({ opacity: 0 });
    expect(fadeIn.animate).toMatchObject({ opacity: 1 });
  });
  it("scaleIn animates scale and opacity", () => {
    expect(scaleIn.initial).toMatchObject({ opacity: 0, scale: 0.95 });
    expect(scaleIn.animate).toMatchObject({ opacity: 1, scale: 1 });
  });
  it("slideInRight animates x and opacity", () => {
    expect(slideInRight.initial).toMatchObject({ opacity: 0, x: 24 });
    expect(slideInRight.animate).toMatchObject({ opacity: 1, x: 0 });
  });
});
