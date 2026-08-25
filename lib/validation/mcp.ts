import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
import {
  COMPANY_DOMAIN_GUIDANCE,
  externalJobRecordSchema,
  toApplicationCreationValues,
  type ExternalJobRecord,
} from "@/lib/applications/external-record";
import type { ApplicationFormValues } from "@/lib/applications/types";
import { MAXIMUM_DOMAIN_LENGTH } from "@/lib/branding/domain";

/** A date being changed may also be cleared, which an empty string expresses. */
const CLEARABLE_DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})?$/;

/**
 * The established MCP name is an alias of the caller-neutral contract. Keeping
 * the very same schema object preserves the advertised tool wire schema while
 * allowing browser capture to use it without importing an MCP-owned module.
 */
export const newJobRecordSchema = externalJobRecordSchema;

export type NewJobRecord = ExternalJobRecord;

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

export { toApplicationCreationValues };

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
 *
 * One pair is not independent, and this is where that is honoured. A due date
 * describes an action, so emptying the action takes its date with it — the
 * same resolution `setApplicationNextAction` has always applied to the detail
 * page's Clear button, applied here so the two paths mean the same thing by a
 * student's reading of them.
 *
 * Without it, "I have dealt with that follow-up" — `next_action: ""` and
 * nothing else — would merge an emptied action onto the stored date and be
 * rejected by the shared rule, leaving an assistant to work out on its own
 * that clearing a follow-up takes two empty fields rather than one. The rule
 * is not weakened: what changes is which values reach it, and the state it
 * forbids is now unreachable from this tool rather than merely refused.
 *
 * A due date sent *alongside* an emptied action is dropped rather than
 * refused, again matching the existing write: the request contradicts itself,
 * and no action means no date whichever date came with the clear. Only an
 * action that survives the patch — one the caller supplied, or the stored one
 * it left alone — keeps a date beside it.
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

  if (patch.next_action !== undefined && !patch.next_action.trim()) {
    merged.nextActionDueDate = "";
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
