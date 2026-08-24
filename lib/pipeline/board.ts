import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import type { ApplicationListItem } from "@/lib/applications/types";

/** One status, and the active applications currently sitting at it. */
export type PipelineColumn = {
  status: ApplicationStatus;
  applications: ApplicationListItem[];
  count: number;
};

export type PipelineBoard = {
  columns: PipelineColumn[];
  /** How many applications the board is showing, across every column. */
  total: number;
};

/**
 * The board's columns are the ten exact statuses, in the order they are
 * declared, and nothing else.
 *
 * Not the five lifecycle stages. The rail is a coarse *summary* drawn over the
 * exact statuses, and summarising is the wrong job here: the board is where a
 * student moves an application from Screening to Assessment, which a
 * five-column board could not express at all. The rail keeps its place on the
 * list and the detail page, where progress is being read rather than changed.
 *
 * Terminal statuses get columns like every other. An application that was
 * rejected but not archived is still one of the student's records, and a board
 * that quietly dropped it would disagree with its own count.
 */
export const PIPELINE_COLUMN_STATUSES = APPLICATION_STATUSES;

/**
 * Groups the active applications into one column per status.
 *
 * Every column is returned even when empty. A board with holes punched in it
 * is harder to read than one with honest zeros, and an empty column is still
 * somewhere a student can move an application to.
 *
 * Order inside a column is whatever order the read returned — newest first,
 * as the repository orders every list. Nothing here re-sorts by urgency or
 * deadline: the column says where the application stands, and inventing a
 * second ranking on top of that would make the same application appear in a
 * different place on the board than it does in the list.
 *
 * `total` counts the applications handed in rather than the columns' entries,
 * so the figure the page prints is the number of records read, not a number
 * the grouping produced.
 */
export function buildPipelineBoard(
  applications: readonly ApplicationListItem[],
): PipelineBoard {
  const grouped = new Map<ApplicationStatus, ApplicationListItem[]>();

  for (const application of applications) {
    const column = grouped.get(application.current_status);
    if (column) column.push(application);
    else grouped.set(application.current_status, [application]);
  }

  return {
    columns: PIPELINE_COLUMN_STATUSES.map((status) => {
      const items = grouped.get(status) ?? [];
      return { status, applications: items, count: items.length };
    }),
    total: applications.length,
  };
}
