/**
 * Which experiences may have one-line bullets.
 *
 * David's rule: every bullet runs exactly two lines, with the last line at
 * least 80% full. Only the experiences listed here may also have one-line
 * bullets, and a one-line bullet must fill at least 80% of its line.
 *
 * To change the list, edit the entries below. `org` must match the
 * experience's organization in the story library; add `title` to allow only
 * one role at that organization (needed for IBM, where the pro bono role is
 * not on the list). Matching ignores case, accents and punctuation.
 */

export type OneLineExperience = { org: string; title?: string };

export const ONE_LINE_EXPERIENCES: readonly OneLineExperience[] = [
  { org: "IBM", title: "Incoming Business Transformation Consulting Intern" },
  { org: "Business Technology Association, uOttawa" },
];
