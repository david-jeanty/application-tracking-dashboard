import type { Metadata } from "next";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { LabelledLifecycleRail } from "@/components/applications/lifecycle-rail";
import { QuickUpdate } from "@/components/applications/quick-update";
import { CompanyLogo } from "@/components/branding/company-logo";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  archiveApplicationAction,
  restoreApplicationAction,
} from "@/lib/applications/actions";
import { buildLifecycle } from "@/lib/applications/lifecycle";
import { displayOptionalText } from "@/lib/applications/mapper";
import { toQuickUpdateNotice } from "@/lib/applications/quick-update-notice";
import {
  getApplicationById,
  listApplicationStatusHistory,
} from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Application details" };

const noticeClassName = {
  success:
    "flex gap-2 rounded-record border border-success/30 bg-success-soft p-4 text-sm text-success",
  error:
    "flex gap-2 rounded-record border border-danger/30 bg-danger-soft p-4 text-sm text-danger",
} as const;

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ quick?: string | string[]; updated?: string }>;
}) {
  const { id } = await params;
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Two owner-scoped reads, in parallel. The history one is narrowed to this
  // application, so drawing the rail costs a single indexed lookup rather than
  // a scan of everything the student has ever recorded.
  const [{ data: application, error }, history] = await Promise.all([
    getApplicationById(supabase, user.id, parsedId.data),
    listApplicationStatusHistory(supabase, user.id, parsedId.data),
  ]);

  if (error) throw new Error(`Application query failed (${error.code}).`);
  if (!application) notFound();

  const { quick, updated } = await searchParams;
  const quickNotice = toQuickUpdateNotice(quick);

  // The rail is a summary of what the status already says precisely, so a
  // failed history read drops it rather than guessing at a journey.
  const lifecycle = history.error
    ? null
    : buildLifecycle(
        application.current_status,
        (history.data ?? []).map((event) => event.new_status),
      );

  const location = displayOptionalText(application.location);
  const context = [location, application.work_term_season]
    .concat(
      application.work_arrangement === "Unknown"
        ? []
        : [application.work_arrangement],
    )
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-4xl">
      <Link
        className="inline-flex items-center gap-1.5 rounded-sm text-[13px] text-foreground-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href="/applications"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        Applications
      </Link>

      {/*
        The record identity is the hero: the employer's mark, the employer, and
        the role. The actions sit beside it rather than competing with it.
      */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo
            companyName={application.company_name}
            domain={application.company_domain}
            size="md"
          />
          {/*
            One heading for the whole record, employer first and role second.
            Two applications at the same company would otherwise share a
            heading, which is exactly the pair a student most needs to tell
            apart. The employer leads visually; the role carries the weight.
          */}
          <div className="min-w-0">
            <h1 className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground-secondary">
                {application.company_name}
              </span>{" "}
              <span className="mt-0.5 block break-words text-[22px] font-semibold leading-tight tracking-tight text-foreground">
                {application.original_job_title}
              </span>
            </h1>
            {context ? (
              <p className="mt-1 text-[13px] text-foreground-muted">{context}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ApplicationStatusLabel status={application.current_status} />
          <ButtonLink
            href={`/applications/${application.id}/edit`}
            variant="secondary"
          >
            Edit
          </ButtonLink>

          {/*
            Only the action that applies is offered. An archived application
            gets Restore and never Archive again, so the two states cannot be
            confused for one another. Archiving is reversible and keeps the
            record, so it needs no destructive confirmation step. Quiet, because
            it is not what a student came to this page to do.
          */}
          <form
            action={
              application.archived_at
                ? restoreApplicationAction
                : archiveApplicationAction
            }
          >
            <input name="applicationId" type="hidden" value={application.id} />
            <Button type="submit" variant="ghost">
              {application.archived_at ? (
                <>
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Restore
                </>
              ) : (
                <>
                  <Archive aria-hidden="true" className="size-4" />
                  Archive
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {lifecycle ? (
        <div className="mt-6 rounded-record border border-border px-5 py-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-muted">
            Lifecycle
          </p>
          <LabelledLifecycleRail className="mt-3" lifecycle={lifecycle} />
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {updated === "1" ? (
          <div className={noticeClassName.success} role="status">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Application updated successfully.
          </div>
        ) : null}

        {quickNotice ? (
          <div className={noticeClassName[quickNotice.tone]} role="status">
            {quickNotice.tone === "success" ? (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            {quickNotice.message}
          </div>
        ) : null}
      </div>

      {/* Renders nothing for an archived application; the rule lives inside. */}
      <QuickUpdate application={application} />

      <ApplicationDetail application={application} />

      {/*
        Permanent deletion belongs to the archive workflow, so it appears only
        once an application is archived. It is a link into a confirmation page
        rather than a button, which keeps the irreversible path a deliberate
        step away — and it sits at the very foot of the record, away from
        everything a student uses day to day.
      */}
      {application.archived_at ? (
        <div className="mt-10 border-t border-border pt-5">
          <Link
            className="rounded-sm text-[13px] font-medium text-danger underline decoration-danger/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            href={`/applications/${application.id}/delete`}
          >
            Delete permanently
          </Link>
        </div>
      ) : null}
    </div>
  );
}
