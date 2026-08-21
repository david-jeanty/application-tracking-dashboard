import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  UNSPECIFIED_DATABASE_VALUE,
  type ApplicationStatus,
  type JobCategory,
} from "@/lib/applications/constants";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The wire contract for `save_job`.
 *
 * Argument names are the ones a student would say out loud rather than our
 * column names, and the shape stays plain so it converts cleanly to the JSON
 * Schema that Claude reads. Real validation happens afterwards by mapping into
 * `applicationCreationSchema`, so an MCP write obeys exactly the same rules as
 * a web-form write. Deliberately absent: `user_id`. Ownership comes from the
 * access token and can never be supplied by the caller.
 */
export const saveJobInputSchema = z.object({
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
  notes: z
    .string()
    .max(20000)
    .optional()
    .describe("Anything else worth remembering about this application."),
});

export type SaveJobInput = z.infer<typeof saveJobInputSchema>;

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
 */
export function toApplicationCreationValues(input: SaveJobInput) {
  return {
    companyName: input.company,
    originalJobTitle: input.job_title,
    normalizedJobCategory: normalizeCategory(input.category),
    currentStatus: normalizeStatus(input.status),
    workTermSeason: input.work_term?.trim() || UNSPECIFIED_DATABASE_VALUE,
    location: input.location,
    workArrangement: undefined,
    applicationUrl: input.job_url,
    applicationSource: input.source,
    jobDescription: input.job_description,
    applicationDeadline: input.deadline,
    dateApplied: input.date_applied,
    workTermDuration: input.duration,
    salary: undefined,
    notes: input.notes,
    nextAction: undefined,
    nextActionDueDate: undefined,
  };
}
