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

/** Stories ranked for the posting; every other experience then gets its best story too. */
export const MAX_STORIES = 8;
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

/**
 * Words a posting uses for work David's stories describe in other words
 * (decision record 0018). Keys and values are stems, as `tokenize` makes
 * them. Only true neighbours belong here: a synonym that turns a real gap
 * (forecasting, pricing, inventory) into a match would mislead the fit read.
 */
const RELATED: Readonly<Record<string, readonly string[]>> = {
  collateral: ["content", "case", "studi", "video", "youtube", "title", "description"],
  catalog: ["content", "case", "studi", "video", "title", "description"],
  bulletin: ["content", "case", "studi", "video", "title", "description"],
  brochure: ["content", "case", "studi", "video", "title", "description"],
  promotional: ["content", "campaign", "outreach", "audience", "visibility"],
  campaign: ["outreach", "audience", "linkedin", "reddit", "visibility", "email", "hubspot"],
  marcomm: ["marketing", "content"],
  marketing: ["seo", "visibility", "audience", "content"],
  launch: ["launch", "launched"],
  metric: ["kpi", "dashboard", "track", "metric"],
  kpi: ["kpi", "dashboard", "metric"],
  process: ["triage", "workflow", "redesign", "backlog", "standard"],
  workflow: ["workflow", "triage", "automat"],
  improvement: ["reduc", "cut", "improv", "eliminat", "redesign"],
  roadmap: ["priorit", "requirement", "rescop"],
  customer: ["user", "interview", "feedback", "client"],
  user: ["user", "interview", "feedback"],
  stakeholder: ["stakeholder", "requirement", "director", "client"],
  engineer: ["engineer", "engineering"],
  engineering: ["engineer", "engineering"],
  requirement: ["requirement", "scope", "rescop"],
  detail: ["audit", "tracker", "timeline", "data", "quality"],
  organizational: ["tracker", "timeline", "deliverable", "event", "logistic"],
  communication: ["present", "document", "email", "call", "outreach"],
  analytic: ["dashboard", "data", "sql", "power", "kpi"],
  data: ["data", "record", "sql", "dashboard"],
  ai: ["ai", "claude", "llm", "mcp"],
};

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
  return story.variants
    .map((variant) => {
      const score =
        (usability ? usability(variant, story) : 0) +
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
  ].map(({ entry: { story, matches, score }, variants }) => ({
    story_id: story.id,
    label: story.label,
    summary: shorten(story.summary, MAX_SUMMARY_CHARS),
    org: story.org,
    title: story.official_title,
    score,
    matches,
    variants: rankVariants(story, query, queryTokens, queryAngles, options.usability).slice(0, variants),
  }));

  const unmatched = query.requirements
    .map((_, index) => index)
    .filter((index) => !matchedAnywhere.has(index));

  return { stories: ranked, unmatched };
}
