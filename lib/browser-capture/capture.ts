import "server-only";

import {
  externalJobRecordSchema,
  toApplicationCreationValues,
} from "@/lib/applications/external-record";
import type { ApplicationUrlMatch } from "@/lib/applications/repository";
import {
  applicationCreationSchema,
  type ApplicationCreationInput,
} from "@/lib/validation/application";

type RepositoryError = { code?: string } | null;

export type BrowserCaptureRepository = {
  findApplicationByExactUrl: (
    authenticatedUserId: string,
    applicationUrl: string,
  ) => Promise<{
    data: ApplicationUrlMatch | null;
    error: RepositoryError;
  }>;
  createApplication: (input: ApplicationCreationInput) => Promise<{
    data: { id: string } | null;
    error: RepositoryError;
  }>;
};

export type BrowserCaptureResult =
  | {
      outcome: "created";
      application: {
        id: string;
        company: string;
        job_title: string;
        status: ApplicationCreationInput["currentStatus"];
        href: string;
      };
    }
  | {
      outcome: "already_tracked";
      application: {
        id: string;
        company: string;
        job_title: string;
        job_url: string;
        href: string;
      };
    }
  | {
      outcome: "invalid";
      issues: { path: string; message: string }[];
    }
  | { outcome: "error" };

function invalidIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
) {
  return issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

/**
 * Validates and stores one explicitly submitted browser-capture record.
 *
 * The first parse is the same external record contract MCP advertises. Zod
 * removes unknown properties such as `user_id`, so no ownership value crosses
 * this boundary. The mapped value then passes through the one final
 * `applicationCreationSchema`, and the successful path calls the same
 * `createApplication` repository write as the web form and MCP.
 */
export async function runBrowserCapture(
  payload: unknown,
  authenticatedUserId: string,
  repository: BrowserCaptureRepository,
): Promise<BrowserCaptureResult> {
  const externalRecord = externalJobRecordSchema.safeParse(payload);
  if (!externalRecord.success) {
    return {
      outcome: "invalid",
      issues: invalidIssues(externalRecord.error.issues),
    };
  }

  const application = applicationCreationSchema.safeParse(
    toApplicationCreationValues(externalRecord.data),
  );
  if (!application.success) {
    return {
      outcome: "invalid",
      issues: invalidIssues(application.error.issues),
    };
  }

  if (application.data.applicationUrl) {
    const existing = await repository.findApplicationByExactUrl(
      authenticatedUserId,
      application.data.applicationUrl,
    );
    if (existing.error) return { outcome: "error" };

    if (existing.data) {
      return {
        outcome: "already_tracked",
        application: {
          id: existing.data.id,
          company: existing.data.company_name,
          job_title: existing.data.original_job_title,
          job_url: existing.data.application_url,
          href: `/applications/${existing.data.id}`,
        },
      };
    }
  }

  const created = await repository.createApplication(application.data);
  if (created.error || !created.data) return { outcome: "error" };

  return {
    outcome: "created",
    application: {
      id: created.data.id,
      company: application.data.companyName,
      job_title: application.data.originalJobTitle,
      status: application.data.currentStatus,
      href: `/applications/${created.data.id}`,
    },
  };
}
