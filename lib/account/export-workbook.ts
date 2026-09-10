import "server-only";

import ExcelJS from "exceljs";
import { displayOptionalText, safeExternalUrl } from "@/lib/applications/mapper";
import type { ApplicationRecord } from "@/lib/applications/types";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";
import type {
  AccountExportData,
  ProfileExportRecord,
  StatusHistoryExportRecord,
} from "@/lib/account/export";

const DATE_ONLY_FORMAT = "yyyy-mm-dd";
const DATE_TIME_FORMAT = "yyyy-mm-dd hh:mm";

/**
 * A date-only Postgres value (`YYYY-MM-DD`, no time zone) as the Excel serial
 * value that displays that same calendar day.
 *
 * ExcelJS derives the serial purely from the JS `Date`'s UTC instant
 * (`utils.dateToExcel` is `25569 + d.getTime() / 86_400_000`), so building the
 * date at UTC midnight is what makes the day Excel shows match the day
 * Postgres stored, with no timezone free to shift it.
 */
function excelDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * A `timestamptz` instant as the Excel serial value that displays it as a
 * reader in `timeZone` would read their own clock at that moment — the same
 * wall-clock convention `formatDateTime` uses for this app's other date-time
 * displays.
 *
 * Excel serials carry no time zone of their own, so the only way to make one
 * *display* a given wall-clock time is to hand ExcelJS a `Date` whose UTC
 * fields already equal that wall clock — `hourCycle: "h23"` rather than
 * `hour12: false` sidesteps an ICU quirk where midnight otherwise formats as
 * hour "24" instead of "00".
 */
function excelDateTime(
  value: string | null,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0);

  return new Date(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
    ),
  );
}

/** "Unknown" is this field's own "not set" state, not a real arrangement a student chose. */
function blankIfUnknownArrangement(value: string): string | null {
  return value === "Unknown" ? null : value;
}

/**
 * A studio-quality look for a plain data grid: a bold, frozen header row and
 * a header-row filter, applied the same way to every sheet in the workbook.
 */
function applyHeaderStyle(worksheet: ExcelJS.Worksheet, columnCount: number): void {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.getRow(1).font = { bold: true };
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnCount },
  };
}

const APPLICATION_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Company", key: "company_name", width: 24 },
  { header: "Company domain", key: "company_domain", width: 22 },
  { header: "Job title", key: "original_job_title", width: 30 },
  { header: "Category", key: "normalized_job_category", width: 24 },
  { header: "Category confidence", key: "classification_confidence", width: 18 },
  { header: "Status", key: "current_status", width: 14 },
  { header: "Location", key: "location", width: 22 },
  { header: "Work arrangement", key: "work_arrangement", width: 16 },
  { header: "Work term season", key: "work_term_season", width: 18 },
  { header: "Work term duration", key: "work_term_duration", width: 18 },
  { header: "Date applied", key: "date_applied", width: 14, style: { numFmt: DATE_ONLY_FORMAT } },
  {
    header: "Application deadline",
    key: "application_deadline",
    width: 18,
    style: { numFmt: DATE_ONLY_FORMAT },
  },
  { header: "Next action", key: "next_action", width: 26 },
  {
    header: "Next action due date",
    key: "next_action_due_date",
    width: 18,
    style: { numFmt: DATE_ONLY_FORMAT },
  },
  { header: "Application source", key: "application_source", width: 20 },
  { header: "Job posting URL", key: "application_url", width: 38 },
  { header: "Salary", key: "salary", width: 16 },
  {
    header: "Notes",
    key: "notes",
    width: 44,
    style: { alignment: { wrapText: true, vertical: "top" } },
  },
  {
    header: "Job description",
    key: "job_description",
    width: 54,
    style: { alignment: { wrapText: true, vertical: "top" } },
  },
  { header: "Created at", key: "created_at", width: 18, style: { numFmt: DATE_TIME_FORMAT } },
  { header: "Updated at", key: "updated_at", width: 18, style: { numFmt: DATE_TIME_FORMAT } },
  { header: "Archived at", key: "archived_at", width: 18, style: { numFmt: DATE_TIME_FORMAT } },
  { header: "Application ID", key: "id", width: 38 },
];

