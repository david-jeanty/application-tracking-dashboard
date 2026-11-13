/**
 * Size caps on every agent tool result, and the byte count the usage log keeps.
 *
 * Every agent tool answers in compact JSON (no prose, no indentation) and
 * builds its answer within limits by construction: bounded counts, truncated
 * long text, and never the full job description after creation. The cap here
 * is the last guard. A result over its cap is refused rather than sent, so a
 * bug shows up as a clear error instead of a quietly expensive response.
 *
 * Estimated tokens are bytes / 4, which is what the usage page shows.
 */

export const TOOL_RESULT_CAPS = {
  // About 18 KB is the run steps and standards. The rest is room for saved
  // rules, which must all be served and grow over time.
  get_playbook: 40_000,
  get_run_state: 1_500,
  get_application_brief: 2_600,
  create_application_from_jd: 1_000,
  search_stories: 9_000,
  save_variant: 600,
  record_edit: 400,
  add_rule: 400,
  check_bullets: 8_000,
  save_answer: 400,
  search_answers: 7_000,
  import_library: 1_500,
  calibrate_template: 4_000,
  build_resume: 3_000,
  rebuild_with_edits: 3_000,
  complete_run: 4_000,
} as const;

export type CappedTool = keyof typeof TOOL_RESULT_CAPS;

export type SerializedResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; bytes: number; cap: number };

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Compact JSON for one tool result, or a refusal when it is over the cap. */
export function serializeCapped(tool: CappedTool, value: unknown): SerializedResult {
  const text = JSON.stringify(value);
  const bytes = byteLength(text);
  const cap = TOOL_RESULT_CAPS[tool];
  return bytes <= cap ? { ok: true, text, bytes } : { ok: false, bytes, cap };
}

/** Shortens text to at most `max` characters, marking the cut with "...". */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

export function estimatedTokens(bytes: number): number {
  return Math.ceil(bytes / 4);
}
