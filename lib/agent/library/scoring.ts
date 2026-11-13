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
 */

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
};

export type RankedVariant = {
  id: string;
  text: string;
  style: "house" | "story_voice";
  char_count: number;
  explain_note: string | null;
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
  variants: RankedVariant[];
};

export type StoryRanking = {
  stories: RankedStory[];
  /** Requirement indexes that no story in the whole library matched. */
  unmatched: number[];
};

export const MAX_STORIES = 5;
export const MAX_VARIANTS_PER_STORY = 2;
/** Longest story summary (its facts) a search result carries. */
export const MAX_SUMMARY_CHARS = 700;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "by",
  "with", "from", "as", "is", "are", "be", "will", "you", "your", "our", "we",
  "ability", "able", "experience", "skills", "skill", "strong", "excellent",
  "knowledge", "understanding", "proficiency", "proficient", "familiarity",
  "work", "working", "including", "etc", "plus", "preferred", "required",
  "years", "year", "related", "using", "use",
]);

/** A crude, fixed stemmer: enough to match "analyzing" with "analyzed". */
function stem(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .map(stem);
}

function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function lower(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

/** A requirement matches when at least half of its words appear. */
function requirementMatches(
  requirementTokens: ReadonlySet<string>,
  documentTokens: ReadonlySet<string>,
): boolean {
  if (requirementTokens.size === 0) return false;
  return overlap(requirementTokens, documentTokens) * 2 >= requirementTokens.size;
}

function rankVariants(
  variants: readonly LibraryVariant[],
  query: StoryQuery,
  queryTokens: ReadonlySet<string>,
  queryAngles: ReadonlySet<string>,
): RankedVariant[] {
  const template = query.template.trim().toLowerCase();
  return variants
    .map((variant) => {
      const score =
        (variant.style === "house" ? 3 : 0) +
        2 * overlap(lower(variant.angles), queryAngles) +
        (lower(variant.template_fit).has(template) ? 2 : 0) +
        (variant.is_gold ? 1 : 0) +
        overlap(new Set(tokenize(variant.text)), queryTokens);
      return { variant, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.variant.created_at.localeCompare(a.variant.created_at) ||
        a.variant.id.localeCompare(b.variant.id),
    )
    .slice(0, MAX_VARIANTS_PER_STORY)
    .map(({ variant }) => ({
      id: variant.id,
      text: variant.text,
      style: variant.style,
      char_count: variant.char_count,
      explain_note: variant.explain_note,
    }));
}

function shorten(text: string | null, max: number): string | null {
  if (text === null || text.length <= max) return text;
  return `${text.slice(0, max - 3).trimEnd()}...`;
}

export function rankStories(
  stories: readonly LibraryStory[],
  query: StoryQuery,
): StoryRanking {
  const requirementTokens = query.requirements.map(
    (requirement) => new Set(tokenize(requirement)),
  );
  const queryTokens = new Set(requirementTokens.flatMap((set) => [...set]));
  const queryAngles = lower(query.angles);
  const matchedAnywhere = new Set<number>();

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

    const score =
      3 * matches.length +
      Math.min(overlap(queryTokens, documentTokens), 10) +
      2 * overlap(storyAngles, queryAngles);

    return { story, matches, score };
  });

  const ranked = scored
    .filter((entry) => entry.score > 0 && entry.story.variants.length > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.story.label.localeCompare(b.story.label) ||
        a.story.id.localeCompare(b.story.id),
    )
    .slice(0, MAX_STORIES)
    .map(({ story, matches, score }) => ({
      story_id: story.id,
      label: story.label,
      summary: shorten(story.summary, MAX_SUMMARY_CHARS),
      org: story.org,
      title: story.official_title,
      score,
      matches,
      variants: rankVariants(story.variants, query, queryTokens, queryAngles),
    }));

  const unmatched = query.requirements
    .map((_, index) => index)
    .filter((index) => !matchedAnywhere.has(index));

  return { stories: ranked, unmatched };
}
