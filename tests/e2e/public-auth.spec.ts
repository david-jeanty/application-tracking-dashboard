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

  await expect(page.getByTestId("mobile-brand")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeInViewport();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeInViewport();
});

test("login fields are reachable in a predictable keyboard order", async ({
  page,
}) => {
  await page.goto("/login");

  const visibleBrandLink = page.locator('a[href="/"]:visible', {
    hasText: "JobTrack",
  });
  await visibleBrandLink.focus();
  await page.keyboard.press("Tab");

  await expect(page.getByLabel("Email address")).toBeFocused();
});
