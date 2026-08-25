import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  UNSPECIFIED_DATABASE_VALUE,
  WORK_ARRANGEMENTS,
  type ApplicationStatus,
  type JobCategory,
} from "@/lib/applications/constants";
import type { ApplicationFormValues } from "@/lib/applications/types";
import { MAXIMUM_DOMAIN_LENGTH } from "@/lib/branding/domain";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What Claude is told about `company_domain`, written once.
 *
 * `save_job` and `update_job` both carry the field, and their guidance must not
 * drift: an assistant that fills the domain in confidently while saving but
 * hesitates while updating would leave half a student's tracker without logos
 * for no reason anybody could explain.
 *
 * The employer examples are guidance to a model, not a lookup table. Nothing in
 * this product maps a company name to a domain — such a list rots, and the
 * knowledge belongs to Claude, which is why the field is supplied over the wire
 * rather than derived here.
 */
const COMPANY_DOMAIN_GUIDANCE =
  "Prefer the employer's own canonical website over an applicant-tracking or job-board host such as Workday, Greenhouse, Lever, LinkedIn, or Indeed. Examples: Shopify → shopify.com, KPMG → kpmg.com, RBC or Royal Bank of Canada → rbc.com, BMO or Bank of Montreal → bmo.com, Microsoft → microsoft.com.";

/** A date being changed may also be cleared, which an empty string expresses. */
const CLEARABLE_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})?$/;

/**
 * One new application, as it crosses the MCP boundary.
 *
 * Argument names are the ones a student would say out loud rather than our
 * column names, and the shape stays plain so it converts cleanly to the JSON
 * Schema that Claude reads. Real validation happens afterwards by mapping into
 * `applicationCreationSchema`, so an MCP write obeys exactly the same rules as
 * a web-form write. Deliberately absent: `user_id`. Ownership comes from the
 * access token and can never be supplied by the caller.
 *
 * `save_job` and `import_jobs` are the same record, one at a time and many at
 * a time, so they share this schema rather than each declaring their own. One
 * saved through a conversation and one carried in from an old spreadsheet are
 * the same kind of thing, and a field either tool could not express would be a
 * field the other quietly stored better.
 *
 * Every field is a value JobTrack already stores. Nothing was added to the
 * schema to make an import look richer.
 */
export const newJobRecordSchema = z.object({
  company: z
    .string()
    .min(1)
    .max(160)
    .describe("Employer name, for example 'Nokia'."),
  job_title: z
    .string()
    .min(1)
    .max(200)
    .describe("The job title exactly as posted."),
  company_domain: z
    .string()
    .max(MAXIMUM_DOMAIN_LENGTH)
    .optional()
    .describe(
      `The employer's canonical public website domain, which is what shows the company's logo. This is ordinary employer metadata: fill it in whenever the employer can be reasonably identified — from the job posting, the employer name, a supplied URL, or ordinary knowledge — rather than waiting for the student to ask for it or for a logo. ${COMPANY_DOMAIN_GUIDANCE} It is not the posting URL, which belongs in job_url. Leave it out only when the employer genuinely cannot be identified confidently; the job still saves without it.`,
    ),
  location: z
    .string()
    .max(200)
    .optional()
    .describe("Where the role is based, for example 'Ottawa, ON'."),
  status: z
    .enum(APPLICATION_STATUSES)
    .optional()
    .describe(
      "Where the student is in the process. Defaults to 'Interested' when the job is only being saved. Use 'Applied' once they have submitted it.",
    ),
  category: z
    .enum(JOB_CATEGORIES)
    .optional()
    .describe(
      "Best-fit job family for the role. Defaults to 'Other' when unclear.",
    ),
  job_description: z
    .string()
    .max(50000)
    .optional()
    .describe("The full job description text, pasted verbatim."),
  job_url: z
    .string()
    .max(2048)
    .optional()
    .describe("Link to the posting. Must begin with http:// or https://."),
  source: z
    .string()
    .max(100)
    .optional()
    .describe("Where the posting was found, for example 'LinkedIn'."),
  deadline: z
    .string()
    .regex(DATE_ONLY_PATTERN)
    .optional()
    .describe("Application deadline as YYYY-MM-DD."),
  date_applied: z
    .string()
    .regex(DATE_ONLY_PATTERN)
    .optional()
    .describe("The date the student applied, as YYYY-MM-DD."),
  work_term: z
    .string()
    .max(80)
    .optional()
    .describe(
      "Recruiting term the role belongs to, for example 'Summer 2027' or 'Fall 2026'.",
    ),
  duration: z
    .string()
    .max(80)
    .optional()
    .describe("Length of the work term, for example '4 months' or '8 months'."),
  work_arrangement: z
    .enum(WORK_ARRANGEMENTS)
    .optional()
    .describe(
      "Whether the role is Remote, Hybrid, or On-site. Defaults to 'Unknown'.",
    ),
  salary: z
    .string()
    .max(100)
    .optional()
    .describe("Pay as the posting states it, for example '$22/hour'."),
  notes: z
    .string()
    .max(20000)
    .optional()
    .describe("Anything else worth remembering about this application."),
  next_action: z
    .string()
    .max(500)
    .optional()
    .describe(
      "What the student needs to do next, for example 'Follow up with the recruiter'.",
    ),
  next_action_due_date: z
    .string()
    .regex(DATE_ONLY_PATTERN)
    .optional()
    .describe(
      "When that next action is due, as YYYY-MM-DD. Only kept alongside a next_action.",
    ),
});

