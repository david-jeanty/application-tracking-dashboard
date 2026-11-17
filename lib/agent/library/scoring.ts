/**
 * Deterministic ranking for `search_stories`.
 *
 * Given the posting's requirements, the angles the role calls for, and the
 * template, it returns the library's best stories (at most 5) with each
 * story's best variants (at most 2). No model and no randomness: keyword
 * overlap, angle overlap and a few fixed preferences, with ties broken by
 * name and id so the same library always ranks the same way.
 *
 * It also reports which requirements no story touched. Those are where the
 * assistant should look harder before calling something a gap (STANDARDS.md,
 * "find the hidden match").
 *
 * When the query carries requirement phrases ("led a group project"), a
 * story or variant that answers a phrase directly outranks one that only
 * shares its words, and the result says which phrases each one answers
 * (decision record 0023).
 */

import { answerScore, answersIn, type PhraseAnswers } from "@/lib/agent/library/phrases";
import { RELATED, relatedTo, tokenize } from "@/lib/agent/library/words";

export { relatedTo, tokenize };

export type LibraryVariant = {
  id: string;
  text: string;
  style: "house" | "story_voice";
  angles: readonly string[];
  template_fit: readonly string[];
  char_count: number;
  is_gold: boolean;
  explain_note: string | null;
  created_at: string;
};

export type LibraryStory = {
  id: string;
  label: string;
  summary: string | null;
  tags: readonly string[];
  org: string;
  official_title: string;
  variants: readonly LibraryVariant[];
};

export type StoryQuery = {
  requirements: readonly string[];
  angles: readonly string[];
  template: string;
  /** Requirement phrases in the posting's words, such as "led a group project". */
  phrases?: readonly string[];
};

export type RankedVariant = {
  id: string;
  text: string;
  style: "house" | "story_voice";
  char_count: number;
  explain_note: string | null;
  /** Indexes of the query's phrases this wording answers directly. Only with phrases. */
  answers?: number[];
  /** Indexes of the phrases it answers in part. Only with phrases. */
  partly?: number[];
};

export type RankedStory = {
  story_id: string;
  label: string;
  /** The story's facts. A new bullet may be written from these. */
  summary: string | null;
  org: string;
  title: string;
  score: number;
  /** Indexes into the query's requirements this story speaks to. */
  matches: number[];
  /** Phrase indexes the story's facts or wordings answer directly. Only with phrases. */
  answers?: number[];
  /** Phrase indexes they answer in part. Only with phrases. */
  partly?: number[];
  variants: RankedVariant[];
};

export type StoryRanking = {
  stories: RankedStory[];
  /** Requirement indexes that no story in the whole library matched. */
  unmatched: number[];
  /** Phrase indexes no story answered, even in part. Only with phrases. */
  unanswered_phrases?: number[];
};

/** A phrase answer counts this many times its `answerScore` in the ranking. */
const PHRASE_WEIGHT = 2;

/** The best answer each phrase gets from any of the texts. */
function bestAnswers(texts: readonly string[], phrases: readonly string[]): PhraseAnswers {
  const direct = new Set<number>();
  const partial = new Set<number>();
  for (const text of texts) {
    const answers = answersIn(text, phrases);
    answers.direct.forEach((index) => direct.add(index));
    answers.partial.forEach((index) => partial.add(index));
  }
  return {
    direct: [...direct].sort((a, b) => a - b),
    partial: [...partial].filter((index) => !direct.has(index)).sort((a, b) => a - b),
  };
}

function answerFields(answers: PhraseAnswers | null): { answers?: number[]; partly?: number[] } {
  return answers ? { answers: answers.direct, partly: answers.partial } : {};
}

