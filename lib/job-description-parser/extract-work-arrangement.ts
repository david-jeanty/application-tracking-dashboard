import type { WorkArrangement } from "@/lib/applications/constants";
import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import {
  ARRANGEMENT_NEGATIONS,
  WORK_ARRANGEMENT_PHRASES,
} from "@/lib/job-description-parser/rules/work-arrangements";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

type PositiveArrangement = Exclude<WorkArrangement, "Unknown">;

const ARRANGEMENTS = Object.keys(
  WORK_ARRANGEMENT_PHRASES,
) as PositiveArrangement[];

/**
 * Longer phrases win: "hybrid work model" is more diagnostic than "hybrid",
 * and "remote within canada" should not be scored the same as a passing
 * mention of "work remotely" in a benefits list.
 */
function phraseScore(phrase: string): number {
  const words = phrase.split(/\s+/).length;
  if (words >= 4) return 100;
  if (words === 3) return 90;
  if (words === 2) return 80;
  return 65;
}

export function extractWorkArrangement(
  document: NormalizedDocument,
): ExtractedField<WorkArrangement> {
  const candidates: FieldCandidate<WorkArrangement>[] = [];
  const warnings: string[] = [];

  const negated = new Set<PositiveArrangement>();
  for (const line of document.lines) {
    for (const arrangement of ARRANGEMENTS) {
      const isNegated = ARRANGEMENT_NEGATIONS[arrangement].some((phrase) =>
        line.normalized.includes(phrase),
      );
      if (isNegated) negated.add(arrangement);
    }
  }

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "workArrangement");
    const haystack = (labelled ?? line.original).toLowerCase();

    for (const arrangement of ARRANGEMENTS) {
      if (negated.has(arrangement)) continue;

      const phrases = [...WORK_ARRANGEMENT_PHRASES[arrangement]].sort(
        (left, right) => right.length - left.length,
      );

      const hit = phrases.find((phrase) => haystack.includes(phrase));
      if (!hit) continue;

      let score = phraseScore(hit);
      if (labelled) score += 30;
      // A heading like "Remote" on its own line is a stronger signal than the
      // same word buried in a paragraph.
      if (line.isHeadingLike) score += 10;

      candidates.push({
        value: arrangement,
        score,
        evidence: line.original,
        ruleId: labelled
          ? `arrangement:labelled:${hit}`
          : `arrangement:phrase:${hit}`,
        lineIndex: line.index,
      });
    }
  }

  if (negated.size) {
    warnings.push(
      `The posting explicitly rules out: ${[...negated].join(", ")}.`,
    );
  }

  const resolved = resolveField(candidates, warnings);

  // The schema has an explicit "Unknown" member, so an unfound arrangement is
  // representable without inventing a value. Confidence stays null.
  if (resolved.value === null) {
    return { ...resolved, value: "Unknown" };
  }

  return resolved;
}
