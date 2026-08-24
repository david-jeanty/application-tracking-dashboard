import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArchivedApplicationsList } from "@/components/applications/archived-list";
import {
  NeedsAttention,
  RecentActivity,
} from "@/components/dashboard/dashboard-sections";
import { LOGO_DEV_HOST } from "@/lib/branding/logo";
import type {
  ApplicationListItem,
  ApplicationRecord,
} from "@/lib/applications/types";
import type { AttentionItem } from "@/lib/dashboard/attention";
import type { ActivityEntry } from "@/lib/dashboard/calculate";

const TOKEN = "pk_test_publishable_key";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Every form on these surfaces posts to a Server Action, which cannot run in a
// unit environment. What these tests are about is the branding beside each
// company, not what the forms do.
vi.mock("@/lib/applications/actions", () => ({
  archiveApplicationAction: vi.fn(),
  clearNextActionAction: vi.fn(),
  restoreApplicationAction: vi.fn(),
  updateApplicationStatusAction: vi.fn(),
  updateNextActionAction: vi.fn(),
}));

const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
  },
};
const listActiveApplications = vi.fn();
const getApplicationById = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabase,
}));
vi.mock("@/lib/applications/repository", () => ({
  getApplicationById: (...args: unknown[]) => getApplicationById(...args),
  listActiveApplications: (...args: unknown[]) =>
    listActiveApplications(...args),
}));

const { ApplicationFields } = await import(
  "@/components/applications/application-fields"
);
const { ApplicationList } = await import(
  "@/components/applications/application-list"
);
const { default: ApplicationDetailPage } = await import(
  "@/app/(app)/applications/[id]/page"
);

