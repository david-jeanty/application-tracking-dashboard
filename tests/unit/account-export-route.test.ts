import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAccountExport = vi.fn();
vi.mock("@/lib/account/export", () => ({
  buildAccountExport: (...args: unknown[]) => buildAccountExport(...args),
}));

const getUser = vi.fn();
const sessionSupabase = { auth: { getUser } };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => sessionSupabase,
}));

// The workbook itself is not mocked: this proves the route serves real xlsx
// bytes, not just that it calls the right builder.
const { GET } = await import("@/app/api/account/export/route");

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const EXPORTED_DATA = {
  exported_at: "2026-09-08T00:00:00.000Z",
  account: { id: USER_ID, email: "student@example.com" },
  profile: {
    full_name: "Alex Smith",
    school: "University of Waterloo",
    academic_program: "Business Administration",
    graduation_year: 2027,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
  applications: [
    {
      id: "app-1",
      company_name: "Nokia",
      company_domain: "nokia.com",
      original_job_title: "Business Analyst Intern",
      normalized_job_category: "Business Analysis",
      classification_confidence: "High",
      location: "Ottawa, ON",
      work_arrangement: "Hybrid",
      application_url: null,
      application_source: "Referral",
      job_description: null,
      application_deadline: null,
      date_applied: "2026-08-24",
      current_status: "Applied",
      work_term_season: "Winter 2027",
      work_term_duration: null,
      salary: null,
      notes: null,
      next_action: null,
      next_action_due_date: null,
      created_at: "2026-08-24T12:00:00.000Z",
      updated_at: "2026-08-24T12:00:00.000Z",
      archived_at: null,
    },
  ],
  application_status_history: [
    {
      application_id: "app-1",
      previous_status: null,
      new_status: "Applied",
      changed_at: "2026-08-24T12:00:00.000Z",
    },
  ],
};

beforeEach(() => {
  buildAccountExport.mockReset();
  getUser.mockReset();
});

describe("GET /api/account/export", () => {
  it("refuses an unauthenticated request", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(buildAccountExport).not.toHaveBeenCalled();
  });

  it("scopes the export to the authenticated user's own id, never a client-supplied one", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({ outcome: "exported", data: EXPORTED_DATA });

    await GET();

    expect(buildAccountExport).toHaveBeenCalledWith(
      sessionSupabase,
      USER_ID,
      "student@example.com",
    );
  });

  it("returns the export as an .xlsx attachment with the correct content type", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({ outcome: "exported", data: EXPORTED_DATA });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(XLSX_CONTENT_TYPE);

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename="interndex-export-\d{4}-\d{2}-\d{2}\.xlsx"/);
  });

  it("returns bytes that parse back into the three expected worksheets", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({ outcome: "exported", data: EXPORTED_DATA });

    const response = await GET();
    const arrayBuffer = await response.arrayBuffer();
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as never);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Applications",
      "Status history",
      "Profile",
    ]);
  });

  it("returns 500 rather than a partial file when the export read fails", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({ outcome: "error", message: "boom" });

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
