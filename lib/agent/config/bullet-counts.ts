/**
 * How many bullets each experience gets.
 *
 * David's default layout (from his example resume): IRB 2, Fidus 3,
 * StraNexus 2, Interndex 3, IBM Pro Bono 2 to 3, BTA 2, and the incoming
 * IBM role 1. `complete_run` refuses a resume outside these counts, and page
 * fill keeps within them (decision record 0021). When the library has fewer
 * stories for an experience than `min`, the minimum is what the library has.
 *
 * To change a count, edit the numbers below. `org` must match the
 * experience's organization in the story library; add `title` when only one
 * role at that organization is meant (IBM has two). Matching ignores case,
 * accents and punctuation. Experiences not listed get DEFAULT_BULLET_COUNT.
 */

export type BulletCount = { org: string; title?: string; min: number; max: number };

export const DEFAULT_BULLET_COUNT = { min: 1, max: 3 } as const;

export const BULLET_COUNTS: readonly BulletCount[] = [
  { org: "IBM", title: "Incoming Business Transformation Consulting Intern", min: 1, max: 1 },
  { org: "Immigration and Refugee Board of Canada", min: 2, max: 2 },
  { org: "Fidus Systems", min: 3, max: 3 },
  { org: "StraNexus Inc.", min: 2, max: 2 },
  { org: "Interndex", min: 3, max: 3 },
  { org: "IBM", title: "Pro-Bono Consultant", min: 2, max: 3 },
  { org: "Business Technology Association, uOttawa", min: 2, max: 2 },
];
