import type { McpServer } from "@modelcontextprotocol/server";
import type {
  ApplicationListFilters,
  ApplicationUpdateResult,
  CreatedApplication,
} from "@/lib/applications/repository";
import type {
  ApplicationListItem,
  ApplicationRecord,
} from "@/lib/applications/types";
import { runGetJob } from "@/lib/mcp/get-job";
import { runImportJobs } from "@/lib/mcp/import-jobs";
import { runListJobs } from "@/lib/mcp/list-jobs";
import { runUpdateJob } from "@/lib/mcp/update-job";
import { readUserId } from "@/lib/mcp/user";
import {
  applicationCreationSchema,
  type ApplicationCreationInput,
  type ApplicationUpdateInput,
} from "@/lib/validation/application";
import {
  getJobInputSchema,
  IMPORT_JOBS_MAXIMUM_BATCH,
  importJobsInputSchema,
  importJobsOutputSchema,
  jobDetailSchema,
  listJobsInputSchema,
  listJobsOutputSchema,
  saveJobInputSchema,
  saveJobOutputSchema,
  toApplicationCreationValues,
  updateJobInputSchema,
  updateJobOutputSchema,
  type JobSummary,
} from "@/lib/validation/mcp";

/** A read that failed, in the only shape the tools care about. */
type ReadError = { code?: string } | null;

/**
 * The data access the tools use, already bound to one authenticated user.
 *
 * Every method here is the existing repository function with the caller's
 * identity applied, so a tool body has no way to name a different owner. The
 * indirection exists for one reason beyond that: it lets the real tool
 * registration be exercised in tests against a stand-in store, instead of
 * tests re-declaring their own copies of the tools and proving nothing about
 * what the route actually serves.
 */
export type JobTrackRepository = {
  createApplication: (input: ApplicationCreationInput) => Promise<{
    data: { id: string } | null;
    error: ReadError;
  }>;
  /** One statement for the whole batch, so an import cannot half-succeed. */
  createApplications: (
    inputs: readonly ApplicationCreationInput[],
  ) => Promise<{ data: CreatedApplication[] | null; error: ReadError }>;
  getApplication: (applicationId: string) => Promise<{
    data: ApplicationRecord | null;
    error: ReadError;
  }>;
  listApplications: (filters: ApplicationListFilters) => Promise<{
    data: ApplicationListItem[] | null;
    error: ReadError;
  }>;
  updateApplication: (
    applicationId: string,
    input: ApplicationUpdateInput,
  ) => Promise<ApplicationUpdateResult>;
};

/** Builds the bound repository for one verified request. */
export type JobTrackRepositoryFactory = (identity: {
  token: string;
  userId: string;
}) => JobTrackRepository;

const NOT_SIGNED_IN = "Not signed in to the application tracker.";
const NOT_IN_TRACKER =
  "No application with that id is in this student's tracker.";

function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/** A short line per application, for clients that read only the text block. */
function summaryLine(job: JobSummary): string {
  const details = [
    job.status,
    job.work_term,
    job.location,
    job.date_applied ? `applied ${job.date_applied}` : null,
    job.deadline ? `deadline ${job.deadline}` : null,
    job.archived ? "archived" : null,
  ].filter(Boolean);

  return `${job.company} — ${job.job_title} (${details.join(", ")}) [${job.application_id}]`;
}

/**
 * Registers every Interndex tool on an MCP server.
 *
 * The route and the tests both call this, so what is tested is what is served.
 */
