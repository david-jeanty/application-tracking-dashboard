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

test("the dashboard composition expands on desktop and stacks cleanly below it", async ({
  page,
}) => {
  const grid = page.locator("[data-dashboard-secondary-grid]");
  const savedOpportunities = page.locator(
    'section[aria-labelledby="dashboard-saved-opportunities"]',
  );
  const activity = page.locator(
    'section[aria-labelledby="dashboard-activity"]',
  );
  const upcoming = page.locator(
    'section[aria-labelledby="dashboard-upcoming"] > ul',
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/demo");
  await expect(grid).toBeVisible();
  await expect(upcoming).toBeVisible();
  await expect
    .poll(() => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns))
    .toMatch(/\S+\s+\S+/);
  await expect
    .poll(() =>
      upcoming.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    )
    .toMatch(/\S+\s+\S+/);
  expect(
    await savedOpportunities.evaluate(
      (node) => node.getBoundingClientRect().height,
    ),
  ).toBeLessThan(
    await activity.evaluate((node) => node.getBoundingClientRect().height),
  );

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect
    .poll(() => grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns))
    .not.toMatch(/\S+\s+\S+/);
  await expect
    .poll(() =>
      upcoming.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    )
    .toMatch(/\S+\s+\S+/);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(grid).toBeVisible();
  await expect(upcoming).toBeVisible();
  await expect
    .poll(() =>
      upcoming.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    )
    .not.toMatch(/\S+\s+\S+/);
  await expect(
    savedOpportunities.getByRole("link", {
      name: "View saved applications",
    }),
  ).toHaveAttribute("href", "/demo/applications?status=summary%3Asaved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("link", { name: /View analytics/ })).toBeVisible();
});

test("a visitor can walk the whole demo without signing in", async ({ page }) => {
  await page.goto("/demo");

  await navigateTo(page, "Applications");
  await expect(page).toHaveURL(/\/demo\/applications$/);
  await expect(records(page).first()).toBeVisible();

  // Demo records reveal read-only context without leaving the sample index.
  const firstRecord = records(page)
    .first()
    .getByRole("button", { name: /details for/ });
  await firstRecord.click();
  await expect(firstRecord).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/\/demo\/applications$/);

  await navigateTo(page, "Pipeline");
  await expect(page).toHaveURL(/\/demo\/pipeline$/);
  await expect(page.getByRole("heading", { level: 2, name: "Interested" })).toBeVisible();

  await navigateTo(page, "Analytics");
  await expect(page).toHaveURL(/\/demo\/analytics$/);
  await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
});

test("analytics reflows without overflow across desktop, tablet and mobile", async ({
  page,
}) => {
  const workspace = page.locator("[data-analytics-conversion-workspace]");
  const matrix = page.locator("[data-outcome-matrix]");
  const plot = page.locator("[data-activity-plot]");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/demo/analytics");
  await expect(
    page.getByRole("region", { name: "Your funnel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Where your funnel narrows" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Outcome comparison" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Search activity" })).toBeVisible();
  await expect
    .poll(() =>
      workspace.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    )
    .toMatch(/\S+\s+\S+/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 900, height: 1000 });
  await expect
    .poll(() =>
      workspace.evaluate((node) => getComputedStyle(node).gridTemplateColumns),
    )
    .not.toMatch(/\S+\s+\S+/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(matrix).toBeVisible();
  await expect(plot).toBeVisible();
  expect(await plot.evaluate((node) => node.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(220);
  expect(
    await matrix.evaluate(
      (node) => node.getBoundingClientRect().right <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("list", { name: "Weekly application counts" }))
    .toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Weekly application counts" })
      .getByRole("listitem"),
  ).toHaveCount(12);
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

test("the pipeline quietly signals horizontal continuation above mobile", async ({
  page,
}) => {
  await page.goto("/demo/pipeline");

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[data-pipeline-continuation-cue]")).toBeVisible();
  }

  const scroller = page.locator("[data-pipeline-column-scroller]");
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(page.locator("[data-pipeline-continuation-cue]")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("[data-pipeline-continuation-cue]")).toHaveCount(0);
  await expect(scroller).toHaveCSS("overflow-x", "visible");
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
