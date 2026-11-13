/**
 * Duplicate detection for `create_application_from_jd`: company + title +
 * job id, as Spec 1 asks.
 *
 * Done in code rather than with a SQL `ilike`, because PostgREST treats `*` in
 * a like pattern as a wildcard and offers no way to escape it, so an exact,
 * case-insensitive comparison is only reliable here. A tracker holds at most a
 * few hundred applications, and only short columns are read to do it.
 */

export type DedupeCandidate = {
  id: string;
  company_name: string;
  original_job_title: string;
  job_id: string | null;
  created_at: string;
};

/** Case, spacing and punctuation differences do not make a new posting. */
export function normalizeForDedupe(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Every candidate with the same company and title, newest first. */
export function sameCompanyAndTitle(
  candidates: readonly DedupeCandidate[],
  company: string,
  title: string,
): DedupeCandidate[] {
  const wantedCompany = normalizeForDedupe(company);
  const wantedTitle = normalizeForDedupe(title);
  return candidates
    .filter(
      (candidate) =>
        normalizeForDedupe(candidate.company_name) === wantedCompany &&
        normalizeForDedupe(candidate.original_job_title) === wantedTitle,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/**
 * The application a posting is a duplicate of, or null.
 *
 * Same job id wins. Without a job id on one side, the newest same company and
 * title record counts as the same posting (it was saved before the agent ran,
 * by the extension or by hand). Two different job ids are two postings.
 */
export function pickDuplicate<T extends { job_id: string | null }>(
  sameNamed: readonly T[],
  jobId: string | null | undefined,
): T | null {
  if (jobId) {
    const exact = sameNamed.find((row) => row.job_id === jobId);
    if (exact) return exact;
  }
  return sameNamed.find((row) => !jobId || row.job_id === null) ?? null;
}
