import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { AccountExportData } from "@/lib/account/export";
import {
  buildAccountExportWorkbook,
  buildAccountExportWorkbookBuffer,
} from "@/lib/account/export-workbook";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const APPLICATION_COLUMN_HEADERS = [
  "Company",
  "Company domain",
  "Job title",
  "Category",
  "Category confidence",
  "Status",
  "Location",
  "Work arrangement",
  "Work term season",
  "Work term duration",
  "Date applied",
  "Application deadline",
  "Next action",
  "Next action due date",
  "Application source",
  "Job posting URL",
  "Salary",
  "Notes",
  "Job description",
  "Created at",
  "Updated at",
  "Archived at",
  "Application ID",
];

const STATUS_HISTORY_COLUMN_HEADERS = [
  "Application ID",
  "Company",
  "Job title",
  "Work term season",
  "Previous status",
  "New status",
  "Changed at",
];

function baseData(overrides: Partial<AccountExportData> = {}): AccountExportData {
  return {
    exported_at: "2026-09-08T00:00:00.000Z",
    account: { id: USER_ID, email: "student@example.com" },
    profile: {
      full_name: "Alex Smith",
      school: "University of Waterloo",
      academic_program: "Business Administration",
      graduation_year: 2027,
      created_at: "2026-01-01T05:00:00.000Z",
      updated_at: "2026-01-02T05:00:00.000Z",
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
        application_url: "https://nokia.com/careers/123",
        application_source: "Referral",
        job_description: "Line one\nLine two",
        application_deadline: "2026-09-30",
        date_applied: "2026-08-24",
        current_status: "Applied",
        work_term_season: "Winter 2027",
        work_term_duration: "4 months",
        salary: "$22/hr",
        notes: "Follow up after the info fair.",
        next_action: "Follow up",
        next_action_due_date: "2026-09-15",
        created_at: "2026-08-24T16:30:00.000Z",
        updated_at: "2026-08-25T12:00:00.000Z",
        archived_at: null,
      },
      {
        id: "app-2",
        company_name: "Shopify",
        company_domain: null,
        original_job_title: "Data Analyst Co-op",
        normalized_job_category: "Data and Analytics",
        classification_confidence: null,
        location: "Not specified",
        work_arrangement: "Unknown",
        application_url: null,
        application_source: "Not specified",
        job_description: null,
        application_deadline: null,
        date_applied: null,
        current_status: "Interested",
        work_term_season: "Summer 2027",
        work_term_duration: null,
        salary: null,
        notes: null,
        next_action: null,
        next_action_due_date: null,
        created_at: "2026-08-20T09:00:00.000Z",
        updated_at: "2026-08-20T09:00:00.000Z",
        archived_at: null,
      },
    ],
    application_status_history: [
      {
        application_id: "app-1",
        previous_status: null,
        new_status: "Applied",
        changed_at: "2026-08-24T16:30:00.000Z",
      },
      {
        application_id: "app-2",
        previous_status: null,
        new_status: "Interested",
        changed_at: "2026-08-20T09:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

/** Builds the workbook and round-trips it through a real xlsx buffer. */
async function buildAndReload(data: AccountExportData) {
  const buffer = await buildAccountExportWorkbookBuffer(data);
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer as never);
  return reloaded;
}

function headerTexts(worksheet: ExcelJS.Worksheet): string[] {
  const headerRow = worksheet.getRow(1);
  const texts: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    texts.push(String(cell.value));
  });
  return texts;
}

