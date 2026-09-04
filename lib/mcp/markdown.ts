import type { FieldChange } from "@/lib/mcp/update-job";
import type { JobDetail, JobSummary } from "@/lib/validation/mcp";

/**
 * The plain-Markdown replacement for the ChatGPT widget layer this file
 * used to sit beside (`lib/mcp/app-views.ts` and `lib/mcp/app-views/*`,
 * removed). Every tool result a student reads now carries ordinary
 * Markdown built here, on the server, from data the tool actually saved or
 * returned — never from the model, and never from a `ui://` resource a host
 * has to render specially. A host that understands Markdown can use this
 * text with minimal rewriting; a host that does not still gets a readable
 * plain-text answer, because nothing here depends on being rendered by
 * anything beyond an ordinary Markdown viewer.
 *
 * The one rule every formatter here follows: only show a field the tool was
 * actually given, parsed, saved, or read back. There is no fallback text for
 * a missing category, deadline, note, salary, or source — an absent value
 * omits its row or section instead of being guessed at.
 */

/** At most this many notes are ever shown, so a long note field cannot turn a confirmation into a second copy of the posting. */
const MAXIMUM_NOTES = 4;

/** A table cell may not contain a literal pipe or a line break. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n+/g, " ").trim();
}

/** Builds a two-column Markdown table from labelled values, dropping any row whose value is empty. */
function fieldTable(
  rows: ReadonlyArray<readonly [string, string | null | undefined]>,
): string[] {
  const present = rows.filter(
    (row): row is readonly [string, string] => !!row[1] && row[1].trim() !== "",
  );

  if (!present.length) return [];

  return [
    "| Field | Value |",
    "| --- | --- |",
    ...present.map(([label, value]) => `| ${label} | ${escapeCell(value)} |`),
  ];
}

/**
 * Splits a notes field into short, individually useful lines, capped at
 * `MAXIMUM_NOTES`. This never composes or paraphrases anything: each bullet
 * is a line the student (or the model, on their behalf) actually wrote into
 * `notes`, with a leading list marker stripped if one was already there.
 */
function noteBullets(notes: string | null | undefined): string[] {
  if (!notes) return [];

  return notes
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAXIMUM_NOTES);
}

/** What `save_job` actually saved, and nothing it did not. */
export type SaveConfirmationFields = {
  title: string;
  company: string;
  status: string;
  category?: string | null;
  location?: string | null;
  workTerm?: string | null;
  duration?: string | null;
  deadline?: string | null;
  source?: string | null;
  salary?: string | null;
  notes?: string | null;
};

/**
 * The one canonical confirmation shape for a successful save: a short
 * sentence, a field table holding only what was actually saved, an optional
 * "Key details" list drawn verbatim from `notes`, and — only for the one
 * factual gap worth naming, a missing deadline — a single follow-up line.
 * Nothing here is invented: every row and every note comes from `fields`.
 */
export function formatSaveConfirmation(fields: SaveConfirmationFields): string {
  const lines = [
    `Saved **${fields.title}** at **${fields.company}** as **${fields.status}**.`,
    "",
    ...fieldTable([
      ["Company", fields.company],
      ["Title", fields.title],
      ["Status", fields.status],
      ["Category", fields.category],
      ["Location", fields.location],
      ["Work term", fields.workTerm],
      ["Duration", fields.duration],
      ["Deadline", fields.deadline],
      ["Source", fields.source],
      ["Salary", fields.salary],
    ]),
  ];

  const notes = noteBullets(fields.notes);
  if (notes.length) {
    lines.push("", "**Key details**", "", ...notes.map((note) => `- ${note}`));
  }

  // The one factual follow-up this server can state with confidence: the
  // posting saved with no deadline on file. Never an invented next action.
  if (!fields.deadline) {
    lines.push("", "No deadline was listed.");
  }

  return lines.join("\n");
}

/** Display labels for the field names `diffApplications` reports, shared with `update_job`'s confirmation table. */
const CHANGED_FIELD_LABELS: Record<string, string> = {
  company: "Company",
  company_domain: "Company domain",
  job_title: "Title",
  location: "Location",
  status: "Status",
  category: "Category",
  work_arrangement: "Work arrangement",
  job_description: "Job description",
  job_url: "Job URL",
  source: "Source",
  deadline: "Deadline",
  date_applied: "Date applied",
  work_term: "Work term",
  duration: "Duration",
  salary: "Salary",
  notes: "Notes",
  next_action: "Next action",
  next_action_due_date: "Next action due",
};

export type UpdateConfirmationFields = {
  title: string;
  company: string;
  changed: readonly FieldChange[];
};

/**
 * `update_job`'s normal-text confirmation: a sentence naming the record that
 * changed, then a table of only the fields that actually changed, each shown
 * as its new value (never a full description — `diffApplications` already
 * truncates a long one before this ever sees it).
 */
export function formatUpdateConfirmation(fields: UpdateConfirmationFields): string {
  if (!fields.changed.length) {
    return `No fields changed on **${fields.title}** at **${fields.company}**.`;
  }

  return [
    `Updated **${fields.title}** at **${fields.company}**.`,
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...fields.changed.map((change) => {
      const label = CHANGED_FIELD_LABELS[change.field] ?? change.field;
      const value = change.to === null ? "Cleared" : escapeCell(change.to);
      return `| ${label} | ${value} |`;
    }),
  ].join("\n");
}

/**
 * `list_jobs`'s normal-text answer: a count, then a compact table of exactly
 * the applications the filters matched — never a UI resource, and never any
 * application the filters did not match.
 */
export function formatJobList(
  applications: readonly JobSummary[],
  hasMore: boolean,
): string {
  if (!applications.length) return "No applications found.";

  const lines = [
    `**${applications.length}** application${applications.length === 1 ? "" : "s"} found.`,
    "",
    "| Company | Title | Status | Work term | Deadline |",
    "| --- | --- | --- | --- | --- |",
    ...applications.map((application) => {
      const company = escapeCell(application.company);
      const title = escapeCell(application.job_title);
      const status = escapeCell(application.status);
      const workTerm = application.work_term ? escapeCell(application.work_term) : "—";
      const deadline = application.deadline ? escapeCell(application.deadline) : "—";
      return `| ${company} | ${title} | ${status} | ${workTerm} | ${deadline} |`;
    }),
  ];

  if (hasMore) {
    lines.push(
      "",
      "More applications matched than shown — narrow the filters or raise the limit.",
    );
  }

  return lines.join("\n");
}

/**
 * `get_job`'s normal-text answer: a sentence, a field table of everything
 * short enough for one, and the two long fields — the job description and
 * notes — as their own sections underneath, verbatim, since a single detail
 * read is exactly where a student wants that text in full.
 */
export function formatJobDetail(job: JobDetail): string {
  const lines = [
    `**${job.job_title}** at **${job.company}** — **${job.status}**.`,
    "",
    ...fieldTable([
      ["Category", job.category],
      ["Location", job.location],
      ["Work arrangement", job.work_arrangement],
      ["Work term", job.work_term],
      ["Duration", job.duration],
      ["Source", job.source],
      ["Job URL", job.job_url],
      ["Deadline", job.deadline],
      ["Date applied", job.date_applied],
      ["Salary", job.salary],
      ["Next action", job.next_action],
      ["Next action due", job.next_action_due_date],
    ]),
  ];

  if (job.job_description) {
    lines.push("", "**Job description**", "", job.job_description);
  }
  if (job.notes) {
    lines.push("", "**Notes**", "", job.notes);
  }

  return lines.join("\n");
}
