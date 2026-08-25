import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  UNSPECIFIED_DATABASE_VALUE,
  WORK_ARRANGEMENTS,
  type ApplicationStatus,
  type JobCategory,
} from "@/lib/applications/constants";
import { MAXIMUM_DOMAIN_LENGTH } from "@/lib/branding/domain";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Stable guidance attached to the external record's company-domain field.
 *
 * The existing MCP wire schema exposes this description, so it remains part of
 * the shared contract verbatim. Browser capture does not act on the guidance:
 * it accepts a domain only when its caller actually knows one, and never derives
 * an employer domain from the page host.
 */
export const COMPANY_DOMAIN_GUIDANCE =
  "Prefer the employer's own canonical website over an applicant-tracking or job-board host such as Workday, Greenhouse, Lever, LinkedIn, or Indeed. Examples: Shopify → shopify.com, KPMG → kpmg.com, RBC or Royal Bank of Canada → rbc.com, BMO or Bank of Montreal → bmo.com, Microsoft → microsoft.com.";

/**
 * One application record supplied by an authenticated external caller.
 *
 * This is the single caller-neutral record contract used by MCP saves/imports
 * and browser capture. Its field names and descriptions are unchanged from the
 * original MCP contract so existing tool wire schemas remain stable. It only
 * describes values JobTrack already stores and deliberately has no `user_id`:
 * ownership always comes from the authenticated bearer token.
 *
 * This boundary is intentionally followed by `applicationCreationSchema`, the
 * final application-domain gate shared with the web form.
 */
export const externalJobRecordSchema = z.object({
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

export type ExternalJobRecord = z.infer<typeof externalJobRecordSchema>;

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

/** Maps an external record onto the application's one creation contract. */
export function toApplicationCreationValues(input: ExternalJobRecord) {
  return {
    companyName: input.company,
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
