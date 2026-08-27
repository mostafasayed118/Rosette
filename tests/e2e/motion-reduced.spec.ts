import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { getBaseUrl } from "./base-url";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("Reduced motion", () => {
  it("honors prefers-reduced-motion: reduce", async () => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: "domcontentloaded" });
    const root = page.locator("[data-motion-root]");
    await root.waitFor({ state: "visible", timeout: 10_000 });
    const transition = await page.evaluate(() => {
      const el = document.querySelector("[data-motion-root] *");
      if (!el) return null;
      const style = getComputedStyle(el);
      return style.transitionDuration;
    });
    expect(transition === "0s" || transition === "0.01ms" || transition === null).toBeTruthy();
    await context.close();
  });
});
