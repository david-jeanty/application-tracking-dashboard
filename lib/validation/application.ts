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

export type ApplicationCreationInput = z.infer<
  typeof applicationCreationSchema
>;
