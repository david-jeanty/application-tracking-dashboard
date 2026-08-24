import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  type ApplicationStatus,
  type JobCategory,
} from "@/lib/applications/constants";
import type { ActiveApplicationFilters } from "@/lib/applications/repository";

/**
 * The query parameters the applications list and the pipeline board read.
 *
 * Named with the same vocabulary the MCP tools use, so a student reading a
 * bookmarked URL and a student reading a Claude transcript see the same words
 * for the same things. Deliberately absent: anything that could select archived
 * records. Archive state is not a URL concern on this page.
 */
export const SEARCH_PARAM = "q";
export const STATUS_PARAM = "status";
export const WORK_TERM_PARAM = "work_term";
export const CATEGORY_PARAM = "category";

/** What Next.js hands a page for `?a=1&b=2`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

const SEARCH_MAXIMUM_LENGTH = 160;
const WORK_TERM_MAXIMUM_LENGTH = 80;

/** Takes the first value when a parameter is repeated, and trims it. */
function readParam(
  params: RawSearchParams,
  name: string,
  maximumLength: number,
): string | undefined {
  const raw = params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength) return undefined;

  return trimmed;
}

/** Matches a controlled value case-insensitively, or ignores it entirely. */
function readOption<Option extends string>(
  params: RawSearchParams,
  name: string,
  options: readonly Option[],
): Option | undefined {
  const value = readParam(params, name, 80);
  if (!value) return undefined;

  return options.find(
    (option) => option.toLowerCase() === value.toLowerCase(),
  );
}

/**
 * Reads the list filters out of a URL.
 *
 * Every parameter is optional and every unrecognized value is dropped rather
 * than rejected: a hand-edited `?status=banana` shows the ordinary unfiltered
 * list instead of an error page, which is the behavior a student bookmarking
 * and editing URLs will expect. An over-long value is dropped for the same
 * reason, so a pathological query string cannot become a pathological
 * `LIKE` pattern.
 */
export function parseApplicationFilters(
  params: RawSearchParams,
): ActiveApplicationFilters {
  const search = readParam(params, SEARCH_PARAM, SEARCH_MAXIMUM_LENGTH);
  const status = readOption<ApplicationStatus>(
    params,
    STATUS_PARAM,
    APPLICATION_STATUSES,
  );
  const workTermSeason = readParam(
    params,
    WORK_TERM_PARAM,
    WORK_TERM_MAXIMUM_LENGTH,
  );
  const category = readOption<JobCategory>(
    params,
    CATEGORY_PARAM,
    JOB_CATEGORIES,
  );

  return {
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    ...(workTermSeason ? { workTermSeason } : {}),
    ...(category ? { category } : {}),
  };
}

/** True when the student has actually narrowed the list. */
export function hasActiveFilters(filters: ActiveApplicationFilters): boolean {
  return Boolean(
    filters.search ||
      filters.status ||
      filters.workTermSeason ||
      filters.category,
  );
}

/**
 * Describes the applied filters for a screen-reader summary and the empty
 * state, in the order the controls appear.
 */
export function describeActiveFilters(
  filters: ActiveApplicationFilters,
): string[] {
  const described: string[] = [];

  if (filters.search) described.push(`matching "${filters.search}"`);
  if (filters.status) described.push(`with status ${filters.status}`);
  if (filters.workTermSeason) described.push(`for ${filters.workTermSeason}`);
  if (filters.category) described.push(`in ${filters.category}`);

  return described;
}

/**
 * Reads the pipeline board's filters out of a URL.
 *
 * The same parser as the list's, minus status. Status is what the board's
 * columns *are*: filtering it away would leave a board of one column, which is
 * the applications list with extra steps. Search, work term and role category
 * all narrow *which* applications the board is about, which is a different
 * question from where each one stands, so all three are kept.
 *
 * Sharing `ActiveApplicationFilters` rather than a pipeline-specific type is
 * deliberate: the board reads through the same owner-scoped, archive-safe
 * `listActiveApplications` the list uses, so it must not be able to describe a
 * filter that read would not accept — and the category filter it produces is
 * the same equality match on `normalized_job_category` the list already sends.
 */
export function parsePipelineFilters(
  params: RawSearchParams,
): ActiveApplicationFilters {
  const { search, workTermSeason, category } = parseApplicationFilters(params);

  return {
    ...(search ? { search } : {}),
    ...(workTermSeason ? { workTermSeason } : {}),
    ...(category ? { category } : {}),
  };
}

/** The parameter the board reports a completed move through. */
export const MOVE_PARAM = "move";

/**
 * Rebuilds a pipeline URL from filters that have already been parsed.
 *
 * The path is a fixed internal one and every parameter is re-encoded here, so
 * a filter value carrying its own `&` or `?` becomes text in a query value
 * rather than a second parameter. That is what lets the move action send a
 * student back to the board they were looking at without a request-supplied
 * string ever reaching the redirect intact.
 */
export function toPipelineUrl(
  filters: ActiveApplicationFilters,
  notice?: string,
): string {
  const params = new URLSearchParams();

  if (filters.search) params.set(SEARCH_PARAM, filters.search);
  if (filters.workTermSeason) {
    params.set(WORK_TERM_PARAM, filters.workTermSeason);
  }
  if (filters.category) params.set(CATEGORY_PARAM, filters.category);
  if (notice) params.set(MOVE_PARAM, notice);

  const query = params.toString();
  return query ? `/pipeline?${query}` : "/pipeline";
}
