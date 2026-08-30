import { expect, test } from "@playwright/test";

const hasAuthenticatedTestEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_SITE_URL &&
    process.env.E2E_USER_EMAIL &&
    process.env.E2E_USER_PASSWORD,
);

test.describe("authenticated shell", () => {
  test.skip(
    !hasAuthenticatedTestEnvironment,
    "Requires an isolated Supabase project and E2E test-account credentials.",
  );

  test("shows protected navigation and supports mobile navigation", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(process.env.E2E_USER_EMAIL ?? "");
    await page.getByLabel("Password").fill(process.env.E2E_USER_PASSWORD ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.getByRole("link", { name: "Applications" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).last().click();
  });
});