/** Stories ranked for the posting; every other experience then gets its best story too. */
export const MAX_STORIES = 8;
export const MAX_VARIANTS_PER_STORY = 2;
/** Longest story summary (its facts) a search result carries. */
export const MAX_SUMMARY_CHARS = 700;

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function lower(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

/** A requirement word is present when it, or a related word, is in the story. */
function hits(token: string, documentTokens: ReadonlySet<string>): boolean {
  return documentTokens.has(token) || (RELATED[token] ?? []).some((related) => documentTokens.has(related));
}

/**
 * A requirement matches when at least a third of its words are present (and
 * at least two, so one shared word is not a match). Postings write long
 * requirements; requiring half their words matched almost nothing.
 */
function requirementMatches(
  requirementTokens: ReadonlySet<string>,
  documentTokens: ReadonlySet<string>,
): boolean {
  if (requirementTokens.size === 0) return false;
  let present = 0;
  for (const token of requirementTokens) if (hits(token, documentTokens)) present += 1;
  const needed = requirementTokens.size <= 2 ? requirementTokens.size : Math.max(2, Math.ceil(requirementTokens.size / 3));
  return present >= needed;
}

function expanded(tokens: ReadonlySet<string>): Set<string> {
  const out = new Set(tokens);
  for (const token of tokens) for (const related of RELATED[token] ?? []) out.add(related);
  return out;
}

/**
 * How usable a wording is as it stands: positive when it fits the template's
 * calibrated line length, negative when a saved rule blocks it. Supplied by
 * the caller, which knows the template and the rules.
 */
export type VariantUsability = (variant: LibraryVariant, story: LibraryStory) => number;

function rankVariants(
  story: LibraryStory,
  query: StoryQuery,
  queryTokens: ReadonlySet<string>,
  queryAngles: ReadonlySet<string>,
  usability?: VariantUsability,
): RankedVariant[] {
  const template = query.template.trim().toLowerCase();
  const phrases = query.phrases ?? [];
  return story.variants
    .map((variant) => {
      const answers = phrases.length ? answersIn(variant.text, phrases) : null;
      const score =
        (answers ? PHRASE_WEIGHT * answerScore(answers) : 0) +
        (usability ? usability(variant, story) : 0) +
        (variant.style === "house" ? 3 : 0) +
        2 * overlap(lower(variant.angles), queryAngles) +
        (lower(variant.template_fit).has(template) ? 2 : 0) +
        (variant.is_gold ? 1 : 0) +
        overlap(new Set(tokenize(variant.text)), queryTokens);
      return { variant, score, answers };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.variant.created_at.localeCompare(a.variant.created_at) ||
        a.variant.id.localeCompare(b.variant.id),
    )
    .slice(0, MAX_VARIANTS_PER_STORY)
    .map(({ variant, answers }) => ({
      id: variant.id,
      text: variant.text,
      style: variant.style,
      char_count: variant.char_count,
      explain_note: variant.explain_note,
      ...answerFields(answers),
    }));
}

function shorten(text: string | null, max: number): string | null {
  if (text === null || text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

export function rankStories(
  stories: readonly LibraryStory[],
  query: StoryQuery,
  options: {
    limit?: number;
    /** Also rank stories that share nothing with the posting (page fill uses this). */
    includeUnscored?: boolean;
    /** Add the best story of every experience the ranking left out. Default true. */
    coverEveryExperience?: boolean;
    /** Prefers wordings that fit the page and pass the saved rules. */
    usability?: VariantUsability;
  } = {},
): StoryRanking {
  const requirementTokens = query.requirements.map(
    (requirement) => new Set(tokenize(requirement)),
  );
  const queryTokens = expanded(new Set(requirementTokens.flatMap((set) => [...set])));
  const queryAngles = lower(query.angles);
  const matchedAnywhere = new Set<number>();

  const phrases = query.phrases ?? [];
  const answeredAnywhere = new Set<number>();

  const scored = stories.map((story) => {
    const documentTokens = new Set(
      tokenize(
        [
          story.label,
          story.summary ?? "",
          story.tags.join(" "),
          story.org,
          story.official_title,
          ...story.variants.map((variant) => variant.text),
        ].join(" "),
      ),
    );

    const matches: number[] = [];
    requirementTokens.forEach((tokens, index) => {
      if (requirementMatches(tokens, documentTokens)) {
        matches.push(index);
        matchedAnywhere.add(index);
      }
    });

    const storyAngles = new Set([
      ...lower(story.tags),
      ...story.variants.flatMap((variant) => [...lower(variant.angles)]),
    ]);

    // A story answers a phrase through its facts or any of its wordings.
    const answers = phrases.length
      ? bestAnswers([story.summary ?? "", ...story.variants.map((variant) => variant.text)], phrases)
      : null;
    if (answers) [...answers.direct, ...answers.partial].forEach((index) => answeredAnywhere.add(index));

    const score =
      (answers ? PHRASE_WEIGHT * answerScore(answers) : 0) +
      3 * matches.length +
      Math.min(overlap(queryTokens, documentTokens), 10) +
      2 * overlap(storyAngles, queryAngles);

    return { story, matches, score, answers };
  });

  const ordered = scored
    .filter((entry) => entry.story.variants.length > 0 && (options.includeUnscored || entry.score > 0))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.story.label.localeCompare(b.story.label) ||
        a.story.id.localeCompare(b.story.id),
    );
  const top = ordered.slice(0, options.limit ?? MAX_STORIES);

  // Every experience on the resume needs bullets, so each one the ranking
  // left out gets its best story too, scored or not (decision record 0018).
  // Without this a posting that never names an experience (the incoming IBM
  // role, BTA) gave the run nothing to write for it.
  const experienceOf = (story: LibraryStory) => `${story.org}\u0000${story.official_title}`;
  const covered = new Set(top.map((entry) => experienceOf(entry.story)));
  const coverage: typeof ordered = [];
  if (options.coverEveryExperience ?? true) {
    const bestUnscored = [...scored]
      .filter((entry) => entry.story.variants.length > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.story.variants.filter((variant) => variant.style === "house").length -
            a.story.variants.filter((variant) => variant.style === "house").length ||
          a.story.label.localeCompare(b.story.label) ||
          a.story.id.localeCompare(b.story.id),
      );
    for (const entry of bestUnscored) {
      const key = experienceOf(entry.story);
      if (covered.has(key)) continue;
      covered.add(key);
      coverage.push(entry);
    }
  }

  const ranked = [
    ...top.map((entry) => ({ entry, variants: MAX_VARIANTS_PER_STORY })),
    // Stories added only so an experience has material carry one wording.
    ...coverage.map((entry) => ({ entry, variants: 1 })),
  ].map(({ entry: { story, matches, score, answers }, variants }) => ({
    story_id: story.id,
    label: story.label,
    summary: shorten(story.summary, MAX_SUMMARY_CHARS),
    org: story.org,
    title: story.official_title,
    score,
    matches,
    ...answerFields(answers),
    variants: rankVariants(story, query, queryTokens, queryAngles, options.usability).slice(0, variants),
  }));

  const unmatched = query.requirements
    .map((_, index) => index)
    .filter((index) => !matchedAnywhere.has(index));

  if (!phrases.length) return { stories: ranked, unmatched };
  const unanswered_phrases = phrases.map((_, index) => index).filter((index) => !answeredAnywhere.has(index));
  return { stories: ranked, unmatched, unanswered_phrases };
}
