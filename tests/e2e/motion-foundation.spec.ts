import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { getBaseUrl } from "./base-url";

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  const context = await browser.newContext();
  page = await context.newPage();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe("Motion foundation smoke", () => {
  it("root layout mounts MotionProvider", async () => {
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-motion-root]").waitFor({ state: "visible", timeout: 10_000 });
  });

  it("a page renders without console errors", async () => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${getBaseUrl()}/en/cairo`, { waitUntil: "domcontentloaded" });
    await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
    expect(errors).toEqual([]);
  });
});
