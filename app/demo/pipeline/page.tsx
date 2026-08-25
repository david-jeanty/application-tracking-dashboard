import { PipelineColumns } from "@/components/pipeline/pipeline-board";
import { PipelineFilters } from "@/components/pipeline/pipeline-filters";
import {
  hasActiveFilters,
  parsePipelineFilters,
  type RawSearchParams,
} from "@/lib/applications/search-params";
import { buildPipelineBoard } from "@/lib/pipeline/board";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { demoWorkTermOptions, filterDemoApplications } from "@/lib/demo/filter";
import { DEMO_BASE_PATH, pipelinePath } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";

export const metadata = { title: "Pipeline" };

/**
 * The demo pipeline board.
 *
 * `buildPipelineBoard` groups the fixtures exactly as it groups a real read, so
 * all ten status columns appear in the same order with the same honest zeros.
 * The cards are the production cards in read-only mode: same role, employer,
 * placement and context date, and no Move control at all.
 *
 * Three filters, like the real board — status is what the columns *are*, so
 * `parsePipelineFilters` does not produce one and this page cannot either.
 */
export default async function DemoPipelinePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parsePipelineFilters(await searchParams);
  const demo = buildDemoDataset(demoToday());
  // Active only, as the real board reads. An archived application is not
  // sitting at a status waiting to be moved, so it has no column here.
  const board = buildPipelineBoard(
    filterDemoApplications(demo.activeApplications, filters),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Pipeline
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          Every sample application, under the status it is at. In your own
          workspace you can move one to another status without leaving the
          board.
        </p>
      </div>

      <PipelineFilters
        action={pipelinePath(DEMO_BASE_PATH)}
        filters={filters}
        workTermOptions={demoWorkTermOptions(demo.activeApplications)}
      />

      {board.total ? (
        <PipelineColumns
          basePath={DEMO_BASE_PATH}
          board={board}
          filters={filters}
          readOnly
        />
      ) : (
        <div className="border-t border-border py-16 text-center">
          <h2 className="text-[16px] text-foreground">
            {hasActiveFilters(filters)
              ? "No applications match these filters"
              : "Nothing in the pipeline"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
            Try changing or clearing your search.
          </p>
        </div>
      )}
    </div>
  );
}
