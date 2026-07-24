/**
 * Section headings and boilerplate that must never be mistaken for a job title
 * or company name. Compared against the lowercased line with any trailing
 * colon removed.
 */
export const GENERIC_HEADINGS = new Set([
  "about us",
  "about the company",
  "about the opportunity",
  "apply now",
  "career opportunities",
  "current openings",
  "job opportunities",
  "job posting",
  "open positions",
  "opportunities",
  "position details",
  "posting details",
  "student opportunities",
  "about the role",
  "about this role",
  "about the team",
  "about you",
  "accommodations",
  "additional information",
  "application process",
  "benefits",
  "compensation",
  "description",
  "diversity and inclusion",
  "duties",
  "equal opportunity employer",
  "essential functions",
  "how to apply",
  "job description",
  "job details",
  "job overview",
  "job summary",
  "key responsibilities",
  "learn more",
  "must have",
  "nice to have",
  "obligations",
  "our company",
  "our mission",
  "our values",
  "overview",
  "position overview",
  "position summary",
  "preferred qualifications",
  "qualifications",
  "requirements",
  "responsibilities",
  "role description",
  "role overview",
  "skills",
  "summary",
  "the opportunity",
  "the role",
  "what we offer",
  "what you bring",
  "what you will do",
  "what you'll do",
  "who we are",
  "who you are",
  "why join us",
  "your impact",
]);

/** Phrases that mark legal or benefits boilerplate anywhere in a line. */
export const BOILERPLATE_MARKERS = [
  "equal opportunity",
  "without regard to race",
  "accommodation",
  "background check",
  "e-verify",
  "drug screening",
  "protected veteran",
];

/**
 * Headings that open a section describing the employer's legal or process
 * obligations rather than the job. Everything under one of these is written by
 * a legal or HR team and uses their vocabulary, which quietly poisons category
 * classification: an accommodation notice naming "Human Resources" twice will
 * out-score the actual marketing content of the role.
 */
const BOILERPLATE_SECTION_PATTERNS = [
  /accessibilit/,
  /accommodation/,
  /equal opportunit/,
  /diversity|inclusion|belonging/,
  /privacy|personal information/,
  /legal notice|terms and conditions/,
  /how to apply|application process|recruitment process/,
  /contact (?:us|information)/,
  /our commitment/,
  /background check|security clearance/,
];

export function isGenericHeading(normalizedLine: string): boolean {
  return GENERIC_HEADINGS.has(normalizedLine.replace(/[:：]\s*$/, "").trim());
}

/** True when a heading opens an employer-obligation section, not job content. */
export function isBoilerplateSectionHeading(normalizedLine: string): boolean {
  const heading = normalizedLine.replace(/[:：]\s*$/, "").trim();
  if (!heading.length || heading.split(/\s+/).length > 7) return false;
  return BOILERPLATE_SECTION_PATTERNS.some((pattern) => pattern.test(heading));
}

export function containsBoilerplate(normalizedLine: string): boolean {
  return BOILERPLATE_MARKERS.some((marker) => normalizedLine.includes(marker));
}