export function registerJobTrackTools(
  server: McpServer,
  repositoryFor: JobTrackRepositoryFactory,
): void {
  server.registerTool(
    "save_job",
    {
      title: "Save job application",
      description:
        "Saves a job to the student's application tracker. Use this when they share a job posting and want it recorded, or say they have applied somewhere. Pass the full job description verbatim when it is available so they can reread it later. Fill in company_domain with the employer's own website whenever you can identify the employer, so the saved application shows its logo without the student having to ask for it.",
      inputSchema: saveJobInputSchema,
      outputSchema: saveJobOutputSchema,
    },
    async (args, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);

      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);

      // The tool's wire schema is permissive so Claude can fill it easily.
      // The shared creation schema is the real gate, so an MCP write obeys
      // exactly the same rules as a write from the website's form.
      const parsed = applicationCreationSchema.safeParse(
        toApplicationCreationValues(args),
      );

      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => issue.message)
          .join(" ");
        return toolError(`That job could not be saved. ${details}`);
      }

      // Queries run as the token's user, so row-level security decides what
      // may be written. `user_id` is never taken from tool arguments: the
      // column defaults to `auth.uid()`, resolved from the access token.
      const repository = repositoryFor({ token: authInfo.token, userId });
      const { data, error } = await repository.createApplication(parsed.data);

      if (error || !data) {
        return toolError(
          `That job could not be saved. Database error ${error?.code ?? "unknown"}.`,
        );
      }

      // The sentence a student reads, and the same facts as data for a client
      // that would otherwise have to list the tracker again to find the id it
      // just created. No ownership column is in either.
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved ${parsed.data.originalJobTitle} at ${parsed.data.companyName} with status ${parsed.data.currentStatus}.`,
          },
        ],
        structuredContent: {
          application_id: data.id,
          company: parsed.data.companyName,
          job_title: parsed.data.originalJobTitle,
          status: parsed.data.currentStatus,
        },
      };
    },
  );

  server.registerTool(
    "import_jobs",
    {
      title: "Import job applications",
      description:
        `Adds several already-normalized applications to the student's tracker in one write. Use this when they want to migrate an existing tracker — a Google Sheets or Excel export, a CSV, a list they have been keeping elsewhere — or otherwise add many applications at once. This tool takes records, never files: read the spreadsheet yourself and send Interndex what you concluded. Before calling it: work out what each column means, and resolve anything ambiguous with the student rather than guessing — a status like "OA", "Ghosted" or "Phone screen" must become one of Interndex's own statuses, and a date like 03/04/2026 must become an unambiguous YYYY-MM-DD, which means asking which convention their spreadsheet used. Show them what you found before writing anything. Check for likely duplicates with list_jobs, narrowing by company where that helps, and when an employer and title already look present, ask whether to skip that row or import another copy — Interndex will not merge or skip anything on its own. Never invent history: send the status each application is at now, with its recorded date_applied, and do not manufacture the stages it passed through on the way. Useful information from columns Interndex has no field for can go in that record's notes, once you have told the student you are doing that. Send at most ${IMPORT_JOBS_MAXIMUM_BATCH} applications per call and split a larger tracker into several calls, keeping the mapping the student agreed to identical across every batch. Each call is all-or-nothing: if one record is invalid, nothing in that batch is saved.`,
      inputSchema: importJobsInputSchema,
      outputSchema: importJobsOutputSchema,
    },
    async (args, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);

      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);

      // Bound to the token's user before the runner is reached, exactly as
      // every other tool is. Row-level security checks again underneath.
      const repository = repositoryFor({ token: authInfo.token, userId });
      const result = await runImportJobs(args, {
        createApplications: (inputs) => repository.createApplications(inputs),
      });

      if (result.outcome === "invalid") {
        return toolError(
          `Nothing was imported. ${result.message} Fix that record with the student and send the batch again.`,
        );
      }
      if (result.outcome === "error") {
        return toolError(
          `Nothing was imported. Database error ${result.code ?? "unknown"}.`,
        );
      }

      const imported = result.applications.length;

      return {
        content: [
          {
            type: "text" as const,
            text: `Imported ${imported} application${imported === 1 ? "" : "s"} into Interndex.`,
          },
        ],
        structuredContent: {
          imported,
          applications: result.applications,
        },
      };
    },
  );

  server.registerTool(
    "list_jobs",
    {
      title: "List job applications",
      description:
        "Lists the student's saved job applications, newest first, so you can find the one they mean and read its id. Records are short: use get_job for the full posting and notes. Filter by status, employer, work term, or archive state, then choose the application yourself rather than asking the student for an id.",
      inputSchema: listJobsInputSchema,
      outputSchema: listJobsOutputSchema,
    },
    async (args, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);

      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);

      const repository = repositoryFor({ token: authInfo.token, userId });
      const result = await runListJobs(args, {
        listApplications: (filters) => repository.listApplications(filters),
      });

      if (result.outcome === "error") {
        return toolError(
          `Those applications could not be read. Database error ${result.code ?? "unknown"}.`,
        );
      }

      const structured = {
        applications: result.applications,
        returned: result.applications.length,
        has_more: result.hasMore,
      };
      const text = result.applications.length
        ? result.applications.map(summaryLine).join("\n")
        : "No applications match.";

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: structured,
      };
    },
  );

  server.registerTool(
    "get_job",
    {
      title: "Get job application",
      description:
        "Reads one saved application in full, including the stored job description, notes, next action, dates, and links. Requires the application's id, which list_jobs returns.",
      inputSchema: getJobInputSchema,
      outputSchema: jobDetailSchema,
    },
    async (args, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);

      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);

      // The read is bound to the token's user here, so the tool body has no
      // way to name a different owner. Row-level security checks again.
      const repository = repositoryFor({ token: authInfo.token, userId });
      const result = await runGetJob(args, {
        readApplication: (applicationId) =>
          repository.getApplication(applicationId),
      });

      if (result.outcome === "not_found") return toolError(NOT_IN_TRACKER);
      if (result.outcome === "error") {
        return toolError(
          `That application could not be read. Database error ${result.code ?? "unknown"}.`,
        );
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `${result.job.job_title} at ${result.job.company}, status ${result.job.status}.`,
          },
        ],
        structuredContent: result.job,
      };
    },
  );

  server.registerTool(
    "update_job",
    {
      title: "Update job application",
      description:
        "Updates an existing job application in the student's tracker. Send only the fields that changed, such as moving the status to Applied or Interview, recording a date, or setting the next action. Fields you omit keep their current value. One exception is worth taking on your own: if the application has no company_domain stored and you can identify the employer's website, fill it in alongside whatever else you are updating. Requires the application's id.",
      inputSchema: updateJobInputSchema,
      outputSchema: updateJobOutputSchema,
    },
    async (args, ctx) => {
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);

      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);

      // Both calls are bound to the token's user here, so the tool body has
      // no way to name a different owner. Row-level security checks again.
      const repository = repositoryFor({ token: authInfo.token, userId });
      const result = await runUpdateJob(args, {
        readApplication: (applicationId) =>
          repository.getApplication(applicationId),
        writeApplication: (applicationId, input) =>
          repository.updateApplication(applicationId, input),
      });

      if (result.outcome === "not_found") return toolError(NOT_IN_TRACKER);
      if (result.outcome === "invalid") {
        return toolError(`That update could not be applied. ${result.message}`);
      }
      if (result.outcome === "conflict") {
        return toolError(
          "That application was changed elsewhere while updating. Read it again and retry.",
        );
      }
      if (result.outcome === "error") {
        return toolError(
          `That application could not be updated. Database error ${result.code ?? "unknown"}.`,
        );
      }

      const structured = {
        application_id: result.applicationId,
        changed_fields: result.changed,
        status_history_recorded: result.statusChanged,
      };
      const summary = result.changed.length
        ? result.changed
            .map((change) => `${change.field} → ${change.to ?? "cleared"}`)
            .join(", ")
        : "no fields changed";

      return {
        content: [{ type: "text" as const, text: `Updated: ${summary}.` }],
        structuredContent: structured,
      };
    },
  );
}
