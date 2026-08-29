import {
  ApplicationRecords,
  ApplicationsEmptyState,
} from "@/components/applications/application-list";
import { ApplicationFilters } from "@/components/applications/application-filters";
import {
  parseApplicationFilters,
  hasActiveFilters,
  type RawSearchParams,
} from "@/lib/applications/search-params";
import { buildDemoDataset } from "@/lib/demo/dataset";
import { demoWorkTermOptions, filterDemoApplications } from "@/lib/demo/filter";
import { applicationsPath, DEMO_BASE_PATH } from "@/lib/demo/paths";
import { demoToday } from "@/lib/demo/today";

export const metadata = { title: "Applications" };

/**
 * The demo applications list.
 *
 * The same `parseApplicationFilters` the real page uses, so the URL contract is
 * identical — `?q=`, `?status=`, `?work_term=`, `?category=` mean here exactly
 * what they mean signed in, and an unrecognised value is dropped rather than
 * rejected on both. The narrowing itself happens in memory because there is no
 * database, through a helper written against the same semantics.
 *
 * No Add application control. The demo is read-only, and a button that
 * explained why it could not be pressed would be worse than its absence.
 */
export default async function DemoApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = parseApplicationFilters(await searchParams);
  const demo = buildDemoDataset(demoToday());
  // The active population, as `listActiveApplications` returns in production:
  // this page is a worklist, and an application the student filed away is not
  // on it. The archived records are still in the dataset, and still in the
  // dashboard's totals and the analytics — they are simply not here.
  const applications = filterDemoApplications(demo.activeApplications, filters);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[34px] font-medium leading-tight tracking-tight text-foreground sm:text-[38px]">
          Applications
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-foreground-secondary">
          Track every application, from the first save to the final outcome.
          Search and filter this sample search the way you would your own.
        </p>
      </div>

      <ApplicationFilters
        action={applicationsPath(DEMO_BASE_PATH)}
        filters={filters}
        workTermOptions={demoWorkTermOptions(demo.activeApplications)}
      />

      {applications.length ? (
        <ApplicationRecords
          applications={applications}
          basePath={DEMO_BASE_PATH}
          history={demo.statusEvents}
        />
      ) : (
        <ApplicationsEmptyState
          clearHref={applicationsPath(DEMO_BASE_PATH)}
          filtered={hasActiveFilters(filters)}
        />
      )}
    </div>
  );
}
