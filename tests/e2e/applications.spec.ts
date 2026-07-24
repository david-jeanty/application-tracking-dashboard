import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const hasAuthenticatedTestEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.E2E_USER_EMAIL &&
    process.env.E2E_USER_PASSWORD,
);

const companyPrefix = "Ticket 2.1 E2E";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(process.env.E2E_USER_EMAIL ?? "");
  await page.getByLabel("Password").fill(process.env.E2E_USER_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function cleanTicketApplications() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: process.env.E2E_USER_EMAIL ?? "",
    password: process.env.E2E_USER_PASSWORD ?? "",
  });
  if (signInError) throw signInError;

  const { error: deleteError } = await supabase
    .from("applications")
    .delete()
    .like("company_name", `${companyPrefix}%`);
  await supabase.auth.signOut();
  if (deleteError) throw deleteError;
}

test.describe("applications ticket 2.1", () => {
  test.skip(
    !hasAuthenticatedTestEnvironment,
    "Requires a confirmed isolated E2E account.",
  );

  test.beforeEach(async () => {
    await cleanTicketApplications();
  });

  test.afterEach(async () => {
    await cleanTicketApplications();
  });

  test("shows server validation and creates one responsive list record", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/applications");

    await expect(
      page.getByRole("heading", { name: "Your applications" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "No applications yet" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add application" }).click();
    await page.getByRole("button", { name: "Save application" }).click();
    await expect(page.getByText("Company name is required.")).toBeVisible();
    await expect(
      page.getByText("Original job title is required."),
    ).toBeVisible();
    await expect(
      page.getByText("Select a normalized category."),
    ).toBeVisible();

    const company = `${companyPrefix} ${Date.now()}`;
    await page.getByLabel("Company name").fill(company);
    await page
      .getByLabel("Original job title")
      .fill("Business Analyst Intern");
    await page
      .getByLabel("Normalized category")
      .selectOption("Business Analysis");
    await page.getByLabel("Current status").selectOption("Applied");
    await page.getByLabel("Work-term season").fill("Summer 2027");

    const submit = page.getByRole("button", { name: "Save application" });
    await submit.evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected the submit locator to resolve to a button.");
      }
      button.click();
      button.click();
    });
    await expect(
      page.getByText("Application added successfully."),
    ).toBeVisible();
    await expect(page.getByText(company)).toHaveCount(2);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileCard = page
      .getByRole("heading", { name: company })
      .locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
    await expect(mobileCard).toBeVisible();
    await expect(mobileCard.getByText("Business Analyst Intern")).toBeVisible();
    await expect(mobileCard.getByText("Status: Applied")).toBeVisible();
  });
});
