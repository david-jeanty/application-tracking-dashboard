import {
  containsBoilerplate,
  isGenericHeading,
} from "@/lib/job-description-parser/rules/generic-headings";
import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
  NormalizedLine,
} from "@/lib/job-description-parser/types";

/** The form caps the job title at 200 characters. */
const MAX_TITLE_LENGTH = 200;

/** Role words that strongly suggest a line is a job title. */
const ROLE_WORDS =
  /\b(intern|internship|co-?op|student|analyst|coordinator|associate|specialist|manager|engineer|developer|designer|consultant|advisor|assistant|representative|administrator|technician|lead|director|officer|strategist)\b/i;

/** Seniority and program markers that commonly appear in student postings. */
const QUALIFIER_WORDS =
  /\b(junior|senior|entry[\s-]level|graduate|new grad|summer|fall|winter|spring|20\d{2})\b/i;

/**
 * Recovers a title stated only in prose: "Silverbrook Grain Cooperative is
 * looking for a Business Operations Analyst to join our planning team."
 *
 * The capture is the run of capitalized words after the hiring verb, plus an
 * optional trailing parenthetical such as "(Co-op)". Stopping at the first
 * lowercase word is what bounds the match — "to join our planning team" is
 * excluded for free, with no need to enumerate sentence tails.
 */
const PROSE_TITLE =
  /\b(?:looking for|seeking|hiring|recruiting)\s+(?:an?|our|the)?\s*([A-Z][\w&.'/-]*(?:[,\s]+[A-Z][\w&.'/-]*){0,6}(?:\s*\([^)]{1,20}\))?)/;

function scoreTitleLine(line: NormalizedLine): number {
  let score = 0;
  const words = line.original.split(/\s+/);

  // Titles sit near the top of a posting.
  if (line.index === 0) score += 35;
  else if (line.index < 5) score += 25;
  else if (line.index < 10) score += 10;
  else score -= 15;

  if (ROLE_WORDS.test(line.original)) score += 40;
  if (QUALIFIER_WORDS.test(line.original)) score += 10;

  if (words.length <= 3) score += 10;
  else if (words.length <= 8) score += 15;
  else if (words.length <= 12) score += 5;
  else score -= 30;

  // Title Case is the dominant convention for posting titles.
  const capitalized = words.filter((word) => /^[A-Z0-9]/.test(word)).length;
  if (words.length && capitalized / words.length >= 0.6) score += 15;

  if (isGenericHeading(line.normalized)) score -= 150;
  if (containsBoilerplate(line.normalized)) score -= 100;

  // Full sentences and prose are not titles.
  if (/[.!?]$/.test(line.original)) score -= 25;
  if (/\b(we|you|our|your|the successful candidate)\b/i.test(line.original)) {
    score -= 25;
  }
  if (line.original.includes(":") && !ROLE_WORDS.test(line.original)) score -= 15;

  return score;
}

export function extractTitle(
  document: NormalizedDocument,
): ExtractedField<string> {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "title");
    if (labelled && labelled.length <= MAX_TITLE_LENGTH) {
      candidates.push({
        value: labelled,
        score: 120,
        evidence: line.original,
        ruleId: "title:labelled",
        lineIndex: line.index,
      });
      continue;
    }

    // A hiring sentence names the role explicitly, so it is trusted anywhere in
    // the document. It scores into the Medium band: below a labelled title and
    // below a strong heading, but enough to stand alone when the posting never
    // puts the title on its own line.
    const prose = PROSE_TITLE.exec(line.original)?.[1]?.replace(/[,\s]+$/, "");
    if (prose && prose.length <= MAX_TITLE_LENGTH && ROLE_WORDS.test(prose)) {
      candidates.push({
        value: prose,
        score: 70,
        evidence: line.original,
        ruleId: "title:prose-hiring-sentence",
        lineIndex: line.index,
      });
    }

    // Heuristics only apply near the top; scanning the whole body produces
    // confident nonsense from responsibility bullets.
    if (line.index > 12) continue;
    if (line.original.length > MAX_TITLE_LENGTH) continue;

    const score = scoreTitleLine(line);
    if (score < 25) continue;

    candidates.push({
      value: line.original.replace(/\s*[:：]\s*$/, ""),
      score,
      evidence: line.original,
      ruleId: "title:heuristic",
      lineIndex: line.index,
    });
  }

  return resolveField(candidates);
}
