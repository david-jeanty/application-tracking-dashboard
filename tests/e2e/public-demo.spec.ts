import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Clicks a sidebar link at any viewport.
 *
 * Below `lg` the sidebar lives in a drawer, so the link exists but is not
 * reachable until the drawer is opened. Doing that here keeps the navigation
 * tests about navigation rather than about which breakpoint they ran at.
 */
async function navigateTo(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name })
    .click();
}

/** The record rows, which are the direct children of the applications list. */
function records(page: Page) {
  return page.locator('ul[aria-label="Applications"] > li');
}

/**
 * The demo, exercised the way a visitor with no account meets it.
 *
 * No sign-in step anywhere in this file: if any of it needed a session, the
 * proxy would send the browser to `/login` and every assertion below would
 * fail. That is the point of running it as an end-to-end test rather than a
 * unit one — the middleware is in the loop.
 */
test("the demo workspace is reachable with no account", async ({ page }) => {
  await page.goto("/demo");

  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // The banner, inside the workspace, rather than the sidebar's copy of the
  // words — which is behind the drawer at a phone's width.
  const banner = page.getByRole("main");
  await expect(banner.getByText("Demo workspace", { exact: true })).toBeVisible();
  await expect(
    banner.getByText(/Sample applications are fictional/),
  ).toBeVisible();
});

test("a visitor can walk the whole demo without signing in", async ({ page }) => {
  await page.goto("/demo");

  await navigateTo(page, "Applications");
  await expect(page).toHaveURL(/\/demo\/applications$/);
  await expect(records(page).first()).toBeVisible();

  // Open the first record, then come back.
  await records(page).first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/demo\/applications\/[a-z0-9-]+$/);
  await page.getByRole("link", { name: "Back to applications" }).click();
  await expect(page).toHaveURL(/\/demo\/applications$/);

  await navigateTo(page, "Pipeline");
  await expect(page).toHaveURL(/\/demo\/pipeline$/);
  await expect(page.getByRole("heading", { level: 2, name: "Interested" })).toBeVisible();

  await navigateTo(page, "Analytics");
  await expect(page).toHaveURL(/\/demo\/analytics$/);
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
});

test("the demo filters narrow the sample search", async ({ page }) => {
  await page.goto("/demo/applications");
  await expect(records(page).first()).toBeVisible();
  const all = await records(page).count();

  await page.getByLabel("Filter by status").selectOption("Offer");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveURL(/status=Offer/);
  await expect(records(page).first()).toBeVisible();
  const filtered = await records(page).count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(all);
});

test("the demo offers nothing that would write", async ({ page }) => {
  await page.goto("/demo/pipeline");

  await expect(page.getByRole("button", { name: /^Move/ })).toHaveCount(0);
  await expect(page.getByLabel(/to another status/)).toHaveCount(0);

  await page.goto("/demo/applications");
  await expect(page.getByRole("button", { name: "Add application" })).toHaveCount(0);
});

test("the demo offers the ways out of it", async ({ page }) => {
  await page.goto("/demo");

  const banner = page.getByRole("main");
  await expect(
    banner.getByRole("link", { name: "Create your own workspace" }),
  ).toHaveAttribute("href", "/signup");
  await expect(
    banner.getByRole("link", { name: "Back to Interndex" }),
  ).toHaveAttribute("href", "/");
});

test("an unknown demo application is not found", async ({ page }) => {
  await page.goto("/demo/applications/no-such-application");

  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
