import { z } from "zod";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
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

export const applicationCreationSchema = z.object({
  companyName: requiredText("Company name", 160),
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

export const applicationIdSchema = z.uuid("Invalid application identifier.");

export const applicationUpdateSchema = applicationCreationSchema.extend({
  expectedUpdatedAt: z.iso.datetime({
    offset: true,
    error: "The application version is missing or invalid.",
  }),
});

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
