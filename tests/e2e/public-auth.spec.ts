import { expect, test } from "@playwright/test";

test("login page is publicly available and accessible", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: "Sign in to your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toHaveAttribute("href", "/forgot-password");
});

test("signup and recovery routes expose their real forms", async ({ page }) => {
  await page.goto("/signup");
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();

  await page.goto("/forgot-password");
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
});

test("protected routes redirect an unauthenticated visitor", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Sign in to your account" }),
  ).toBeVisible();
});

test("login remains usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/login");

  // One wordmark at every width now, rather than a desktop panel and a mobile
  // copy of it.
  await expect(page.getByTestId("brand")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

test("login fields are reachable in a predictable keyboard order", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByTestId("brand").focus();
  // Wordmark, then the demo link in the header, then the first field.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Explore the demo" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email address")).toBeFocused();
});

test("the public homepage is the front door for a signed-out visitor", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "The job tracker your AI can use.",
    }),
  ).toBeVisible();
});

test("the homepage's first fold holds the message, both CTAs and the product on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const hero = page.getByRole("heading", { level: 1 }).locator("..");
  await expect(hero.getByRole("heading", { level: 1 })).toBeInViewport();
  await expect(
    page.getByText(/Save every posting and application in one place/),
  ).toBeInViewport();
  await expect(
    hero.getByRole("link", { name: "Connect your AI" }),
  ).toBeInViewport();
  await expect(
    hero.getByRole("link", { name: "Explore the demo" }),
  ).toBeInViewport();
  await expect(
    page.getByText("Works with ChatGPT · Claude · MCP-compatible AI"),
  ).toBeInViewport();
  // A recognizable part of the real product, not only the copy above it.
  await expect(
    page.locator('ul[aria-label="Applications"] > li').first(),
  ).toBeInViewport();
});

test("the homepage header stays a single compact line on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const header = page.getByRole("banner");
  const demoLink = header.getByRole("link", { name: "Try the demo" });
  await expect(demoLink).toBeInViewport();
  await expect(header.getByText("Demo", { exact: true })).toBeVisible();

  // Sign in and Create account step out at this width — both stay reachable
  // from the hero just below — so only the wordmark and the demo link share
  // the header row.
  await expect(header.getByRole("link", { name: "Create account" })).toBeHidden();
  await expect(header.getByRole("link", { name: "Sign in" })).toBeHidden();

  // A wrapped button would stand taller than a single line of its own text;
  // this is the concrete "did it wrap" check rather than an eyeballed one.
  const [headerBox, demoBox] = await Promise.all([
    header.boundingBox(),
    demoLink.boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(demoBox).not.toBeNull();
  expect(demoBox!.height).toBeLessThan(48);
  expect(headerBox!.height).toBeLessThan(80);
});

test("the privacy page is public and linked from the homepage footer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();

  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your application records stay yours.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "The Interndex Capture browser extension",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/installed locally as an unpacked extension/i),
  ).toBeVisible();
});

test("a visitor can reach the demo from the homepage and the auth pages", async ({
  page,
}) => {
  // Scoped to the header on each page: the demo is deliberately reachable from
  // several places, so an unscoped name matches more than one link.
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Public navigation" })
    .getByRole("link", { name: "Try the demo" })
    .click();
  await expect(page).toHaveURL(/\/demo$/);

  for (const path of ["/signup", "/login"]) {
    await page.goto(path);
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Explore the demo" })
      .click();
    await expect(page, path).toHaveURL(/\/demo$/);
  }
});

test("the demo offers the way back to the homepage", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("main").getByRole("link", { name: "Back to Interndex" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "The job tracker your AI can use.",
  );
});
