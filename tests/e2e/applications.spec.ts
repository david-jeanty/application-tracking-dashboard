import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const hasAuthenticatedTestEnvironment = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    process.env.E2E_USER_EMAIL &&
    process.env.E2E_USER_PASSWORD,
);
const hasTwoUserTestEnvironment = Boolean(
  hasAuthenticatedTestEnvironment &&
    process.env.E2E_USER_B_EMAIL &&
    process.env.E2E_USER_B_PASSWORD,
);

const ticket21CompanyPrefix = "Ticket 2.1 E2E";
const ticket22CompanyPrefix = "Ticket 2.2 E2E";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(process.env.E2E_USER_EMAIL ?? "");
  await page.getByLabel("Password").fill(process.env.E2E_USER_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function signInAsUserB(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill(process.env.E2E_USER_B_EMAIL ?? "");
  await page
    .getByLabel("Password")
    .fill(process.env.E2E_USER_B_PASSWORD ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function authenticatedClient(email: string, password: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    { auth: { persistSession: false } },
  );
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return supabase;
}

async function expectSafeNotFound(page: Page) {
  await expect(page.getByText("404", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The page may have moved or you may not have access to it.",
    ),
  ).toBeVisible();

  return page.locator("main").last().innerText();
}

async function cleanTicketApplications(companyPrefix: string) {
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
  await supabase.auth.signOut({ scope: "local" });
  if (deleteError) throw deleteError;
}

test.describe("applications ticket 2.1", () => {
  test.skip(
    !hasAuthenticatedTestEnvironment,
    "Requires a confirmed isolated E2E account.",
  );

  test.beforeEach(async ({}, testInfo) => {
    await cleanTicketApplications(
      `${ticket21CompanyPrefix} ${testInfo.project.name}`,
    );
  });

  test.afterEach(async ({}, testInfo) => {
    await cleanTicketApplications(
      `${ticket21CompanyPrefix} ${testInfo.project.name}`,
    );
  });

  test("shows server validation and creates one responsive list record", async ({
    page,
  }, testInfo) => {
    await signIn(page);
    await page.goto("/applications");

    await expect(
      page.getByRole("heading", { name: "Applications", exact: true }),
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

    const company = `${ticket21CompanyPrefix} ${testInfo.project.name} ${Date.now()}`;
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
    await expect(page.getByText(company)).toHaveCount(1);

    // Each application row is one link whose accessible name is the job
    // title; the company name and status render as text inside it. Locating
    // by role rather than by a styling class keeps this assertion tied to
    // the row's actual accessible structure, not an implementation detail
    // that changes with each visual redesign.
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileRow = page.getByRole("link", {
      name: "Business Analyst Intern",
    });
    await expect(mobileRow).toBeVisible();
    await expect(mobileRow.getByText(company)).toBeVisible();
    await expect(mobileRow.getByText("Status: Applied")).toBeVisible();
  });
});

test.describe("applications ticket 2.2", () => {
  test.skip(
    !hasAuthenticatedTestEnvironment,
    "Requires a confirmed isolated E2E account.",
  );

  test.beforeEach(async ({}, testInfo) => {
    await cleanTicketApplications(
      `${ticket22CompanyPrefix} ${testInfo.project.name}`,
    );
  });

  test.afterEach(async ({}, testInfo) => {
    await cleanTicketApplications(
      `${ticket22CompanyPrefix} ${testInfo.project.name}`,
    );
  });

  test("opens, validates, and edits a disposable application", async ({
    page,
  }, testInfo) => {
    await signIn(page);
    await page.goto("/applications");
    await page.getByRole("button", { name: "Add application" }).click();

    const company = `${ticket22CompanyPrefix} ${testInfo.project.name} ${Date.now()}`;
    await page.getByLabel("Company name").fill(company);
    await page
      .getByLabel("Original job title")
      .fill("Revenue Operations Intern");
    await page
      .getByLabel("Normalized category")
      .selectOption("Revenue Operations");
    await page.getByLabel("Current status").selectOption("Applied");
    await page.getByLabel("Work-term season").fill("Fall 2027");
    await page.getByText("Optional details").click();
    await page.getByLabel("Location").fill("Toronto, ON");
    await page.getByLabel("Date applied").fill("2027-07-24");
    await page.getByLabel("Notes").fill("Created for Ticket 2.2 E2E.");
    await page.getByRole("button", { name: "Save application" }).click();
    await expect(
      page.getByText("Application added successfully."),
    ).toBeVisible();

    // The row's accessible name is the job title, not the company: the whole
    // row is one link, and the company renders as text inside it rather than
    // as its own link. Opening the record means activating that row link.
    await page
      .getByRole("link", { name: "Revenue Operations Intern" })
      .filter({ visible: true })
      .click();

    // Below the desktop breakpoint the index is a full-width list and the
    // row link navigates straight to the detail page, matching every other
    // width. At and above it (application-records.tsx's own DESKTOP_QUERY,
    // "(min-width: 1280px)"), the index becomes a master-detail layout: the
    // same click instead selects the row and opens an inline preview aside
    // without navigating, and "Open full application" is the deliberate,
    // singular way from there into the full record — that link is where
    // editing lives, so reaching it is part of this test's real intent
    // rather than an assumption to route around. Checked against the actual
    // viewport rather than the Playwright project name, so this keeps
    // matching the application's own breakpoint if a project is ever
    // renamed or added.
    const viewportWidth = page.viewportSize()?.width ?? 0;
    if (viewportWidth >= 1280) {
      const preview = page.getByRole("complementary", {
        name: "Selected application preview",
      });
      await expect(
        preview.getByRole("heading", { name: "Revenue Operations Intern" }),
      ).toBeVisible();
      await expect(preview.getByText(company)).toBeVisible();
      await preview
        .getByRole("link", { name: "Open full application" })
        .click();
    }

    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: company })).toBeVisible();
    await expect(page.getByText("Revenue Operations Intern")).toBeVisible();

    // Scoped to the Location field specifically: "Toronto, ON" also appears
    // inside the identity line's "location · work term" summary just above
    // it, so a bare text match is ambiguous by design, not by accident. The
    // detail page's fields are a `<dt>`/`<dd>` list, so the field's own
    // label is the precise way to reach its value.
    const applicationSection = page.getByRole("region", {
      exact: true,
      name: "Application",
    });
    await expect(
      applicationSection
        .locator("dt", { hasText: "Location" })
        .locator("xpath=following-sibling::dd[1]"),
    ).toHaveText("Toronto, ON");
    await expect(page.getByText("Jul 24, 2027")).toBeVisible();

    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Company name")).toHaveValue(company);
    await expect(page.getByLabel("Original job title")).toHaveValue(
      "Revenue Operations Intern",
    );
    await expect(page.getByLabel("Date applied")).toHaveValue("2027-07-24");

    await page.getByLabel("Company name").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Company name is required.")).toBeVisible();

    const updatedCompany = `${company} Updated`;
    await page.getByLabel("Company name").fill(updatedCompany);
    await page
      .getByLabel("Notes")
      .fill("Updated without changing application status.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+\?updated=1$/);
    await expect(
      page.getByText("Application updated successfully."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: updatedCompany }),
    ).toBeVisible();
    await expect(
      page.getByText("Updated without changing application status."),
    ).toBeVisible();

    await page.getByRole("link", { name: "Edit", exact: true }).click();
    const staleVersion = await page
      .locator('input[name="expectedUpdatedAt"]')
      .inputValue();
    const applicationId = new URL(page.url()).pathname.split("/")[2];
    const ownerClient = await authenticatedClient(
      process.env.E2E_USER_EMAIL ?? "",
      process.env.E2E_USER_PASSWORD ?? "",
    );
    const { data: concurrentUpdate, error: concurrentUpdateError } =
      await ownerClient
      .from("applications")
      .update({ notes: "Newer concurrent value." })
      .eq("id", applicationId)
      .select("updated_at")
      .single();
    expect(concurrentUpdateError).toBeNull();
    expect(concurrentUpdate?.updated_at).not.toBe(staleVersion);
    await ownerClient.auth.signOut({ scope: "local" });

    await page
      .getByLabel("Company name")
      .fill(`${updatedCompany} Stale overwrite`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByText(
        "This application changed after you opened it. Reload the page, review the latest values, and try again.",
      ),
    ).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Company name")).toHaveValue(updatedCompany);
    await expect(page.getByLabel("Notes")).toHaveValue(
      "Newer concurrent value.",
    );
    await page.getByLabel("Current status").selectOption("Interview");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Status: Interview")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("heading", { name: updatedCompany }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit", exact: true }),
    ).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("returns the same safe result for missing and non-owner records", async ({
    page,
  }, testInfo) => {
    test.skip(
      !hasTwoUserTestEnvironment,
      "Requires two confirmed isolated E2E accounts.",
    );

    const ownerClient = await authenticatedClient(
      process.env.E2E_USER_EMAIL ?? "",
      process.env.E2E_USER_PASSWORD ?? "",
    );
    const company = `${ticket22CompanyPrefix} ${testInfo.project.name} isolation ${Date.now()}`;
    const { data: application, error: createError } = await ownerClient
      .from("applications")
      .insert({
        company_name: company,
        original_job_title: "Owner-only Intern",
        normalized_job_category: "Other",
        current_status: "Interested",
        work_term_season: "Fall 2027",
        location: "Not specified",
        application_source: "Not specified",
      })
      .select("id")
      .single();
    expect(createError).toBeNull();

    await signInAsUserB(page);
    await page.goto(`/applications/${application?.id}`);
    const nonOwnerResult = await expectSafeNotFound(page);

    const missingId = "00000000-0000-4000-8000-000000000001";
    await page.goto(`/applications/${missingId}`);
    expect(await expectSafeNotFound(page)).toBe(nonOwnerResult);

    await page.goto(`/applications/${application?.id}/edit`);
    expect(await expectSafeNotFound(page)).toBe(nonOwnerResult);

    const userBClient = await authenticatedClient(
      process.env.E2E_USER_B_EMAIL ?? "",
      process.env.E2E_USER_B_PASSWORD ?? "",
    );
    const { data: nonOwnerUpdate, error: nonOwnerUpdateError } =
      await userBClient
        .from("applications")
        .update({ notes: "Non-owner overwrite" })
        .eq("id", application?.id)
        .select("id");
    expect(nonOwnerUpdateError).toBeNull();
    expect(nonOwnerUpdate).toEqual([]);

    await userBClient.auth.signOut({ scope: "local" });
    await ownerClient.auth.signOut({ scope: "local" });
  });
});
