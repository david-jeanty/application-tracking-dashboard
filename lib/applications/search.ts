/**
 * Builds a `LIKE` pattern that makes caller-supplied text match itself.
 *
 * PostgREST hands the pattern to SQL `LIKE`, where `%` and `_` are wildcards
 * and a backslash escapes them. Escaping here keeps a company name such as
 * `100%_Inc` a search for that text rather than a pattern that matches most of
 * the table.
 *
 * One case cannot be escaped: PostgREST expands a literal `*` to `%` before
 * Postgres sees the pattern. The effect is limited to a broader match within
 * the caller's own rows, since every query using this is owner-scoped and
 * row-level security applies again underneath.
 */
export function toContainsPattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}
