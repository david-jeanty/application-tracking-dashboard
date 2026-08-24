import type { Metadata } from "next";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { QuickUpdate } from "@/components/applications/quick-update";
import { CompanyLogo } from "@/components/branding/company-logo";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  archiveApplicationAction,
  restoreApplicationAction,
} from "@/lib/applications/actions";
import { toQuickUpdateNotice } from "@/lib/applications/quick-update-notice";
import { getApplicationById } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Application details" };

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

  const { data: application, error } = await getApplicationById(
    supabase,
    user.id,
    parsedId.data,
  );
  if (error) throw new Error(`Application query failed (${error.code}).`);
  if (!application) notFound();

  const { quick, updated } = await searchParams;
  const quickNotice = toQuickUpdateNotice(quick);

  return (
    <div className="space-y-6">
      <ButtonLink
        className="w-fit px-3"
        href="/applications"
        variant="ghost"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All applications
      </ButtonLink>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-accent">Application</p>
          {/*
            The mark sits beside the employer's name, at the one place on this
            page that identifies the company. It is decorative: the name it
            accompanies is the heading itself.
          */}
          <div className="mt-1 flex items-center gap-3">
            <CompanyLogo
              companyName={application.company_name}
              domain={application.company_domain}
              size="md"
            />
            <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {application.company_name}
            </h1>
          </div>
          <p className="mt-2 break-words text-sm leading-6 text-foreground-secondary">
            {application.original_job_title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink href={`/applications/${application.id}/edit`}>
            <Pencil aria-hidden="true" className="size-4" />
            Edit application
          </ButtonLink>

          {/*
            Only the action that applies is offered. An archived application
            gets Restore and never Archive again, so the two states cannot be
            confused for one another. Archiving is reversible and keeps the
            record, so it needs no destructive confirmation step.
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
              {application.archived_at ? (
                <>
                  <RotateCcw aria-hidden="true" className="size-4" />
                  Restore application
                </>
              ) : (
                <>
                  <Archive aria-hidden="true" className="size-4" />
                  Archive application
                </>
              )}
            </Button>
          </form>

          {/*
            Permanent deletion belongs to the archive workflow, so it appears
            only once an application is archived. It is a link into a
            confirmation page rather than a button, which keeps the
            irreversible path a deliberate step away.
          */}
          {application.archived_at ? (
            <Link
              className="rounded-sm text-sm font-semibold text-danger underline decoration-danger/40 underline-offset-4 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
              href={`/applications/${application.id}/delete`}
            >
              Delete permanently
            </Link>
          ) : null}
        </div>
      </div>

      {updated === "1" ? (
        <div
          className="flex gap-2 rounded-record border border-success/30 bg-success-soft p-4 text-sm text-success"
          role="status"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          Application updated successfully.
        </div>
      ) : null}

      {quickNotice ? (
        <div
          className={
            quickNotice.tone === "success"
              ? "flex gap-2 rounded-record border border-success/30 bg-success-soft p-4 text-sm text-success"
              : "flex gap-2 rounded-record border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
          }
          role="status"
        >
          {quickNotice.tone === "success" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {quickNotice.message}
        </div>
      ) : null}

      {/* Renders nothing for an archived application; the rule lives inside. */}
      <QuickUpdate application={application} />

      <ApplicationDetail application={application} />
    </div>
  );
}
