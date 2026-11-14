/**
 * Bold follows the job description (decision records 0022 and 0023).
 *
 * A recruiter skims a resume against the posting, so bold marks the span of a
 * bullet that answers one of the posting's requirement phrases: "led a team
 * of five" for "led a group project", never the isolated noun "team" or a
 * bare number. When the posting has phrases:
 *
 * - every **bold** span must answer a phrase on its own (`answerTo`), which an
 *   isolated noun or number cannot do, since it holds at most one of the
 *   phrase's words;
 * - a span runs at most `MAX_BOLD_WORDS` words, so a whole bullet is not bold;
 * - the resume has at most `MAX_BOLD_SPANS` spans in total.
 *
 * Postings saved before phrases existed keep the earlier rule: a bold phrase
 * shares a word with the requirements or the fit read's mirror words, and a
 * bold number with no words passes only in a bullet that speaks to a
 * requirement. Pure, no I/O.
 */

import { answerTo } from "@/lib/agent/library/phrases";
import { tokenize } from "@/lib/agent/library/words";

/** Bold spans allowed on one resume: a few, so the matches stand out. */
export const MAX_BOLD_SPANS = 5;
/** Longest bold span, in words. */
export const MAX_BOLD_WORDS = 8;

export type BoldReason = "no_match" | "no_phrase" | "too_long" | "too_many";

export type BoldProblem = { index: number; phrase: string; reason: BoldReason };

const BOLD = /\*\*(.+?)\*\*/g;

export function boldProblems(
  bullets: readonly string[],
  requirements: readonly string[],
  mirrorWords: readonly string[],
  phrases: readonly string[] = [],
): BoldProblem[] {
  return phrases.length ? phraseProblems(bullets, phrases) : keywordProblems(bullets, requirements, mirrorWords);
}

function phraseProblems(bullets: readonly string[], phrases: readonly string[]): BoldProblem[] {
  const problems: BoldProblem[] = [];
  let spans = 0;
  bullets.forEach((bullet, index) => {
    for (const [, phrase] of bullet.matchAll(BOLD)) {
      spans += 1;
      if (phrase.trim().split(/\s+/).length > MAX_BOLD_WORDS) {
        problems.push({ index, phrase, reason: "too_long" });
      } else if (tokenize(phrase).length < 2 || !phrases.some((wanted) => answerTo(wanted, phrase) !== null)) {
        problems.push({ index, phrase, reason: "no_phrase" });
      } else if (spans > MAX_BOLD_SPANS) {
        problems.push({ index, phrase, reason: "too_many" });
      }
    }
  });
  return problems;
}

function keywordProblems(
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
    return [...bullet.matchAll(BOLD)].flatMap(([, phrase]): BoldProblem[] => {
      const words = tokenize(phrase).filter((token) => !/\d/.test(token));
      if (words.some((token) => postingTokens.has(token))) return [];
      if (words.length === 0 && /\d/.test(phrase) && speaksToRequirement) return [];
      return [{ index, phrase, reason: "no_match" }];
    });
  });
}

/** One line per problem, for a tool's failure message. */
export function describeBoldProblem(problem: BoldProblem): string {
  const span = `"**${problem.phrase}**"`;
  switch (problem.reason) {
    case "too_long":
      return `${span} is longer than ${MAX_BOLD_WORDS} words; bold only the span that answers a phrase.`;
    case "no_phrase":
      return `${span} answers none of the posting's phrases; bold the few words that do (such as "led a team of five"), not an isolated noun or number.`;
    case "too_many":
      return `${span} is over the limit of ${MAX_BOLD_SPANS} bold spans per resume.`;
    case "no_match":
      return `${span} does not mirror the posting or prove a requirement it lists.`;
  }
}
