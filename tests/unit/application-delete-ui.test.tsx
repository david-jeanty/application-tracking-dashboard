import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// The delete posts to a Server Action, which cannot run in a unit environment.
// This suite is about the confirmation the student is shown before it does.
vi.mock("@/lib/applications/actions", () => ({
  deleteApplicationAction: vi.fn(),
}));

const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (...args: unknown[]) => redirect(...args),
}));

const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
  },
};
const getApplicationById = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/applications/repository", () => ({
  getApplicationById: (...args: unknown[]) => getApplicationById(...args),
}));

const { default: DeleteApplicationPage } = await import(
  "@/app/(app)/applications/[id]/delete/page"
);

const ID = "11111111-1111-4111-8111-111111111111";

function record(overrides: Partial<ApplicationRecord> = {}) {
  return {
    id: ID,
    company_name: "RBC",
    company_domain: "rbc.com",
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Rejected",
    archived_at: "2026-08-24T10:00:00.000Z",
    updated_at: "2026-08-24T10:00:00.000Z",
    ...overrides,
  } as ApplicationRecord;
}

async function renderPage(overrides: Partial<ApplicationRecord> = {}) {
  getApplicationById.mockResolvedValue({
    data: record(overrides),
    error: null,
  });
  return render(
    await DeleteApplicationPage({ params: Promise.resolve({ id: ID }) }),
  );
}

describe("the confirmation", () => {
  it("asks the question once, as the page title", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Permanently delete this application?",
    );
  });

  it("names the record, role first and company second", async () => {
    await renderPage();

    expect(screen.getByText("Business Analyst Intern")).toBeInTheDocument();
    expect(screen.getByText("RBC")).toBeInTheDocument();
  });

  it("says what will be lost and that it cannot be undone", async () => {
    await renderPage();

    expect(
      screen.getByText(/deletes the application and its status history/),
    ).toBeInTheDocument();
    expect(screen.getByText(/cannot be\s+undone/)).toBeInTheDocument();
  });

  it("offers the archive as the way out", async () => {
    await renderPage();

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/archive",
    );
  });

  it("keeps the destructive control on the delete action", async () => {
    const { container } = await renderPage();

    const confirm = screen.getByRole("button", { name: "Delete permanently" });
    expect(confirm).toHaveAttribute("type", "submit");
    expect(container.querySelector('input[name="applicationId"]')).toHaveValue(
      ID,
    );
    expect(container.querySelector("form")?.getAttribute("action")).toBeTruthy();
  });

  it("carries the danger on the control, not on the page", async () => {
    const { container } = await renderPage();

    // An intentional invariant rather than a frozen class: exactly one thing
    // on this page is coloured by consequence, and it is the button that
    // causes it. No soft-red panel, and no icon box, sits behind the copy.
    const coloured = container.querySelectorAll('[class*="bg-danger"]');
    expect(coloured).toHaveLength(1);
    expect(coloured[0]).toBe(
      screen.getByRole("button", { name: "Delete permanently" }),
    );
    expect(container.querySelectorAll('[class*="danger-soft"]')).toHaveLength(0);
  });
});

describe("the guard around it", () => {
  it("sends an active application back to its record", async () => {
    getApplicationById.mockResolvedValue({
      data: record({ archived_at: null }),
      error: null,
    });

    await DeleteApplicationPage({ params: Promise.resolve({ id: ID }) });

    expect(redirect).toHaveBeenCalledWith(`/applications/${ID}`);
  });

  it("reads the record under the caller's own identity", async () => {
    await renderPage();

    expect(getApplicationById).toHaveBeenCalledWith(
      supabase,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ID,
    );
  });
});
