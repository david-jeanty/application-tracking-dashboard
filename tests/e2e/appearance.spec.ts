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

/**
 * The sign-in page never renders the Appearance controls, so these prove the
 * theme follows the operating system for a visitor who has not been anywhere
 * near Settings — the case a Settings-scoped listener would have missed.
 */
test.describe("a live operating-system change", () => {
  async function themeOf(page: import("@playwright/test").Page) {
    return page.evaluate(() => ({
      attribute: document.documentElement.dataset.theme,
      background: getComputedStyle(document.body).backgroundColor,
    }));
  }

  function brightness(background: string) {
    const [r, g, b] = background.match(/\d+/g)!.map(Number);
    return (r + g + b) / 3;
  }

  test("system mode follows the desktop switching to dark", async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    const page = await context.newPage();
    await page.goto("/login");
    expect((await themeOf(page)).attribute).toBe("light");

    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // The attribute is only worth anything if the paint followed it.
    expect(brightness((await themeOf(page)).background)).toBeLessThan(80);
    await context.close();
  });

  test("system mode follows the desktop switching back to light", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    const page = await context.newPage();
    await page.goto("/login");
    expect((await themeOf(page)).attribute).toBe("dark");

    await page.emulateMedia({ colorScheme: "light" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(brightness((await themeOf(page)).background)).toBeGreaterThan(200);
    await context.close();
  });

  test("an explicit light choice ignores the desktop switching to dark", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "light" });
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ mode: "light", accent: "blue" })],
    );
    const page = await context.newPage();
    await page.goto("/login");

    await page.emulateMedia({ colorScheme: "dark" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(brightness((await themeOf(page)).background)).toBeGreaterThan(200);
    await context.close();
  });

  test("an explicit dark choice ignores the desktop switching to light", async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: "dark" });
    await context.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [STORAGE_KEY, JSON.stringify({ mode: "dark", accent: "blue" })],
    );
    const page = await context.newPage();
    await page.goto("/login");

    await page.emulateMedia({ colorScheme: "light" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(brightness((await themeOf(page)).background)).toBeLessThan(80);
    await context.close();
  });
});
