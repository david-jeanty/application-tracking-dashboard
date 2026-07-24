import type {
  ExtractedField,
  ExtractionConfidence,
  FieldCandidate,
} from "@/lib/job-description-parser/types";

const HIGH_THRESHOLD = 90;
const MEDIUM_THRESHOLD = 55;
const LOW_THRESHOLD = 25;

/**
 * Two candidates this close are treated as a genuine tie, which downgrades
 * confidence rather than silently picking the first one.
 *
 * The threshold is proportional because scores span a wide range: six points
 * between two candidates scoring 130 is noise, while the same six points
 * between candidates scoring 38 is a clear preference. A fixed gap treats those
 * identically and collapses every low-scoring field into "ambiguous", which is
 * how a category backed by real evidence ends up reported as nothing at all.
 * The absolute floor keeps near-identical scores tied at the low end.
 */
const AMBIGUITY_RATIO = 0.1;
const AMBIGUITY_FLOOR = 5;

function isAmbiguous(bestScore: number, runnerUpScore: number): boolean {
  const threshold = Math.max(AMBIGUITY_FLOOR, bestScore * AMBIGUITY_RATIO);
  return bestScore - runnerUpScore < threshold;
}

export function confidenceFromScore(score: number): ExtractionConfidence {
  if (score >= HIGH_THRESHOLD) return "High";
  if (score >= MEDIUM_THRESHOLD) return "Medium";
  if (score >= LOW_THRESHOLD) return "Low";
  return null;
}

export function downgradeConfidence(
  confidence: ExtractionConfidence,
): ExtractionConfidence {
  if (confidence === "High") return "Medium";
  if (confidence === "Medium") return "Low";
  return null;
}

export function emptyField<T>(warnings: string[] = []): ExtractedField<T> {
  return {
    value: null,
    confidence: null,
    evidence: null,
    candidates: [],
    warnings,
  };
}

/**
 * Ranks candidates and resolves the winner. A wrong confident answer is worse
 * than a blank field, so ties and sub-threshold scores degrade rather than
 * assert: the value survives for review but its confidence does not.
 */
export function resolveField<T>(
  candidates: FieldCandidate<T>[],
  warnings: string[] = [],
): ExtractedField<T> {
  if (!candidates.length) return emptyField<T>(warnings);

  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const runnerUp = ranked[1];
  const collected = [...warnings];

  let confidence = confidenceFromScore(best.score);

  // Only a *differing* runner-up is ambiguous. Two rules agreeing on the same
  // value is corroboration, not conflict.
  if (
    runnerUp &&
    !valuesMatch(best.value, runnerUp.value) &&
    isAmbiguous(best.score, runnerUp.score)
  ) {
    confidence = downgradeConfidence(confidence);
    collected.push("Multiple similarly likely values were found.");
  }

  if (confidence === null) {
    return {
      value: null,
      confidence: null,
      evidence: null,
      candidates: ranked,
      warnings: collected,
    };
  }

  return {
    value: best.value,
    confidence,
    evidence: best.evidence,
    candidates: ranked,
    warnings: [...collected, ...(best.warnings ?? [])],
  };
}

function valuesMatch<T>(left: T, right: T): boolean {
  if (typeof left === "string" && typeof right === "string") {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }
  return left === right;
}
