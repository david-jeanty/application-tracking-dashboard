import type { Metadata } from "next";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ApplicationDetail,
  ApplicationIdentity,
  ApplicationOriginalPosting,
  ApplicationRecordMeta,
} from "@/components/applications/application-detail";
import { ApplicationStatusDot } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { QuickUpdate } from "@/components/applications/quick-update";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  archiveApplicationAction,
  restoreApplicationAction,
} from "@/lib/applications/actions";
import { buildLifecycle } from "@/lib/applications/lifecycle";
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
    "flex gap-2 border border-success/30 bg-success-soft p-4 text-sm text-success",
  error:
    "flex gap-2 border border-danger/30 bg-danger-soft p-4 text-sm text-danger",
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

  return (
    <div className="w-full">
      <Link
        className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href="/applications"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        Back to applications
      </Link>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <ApplicationIdentity application={application} />

        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {/*
              The posting first: it is the one action a student takes while
              reading the record rather than while changing it.
            */}
            <ApplicationOriginalPosting application={application} />

            <ButtonLink
              href={`/applications/${application.id}/edit`}
              variant="secondary"
            >
              Edit
            </ButtonLink>

            {/*
              Only the action that applies is offered. An archived application
              gets Restore and never Archive again, so the two states cannot be
              confused. Archiving is reversible and keeps the record, so it
              needs no destructive confirmation step.
            */}
            <form
              action={
                application.archived_at
                  ? restoreApplicationAction
                  : archiveApplicationAction
              }
            >
              <input name="applicationId" type="hidden" value={application.id} />
              <Button type="submit" variant="secondary">
                {application.archived_at ? "Restore" : "Archive"}
              </Button>
            </form>
          </div>
          <ApplicationStatusDot status={application.current_status} />
        </div>
      </div>

      {/* Part of the page rather than a boxed widget on top of it. */}
      {lifecycle ? (
        <div className="mt-10 border-b border-border pb-6">
          <LifecycleRail lifecycle={lifecycle} size="detail" />
        </div>
      ) : null}

      <div className="mt-5 space-y-4">
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

      {/*
        An asymmetric workspace: what the application *is* on the left, what to
        do with it on the right, divided by a rule rather than by two cards.
        It stacks below `xl`, where two columns would leave the controls
        cramped rather than convenient.
      */}
      <div className="mt-2 grid gap-10 xl:grid-cols-[minmax(0,63fr)_minmax(0,37fr)] xl:gap-12">
        <ApplicationDetail application={application} />
        {/*
          Stacked, the working area comes first: there is no reason to scroll
          past the whole record to change a status on a phone. Side by side it
          returns to the right, where the eye expects the controls.
        */}
        <div className="order-first xl:order-none xl:border-l xl:border-border xl:pl-12">
          {/* Renders nothing for an archived application; the rule lives inside. */}
          <QuickUpdate application={application} />
          <ApplicationRecordMeta application={application} />
        </div>
      </div>

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
            className="text-[13px] text-danger underline decoration-danger/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
            href={`/applications/${application.id}/delete`}
          >
            Delete permanently
          </Link>
        </div>
      ) : null}
    </div>
  );
}
