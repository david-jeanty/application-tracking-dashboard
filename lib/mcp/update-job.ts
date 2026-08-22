import { displayOptionalText, toApplicationFormValues } from "@/lib/applications/mapper";
import type { ApplicationUpdateResult } from "@/lib/applications/repository";
import type { ApplicationRecord } from "@/lib/applications/types";
import { applicationUpdateSchema } from "@/lib/validation/application";
import {
  mergeUpdateValues,
  type UpdateJobInput,
} from "@/lib/validation/mcp";

/** One reported change, named with the tool's vocabulary rather than columns. */
export type FieldChange = {
  field: string;
  from: string | null;
  to: string | null;
};

export type UpdateJobOutcome =
  | {
      outcome: "updated";
      applicationId: string;
      changed: FieldChange[];
      statusChanged: boolean;
    }
  | { outcome: "not_found" }
  | { outcome: "conflict" }
  | { outcome: "invalid"; message: string }
  | { outcome: "error"; code?: string };

/**
 * The repository calls this orchestration needs, injected so the ownership,
 * conflict, and not-found paths are testable without a database. Both are
 * bound to the authenticated user before they reach here.
 */
export type UpdateJobDependencies = {
  readApplication: (applicationId: string) => Promise<{
    data: ApplicationRecord | null;
    error: { code?: string } | null;
  }>;
  writeApplication: (
    applicationId: string,
    input: ReturnType<typeof applicationUpdateSchema.parse>,
  ) => Promise<ApplicationUpdateResult>;
};

/** Columns the tool can change, labelled with the argument that changes them. */
const REPORTED_FIELDS = {
  company_name: "company",
  original_job_title: "job_title",
  location: "location",
  current_status: "status",
  normalized_job_category: "category",
  work_arrangement: "work_arrangement",
  job_description: "job_description",
  application_url: "job_url",
  application_source: "source",
  application_deadline: "deadline",
  date_applied: "date_applied",
  work_term_season: "work_term",
  work_term_duration: "duration",
  salary: "salary",
  notes: "notes",
  next_action: "next_action",
  next_action_due_date: "next_action_due_date",
} as const satisfies Partial<Record<keyof ApplicationRecord, string>>;

/** Columns that store the internal sentinel rather than a null when unset. */
const SENTINEL_COLUMNS = new Set(["location", "application_source"]);

const MAXIMUM_REPORTED_LENGTH = 80;

function reportableValue(
  column: string,
  value: ApplicationRecord[keyof ApplicationRecord],
): string | null {
  const raw = SENTINEL_COLUMNS.has(column)
    ? displayOptionalText(typeof value === "string" ? value : null)
    : value;

  if (raw === null || raw === undefined || raw === "") return null;

  const text = String(raw);
  return text.length > MAXIMUM_REPORTED_LENGTH
    ? `${text.slice(0, MAXIMUM_REPORTED_LENGTH)}…`
    : text;
}

/** Compares the stored record before and after the write. */
export function diffApplications(
  before: ApplicationRecord,
  after: ApplicationRecord,
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [column, field] of Object.entries(REPORTED_FIELDS)) {
    const key = column as keyof ApplicationRecord;
    if (before[key] === after[key]) continue;

    changes.push({
      field,
      from: reportableValue(column, before[key]),
      to: reportableValue(column, after[key]),
    });
  }

  return changes;
}

/**
 * Applies a partial update to one application the caller owns.
 *
 * The record is read first, under the authenticated identity, so the patch
 * merges onto real stored values instead of erasing the fields Claude did not
 * mention. That read also supplies the `updated_at` the conditional write needs,
 * which is what makes optimistic concurrency meaningful here: if anything
 * changed the row in between — a browser tab, another agent — the write matches
 * no row and we start again from the newer state. One retry covers an ordinary
 * race; a second conflict is reported rather than looped on.
 *
 * Status history is never written here. Changing `current_status` fires the
 * database trigger that owns that audit trail.
 */
export async function runUpdateJob(
  args: UpdateJobInput,
  dependencies: UpdateJobDependencies,
): Promise<UpdateJobOutcome> {
  const applicationId = args.application_id;
  const maximumAttempts = 2;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const before = await dependencies.readApplication(applicationId);

    if (before.error) return { outcome: "error", code: before.error.code };
    // Missing and not-owned are indistinguishable by design: the read is
    // scoped to the authenticated user and row-level security applies again.
    if (!before.data) return { outcome: "not_found" };

    const merged = mergeUpdateValues(
      toApplicationFormValues(before.data),
      args,
    );
    const parsed = applicationUpdateSchema.safeParse({
      ...merged,
      expectedUpdatedAt: before.data.updated_at,
    });

    if (!parsed.success) {
      return {
        outcome: "invalid",
        message: parsed.error.issues.map((issue) => issue.message).join(" "),
      };
    }

    const result = await dependencies.writeApplication(
      applicationId,
      parsed.data,
    );

    if (result.outcome === "updated") {
      return {
        outcome: "updated",
        applicationId,
        changed: diffApplications(before.data, result.application),
        statusChanged:
          before.data.current_status !== result.application.current_status,
      };
    }
    if (result.outcome === "not_found") return { outcome: "not_found" };
    if (result.outcome === "error") {
      return { outcome: "error", code: result.code };
    }
    // Conflict: something else wrote first. Re-read and rebuild the patch.
  }

  return { outcome: "conflict" };
}
