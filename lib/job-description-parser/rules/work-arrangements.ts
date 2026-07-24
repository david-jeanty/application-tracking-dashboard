import type { WorkArrangement } from "@/lib/applications/constants";

/**
 * Phrase lists per arrangement. Longer phrases are checked first at match time
 * so "hybrid work model" outranks a bare "hybrid" appearing elsewhere.
 */
export const WORK_ARRANGEMENT_PHRASES: Record<
  Exclude<WorkArrangement, "Unknown">,
  string[]
> = {
  Remote: [
    "fully remote",
    "100% remote",
    "remote position",
    "remote role",
    "remote opportunity",
    "work remotely",
    "work from home",
    "remote within canada",
    "remote (canada)",
    "telework",
    "télétravail",
    "distributed team",
    "remote first",
    "remote-first",
  ],
  Hybrid: [
    "hybrid work model",
    "hybrid work arrangement",
    "hybrid schedule",
    "hybrid model",
    "hybrid role",
    "hybrid position",
    "hybrid",
    "combination of remote and onsite",
    "combination of remote and on-site",
    "mix of remote and in-office",
    "flexible hybrid",
    "days in the office",
    "days per week in office",
    "days a week in the office",
    "in office 2 days",
    "in office 3 days",
    "partially remote",
  ],
  "On-site": [
    "on-site",
    "onsite",
    "on site",
    "in-office",
    "in office",
    "in-person",
    "work from our office",
    "based in our office",
    "fully in-office",
    "presence in the office is required",
    "sur place",
  ],
};

/**
 * Negations are checked before any positive phrase. A posting saying "this is
 * not a remote role" must never be classified Remote.
 */
export const ARRANGEMENT_NEGATIONS: Record<
  Exclude<WorkArrangement, "Unknown">,
  string[]
> = {
  Remote: [
    "not a remote role",
    "not a remote position",
    "remote work is not available",
    "no remote work",
    "this role is not remote",
    "not eligible for remote",
    "remote work is not an option",
  ],
  Hybrid: ["not a hybrid role", "no hybrid option"],
  "On-site": ["not an on-site role", "no on-site requirement"],
};
