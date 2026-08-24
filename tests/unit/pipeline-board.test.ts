import { describe, expect, it } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import {
  MOVE_PARAM,
  parseApplicationFilters,
  parsePipelineFilters,
  toPipelineUrl,
} from "@/lib/applications/search-params";
import type { ApplicationListItem } from "@/lib/applications/types";
import {
  buildPipelineBoard,
  PIPELINE_COLUMN_STATUSES,
} from "@/lib/pipeline/board";

let sequence = 0;

function application(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  sequence += 1;

  return {
    id: `1111111${sequence}-1111-4111-8111-111111111111`,
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-22",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

const columnFor = (board: ReturnType<typeof buildPipelineBoard>, status: string) =>
  board.columns.find((column) => column.status === status);

describe("the board's columns are the exact statuses", () => {
  it("is one column per status, in the declared order", () => {
    const board = buildPipelineBoard([]);

    expect(board.columns.map((column) => column.status)).toEqual([
      ...APPLICATION_STATUSES,
    ]);
    expect(PIPELINE_COLUMN_STATUSES).toEqual(APPLICATION_STATUSES);
  });

  it("returns every column even when nothing is at it", () => {
    const board = buildPipelineBoard([application({ current_status: "Offer" })]);

    // An empty column is somewhere to move an application to, so it is
    // returned as an honest zero rather than dropped.
    expect(board.columns).toHaveLength(APPLICATION_STATUSES.length);
    expect(columnFor(board, "Interested")?.count).toBe(0);
    expect(columnFor(board, "Interested")?.applications).toEqual([]);
  });

  it("keeps a terminal status as a column of its own", () => {
    // A rejected application that was never archived is still one of the
    // student's records. A board that dropped it would disagree with its count.
    const board = buildPipelineBoard([
      application({ current_status: "Rejected" }),
      application({ current_status: "Withdrawn" }),
      application({ current_status: "Accepted" }),
    ]);

    expect(columnFor(board, "Rejected")?.count).toBe(1);
    expect(columnFor(board, "Withdrawn")?.count).toBe(1);
    expect(columnFor(board, "Accepted")?.count).toBe(1);
    expect(board.total).toBe(3);
  });
});

describe("every application lands in exactly one column", () => {
  const applications = [
    application({ current_status: "Interested" }),
    application({ current_status: "Interested" }),
    application({ current_status: "Preparing" }),
    application({ current_status: "Applied" }),
    application({ current_status: "Applied" }),
    application({ current_status: "Interview" }),
  ];
  const board = buildPipelineBoard(applications);

  it("counts each one once", () => {
    const placed = board.columns.flatMap((column) => column.applications);

    expect(placed).toHaveLength(applications.length);
    expect(new Set(placed.map((item) => item.id)).size).toBe(
      applications.length,
    );
  });

  it("reports a total that matches what was read", () => {
    const summed = board.columns.reduce((total, column) => total + column.count, 0);

    expect(board.total).toBe(applications.length);
    expect(summed).toBe(board.total);
  });

  it("puts each application under its own status", () => {
    expect(columnFor(board, "Interested")?.count).toBe(2);
    expect(columnFor(board, "Preparing")?.count).toBe(1);
    expect(columnFor(board, "Applied")?.count).toBe(2);
    expect(columnFor(board, "Interview")?.count).toBe(1);
    expect(columnFor(board, "Screening")?.count).toBe(0);
  });

  it("preserves the order the read returned", () => {
    const first = application({ current_status: "Applied", company_name: "Shopify" });
    const second = application({ current_status: "Applied", company_name: "RBC" });

    // Newest first, as the repository orders every list. Nothing on the board
    // re-ranks a column by urgency or deadline.
    const ordered = buildPipelineBoard([first, second]);

    expect(
      columnFor(ordered, "Applied")?.applications.map((item) => item.company_name),
    ).toEqual(["Shopify", "RBC"]);
  });
});

describe("the board reads fewer filters than the list", () => {
  it("keeps the search and the work term", () => {
    expect(
      parsePipelineFilters({ q: "analyst", work_term: "Winter 2027" }),
    ).toEqual({ search: "analyst", workTermSeason: "Winter 2027" });
  });

  it("ignores a status, because the columns are the statuses", () => {
    const raw = { status: "Interview", q: "analyst" };

    // The same parameter the list honours is dropped here, so a bookmarked
    // list URL opened on the board shows the whole board rather than one
    // column pretending to be it.
    expect(parseApplicationFilters(raw).status).toBe("Interview");
    expect(parsePipelineFilters(raw)).toEqual({ search: "analyst" });
  });

  it("ignores a category", () => {
    expect(parsePipelineFilters({ category: "Marketing" })).toEqual({});
  });

  it("cannot describe an archived record", () => {
    // `ActiveApplicationFilters` has no archive field at all, so this is a
    // property of the type rather than of what the parser happens to read.
    expect(parsePipelineFilters({ archived: "1", archiveState: "all" })).toEqual(
      {},
    );
  });
});

describe("the board's own URL is rebuilt, never echoed", () => {
  it("is the bare path when nothing is filtered", () => {
    expect(toPipelineUrl({})).toBe("/pipeline");
  });

  it("carries the filters a student was looking at", () => {
    expect(toPipelineUrl({ search: "analyst", workTermSeason: "Winter 2027" })).toBe(
      "/pipeline?q=analyst&work_term=Winter+2027",
    );
  });

  it("re-encodes a value that tries to become a second parameter", () => {
    const url = toPipelineUrl({ search: "a&move=moved" }, "error");

    // The injected `move` survives only as text inside `q`, so the notice the
    // page reads is the one the action decided on.
    expect(url).toBe("/pipeline?q=a%26move%3Dmoved&move=error");
    expect(new URL(url, "https://jobtrack.test").searchParams.get(MOVE_PARAM)).toBe(
      "error",
    );
  });

  it("always names an internal path", () => {
    for (const url of [
      toPipelineUrl({}),
      toPipelineUrl({ search: "//evil.example" }, "moved"),
    ]) {
      expect(url.startsWith("/pipeline")).toBe(true);
    }
  });
});
