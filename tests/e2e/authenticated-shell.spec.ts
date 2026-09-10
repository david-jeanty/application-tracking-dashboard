import { createClient } from "@supabase/supabase-js";
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

  test("renders application content on the first dashboard navigation after login", async ({
    page,
  }, testInfo) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      { auth: { persistSession: false } },
    );
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: process.env.E2E_USER_EMAIL ?? "",
      password: process.env.E2E_USER_PASSWORD ?? "",
    });
    expect(signInError).toBeNull();

    const company = `First Navigation ${testInfo.project.name} ${Date.now()}`;
    const { data: application, error: insertError } = await supabase
      .from("applications")
      .insert({
        company_name: company,
        original_job_title: "Dashboard First Load Intern",
        normalized_job_category: "Business Analysis",
        current_status: "Interested",
        location: "Not specified",
        application_source: "E2E",
        work_term_season: "Winter 2027",
      })
      .select("id")
      .single<{ id: string }>();
    expect(insertError).toBeNull();
    expect(application).not.toBeNull();

    try {
      await page.goto("/login");
      await page
        .getByLabel("Email address")
        .fill(process.env.E2E_USER_EMAIL ?? "");
      await page
        .getByLabel("Password")
        .fill(process.env.E2E_USER_PASSWORD ?? "");
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page).toHaveURL(/\/dashboard/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(company, { exact: true }).first()).toBeVisible();
      await expect(
        page.getByText("Your dashboard could not be loaded"),
      ).toHaveCount(0);
    } finally {
      if (application) {
        const { error: deleteError } = await supabase
          .from("applications")
          .delete()
          .eq("id", application.id);
        expect(deleteError).toBeNull();
      }
      await supabase.auth.signOut({ scope: "local" });
    }
  });
});
