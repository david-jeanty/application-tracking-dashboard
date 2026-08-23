import type { Metadata } from "next";
import { Archive, ArrowLeft, CheckCircle2, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationDetail } from "@/components/applications/application-detail";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  archiveApplicationAction,
  restoreApplicationAction,
} from "@/lib/applications/actions";
import { getApplicationById } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Application details" };

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string }>;
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

  const { updated } = await searchParams;

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
          <p className="text-sm font-semibold text-blue-700">Application</p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            {application.company_name}
          </h1>
          <p className="mt-2 break-words text-sm leading-6 text-slate-600">
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
              className="rounded-sm text-sm font-semibold text-red-700 underline decoration-red-200 underline-offset-4 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              href={`/applications/${application.id}/delete`}
            >
              Delete permanently
            </Link>
          ) : null}
        </div>
      </div>

      {updated === "1" ? (
        <div
          className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          <CheckCircle2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          Application updated successfully.
        </div>
      ) : null}

      <ApplicationDetail application={application} />
    </div>
  );
}
