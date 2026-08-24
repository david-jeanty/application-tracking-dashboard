import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";

/**
 * How two spellings of a source become one source.
 *
 * This module is deliberately only the grouping rule. What *happened* to the
 * applications in a group is `lib/analytics/performance.ts`, which asks the
 * same question of role categories and would otherwise have to restate these
 * decisions a second time — and two implementations of "is `linkedin` the same
 * as `LinkedIn`" is exactly how a page ends up quietly disagreeing with itself.
 *
 * Nothing here ranks, scores, or recommends a source. It decides which rows
 * belong together and what to call the result.
 */

/**
 * The bucket an application with no recorded source falls into.
 *
 * It is the sentinel the database already stores, not a new vocabulary: a blank
 * source on the form or over MCP is written as `Not specified`, so this is what
 * "no source" already looks like in the data.
 */
export const UNSPECIFIED_SOURCE_LABEL = UNSPECIFIED_DATABASE_VALUE;

/** The key that decides whether two spellings are the same source. */
export const unspecifiedSourceKey = UNSPECIFIED_SOURCE_LABEL.toLowerCase();

/**
 * The key two spellings must share to be counted as one source.
 *
 * Deliberately conservative: trim, then lowercase. Nothing else. `LinkedIn`,
 * `linkedin`, and `LINKEDIN ` are one source because they differ only in how
 * the same word was typed. `LinkedIn` and `LinkedIn Easy Apply` stay two,
 * because nothing in the data model says they are the same thing and deciding
 * that they are would be inventing a taxonomy this product does not have.
 *
 * A blank value cannot reach here from the database — the column is `not null`
 * with a `btrim` length check — but it is folded into the unspecified bucket
 * anyway rather than becoming an empty row.
 */
export function sourceGroupingKey(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return unspecifiedSourceKey;
  return trimmed.toLowerCase();
}

/**
 * The spelling to show for a group, chosen deterministically from the data.
 *
 * The most frequently typed spelling wins, because that is the one the student
 * recognises as theirs. Ties break on the spelling itself rather than on row
 * order, so the label depends only on which values are present and not on the
 * order the database happened to return them in.
 */
export function preferredSourceSpelling(spellings: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const spelling of spellings) {
    counts.set(spelling, (counts.get(spelling) ?? 0) + 1);
  }

  return [...counts.entries()].sort(
    (first, second) => second[1] - first[1] || first[0].localeCompare(second[0]),
  )[0][0];
}
