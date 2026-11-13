/**
 * `get_application_brief`: everything a new chat needs to pick a posting back
 * up, in under 300 words.
 *
 * STANDARDS.md asks that returning to a posting starts a new chat from this
 * brief, never from old history. It never includes the job description: the
 * requirements extracted at creation stand in for it.
 *
 * Pure: it takes rows already read and returns the response object.
 */

import { byteLength, TOOL_RESULT_CAPS, truncate } from "@/lib/agent/caps";
import type { RunState } from "@/lib/agent/ledger";
import type { Requirement } from "@/lib/agent/types";

export const BRIEF_WORD_LIMIT = 300;

export type BriefSource = {
  application: {
    id: string;
    company_name: string;
    original_job_title: string;
    location: string | null;
    job_id: string | null;
    application_url: string | null;
    current_status: string;
    date_applied: string | null;
    application_deadline: string | null;
    partner_functions: string[] | null;
  };
  requirements: Requirement[];
  runState: RunState;
  resume: {
    id: string;
    status: string;
    build_count: number;
    template: string | null;
    has_pdf: boolean;
    resumelol_url: string | null;
  } | null;
  answersCount: number;
};

/** Words across every string in a value, the way a reader would count them. */
export function countWords(value: unknown): number {
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean).length;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + countWords(item), 0);
  if (value && typeof value === "object") {
    return Object.values(value).reduce<number>((sum, item) => sum + countWords(item), 0);
  }
  return 0;
}

export function buildApplicationBrief(source: BriefSource) {
  const { application } = source;

  // Must-haves first, so trimming to the word limit drops nice-to-haves first.
  const ordered = [
    ...source.requirements.filter((requirement) => requirement.must_have),
    ...source.requirements.filter((requirement) => !requirement.must_have),
  ].map((requirement) => ({
    text: truncate(requirement.text, 140),
    must_have: requirement.must_have,
  }));

  const brief = {
    application_id: application.id,
    company: application.company_name,
    title: application.original_job_title,
    location: application.location,
    job_id: application.job_id,
    posting_url: application.application_url,
    status: application.current_status,
    date_applied: application.date_applied,
    deadline: application.application_deadline,
    partner_functions: (application.partner_functions ?? []).slice(0, 8),
    requirements: ordered,
    requirements_omitted: 0,
    run: source.runState,
    resume: source.resume,
    saved_answers: source.answersCount,
  };

  // Trim until it is under both the word limit and the tool's byte cap, so the
  // brief is always built to fit rather than refused at the cap.
  const overBudget = () =>
    countWords(brief) > BRIEF_WORD_LIMIT ||
    byteLength(JSON.stringify(brief)) > TOOL_RESULT_CAPS.get_application_brief;

  while (overBudget() && brief.requirements.length > 0) {
    brief.requirements = brief.requirements.slice(0, -1);
    brief.requirements_omitted += 1;
  }

  return brief;
}