export type NewJobRecord = z.infer<typeof newJobRecordSchema>;

/**
 * The wire contract for `save_job`: exactly one new job record.
 *
 * The same schema `import_jobs` carries an array of, so the two tools cannot
 * drift apart in what they accept.
 */
export const saveJobInputSchema = newJobRecordSchema;

export type SaveJobInput = NewJobRecord;

/** What `save_job` reports back, so a client need not re-read the record. */
export const saveJobOutputSchema = z.object({
  application_id: z.string(),
  company: z.string(),
  job_title: z.string(),
  status: z.enum(APPLICATION_STATUSES),
});

/** Accepts a status however Claude phrased it, then matches our enum exactly. */
function normalizeStatus(value: string | undefined): ApplicationStatus {
  if (!value) return "Interested";
  const match = APPLICATION_STATUSES.find(
    (status) => status.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? "Interested";
}

function normalizeCategory(value: string | undefined): JobCategory {
  if (!value) return "Other";
  const match = JOB_CATEGORIES.find(
    (category) => category.toLowerCase() === value.trim().toLowerCase(),
  );
  return match ?? "Other";
}

/**
 * Maps tool arguments onto the shared creation contract.
 *
 * `work_term_season` is required by the schema but is not something a job
 * description reliably states, so it falls back to the same sentinel the web
 * form uses for unspecified values rather than forcing Claude to invent one.
 *
 * Used by both `save_job` and every record of an `import_jobs` batch, so a job
 * saved in conversation and a job carried in from an old tracker reach the
 * database through the same mapping and the same defaults.
 */
export function toApplicationCreationValues(input: NewJobRecord) {
  return {
    companyName: input.company,
    // Validated and normalized by the shared creation schema, exactly as a
    // value typed into the web form is. Nothing here parses a domain.
    companyDomain: input.company_domain,
    originalJobTitle: input.job_title,
    normalizedJobCategory: normalizeCategory(input.category),
    currentStatus: normalizeStatus(input.status),
    workTermSeason: input.work_term?.trim() || UNSPECIFIED_DATABASE_VALUE,
    location: input.location,
    workArrangement: input.work_arrangement,
    applicationUrl: input.job_url,
    applicationSource: input.source,
    jobDescription: input.job_description,
    applicationDeadline: input.deadline,
    dateApplied: input.date_applied,
    workTermDuration: input.duration,
    salary: input.salary,
    notes: input.notes,
    nextAction: input.next_action,
    nextActionDueDate: input.next_action_due_date,
  };
}

/**
 * The wire contract for `update_job`.
 *
 * Every field is optional except the application identifier, so Claude sends
 * only what the student actually said changed. An omitted field keeps its
 * stored value; an empty string clears a field that is allowed to be empty.
 *
 * Deliberately absent: `user_id`. Ownership comes from the access token, and
 * the application is looked up under that identity before anything is written.
 */
export const updateJobInputSchema = z.object({
  application_id: z
    .uuid()
    .describe("Identifier of the application to update, from the tracker."),
  company: z.string().min(1).max(160).optional(),
  company_domain: z
    .string()
    .max(MAXIMUM_DOMAIN_LENGTH)
    .optional()
    .describe(
      `The employer's canonical public website domain, which is what shows the company's logo, or an empty string to clear it. When an application has none stored and the employer can be reasonably identified, fill it in as part of the update rather than leaving it empty. ${COMPANY_DOMAIN_GUIDANCE}`,
    ),
  job_title: z.string().min(1).max(200).optional(),
  location: z.string().max(200).optional(),
  status: z
    .enum(APPLICATION_STATUSES)
    .optional()
    .describe(
      "New stage, for example 'Applied' once submitted or 'Interview' after an invitation.",
    ),
  category: z.enum(JOB_CATEGORIES).optional(),
  work_arrangement: z.enum(WORK_ARRANGEMENTS).optional(),
  job_description: z.string().max(50000).optional(),
  job_url: z.string().max(2048).optional(),
  source: z.string().max(100).optional(),
  deadline: z
    .string()
    .regex(CLEARABLE_DATE_PATTERN)
    .optional()
    .describe("Application deadline as YYYY-MM-DD, or empty to clear it."),
  date_applied: z
    .string()
    .regex(CLEARABLE_DATE_PATTERN)
    .optional()
    .describe("Date the student applied, as YYYY-MM-DD."),
  work_term: z.string().min(1).max(80).optional(),
  duration: z.string().max(80).optional(),
  salary: z.string().max(100).optional(),
  notes: z.string().max(20000).optional(),
  next_action: z
    .string()
    .max(500)
    .optional()
    .describe(
      "What the student needs to do next, for example 'Follow up with the recruiter' or 'Interview'.",
    ),
  next_action_due_date: z
    .string()
    .regex(CLEARABLE_DATE_PATTERN)
    .optional()
    .describe("When that next action is due, as YYYY-MM-DD."),
});

export type UpdateJobInput = z.infer<typeof updateJobInputSchema>;

/**
 * The complete set of fields `update_job` may write, mapping each tool
 * argument to its form field. Anything absent from this map cannot be reached
 * by the tool, so ownership, timestamps, archive state, and classification
 * columns are all unreachable regardless of what a caller sends.
 */
export const UPDATE_FIELD_MAP = {
  company: "companyName",
  company_domain: "companyDomain",
  job_title: "originalJobTitle",
  location: "location",
  status: "currentStatus",
  category: "normalizedJobCategory",
  work_arrangement: "workArrangement",
  job_description: "jobDescription",
  job_url: "applicationUrl",
  source: "applicationSource",
  deadline: "applicationDeadline",
  date_applied: "dateApplied",
  work_term: "workTermSeason",
  duration: "workTermDuration",
  salary: "salary",
  notes: "notes",
  next_action: "nextAction",
  next_action_due_date: "nextActionDueDate",
} as const satisfies Record<string, keyof ApplicationFormValues>;

/**
 * Applies a partial patch onto the application's current values.
 *
 * The stored record is the base, so a field Claude did not mention keeps its
 * value instead of being erased. The merged result is then validated by the
 * same `applicationUpdateSchema` the web edit form uses.
 */
export function mergeUpdateValues(
  current: ApplicationFormValues,
  patch: UpdateJobInput,
): ApplicationFormValues {
  const merged: ApplicationFormValues = { ...current };

  for (const argument of Object.keys(UPDATE_FIELD_MAP) as (keyof typeof UPDATE_FIELD_MAP)[]) {
    const value = patch[argument];
    if (value === undefined) continue;

    // Each mapped argument is validated to the same value set as its form
    // field, and every form field holds a string, so this write is in range.
    (merged as Record<string, string>)[UPDATE_FIELD_MAP[argument]] = value;
  }

  return merged;
}

/** The tool-facing archive vocabulary, mapped to the repository's own. */
export const ARCHIVE_STATES = ["active", "archived", "all"] as const;

export const LIST_JOBS_DEFAULT_LIMIT = 25;
export const LIST_JOBS_MAXIMUM_LIMIT = 50;

/**
 * The wire contract for `list_jobs`.
 *
 * This is the tool that removes the need for a student to know an identifier:
 * Claude lists, reads the short records, and picks the one the student meant.
 * Every filter is therefore a plain, literal predicate — there is no fuzzy or
 * natural-language matching here, because the reasoning belongs to Claude and
 * a tracker that silently guesses which employer was meant is worse than one
 * that returns the candidates.
 *
 * Deliberately absent: `user_id`. The list is always the caller's own.
 */
export const listJobsInputSchema = z.object({
  status: z
    .enum(APPLICATION_STATUSES)
    .optional()
    .describe("Only applications currently at this stage."),
  company: z
    .string()
    .min(1)
    .max(160)
    .optional()
    .describe(
      "Only applications whose employer name contains this text, ignoring case. Literal text, not a fuzzy search.",
    ),
  work_term: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "Only applications whose work term contains this text, for example 'Summer 2027' or '2027'.",
    ),
  archive_state: z
    .enum(ARCHIVE_STATES)
    .optional()
    .describe(
      "Which applications to include. Defaults to 'active', which leaves archived ones out.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LIST_JOBS_MAXIMUM_LIMIT)
    .optional()
    .describe(
      `Most applications to return, newest first. Defaults to ${LIST_JOBS_DEFAULT_LIMIT} and cannot exceed ${LIST_JOBS_MAXIMUM_LIMIT}.`,
    ),
});

export type ListJobsInput = z.infer<typeof listJobsInputSchema>;

/** One short record, holding only what is needed to choose between jobs. */
const jobSummarySchema = z.object({
  application_id: z.string(),
  company: z.string(),
  job_title: z.string(),
  status: z.enum(APPLICATION_STATUSES),
  work_term: z.string().nullable(),
  location: z.string().nullable(),
  deadline: z.string().nullable(),
  date_applied: z.string().nullable(),
  archived: z.boolean(),
});

export type JobSummary = z.infer<typeof jobSummarySchema>;

export const listJobsOutputSchema = z.object({
  applications: z.array(jobSummarySchema),
  returned: z.number().int(),
  has_more: z
    .boolean()
    .describe(
      "True when more applications matched than were returned. Narrow the filters or raise the limit.",
    ),
});

/** Maps tool arguments onto the repository's filter contract. */
export function toApplicationListFilters(input: ListJobsInput) {
  return {
    status: input.status,
    company: input.company?.trim() || undefined,
    workTermSeason: input.work_term?.trim() || undefined,
    archiveState: input.archive_state ?? ("active" as const),
    limit: input.limit ?? LIST_JOBS_DEFAULT_LIMIT,
  };
}

/**
 * The wire contract for `get_job`.
 *
 * One argument, and it is the application's own identifier. Ownership is not
 * an argument: the record is read under the access token's identity, so an
 * application belonging to somebody else reads exactly like one that does not
 * exist.
 */
export const getJobInputSchema = z.object({
  application_id: z
    .uuid()
    .describe(
      "Identifier of the application to read, as returned by list_jobs.",
    ),
});

export type GetJobInput = z.infer<typeof getJobInputSchema>;

/**
 * The full application as the tools describe it.
 *
 * Named with the tool vocabulary rather than column names, and carrying no
 * ownership, versioning, or classification columns: Claude never needs them,
 * and `update_job` reads the record's version itself when it writes.
 */
export const jobDetailSchema = z.object({
  application_id: z.string(),
  company: z.string(),
  company_domain: z
    .string()
    .nullable()
    .describe(
      "The employer's stored website domain, or null when none was recorded.",
    ),
  job_title: z.string(),
  status: z.enum(APPLICATION_STATUSES),
  category: z.enum(JOB_CATEGORIES),
  work_arrangement: z.enum(WORK_ARRANGEMENTS),
  location: z.string().nullable(),
  work_term: z.string().nullable(),
  duration: z.string().nullable(),
  job_url: z.string().nullable(),
  source: z.string().nullable(),
  job_description: z.string().nullable(),
  deadline: z.string().nullable(),
  date_applied: z.string().nullable(),
  salary: z.string().nullable(),
  notes: z.string().nullable(),
  next_action: z.string().nullable(),
  next_action_due_date: z.string().nullable(),
  archived: z.boolean(),
  created_at: z.string().describe("When the application was first saved."),
  updated_at: z.string().describe("When it was last changed."),
});

export type JobDetail = z.infer<typeof jobDetailSchema>;

/** What changed, so Claude can confirm an edit without re-reading the record. */
export const updateJobOutputSchema = z.object({
  application_id: z.string(),
  changed_fields: z.array(
    z.object({
      field: z.string(),
      from: z.string().nullable(),
      to: z.string().nullable(),
    }),
  ),
  status_history_recorded: z
    .boolean()
    .describe("True when the status moved, which records a history event."),
});

/**
 * How many applications one `import_jobs` call may carry.
 *
 * Twenty-five, which is `LIST_JOBS_DEFAULT_LIMIT` — deliberately the same
 * number. The assistant is told to check for likely duplicates with `list_jobs`
 * before importing, and that read hands back a page of this size, so a batch is
 * exactly as much as the student and the assistant just looked at together.
 *
 * A bound is what makes the write reviewable and recoverable. One call is one
 * all-or-nothing insert, so a hundred-row tracker arrives as four batches a
 * student can watch land, rather than as a single statement whose failure
 * leaves nobody sure how much of their old spreadsheet made it.
 */
export const IMPORT_JOBS_MAXIMUM_BATCH = 25;

/**
 * The wire contract for `import_jobs`: a batch of the same new job record
 * `save_job` takes one of.
 *
 * There is no file, no CSV, no delimiter, and no column mapping here, and that
 * is the whole design: the assistant reads the student's spreadsheet, resolves
 * what its headers, statuses and dates meant with them, and sends canonical
 * records. JobTrack validates and stores. Anything this schema cannot express
 * is an interpretation the assistant still owes the student.
 *
 * Deliberately absent: `user_id`. Ownership comes from the access token.
 */
export const importJobsInputSchema = z.object({
  applications: z
    .array(newJobRecordSchema)
    .min(1)
    .max(IMPORT_JOBS_MAXIMUM_BATCH)
    .describe(
      `The applications to import, already normalized to JobTrack's own values. Between 1 and ${IMPORT_JOBS_MAXIMUM_BATCH} per call; split a larger tracker into several calls and keep the mapping you agreed with the student identical across all of them.`,
    ),
});

export type ImportJobsInput = z.infer<typeof importJobsInputSchema>;

/** One imported application, named well enough for the assistant to report it. */
const importedApplicationSchema = z.object({
  application_id: z.string(),
  company: z.string(),
  job_title: z.string(),
});

export type ImportedApplication = z.infer<typeof importedApplicationSchema>;

export const importJobsOutputSchema = z.object({
  imported: z
    .number()
    .int()
    .describe("How many applications this batch added to the tracker."),
  applications: z.array(importedApplicationSchema),
});
