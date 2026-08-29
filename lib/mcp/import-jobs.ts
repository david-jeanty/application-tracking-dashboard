import type { CreatedApplication } from "@/lib/applications/repository";
import {
  applicationCreationSchema,
  type ApplicationCreationInput,
} from "@/lib/validation/application";
import {
  toApplicationCreationValues,
  type ImportedApplication,
  type ImportJobsInput,
  type NewJobRecord,
} from "@/lib/validation/mcp";

export type ImportJobsOutcome =
  | { outcome: "imported"; applications: ImportedApplication[] }
  | { outcome: "invalid"; message: string }
  | { outcome: "error"; code?: string };

/**
 * The one repository call this tool needs, injected so batch validation,
 * atomicity, and ownership are testable without a database. It is bound to the
 * authenticated user before it reaches here.
 */
export type ImportJobsDependencies = {
  createApplications: (inputs: readonly ApplicationCreationInput[]) => Promise<{
    data: CreatedApplication[] | null;
    error: { code?: string } | null;
  }>;
};

/**
 * Names the record that failed, well enough to find it in a spreadsheet.
 *
 * A position alone ("record 17") is useless against a file the student is
 * looking at in another window, and the employer and title alone are ambiguous
 * when a tracker holds three roles at one bank. Both together let the
 * assistant say which row to fix. The numbering is one-based, because the
 * student is counting rows, not indexes.
 */
function describeRecord(record: NewJobRecord, index: number): string {
  return `Import record ${index + 1} (${record.company} — ${record.job_title})`;
}

/**
 * Imports a batch of already-normalized applications.
 *
 * Two phases, and the order is the point.
 *
 * **Every record is validated first**, through the same
 * `applicationCreationSchema` the web form and `save_job` go through. Not a
 * second set of import rules — the same one, so a record that could be typed
 * into the website can be imported and a record that could not, cannot. The
 * loop stops at the first failure and nothing has been written, so an invalid
 * seventeenth record cannot leave sixteen applications behind for the student
 * to find and remove by hand.
 *
 * **Then the whole batch is written at once**, through a single bulk insert.
 * There is no per-record write to partially succeed.
 *
 * Nothing here reads the tracker, compares employers, or decides that two rows
 * look alike. Duplicate review belongs to the assistant and the student, who
 * can see both records and can ask; a silent merge or skip inside a database
 * write would be a guess made where nobody could see it.
 *
 * Nothing here writes status history either, and the import path contains no
 * code that could: the creation trigger records the status each application
 * arrived at, and the stages it passed through before Interndex existed are not
 * ours to invent.
 */
export async function runImportJobs(
  input: ImportJobsInput,
  dependencies: ImportJobsDependencies,
): Promise<ImportJobsOutcome> {
  const validated: ApplicationCreationInput[] = [];

  for (const [index, record] of input.applications.entries()) {
    const parsed = applicationCreationSchema.safeParse(
      toApplicationCreationValues(record),
    );

    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => issue.message)
        .join(" ");

      return {
        outcome: "invalid",
        message: `${describeRecord(record, index)} could not be validated: ${details}`,
      };
    }

    validated.push(parsed.data);
  }

  const { data, error } = await dependencies.createApplications(validated);

  if (error || !data) return { outcome: "error", code: error?.code };

  return {
    outcome: "imported",
    applications: data.map((application) => ({
      application_id: application.id,
      company: application.company_name,
      job_title: application.original_job_title,
    })),
  };
}
