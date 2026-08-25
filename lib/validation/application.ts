import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
import {
  MAXIMUM_DOMAIN_INPUT_LENGTH,
  normalizeCompanyDomain,
} from "@/lib/branding/domain";
import { isDateOnly } from "@/lib/dates/date-only";

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredText = (label: string, maximum: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);

const optionalText = (maximum: number) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(maximum).optional(),
  );

const optionalLongText = (maximum: number) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(maximum).optional(),
  );

const optionalDateOnly = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine(isDateOnly, "Use a valid date in YYYY-MM-DD format.")
    .optional(),
);

const optionalUrl = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(2048, "Application URL must be 2,048 characters or fewer.")
    .url("Enter a complete URL beginning with http:// or https://.")
    .refine(
      (value) => {
        try {
          const protocol = new URL(value).protocol;
          return protocol === "http:" || protocol === "https:";
        } catch {
          return false;
        }
      },
      "Enter a complete URL beginning with http:// or https://.",
    )
    .optional(),
);

/**
 * The employer's website, stored as a bare hostname.
 *
 * The schema is where normalization happens, which means it happens for every
 * write: the form, the MCP `save_job` tool, and the MCP `update_job` tool all
 * arrive here, and all three store `shopify.com` whether the input was
 * `Shopify.com`, `www.shopify.com`, or `https://www.shopify.com/careers`.
 * Nothing downstream re-parses, and nothing downstream can be handed raw text.
 *
 * Blank is `undefined`, like every other optional field. Anything that is not
 * a plausible domain is a validation error rather than a silently dropped
 * value, so a student who mistypes is told instead of quietly getting no logo.
 */
const optionalCompanyDomain = z.preprocess(
  blankToUndefined,
  z
    .string()
    .trim()
    .max(
      MAXIMUM_DOMAIN_INPUT_LENGTH,
      `Company website must be ${MAXIMUM_DOMAIN_INPUT_LENGTH.toLocaleString("en-US")} characters or fewer.`,
    )
    .refine(
      (value) => normalizeCompanyDomain(value) !== undefined,
      "Enter a company domain such as shopify.com.",
    )
    // Safe by construction: `refine` above already rejected anything that does
    // not normalize, so this call cannot return undefined.
    .transform((value) => normalizeCompanyDomain(value) as string)
    .optional(),
);

/**
 * Every field of an application, before the rules that span two of them.
 *
 * Split from `applicationCreationSchema` only so the update schema can add its
 * version field and then take the same cross-field rules, rather than
 * extending an already-refined schema.
 */
const applicationFieldsSchema = z.object({
  companyName: requiredText("Company name", 160),
  companyDomain: optionalCompanyDomain,
  originalJobTitle: requiredText("Original job title", 200),
  normalizedJobCategory: z.enum(JOB_CATEGORIES, {
    error: "Select a normalized category.",
  }),
  currentStatus: z.enum(APPLICATION_STATUSES, {
    error: "Select a current status.",
  }),
  workTermSeason: requiredText("Work-term season", 80),
  location: optionalText(200),
  workArrangement: z.preprocess(
    blankToUndefined,
    z.enum(WORK_ARRANGEMENTS, {
      error: "Select a valid work arrangement.",
    }).optional(),
  ),
  applicationUrl: optionalUrl,
  applicationSource: optionalText(100),
  jobDescription: optionalLongText(50000),
  applicationDeadline: optionalDateOnly,
  dateApplied: optionalDateOnly,
  workTermDuration: optionalText(80),
  salary: optionalText(100),
  notes: optionalLongText(20000),
  nextAction: optionalText(500),
  nextActionDueDate: optionalDateOnly,
});

/**
 * A due date describes an action, so it cannot stand on its own.
 *
 * The rule already existed in the product — `setApplicationNextAction` drops a
 * due date that arrives without an action, and the detail page says so under
 * the field — but nothing enforced it on the paths that create or replace a
 * whole record. A row could therefore be stored holding a date for an action
 * that did not exist, which the dashboard would have had to decide what to do
 * with. Stating it here means every writer obeys it: the web form, the edit
 * form, `save_job`, `update_job`, and every record of an `import_jobs` batch.
 *
 * The error is attached to the due date rather than to the action, because the
 * due date is the field with nothing to describe.
 */
function requireActionForDueDate(
  values: { nextAction?: string; nextActionDueDate?: string },
  ctx: z.RefinementCtx,
) {
  if (values.nextActionDueDate && !values.nextAction) {
    ctx.addIssue({
      code: "custom",
      path: ["nextActionDueDate"],
      message: "Next action due date requires a next action.",
    });
  }
}

export const applicationCreationSchema =
  applicationFieldsSchema.superRefine(requireActionForDueDate);

export const applicationIdSchema = z.uuid("Invalid application identifier.");

export const applicationUpdateSchema = applicationFieldsSchema
  .extend({
    expectedUpdatedAt: z.iso.datetime({
      offset: true,
      error: "The application version is missing or invalid.",
    }),
  })
  .superRefine(requireActionForDueDate);

export type ApplicationCreationInput = z.infer<
  typeof applicationCreationSchema
>;
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;

/**
 * The status half of the detail page's quick update.
 *
 * Deliberately one field. Reusing `applicationCreationSchema` here would let a
 * crafted post carry company, dates, or a job description into what a student
 * understands as a status change; this schema cannot describe those fields at
 * all, so they never reach a mutation.
 *
 * The enum is the shared `APPLICATION_STATUSES` constant, so the quick control
 * and the full form can never drift apart or disagree about which statuses
 * exist.
 */
export const quickStatusSchema = z.object({
  currentStatus: z.enum(APPLICATION_STATUSES, {
    error: "Select a current status.",
  }),
});

/**
 * The next-action half of the detail page's quick update.
 *
 * Both fields reuse the same helpers the full form uses — `optionalText(500)`
 * and `optionalDateOnly` — so the length limit and the "valid YYYY-MM-DD"
 * rule are defined once and apply identically wherever a next action is saved.
 *
 * The pairing rule (a due date is only kept alongside an action) is not here.
 * It belongs to the write, so it holds for every caller rather than only for
 * input that happened to come through this schema.
 */
export const quickNextActionSchema = z.object({
  nextAction: optionalText(500),
  nextActionDueDate: optionalDateOnly,
});

export type QuickStatusInput = z.infer<typeof quickStatusSchema>;
export type QuickNextActionInput = z.infer<typeof quickNextActionSchema>;