function listItem(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "Shopify",
    company_domain: "shopify.com",
    original_job_title: "Data Analyst Intern",
    normalized_job_category: "Data and Analytics",
    current_status: "Applied",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    work_term_season: "Summer 2027",
    date_applied: "2026-08-22",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

/** Logo images, in DOM order. The mark is decorative, so it has no role. */
function logoSources(container: HTMLElement): string[] {
  return [...container.querySelectorAll("img")].map(
    (image) => image.getAttribute("src") ?? "",
  );
}

describe("company branding across the product", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = TOKEN;
    listActiveApplications.mockReset();
    getApplicationById.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  });

  describe("applications list", () => {
    it("renders the branding component beside every company", async () => {
      listActiveApplications.mockResolvedValue({
        data: [listItem()],
        error: null,
      });

      const { container } = render(await ApplicationList({}));

      // Once on the mobile card and once in the desktop table; both layouts
      // are in the document, and CSS decides which is seen.
      const sources = logoSources(container);
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        expect(source).toContain(`https://${LOGO_DEV_HOST}/shopify.com?`);
      }
      // The company name is still ordinary linked text.
      expect(screen.getAllByRole("link", { name: "Shopify" })).toHaveLength(2);
    });

    it("renders an application with no domain without crashing", async () => {
      listActiveApplications.mockResolvedValue({
        data: [
          listItem({ company_name: "KPMG", company_domain: null }),
          listItem({
            id: "22222222-2222-4222-8222-222222222222",
            company_name: "Shopify",
            company_domain: "shopify.com",
          }),
        ],
        error: null,
      });

      const { container } = render(await ApplicationList({}));

      // Only the branded row asks Logo.dev for anything.
      expect(logoSources(container)).toHaveLength(2);
      expect(screen.getAllByRole("link", { name: "KPMG" })).toHaveLength(2);
      // The lettermark stands in for the row with no domain.
      expect(container.textContent).toContain("K");
    });

    it("asks Logo.dev for nothing when no token is configured", async () => {
      delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
      listActiveApplications.mockResolvedValue({
        data: [listItem()],
        error: null,
      });

      const { container } = render(await ApplicationList({}));

      expect(logoSources(container)).toHaveLength(0);
      expect(screen.getAllByRole("link", { name: "Shopify" })).toHaveLength(2);
    });
  });

  describe("archive list", () => {
    const archived = listItem({
      archived_at: "2026-08-24T10:00:00.000Z",
      company_name: "Deloitte",
      company_domain: "deloitte.com",
    });

    it("gives archived applications the same subtle mark", () => {
      const { container } = render(
        <ArchivedApplicationsList applications={[archived]} />,
      );

      const sources = logoSources(container);
      expect(sources).toHaveLength(2);
      for (const source of sources) {
        expect(source).toContain(`https://${LOGO_DEV_HOST}/deloitte.com?`);
      }
      expect(screen.getAllByRole("link", { name: "Deloitte" })).toHaveLength(2);
    });

    it("renders an archived application with no domain", () => {
      const { container } = render(
        <ArchivedApplicationsList
          applications={[{ ...archived, company_domain: null }]}
        />,
      );

      expect(logoSources(container)).toHaveLength(0);
      expect(screen.getAllByRole("link", { name: "Deloitte" })).toHaveLength(2);
    });
  });

  describe("dashboard needs attention", () => {
    const item = (overrides: Partial<AttentionItem> = {}): AttentionItem => ({
      applicationId: "11111111-1111-4111-8111-111111111111",
      companyName: "KPMG",
      companyDomain: "kpmg.com",
      jobTitle: "Audit Intern",
      status: "Applied",
      reason: "overdue-action",
      detail: "Follow up with recruiter",
      timing: "Overdue by 2 days",
      daysFromToday: -2,
      ...overrides,
    });

    it("shows the mark without changing what the section says", () => {
      const { container } = render(<NeedsAttention items={[item()]} />);

      expect(logoSources(container)[0]).toContain(
        `https://${LOGO_DEV_HOST}/kpmg.com?`,
      );
      // Exactly the entry the attention rules produced, worded as before.
      expect(screen.getByText("KPMG")).toBeInTheDocument();
      expect(screen.getByText("Follow up with recruiter")).toBeInTheDocument();
      expect(screen.getByText("Overdue by 2 days")).toBeInTheDocument();
    });

    it("keeps every entry when none of them has a domain", () => {
      const { container } = render(
        <NeedsAttention
          items={[
            item({ companyDomain: null }),
            item({
              applicationId: "22222222-2222-4222-8222-222222222222",
              companyName: "BMO",
              companyDomain: null,
              timing: "Due tomorrow",
            }),
          ]}
        />,
      );

      expect(logoSources(container)).toHaveLength(0);
      expect(container.querySelectorAll("li")).toHaveLength(2);
      expect(screen.getByText("BMO")).toBeInTheDocument();
    });

    it("renders the caught-up card unchanged when nothing is due", () => {
      const { container } = render(<NeedsAttention items={[]} />);

      expect(logoSources(container)).toHaveLength(0);
      expect(screen.getByText(/caught up/i)).toBeInTheDocument();
    });
  });

  describe("dashboard recent activity", () => {
    const entry = (overrides: Partial<ActivityEntry> = {}): ActivityEntry => ({
      applicationId: "11111111-1111-4111-8111-111111111111",
      companyName: "Microsoft",
      companyDomain: "microsoft.com",
      description: "Moved to Interview",
      status: "Interview",
      day: "2026-08-26",
      changedAt: "2026-08-26T12:00:00.000Z",
      ...overrides,
    });

    it("shows the mark on each row, from the domain already on the entry", () => {
      const { container } = render(
        <RecentActivity entries={[entry()]} today="2026-08-26" />,
      );

      expect(logoSources(container)[0]).toContain(
        `https://${LOGO_DEV_HOST}/microsoft.com?`,
      );
      const row = container.querySelector("li") as HTMLElement;
      expect(
        within(row).getByRole("link", { name: "Microsoft" }),
      ).toBeInTheDocument();
      expect(within(row).getByText("Moved to Interview")).toBeInTheDocument();
    });

    it("renders an entry whose application has no domain", () => {
      const { container } = render(
        <RecentActivity
          entries={[entry({ companyName: "BMO", companyDomain: null })]}
          today="2026-08-26"
        />,
      );

      expect(logoSources(container)).toHaveLength(0);
      expect(screen.getByRole("link", { name: "BMO" })).toBeInTheDocument();
    });
  });

  describe("application detail", () => {
    const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";

    const renderDetail = async (record: Partial<ApplicationRecord> = {}) => {
      getApplicationById.mockResolvedValue({
        data: {
          id: APPLICATION_ID,
          company_name: "Shopify",
          company_domain: "shopify.com",
          original_job_title: "Data Analyst Intern",
          normalized_job_category: "Data and Analytics",
          classification_confidence: null,
          location: "Toronto, ON",
          work_arrangement: "Hybrid",
          application_url: null,
          application_source: "LinkedIn",
          job_description: null,
          application_deadline: null,
          date_applied: "2026-08-22",
          current_status: "Applied",
          work_term_season: "Summer 2027",
          work_term_duration: null,
          salary: null,
          notes: null,
          next_action: null,
          next_action_due_date: null,
          created_at: "2026-08-20T10:00:00.000Z",
          updated_at: "2026-08-20T10:00:00.000Z",
          archived_at: null,
          ...record,
        },
        error: null,
      });

      return render(
        await ApplicationDetailPage({
          params: Promise.resolve({ id: APPLICATION_ID }),
          searchParams: Promise.resolve({}),
        }),
      );
    };

    it("shows the mark beside the company identity in the header", async () => {
      const { container } = await renderDetail();

      expect(logoSources(container)).toEqual([
        expect.stringContaining(`https://${LOGO_DEV_HOST}/shopify.com?`),
      ]);
      // Larger here than in a list row, and still smaller than the name.
      expect(container.querySelector("img")?.getAttribute("width")).toBe("40");
      expect(
        screen.getByRole("heading", { level: 1, name: "Shopify" }),
      ).toBeInTheDocument();
    });

    it("renders the header for an application with no domain", async () => {
      const { container } = await renderDetail({
        company_name: "KPMG",
        company_domain: null,
      });

      expect(logoSources(container)).toHaveLength(0);
      expect(
        screen.getByRole("heading", { level: 1, name: "KPMG" }),
      ).toBeInTheDocument();
    });
  });

  describe("the manual company website field", () => {
    it("is offered as an optional detail, never required", () => {
      render(<ApplicationFields optionalDetailsOpen />);

      const field = screen.getByLabelText("Company website");
      expect(field).toBeInTheDocument();
      expect(field).not.toBeRequired();
      expect(field).toHaveAttribute("placeholder", "shopify.com");
    });

    it("says plainly what it is for", () => {
      render(<ApplicationFields optionalDetailsOpen />);

      // The hint is associated with the input, so it is read and not merely
      // seen beside it.
      expect(screen.getByLabelText("Company website")).toHaveAccessibleDescription(
        "Optional. Used to display the company logo.",
      );
    });

    it("prefills the stored domain when editing", () => {
      render(
        <ApplicationFields
          defaultValues={{ companyDomain: "shopify.com" }}
          optionalDetailsOpen
        />,
      );

      expect(screen.getByLabelText("Company website")).toHaveValue(
        "shopify.com",
      );
    });

    it("shows a validation message against the field itself", () => {
      render(
        <ApplicationFields
          errors={{
            companyDomain: ["Enter a company domain such as shopify.com."],
          }}
          optionalDetailsOpen
        />,
      );

      const field = screen.getByLabelText("Company website");
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(
        /Enter a company domain such as shopify\.com\./,
      );
    });
  });
});
