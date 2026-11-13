import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationRecord } from "@/lib/applications/types";

afterEach(cleanup);

const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPLICATION_ID = "11111111-1111-4111-8111-111111111111";

const session = vi.hoisted(() => ({ userId: "" }));
const agentReads = vi.hoisted(() => ({ list: vi.fn(), panel: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  usePathname: () => "/applications",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: session.userId } } }) },
  }),
}));
vi.mock("@/lib/agent/resumes-repository", () => ({
  listTailoredResumes: (...args: unknown[]) => agentReads.list(...args),
  readApplicationAgentPanel: (...args: unknown[]) => agentReads.panel(...args),
}));
vi.mock("@/lib/applications/actions", () => ({
  archiveApplicationAction: vi.fn(),
  restoreApplicationAction: vi.fn(),
  updateApplicationStatusAction: vi.fn(),
  updateNextActionAction: vi.fn(),
  clearNextActionAction: vi.fn(),
}));

const record: ApplicationRecord = {
  id: APPLICATION_ID,
  company_name: "RBC",
  company_domain: null,
  original_job_title: "Business Analyst Intern",
  normalized_job_category: "Business Analysis",
  classification_confidence: "High",
  location: "Toronto",
  work_arrangement: "Hybrid",
  application_url: null,
  application_source: "LinkedIn",
  job_description: null,
  application_deadline: null,
  date_applied: null,
  current_status: "Applied",
  work_term_season: "Winter 2027",
  work_term_duration: null,
  salary: null,
  notes: null,
  next_action: null,
  next_action_due_date: null,
  created_at: "2026-08-20T10:00:00.000Z",
  updated_at: "2026-08-22T10:00:00.000Z",
  archived_at: null,
};

vi.mock("@/lib/applications/repository", () => ({
  getApplicationById: async () => ({ data: record, error: null }),
  listApplicationStatusHistory: async () => ({ data: [], error: null }),
}));

const { default: ResumesPage } = await import("@/app/(app)/resumes/page");
const { default: ApplicationDetailPage } = await import("@/app/(app)/applications/[id]/page");

const originalOwner = process.env.OWNER_USER_ID;
beforeEach(() => {
  process.env.OWNER_USER_ID = OWNER;
  agentReads.list.mockReset().mockResolvedValue({ data: [], error: null });
  agentReads.panel.mockReset().mockResolvedValue({
    data: { resume: null, usage: { calls: 0, estimated_tokens: 0, by_tool: [] } },
    error: null,
  });
});
afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

const detailProps = {
  params: Promise.resolve({ id: APPLICATION_ID }),
  searchParams: Promise.resolve({}),
};

describe("the Resumes page", () => {
  it("does not exist for other students, and runs no query", async () => {
    session.userId = STUDENT;
    await expect(ResumesPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(agentReads.list).not.toHaveBeenCalled();
  });

  it("lists the owner's resumes", async () => {
    session.userId = OWNER;
    render(await ResumesPage());
    expect(screen.getByRole("heading", { name: "Resumes" })).toBeInTheDocument();
    expect(agentReads.list).toHaveBeenCalledWith(expect.anything(), OWNER);
  });
});

describe("the application page", () => {
  it("runs no agent query and shows no panel for other students", async () => {
    session.userId = STUDENT;
    render(await ApplicationDetailPage(detailProps));
    expect(agentReads.panel).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Tailored resume" })).toBeNull();
  });

  it("shows the tailored resume panel to the owner", async () => {
    session.userId = OWNER;
    render(await ApplicationDetailPage(detailProps));
    expect(agentReads.panel).toHaveBeenCalledWith(expect.anything(), OWNER, APPLICATION_ID);
    expect(screen.getByRole("heading", { name: "Tailored resume" })).toBeInTheDocument();
  });
});
