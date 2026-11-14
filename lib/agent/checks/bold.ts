/**
 * Bold follows the job description (decision record 0022).
 *
 * A recruiter skims a resume against the posting, so bold is for the words
 * and numbers that match it, not for every number. A **bold** phrase passes
 * when it shares a word with the posting's requirements or the fit read's
 * mirror words. A bold number with no words passes only in a bullet that
 * speaks to one of the requirements, where it is the proof. Pure, no I/O.
 */

import { tokenize } from "@/lib/agent/library/scoring";

export type BoldProblem = { index: number; phrase: string };

const BOLD = /\*\*(.+?)\*\*/g;

export function boldProblems(
  bullets: readonly string[],
  requirements: readonly string[],
  mirrorWords: readonly string[],
): BoldProblem[] {
  const postingTokens = new Set([...requirements, ...mirrorWords].flatMap((text) => tokenize(text)));
  const requirementTokens = requirements.map((text) => new Set(tokenize(text)));
  return bullets.flatMap((bullet, index) => {
    const bulletTokens = new Set(tokenize(bullet.replace(/\*\*/g, "")));
    const speaksToRequirement = requirementTokens.some((tokens) => {
      let shared = 0;
      for (const token of tokens) if (bulletTokens.has(token)) shared += 1;
      return shared >= Math.min(2, tokens.size);
    });
    return [...bullet.matchAll(BOLD)].flatMap(([, phrase]) => {
      const words = tokenize(phrase).filter((token) => !/\d/.test(token));
      if (words.some((token) => postingTokens.has(token))) return [];
      if (words.length === 0 && /\d/.test(phrase) && speaksToRequirement) return [];
      return [{ index, phrase }];
    });
  });
}
