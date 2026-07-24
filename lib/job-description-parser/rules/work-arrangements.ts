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
    // Job boards emit these tags verbatim on copy-paste. They are board
    // conventions rather than any one employer's wording.
    "#li-remote",
    "#remote",
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
    "#li-hybrid",
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
    "#li-onsite",
  ],
};

/**
 * Values that appear in a location field but describe the arrangement instead
 * of a place. "Location: Virtual" states no city at all — it says the work is
 * done remotely, and that is the only way many postings say so.
 *
 * Matched against the whole labelled value, never as a substring, so a posting
 * mentioning "virtual assistant" or "virtual machine" is unaffected.
 */
export const LOCATION_AS_ARRANGEMENT: Record<
  string,
  Exclude<WorkArrangement, "Unknown">
> = {
  virtual: "Remote",
  virtuel: "Remote",
  "virtual - canada": "Remote",
  remote: "Remote",
  "remote - canada": "Remote",
  "fully remote": "Remote",
  telework: "Remote",
  "télétravail": "Remote",
  "work from home": "Remote",
  anywhere: "Remote",
  hybrid: "Hybrid",
  hybride: "Hybrid",
  onsite: "On-site",
  "on-site": "On-site",
  "on site": "On-site",
  "in office": "On-site",
  "in-office": "On-site",
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
