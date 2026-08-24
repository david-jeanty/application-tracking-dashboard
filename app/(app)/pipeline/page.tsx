import type { Metadata } from "next";
import { Suspense } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import {
  PipelineBoard,
  PipelineBoardLoading,
} from "@/components/pipeline/pipeline-board";
import { PipelineFilters } from "@/components/pipeline/pipeline-filters";
import { listActiveWorkTermSeasons } from "@/lib/applications/repository";
import {
  MOVE_PARAM,
  parsePipelineFilters,
  type RawSearchParams,
} from "@/lib/applications/search-params";
import { toPipelineMoveNotice } from "@/lib/pipeline/move-notice";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const rawSearchParams = await searchParams;
  // Unrecognized parameters are dropped rather than rejected, so an edited URL
  // falls back to the ordinary board instead of an error.
  const filters = parsePipelineFilters(rawSearchParams);
  const moveNotice = toPipelineMoveNotice(rawSearchParams[MOVE_PARAM]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // The work-term options are the student's own; another user's terms are
  // never reachable, because the read is owner-scoped like every other.
  const { data: workTermOptions } = await listActiveWorkTermSeasons(
    supabase,
    user.id,
  );

  // Keying the boundary on the applied filters means each new search shows the
  // loading state rather than the previous board while the query runs.
  const boardKey = JSON.stringify(filters);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Pipeline
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          Every application you have not archived, under the status it is at.
          Move one to another status without leaving the board.
        </p>
      </div>

      {moveNotice ? (
        <div
          className={
            moveNotice.tone === "success"
              ? "flex gap-2 border border-success/30 bg-success-soft p-4 text-sm text-success"
              : "flex gap-2 border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
          }
          role="status"
        >
          {moveNotice.tone === "success" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          {moveNotice.message}
        </div>
      ) : null}

      <PipelineFilters
        filters={filters}
        workTermOptions={workTermOptions ?? []}
      />

      <Suspense fallback={<PipelineBoardLoading />} key={boardKey}>
        <PipelineBoard filters={filters} />
      </Suspense>
    </div>
  );
}
