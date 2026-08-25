import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationEditForm } from "@/components/applications/application-edit-form";
import { toApplicationFormValues } from "@/lib/applications/mapper";
import { getApplicationById } from "@/lib/applications/repository";
import { createClient } from "@/lib/supabase/server";
import { applicationIdSchema } from "@/lib/validation/application";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  return (
    <div className="w-full">
      {/* The same quiet way back the detail page uses. */}
      <Link
        className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href={`/applications/${application.id}`}
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        Application details
      </Link>

      {/*
        The page title, then the record it is about. The accent eyebrow reading
        "Application" is gone: a student who arrived here by pressing Edit on
        one application already knows what they are editing, and the line below
        says which one. The employer leads it, as it does on the detail page
        this was reached from.
      */}
      <div className="mt-6">
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Edit application
        </h1>
        <p className="mt-2 break-words text-[17px] leading-snug text-foreground-secondary">
          {application.company_name} — {application.original_job_title}
        </p>
        {/*
          Supporting copy, at the size supporting copy is. What it describes
          almost never happens, and when it does the form says so itself.
        */}
        <p className="mt-3 max-w-2xl text-[13px] leading-6 text-foreground-muted">
          If this record changed after the page loaded, you will be asked to
          review the latest version before saving.
        </p>
      </div>

      <ApplicationEditForm
        applicationId={application.id}
        defaultValues={toApplicationFormValues(application)}
        expectedUpdatedAt={application.updated_at}
      />
    </div>
  );
}
