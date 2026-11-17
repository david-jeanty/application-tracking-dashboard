/**
 * Requirement phrases: the short spans of a posting a bullet can answer
 * (decision record 0023).
 *
 * A posting asks for "led a group project" or "worked cross-functionally",
 * not for the words "group" and "project". A text answers a phrase when the
 * phrase's words, or their close neighbours (`relatedTo`), sit together in it:
 * all of them is a direct answer, at least half of them is a partial one.
 * "Together" means inside a window a few words longer than the phrase, so
 * words scattered across a long bullet do not count.
 *
 * Used to rank stories and variants (`search_stories`, page fill) and to check
 * that every bold span answers a phrase. Pure, no I/O, no randomness.
 */

import { relatedTo, tokenize } from "@/lib/agent/library/words";

export type PhraseAnswer = "direct" | "partial";

/** Extra words a match may spread over, beyond the phrase's own length. */
const WINDOW_SLACK = 4;

/** The phrase's content words, as `tokenize` stems them, without repeats. */
export function phraseTokens(phrase: string): string[] {
  return [...new Set(tokenize(phrase))];
}

/** Content words needed for a partial answer: at least half, and at least two. */
export function partialThreshold(size: number): number {
  return size <= 2 ? size : Math.max(2, Math.ceil(size / 2));
}

/** The most phrase words found together inside any one window of the text. */
export function coveredTogether(phrase: readonly string[], text: readonly string[]): number {
  if (phrase.length === 0 || text.length === 0) return 0;
  const window = phrase.length + WINDOW_SLACK;
  let best = 0;
  for (let start = 0; start < text.length; start += 1) {
    const found = new Set<number>();
    const end = Math.min(text.length, start + window);
    for (let position = start; position < end; position += 1) {
      phrase.forEach((token, index) => {
        if (relatedTo(token, text[position])) found.add(index);
      });
    }
    best = Math.max(best, found.size);
    if (best === phrase.length) break;
  }
  return best;
}

/** How a text answers one phrase, or null when it does not. */
export function answerTo(phrase: string, text: string): PhraseAnswer | null {
  const wanted = phraseTokens(phrase);
  if (wanted.length === 0) return null;
  const covered = coveredTogether(wanted, tokenize(text.replace(/\*\*/g, "")));
  if (covered === wanted.length) return "direct";
  return covered >= partialThreshold(wanted.length) ? "partial" : null;
}

export type PhraseAnswers = {
  /** Indexes of the phrases the text answers directly. */
  direct: number[];
  /** Indexes of the phrases it answers in part. */
  partial: number[];
};

export function answersIn(text: string, phrases: readonly string[]): PhraseAnswers {
  const direct: number[] = [];
  const partial: number[] = [];
  phrases.forEach((phrase, index) => {
    const answer = answerTo(phrase, text);
    if (answer === "direct") direct.push(index);
    else if (answer === "partial") partial.push(index);
  });
  return { direct, partial };
}

/** Ranking weight of a text's answers: a direct answer counts most. */
export function answerScore(answers: PhraseAnswers): number {
  return 5 * answers.direct.length + 2 * answers.partial.length;
}
