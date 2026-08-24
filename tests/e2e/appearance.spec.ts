import { expect, test } from "@playwright/test";

const STORAGE_KEY = "jobtrack.appearance";

/**
 * These run against the public sign-in page, so they need no test account.
 * What is being checked is the theme foundation itself: the preference has to
 * be on `<html>` before the page paints, not applied afterwards by React.
 */
test.describe("appearance", () => {
  test("defaults to the light palette", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
  });

  test("applies a stored preference before the page renders", async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ mode: "dark", accent: "violet" })],
    );

    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  });

  test("the preference is applied by the head script, not after hydration", async ({
    page,
  }) => {
    const html = await (await page.request.get("/login")).text();
    const script = html.indexOf(STORAGE_KEY);
    const body = html.indexOf("<body");

    // A preference applied after `<body>` begins is a preference the visitor
    // sees flash.
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(body);
  });

  test("system mode follows a dark operating system", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await context.close();
  });

  test("system mode follows a light operating system", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });

  test("an explicit choice overrides the operating system", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ mode: "light", accent: "rose" })],
    );
    const page = await context.newPage();
    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });

  test("a corrupted preference falls back instead of breaking the page", async ({
    page,
  }) => {
    await page.addInitScript(
      ([key]) => window.localStorage.setItem(key, "{ not json"),
      [STORAGE_KEY],
    );

    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("without JavaScript the operating system still drives the palette", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme: "dark",
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto("/login");

    const background = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    const [r, g, b] = background.match(/\d+/g)!.map(Number);

    // A dark surface, not the light default.
    expect((r + g + b) / 3).toBeLessThan(80);
    await context.close();
  });
});
