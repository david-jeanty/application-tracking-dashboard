import type { JobCategory } from "@/lib/applications/constants";
import {
  BODY_WEIGHT,
  CATEGORY_RULES,
  TITLE_WEIGHT,
} from "@/lib/job-description-parser/rules/categories";
import {
  containsBoilerplate,
  isBoilerplateSectionHeading,
} from "@/lib/job-description-parser/rules/generic-headings";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

/** Only the first portion of the body is scanned; boilerplate lives at the end. */
const BODY_LINE_LIMIT = 60;

/**
 * Collects the body text that describes the job, skipping any line that sits
 * inside an employer-obligation section.
 *
 * Section membership runs from a boilerplate heading until the next heading, so
 * an entire accommodation or privacy block drops out rather than only the lines
 * that happen to carry a marker phrase. Without this, a posting that mentions
 * "Human Resources" twice in its accommodation notice classifies as an HR role
 * regardless of what the responsibilities actually say.
 */
function jobContentText(document: NormalizedDocument): string {
  const parts: string[] = [];
  let inBoilerplateSection = false;

  for (const line of document.lines.slice(0, BODY_LINE_LIMIT)) {
    if (line.isHeadingLike) {
      inBoilerplateSection = isBoilerplateSectionHeading(line.normalized);
      // A heading itself is a label, not job content, so it is never scored.
      continue;
    }

    if (inBoilerplateSection || containsBoilerplate(line.normalized)) continue;
    parts.push(line.normalized);
  }

  return parts.join(" ");
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(
    haystack,
  );
}

/**
 * Classifies into the app's fixed `JobCategory` union. The title dominates:
 * a title match outweighs a keyword buried in the responsibilities section.
 */
export function classifyCategory(
  document: NormalizedDocument,
  title: string | null,
): ExtractedField<JobCategory> {
  const titleText = (title ?? "").toLowerCase();
  const bodyText = jobContentText(document);

  const candidates: FieldCandidate<JobCategory>[] = [];

  for (const rule of CATEGORY_RULES) {
    const excluded = rule.exclusions?.some(
      (phrase) => containsPhrase(titleText, phrase) || containsPhrase(bodyText, phrase),
    );
    if (excluded) continue;

    let score = 0;
    let bestPhrase: string | null = null;
    let bestPhraseScore = 0;

    for (const [phrase, weight] of Object.entries(rule.phrases)) {
      const inTitle = containsPhrase(titleText, phrase);
      const inBody = containsPhrase(bodyText, phrase);
      if (!inTitle && !inBody) continue;

      const contribution = inTitle ? weight * TITLE_WEIGHT : weight * BODY_WEIGHT;
      score += contribution;

      if (contribution > bestPhraseScore) {
        bestPhraseScore = contribution;
        bestPhrase = phrase;
      }
    }

    if (!bestPhrase) continue;

    // The strongest single phrase carries the signal; additional matches add a
    // capped bonus so a long posting cannot out-score a precise title match.
    const total = Math.min(bestPhraseScore + (score - bestPhraseScore) * 0.25, 140);

    candidates.push({
      value: rule.category,
      score: total,
      evidence: `Matched "${bestPhrase}"${
        containsPhrase(titleText, bestPhrase) ? " in the job title" : " in the description"
      }.`,
      ruleId: `category:${rule.category}`,
    });
  }

  const resolved = resolveField(candidates);

  // "Other" exists precisely for this case, and the null confidence tells the
  // UI not to present it as a real classification.
  if (resolved.value === null) {
    return {
      ...resolved,
      value: "Other",
      warnings: [
        ...resolved.warnings,
        "No category matched confidently; defaulted to Other.",
      ],
    };
  }

  return resolved;
}