describe("buildAccountExportWorkbook", () => {
  it("produces exactly three worksheets, in order", async () => {
    const workbook = await buildAndReload(baseData());

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Applications",
      "Status history",
      "Profile",
    ]);
  });

  it("labels the Applications sheet with every user-facing application field", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;

    expect(headerTexts(sheet)).toEqual(APPLICATION_COLUMN_HEADERS);
  });

  it("labels the Status history sheet with enough identity columns to stand alone", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Status history")!;

    expect(headerTexts(sheet)).toEqual(STATUS_HISTORY_COLUMN_HEADERS);
  });

  it("labels the Profile sheet as a field/value pair", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Profile")!;

    expect(headerTexts(sheet)).toEqual(["Field", "Value"]);
  });

  it("bolds and freezes the header row, and turns on filtering, for every sheet", async () => {
    const workbook = await buildAndReload(baseData());

    for (const name of ["Applications", "Status history", "Profile"]) {
      const sheet = workbook.getWorksheet(name)!;
      expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
      expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
      expect(sheet.autoFilter).toBeTruthy();
    }
  });

  it("gives every column a sensible, non-default width", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;

    for (const column of sheet.columns) {
      expect(column.width).toBeGreaterThan(0);
    }
  });

  it("wraps the free-text notes and job description columns", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;

    const notesCell = sheet.getRow(2).getCell(APPLICATION_COLUMN_HEADERS.indexOf("Notes") + 1);
    const descriptionCell = sheet
      .getRow(2)
      .getCell(APPLICATION_COLUMN_HEADERS.indexOf("Job description") + 1);

    expect(notesCell.alignment?.wrapText).toBe(true);
    expect(descriptionCell.alignment?.wrapText).toBe(true);
  });

  it("writes date-only fields as real Excel dates with a date-only format", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;
    const cell = sheet.getRow(2).getCell(APPLICATION_COLUMN_HEADERS.indexOf("Date applied") + 1);

    expect(cell.value).toBeInstanceOf(Date);
    const value = cell.value as Date;
    expect(
      `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
        value.getUTCDate(),
      ).padStart(2, "0")}`,
    ).toBe("2026-08-24");
    expect(cell.numFmt).toBe("yyyy-mm-dd");
  });

  it("writes timestamps as real Excel dates, converted to a readable local time, with a date-time format", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;
    const cell = sheet.getRow(2).getCell(APPLICATION_COLUMN_HEADERS.indexOf("Created at") + 1);

    expect(cell.value).toBeInstanceOf(Date);
    expect(cell.numFmt).toBe("yyyy-mm-dd hh:mm");
    // 2026-08-24T16:30:00Z is 12:30 in America/Toronto (EDT, UTC-4) — the
    // wall clock a student reads elsewhere in the app for this same instant.
    const value = cell.value as Date;
    expect(value.getUTCHours()).toBe(12);
    expect(value.getUTCMinutes()).toBe(30);
  });

  it("leaves a blank cell rather than the database's own placeholder values", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;
    const shopifyRow = sheet.getRow(3);

    expect(shopifyRow.getCell(APPLICATION_COLUMN_HEADERS.indexOf("Location") + 1).value).toBeNull();
    expect(
      shopifyRow.getCell(APPLICATION_COLUMN_HEADERS.indexOf("Application source") + 1).value,
    ).toBeNull();
    expect(
      shopifyRow.getCell(APPLICATION_COLUMN_HEADERS.indexOf("Work arrangement") + 1).value,
    ).toBeNull();
  });

  it("writes a safe application URL as a real hyperlink", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Applications")!;
    const cell = sheet.getRow(2).getCell(APPLICATION_COLUMN_HEADERS.indexOf("Job posting URL") + 1);

    expect(cell.hyperlink).toBe("https://nokia.com/careers/123");
  });

  it("enriches every status history row with the identity of its application", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Status history")!;
    const col = (name: string) => STATUS_HISTORY_COLUMN_HEADERS.indexOf(name) + 1;

    const rows = [2, 3].map((rowNumber) => {
      const row = sheet.getRow(rowNumber);
      return {
        applicationId: row.getCell(col("Application ID")).value,
        company: row.getCell(col("Company")).value,
        jobTitle: row.getCell(col("Job title")).value,
        workTerm: row.getCell(col("Work term season")).value,
        previousStatus: row.getCell(col("Previous status")).value,
        newStatus: row.getCell(col("New status")).value,
      };
    });

    // Sorted by company name: Nokia before Shopify.
    expect(rows[0]).toEqual({
      applicationId: "app-1",
      company: "Nokia",
      jobTitle: "Business Analyst Intern",
      workTerm: "Winter 2027",
      previousStatus: null,
      newStatus: "Applied",
    });
    expect(rows[1]).toEqual({
      applicationId: "app-2",
      company: "Shopify",
      jobTitle: "Data Analyst Co-op",
      workTerm: "Summer 2027",
      previousStatus: null,
      newStatus: "Interested",
    });
  });

  it("lists the exportable profile fields, pulling email from the account rather than the profile row", async () => {
    const workbook = await buildAndReload(baseData());
    const sheet = workbook.getWorksheet("Profile")!;

    const fields = new Map<string, unknown>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      fields.set(String(row.getCell(1).value), row.getCell(2).value);
    }

    expect(fields.get("Full name")).toBe("Alex Smith");
    expect(fields.get("Email")).toBe("student@example.com");
    expect(fields.get("School")).toBe("University of Waterloo");
    expect(fields.get("Academic program")).toBe("Business Administration");
    expect(fields.get("Graduation year")).toBe(2027);
    expect(fields.get("Profile created")).toBeInstanceOf(Date);
    expect(fields.get("Profile updated")).toBeInstanceOf(Date);
  });

  it("never includes OAuth grants, sessions, credentials, or any raw user id", async () => {
    const workbook = buildAccountExportWorkbook(baseData());
    const serialized = JSON.stringify(
      workbook.worksheets.map((sheet) => sheet.getSheetValues()),
    );

    expect(serialized).not.toContain(USER_ID);
    expect(serialized.toLowerCase()).not.toMatch(/grant|token|credential|session/);
  });

  it("still produces a readable Profile sheet when no profile row exists", async () => {
    const workbook = await buildAndReload(baseData({ profile: null }));
    const sheet = workbook.getWorksheet("Profile")!;

    const fields = new Map<string, unknown>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      fields.set(String(row.getCell(1).value), row.getCell(2).value);
    }

    expect(fields.get("Email")).toBe("student@example.com");
    expect(String(fields.get("Profile"))).toMatch(/no profile record/i);
  });
});
