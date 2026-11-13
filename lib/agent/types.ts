import { z } from "zod";

/**
 * Shapes the agent's tools and repository share. Database rows are read into
 * these and nothing else, so a tool never forwards a column it did not mean
 * to (the full job description in particular).
 */

export const TEMPLATE_NAMES = ["jakes", "zero2sudo"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export const VARIANT_STYLES = ["house", "story_voice"] as const;
export type VariantStyle = (typeof VARIANT_STYLES)[number];

export const VARIANT_SOURCES = [
  "import",
  "library_session",
  "pipeline",
  "edited",
] as const;
export type VariantSource = (typeof VARIANT_SOURCES)[number];

export const RULE_SCOPES = ["bullets", "outreach", "all"] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

/** One stated requirement of a posting, as stored in `jd_requirements`. */
export const requirementSchema = z.object({
  text: z.string().trim().min(1).max(300),
  must_have: z.boolean(),
});
export type Requirement = z.infer<typeof requirementSchema>;

/** Reads `jd_requirements` defensively: anything malformed becomes empty. */
export function parseStoredRequirements(value: unknown): Requirement[] {
  const parsed = z.array(requirementSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type AgentProfile = {
  school: string | null;
  program: string | null;
  degree_level: string | null;
  expected_graduation: string | null;
  year_of_study: number | null;
  notes: string | null;
};

export type AgentTemplate = {
  id: string;
  name: TemplateName;
  use_for: string[];
  one_line_chars: number | null;
  two_line_min: number | null;
  two_line_max: number | null;
  calibrated_at: string | null;
};

export type AgentRule = { scope: RuleScope; text: string };
