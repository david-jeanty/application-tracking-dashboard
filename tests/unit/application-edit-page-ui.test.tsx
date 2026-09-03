import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// A stable reference, so a test can assert on the same bound action the form
// actually submits to rather than a fresh mock `.bind` hands back each time.
// `useActionState` renders whatever this resolves to as the next state, so it
// must resolve to a valid `ApplicationActionState` rather than `undefined`.
const boundUpdateApplicationAction = vi.fn().mockResolvedValue({ status: "success" });

vi.mock("@/lib/applications/actions", () => ({
  updateApplicationAction: Object.assign(vi.fn(), {
    bind: vi.fn(() => boundUpdateApplicationAction),
  }),
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

const { default: EditApplicationPage } = await import(
  "@/app/(app)/applications/[id]/edit/page"
);

const ID = "11111111-1111-4111-8111-111111111111";

async function renderPage(overrides: Partial<ApplicationRecord> = {}) {
  getApplicationById.mockResolvedValue({
    data: {
      id: ID,
      company_name: "RBC",
      company_domain: "rbc.com",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      current_status: "Applied",
      location: "Toronto, ON",
      work_arrangement: "Hybrid",
      work_term_season: "Winter 2027",
      archived_at: null,
      updated_at: "2026-08-24T10:00:00.000Z",
      ...overrides,
    } as ApplicationRecord,
    error: null,
  });
  return render(
    await EditApplicationPage({ params: Promise.resolve({ id: ID }) }),
  );
}

describe("the edit page hierarchy", () => {
  it("has one page title and no eyebrow above it", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Edit application");

    // The accent eyebrow that used to label the page "Application" is gone.
    expect(screen.queryByText("Application", { exact: true })).toBeNull();
  });

  it("names the record beneath the title", async () => {
    await renderPage();

    expect(
      screen.getByText("RBC — Business Analyst Intern"),
    ).toBeInTheDocument();
  });

  it("keeps the concurrency explanation as supporting copy", async () => {
    await renderPage();

    const copy = screen.getByText(/If this record changed after the page loaded/);
    expect(copy).toBeInTheDocument();
    // Quiet: it is not a heading, and it is not the loudest thing on screen.
    expect(copy.tagName).toBe("P");
  });

  it("offers the way back to the record it came from", async () => {
    await renderPage();

    expect(
      screen.getByRole("link", { name: "Application details" }),
    ).toHaveAttribute("href", `/applications/${ID}`);
  });

  it("still renders the shared fields, with optional details open", async () => {
    const { container } = await renderPage();

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByLabelText(/Company name/)).toHaveValue("RBC");
  });

  it("does not wrap the form in a card", async () => {
    const { container } = await renderPage();

    // The form sits on the page under a rule; nothing draws a box around it.
    const form = container.querySelector("form");
    expect(form?.closest('[class*="rounded-record"]')).toBeNull();
  });
});

describe("an unusual status change is confirmed before it saves", () => {
  beforeEach(() => {
    boundUpdateApplicationAction.mockClear();
  });

  it("pauses on Applied to Interested rather than saving right away", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Current status/), {
      target: { value: "Interested" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const dialog = screen.getByRole("dialog", { name: "Confirm status change" });
    expect(dialog).toHaveTextContent(
      "This moves the application backward, from Applied to Interested.",
    );
    expect(boundUpdateApplicationAction).not.toHaveBeenCalled();
  });

  it("leaves the chosen value in place and saves nothing when cancelled", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Current status/), {
      target: { value: "Interested" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep Applied" }));

    expect(
      screen.queryByRole("dialog", { name: "Confirm status change" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Current status/)).toHaveValue("Interested");
    expect(boundUpdateApplicationAction).not.toHaveBeenCalled();
  });

  it("saves exactly once when the change is confirmed", async () => {
    await renderPage();

    fireEvent.change(screen.getByLabelText(/Current status/), {
      target: { value: "Interested" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Change to Interested" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Confirm status change" }),
    ).not.toBeInTheDocument();
    expect(boundUpdateApplicationAction).toHaveBeenCalledTimes(1);
  });

  it("does not pause when the status field is left unchanged", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      screen.queryByRole("dialog", { name: "Confirm status change" }),
    ).not.toBeInTheDocument();
    expect(boundUpdateApplicationAction).toHaveBeenCalledTimes(1);
  });
});
