import { z } from "zod";
import { JOB_CATEGORIES, WORK_ARRANGEMENTS } from "@/lib/applications/constants";
import { COMPANY_DOMAIN_GUIDANCE } from "@/lib/applications/external-record";
import { MAXIMUM_DOMAIN_LENGTH } from "@/lib/branding/domain";
import { PLAYBOOK_PHASES } from "@/lib/agent/playbook/phases";
import {
  requirementSchema,
  RULE_SCOPES,
  TEMPLATE_NAMES,
  VARIANT_STYLES,
} from "@/lib/agent/types";

/**
 * Wire schemas for the recruiting agent's MCP tools (owner only).
 *
 * Descriptions are short and plain: they ride along on every turn of a run,
 * so each one says what the field is and nothing more. No tool takes a
 * user id; ownership always comes from the access token.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_OR_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

const applicationId = z.uuid().describe("The application's id.");

const optionalApplicationId = z
  .uuid()
  .optional()
  .describe("The application this call is for, when there is one. Used for the usage log.");

const tags = z.array(z.string().trim().min(1).max(40)).max(20);

const bulletText = z.string().trim().min(1).max(600);

// -------------------------------------------------------- playbook, state --

export const getPlaybookInputSchema = z.object({
  phase: z.enum(PLAYBOOK_PHASES).describe("run, library_session or import."),
});

export const applicationOnlyInputSchema = z.object({
  application_id: applicationId,
});

// ------------------------------------------------------------ applications --

export const createApplicationFromJdInputSchema = z.object({
  company: z.string().trim().min(1).max(160).describe("Employer name."),
  title: z.string().trim().min(1).max(200).describe("Posting title exactly as written."),
  location: z.string().trim().max(200).optional().describe("Where the role is based."),
  job_id: z.string().trim().min(1).max(100).optional().describe("The employer's own posting id."),
  source_url: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .describe("Link to the posting, starting with http:// or https://."),
  jd_text: z
    .string()
    .min(1)
    .max(50000)
    .describe("The full job description, verbatim. Stored once and never returned."),
  requirements: z
    .array(requirementSchema)
    .max(40)
    .describe("The posting's stated requirements, each marked must_have or not."),
  partner_functions: z
    .array(z.string().trim().min(1).max(80))
    .max(20)
    .default([])
    .describe("Functions the role works with, as the posting names them."),
  category: z.enum(JOB_CATEGORIES).optional().describe("Best-fit job family. Defaults to Other."),
  company_domain: z
    .string()
    .trim()
    .max(MAXIMUM_DOMAIN_LENGTH)
    .optional()
    .describe(`The employer's own website domain, for its logo. ${COMPANY_DOMAIN_GUIDANCE}`),
  work_term: z.string().trim().max(80).optional().describe("For example Summer 2027."),
  work_arrangement: z.enum(WORK_ARRANGEMENTS).optional(),
  deadline: z.string().regex(DATE_ONLY).optional().describe("YYYY-MM-DD."),
  source: z.string().trim().max(100).optional().describe("Where the posting was found."),
});

export type CreateApplicationFromJdInput = z.infer<typeof createApplicationFromJdInputSchema>;

// ----------------------------------------------------------------- library --

export const searchStoriesInputSchema = z.object({
  requirements: z
    .array(z.string().trim().min(1).max(300))
    .min(1)
    .max(40)
    .describe("The posting's requirements, in the posting's words."),
  angles: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .default([])
    .describe("Angles the role calls for: product, ops, consulting, marketing, data."),
  template: z.enum(TEMPLATE_NAMES),
  application_id: optionalApplicationId,
});

export const saveVariantInputSchema = z.object({
  story_id: z.uuid(),
  text: bulletText,
  style: z.enum(VARIANT_STYLES),
  angles: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  template_fit: z.array(z.enum(TEMPLATE_NAMES)).max(2).default([]),
  explain_note: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("One line David could say in an interview. Required when the text has a number."),
  source: z.enum(["library_session", "pipeline"]).default("pipeline"),
  application_id: optionalApplicationId,
});

export const recordEditInputSchema = z.object({
  before_text: z.string().trim().min(1).max(2000),
  after_text: z.string().trim().min(1).max(2000),
  note: z.string().trim().max(500).optional(),
  variant_id: z.uuid().optional(),
  application_id: optionalApplicationId,
});

export const addRuleInputSchema = z.object({
  scope: z.enum(RULE_SCOPES),
  text: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('The instruction in David\'s words, for example: Never use "spearheaded".'),
});

// ----------------------------------------------------------------- checker --

export const checkBulletsInputSchema = z.object({
  template: z.enum(TEMPLATE_NAMES),
  bullets: z
    .array(z.string().max(600))
    .min(1)
    .max(40)
    .describe("Every bullet on the page, in page order."),
  application_id: optionalApplicationId,
});

// ----------------------------------------------------------------- answers --

export const saveAnswerInputSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  answer: z.string().trim().min(1).max(5000),
  tags: tags.default([]),
  application_id: optionalApplicationId,
});

export const searchAnswersInputSchema = z.object({
  query: z.string().trim().min(1).max(1000).describe("The question being asked."),
  application_id: optionalApplicationId,
});

// ------------------------------------------------------------------ import --

const importKey = z.string().trim().min(1).max(60);

export const importLibraryInputSchema = z.object({
  experiences: z
    .array(
      z.object({
        key: importKey.describe("Any label, used only to link stories in this call."),
        org: z.string().trim().min(1).max(160),
        official_title: z.string().trim().min(1).max(200),
        start: z.string().regex(MONTH_OR_DATE).describe("YYYY-MM."),
        end: z.string().regex(MONTH_OR_DATE).nullable().describe("YYYY-MM, or null if current."),
        location: z.string().trim().min(1).max(200).optional(),
        sort_order: z.int().min(0).max(1000).default(0),
      }),
    )
    .max(30),
  stories: z
    .array(
      z.object({
        key: importKey,
        experience_key: importKey,
        label: z.string().trim().min(1).max(120),
        summary: z.string().trim().max(2000).optional(),
        tags: tags.default([]),
      }),
    )
    .max(80),
  variants: z
    .array(
      z.object({
        story_key: importKey,
        text: bulletText,
        style: z.enum(VARIANT_STYLES),
        angles: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
        template_fit: z.array(z.enum(TEMPLATE_NAMES)).max(2).default([]),
        is_gold: z.boolean().default(false),
        explain_note: z.string().trim().min(1).max(500).optional(),
      }),
    )
    .max(300),
  profile: z
    .object({
      school: z.string().trim().min(1).max(160).optional(),
      program: z.string().trim().min(1).max(160).optional(),
      degree_level: z.string().trim().min(1).max(80).optional(),
      expected_graduation: z.string().regex(MONTH_OR_DATE).optional().describe("YYYY-MM."),
      year_of_study: z.int().min(1).max(10).optional(),
    })
    .optional()
    .describe("The fit-read profile. Send it once; later imports may leave it out."),
});

export type ImportLibraryInput = z.infer<typeof importLibraryInputSchema>;

/** "2025-05" becomes "2025-05-01"; a full date is kept. */
export function toMonthDate(value: string): string {
  return value.length === 7 ? `${value}-01` : value;
}