function addApplicationsSheet(
  workbook: ExcelJS.Workbook,
  applications: ApplicationRecord[],
): void {
  const worksheet = workbook.addWorksheet("Applications");
  worksheet.columns = APPLICATION_COLUMNS;

  for (const application of applications) {
    const externalUrl = safeExternalUrl(application.application_url);
    const row = worksheet.addRow({
      company_name: application.company_name,
      company_domain: application.company_domain,
      original_job_title: application.original_job_title,
      normalized_job_category: application.normalized_job_category,
      classification_confidence: application.classification_confidence,
      current_status: application.current_status,
      location: displayOptionalText(application.location),
      work_arrangement: blankIfUnknownArrangement(application.work_arrangement),
      work_term_season: application.work_term_season,
      work_term_duration: application.work_term_duration,
      date_applied: excelDateOnly(application.date_applied),
      application_deadline: excelDateOnly(application.application_deadline),
      next_action: application.next_action,
      next_action_due_date: excelDateOnly(application.next_action_due_date),
      application_source: displayOptionalText(application.application_source),
      // A real hyperlink when the stored URL is safe to follow, matching the
      // same guard `ApplicationOriginalPosting` renders behind; otherwise the
      // raw stored text, so a record is never silently missing its value.
      application_url: externalUrl
        ? { text: externalUrl, hyperlink: externalUrl }
        : application.application_url,
      salary: application.salary,
      notes: application.notes,
      job_description: application.job_description,
      created_at: excelDateTime(application.created_at),
      updated_at: excelDateTime(application.updated_at),
      archived_at: excelDateTime(application.archived_at),
      id: application.id,
    });
    row.commit();
  }

  applyHeaderStyle(worksheet, APPLICATION_COLUMNS.length);
}

const STATUS_HISTORY_COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Application ID", key: "application_id", width: 38 },
  { header: "Company", key: "company_name", width: 24 },
  { header: "Job title", key: "original_job_title", width: 30 },
  { header: "Work term season", key: "work_term_season", width: 18 },
  { header: "Previous status", key: "previous_status", width: 16 },
  { header: "New status", key: "new_status", width: 16 },
  { header: "Changed at", key: "changed_at", width: 18, style: { numFmt: DATE_TIME_FORMAT } },
];

function addStatusHistorySheet(
  workbook: ExcelJS.Workbook,
  applications: ApplicationRecord[],
  history: StatusHistoryExportRecord[],
): void {
  const worksheet = workbook.addWorksheet("Status history");
  worksheet.columns = STATUS_HISTORY_COLUMNS;

  // The identity columns a reader needs to place an event without cross
  // referencing the Applications sheet — every event's application appears
  // there too, read from the same account in the same request, so this join
  // can never miss.
  const applicationById = new Map(applications.map((application) => [application.id, application]));

  const sorted = [...history].sort((first, second) => {
    const firstApplication = applicationById.get(first.application_id);
    const secondApplication = applicationById.get(second.application_id);
    const byCompany = (firstApplication?.company_name ?? "").localeCompare(
      secondApplication?.company_name ?? "",
    );
    if (byCompany !== 0) return byCompany;
    return first.changed_at.localeCompare(second.changed_at);
  });

  for (const event of sorted) {
    const application = applicationById.get(event.application_id);
    const row = worksheet.addRow({
      application_id: event.application_id,
      company_name: application?.company_name ?? null,
      original_job_title: application?.original_job_title ?? null,
      work_term_season: application?.work_term_season ?? null,
      previous_status: event.previous_status,
      new_status: event.new_status,
      changed_at: excelDateTime(event.changed_at),
    });
    row.commit();
  }

  applyHeaderStyle(worksheet, STATUS_HISTORY_COLUMNS.length);
}

function addProfileSheet(
  workbook: ExcelJS.Workbook,
  profile: ProfileExportRecord | null,
  account: { email: string | null },
): void {
  const worksheet = workbook.addWorksheet("Profile");
  worksheet.columns = [
    { header: "Field", key: "field", width: 22 },
    {
      header: "Value",
      key: "value",
      width: 44,
      style: { alignment: { wrapText: true, vertical: "top" } },
    },
  ];

  const fields: { field: string; value: string | number | Date | null }[] = profile
    ? [
        { field: "Full name", value: profile.full_name },
        { field: "Email", value: account.email },
        { field: "Profile created", value: excelDateTime(profile.created_at) },
        { field: "Profile updated", value: excelDateTime(profile.updated_at) },
      ]
    : [
        { field: "Email", value: account.email },
        {
          field: "Profile",
          value: "No profile record was found for this account.",
        },
      ];

  for (const { field, value } of fields) {
    const row = worksheet.addRow({ field, value });
    if (value instanceof Date) {
      row.getCell("value").numFmt = DATE_TIME_FORMAT;
    }
    row.commit();
  }

  applyHeaderStyle(worksheet, 2);
}

/**
 * The self-service export as a workbook, not a query result: one sheet a
 * student can open, filter, and read without knowing what a database column
 * is.
 *
 * Pure and synchronous — every value it needs is already the RLS-scoped data
 * `buildAccountExport` read, so this has nothing left to fetch and nothing
 * that can fail. Only serializing the finished workbook to bytes
 * (`workbook.xlsx.writeBuffer()`) is asynchronous, which is why the route
 * calls that separately rather than this function awaiting it itself.
 */
export function buildAccountExportWorkbook(data: AccountExportData): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Interndex";
  workbook.created = new Date();

  addApplicationsSheet(workbook, data.applications);
  addStatusHistorySheet(workbook, data.applications, data.application_status_history);
  addProfileSheet(workbook, data.profile, data.account);

  return workbook;
}

/** The workbook, ready to serve as an HTTP response body. */
export async function buildAccountExportWorkbookBuffer(
  data: AccountExportData,
): Promise<Buffer> {
  const workbook = buildAccountExportWorkbook(data);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
