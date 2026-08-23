/**
 * The columns a student's free-text search looks at.
 *
 * These are the human-facing fields someone would actually type: who the job
 * is with, what it is called, and where it is. Long free text — the job
 * description and notes — is deliberately absent, so a one-word search cannot
 * drag in every application that happens to mention that word in a posting.
 */
export const SEARCHABLE_COLUMNS = [
  "company_name",
  "original_job_title",
  "location",
] as const;

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

/**
 * Quotes a value for use inside a PostgREST filter expression.
 *
 * PostgREST splits an `or=(…)` list on commas and reads `column.operator.value`
 * triples, so a value containing a comma, a period, or a bracket would
 * otherwise be parsed as structure rather than as text. Double-quoting the
 * value removes that ambiguity, and inside those quotes a `"` or a `\` has to
 * be backslash-escaped in turn.
 *
 * Order matters: this runs *after* `toContainsPattern`, so the backslashes that
 * function added to protect `%` and `_` are themselves doubled here. PostgREST
 * undoes one layer when it unquotes, leaving Postgres the single backslash it
 * needs to treat the wildcard as literal text.
 */
function toQuotedFilterValue(value: string): string {
  const escaped = value.replace(/[\\"]/g, (character) => `\\${character}`);
  return `"${escaped}"`;
}

/**
 * Builds the PostgREST `or` expression for one search term.
 *
 * The result matches a row when the term appears, case-insensitively, in any
 * searchable column. Raw input is never interpolated into the expression: the
 * term is turned into a literal `LIKE` pattern and then quoted, so punctuation
 * a student types — a comma in "Toronto, ON", a period in "Inc." — is searched
 * for rather than read as filter syntax.
 */
export function toSearchFilter(term: string): string {
  const pattern = toQuotedFilterValue(toContainsPattern(term));

  return SEARCHABLE_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(
    ",",
  );
}
