/**
 * Page fill: what to add when the page is short, what to cut when it runs over.
 *
 * David's rule (decision record 0016): one page, with no more than 5% of the
 * page height empty below the last line (or above the first). When the
 * layout check finds the page short, the build adds the next best library
 * bullet for the posting; when it runs over a page, the build cuts the
 * weakest bullet. This module makes those two choices. It is pure and
 * deterministic: the same page, library and posting always give the same
 * choice.
 *
 * "Best" and "weakest" use the same scoring as `search_stories`: how well the
 * text matches the posting's requirements.
 */

import { rankStories, tokenize, type LibraryStory } from "@/lib/agent/library/scoring";
import type { TailoredContent } from "@/lib/agent/resume/content";
import type { BulletOwner } from "@/lib/agent/resume/line-rules";
import type { ResumeEntry } from "@/lib/agent/resume/skeleton";
import type { TemplateName } from "@/lib/agent/types";

/** At most this many bullets per entry, as tailored content allows. */
const MAX_BULLETS_PER_ENTRY = 6;

/** A bullet this close to a story's wording counts as that story being on the page. */
const SAME_STORY_SHARE = 0.6;

export type PageAdjustment =
  | { action: "added"; entry: string; text: string; explain_note: string | null }
  | { action: "cut"; entry: string; text: string };

export type PageBullet = { text: string; owner: BulletOwner };

function overlapCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}

function requirementTokens(requirements: readonly string[]): Set<string>[] {
  return requirements.map((requirement) => new Set(tokenize(requirement)));
}

/** How well a bullet speaks to the posting: matched requirements first, then shared words. */
export function relevance(text: string, requirements: readonly string[]): number {
  const tokens = new Set(tokenize(text));
  const perRequirement = requirementTokens(requirements);
  const matched = perRequirement.filter(
    (set) => set.size > 0 && overlapCount(set, tokens) * 2 >= set.size,
  ).length;
  const all = new Set(perRequirement.flatMap((set) => [...set]));
  return matched * 3 + overlapCount(tokens, all);
}

/**
 * The weakest bullet to cut: the least relevant to the posting. A bullet in
 * `keep` (David's own edits) is never cut, and an entry keeps its last bullet
 * while any other entry has two or more. Ties go to the bullet lowest on the
 * page.
 */
export function pickWeakestBullet(
  content: TailoredContent,
  requirements: readonly string[],
  keep: ReadonlySet<string> = new Set(),
): { entry: string; index: number; text: string } | null {
  const candidates = content.entries.flatMap((entry, entryOrder) =>
    entry.omit
      ? []
      : entry.bullets.map((text, index) => ({
          entry: entry.key,
          index,
          text,
          order: entryOrder * 100 + index,
          alone: entry.bullets.length === 1,
          score: relevance(text, requirements),
        })),
  ).filter((candidate) => !keep.has(candidate.text));
  if (!candidates.length) return null;
  const pool = candidates.some((candidate) => !candidate.alone)
    ? candidates.filter((candidate) => !candidate.alone)
    : candidates;
  pool.sort((a, b) => a.score - b.score || b.order - a.order);
  const { entry, index, text } = pool[0];
  return { entry, index, text };
}

export function cutBullet(content: TailoredContent, entry: string, index: number): TailoredContent {
  const next: TailoredContent = structuredClone(content);
  const target = next.entries.find((candidate) => candidate.key === entry);
  target?.bullets.splice(index, 1);
  return next;
}

function storyDocumentTokens(story: LibraryStory): Set<string> {
  return new Set(
    tokenize([story.label, story.summary ?? "", ...story.variants.map((variant) => variant.text)].join(" ")),
  );
}

/** True when some bullet on the page already tells this story. */
function storyOnPage(story: LibraryStory, pageBullets: readonly string[]): boolean {
  const wordings = new Set(story.variants.map((variant) => variant.text.replace(/\*\*/g, "")));
  const document = storyDocumentTokens(story);
  return pageBullets.some((bullet) => {
    if (wordings.has(bullet)) return true;
    const tokens = new Set(tokenize(bullet));
    return tokens.size > 0 && overlapCount(tokens, document) / tokens.size >= SAME_STORY_SHARE;
  });
}

/** The resume entry a story belongs under, if that entry is on the page. */
function entryForStory(story: LibraryStory, entries: readonly ResumeEntry[]): ResumeEntry | null {
  return (
    entries.find((entry) =>
      entry.org === null
        ? entry.title === story.org
        : entry.org === story.org && entry.title === story.official_title,
    ) ?? null
  );
}

/**
 * The next best library bullet to add: the best-ranked story for the posting
 * that is not on the page yet, whose experience is on the page, written with
 * its best variant that passes the page check (`accepts`).
 */
export function pickNextBullet(input: {
  content: TailoredContent;
  pageBullets: readonly string[];
  entries: readonly ResumeEntry[];
  library: readonly LibraryStory[];
  requirements: readonly string[];
  template: TemplateName;
  accepts: (entry: string, text: string) => boolean;
}): { entry: string; text: string; explain_note: string | null } | null {
  const shown = new Map(
    input.content.entries.filter((entry) => !entry.omit).map((entry) => [entry.key, entry]),
  );
  const ranking = rankStories(
    input.library,
    { requirements: input.requirements, angles: [], template: input.template },
    { limit: Number.MAX_SAFE_INTEGER },
  );
  const byId = new Map(input.library.map((story) => [story.id, story]));

  for (const ranked of ranking.stories) {
    const story = byId.get(ranked.story_id);
    if (!story || storyOnPage(story, input.pageBullets)) continue;
    const entry = entryForStory(story, input.entries);
    const listed = entry ? shown.get(entry.key) : undefined;
    if (!entry || !listed || listed.bullets.length >= MAX_BULLETS_PER_ENTRY) continue;
    for (const variant of ranked.variants) {
      if (input.accepts(entry.key, variant.text)) {
        return { entry: entry.key, text: variant.text, explain_note: variant.explain_note };
      }
    }
  }
  return null;
}

export function addBullet(content: TailoredContent, entry: string, text: string): TailoredContent {
  const next: TailoredContent = structuredClone(content);
  next.entries.find((candidate) => candidate.key === entry)?.bullets.push(text);
  return next;
}
