import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ApplicationDetail,
  ApplicationIdentity,
  ApplicationOriginalPosting,
  ApplicationRecordMeta,
} from "@/components/applications/application-detail";
import { ApplicationStatusDot } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { buildLifecycle } from "@/lib/applications/lifecycle";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { applicationsPath, DEMO_BASE_PATH } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";

export const metadata: Metadata = { title: "Application details" };

/**
 * One sample application, in full.
 *
 * The record is looked up by its own id rather than by parsing a UUID. Demo ids
 * are readable slugs — `rbc-commercial-banking-w27` — because they are part of
 * a URL a visitor may well look at, and because a fixture that had to satisfy
 * `applicationIdSchema` would be 56 hand-written UUIDs nobody could match to a
 * record. An id that is not in the dataset is simply not found, which is the
 * same answer the real page gives for a record that is not yours.
 *
 * Everything below the identity is the production record: `ApplicationDetail`,
 * `ApplicationRecordMeta`, the lifecycle rail and the native disclosures for
 * notes and the job description. What is missing is every control that would
 * write — Edit, Archive, Restore, Delete and the quick-update panel — and they
 * are missing rather than disabled.
 */
export default async function DemoApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demo = buildDemoDataset(demoToday());
  const application = demo.records.get(id);

  if (!application) notFound();

  const lifecycle = buildLifecycle(
    application.current_status,
    demo.statusEvents
      .filter((event) => event.application_id === application.id)
      .map((event) => event.new_status),
  );

  return (
    <div className="w-full">
      <Link
        className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        href={applicationsPath(DEMO_BASE_PATH)}
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        Back to applications
      </Link>

      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <ApplicationIdentity application={application} />
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          {/* Reading the posting is not a write, so the demo offers it too. */}
          <ApplicationOriginalPosting application={application} />
          <ApplicationStatusDot status={application.current_status} />
        </div>
      </div>

      {/* Part of the page rather than a boxed widget on top of it. */}
      <div className="mt-10 border-b border-border pb-6">
        <LifecycleRail lifecycle={lifecycle} size="detail" />
      </div>

      {/*
        One column rather than the signed-in page's two. The right-hand column
        there is the working area — quick status updates, the next action — and
        with nothing to work, a second column would be an empty gutter beside
        the record.
      */}
      <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,63fr)_minmax(0,37fr)] xl:gap-12">
        <ApplicationDetail application={application} />
        <div className="xl:border-l xl:border-border xl:pl-12">
          <ApplicationRecordMeta application={application} />
        </div>
      </div>
    </div>
  );
}
