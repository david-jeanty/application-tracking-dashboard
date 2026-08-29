import { describe, expect, it } from "vitest";
import { APPLICATION_STATUS_SUMMARIES } from "@/lib/applications/constants";
import {
  CATEGORY_PARAM,
  describeActiveFilters,
  hasActiveFilters,
  parseApplicationFilters,
  SEARCH_PARAM,
  STATUS_PARAM,
  toApplicationStatusSummaryUrl,
  WORK_TERM_PARAM,
} from "@/lib/applications/search-params";

describe("reading filters from the URL", () => {
  it("returns nothing to filter by for a bare page visit", () => {
    expect(parseApplicationFilters({})).toEqual({});
    expect(hasActiveFilters(parseApplicationFilters({}))).toBe(false);
  });

  it("reads a search term", () => {
    expect(parseApplicationFilters({ [SEARCH_PARAM]: "rbc" })).toEqual({
      search: "rbc",
    });
  });

  it("reads every filter together", () => {
    const filters = parseApplicationFilters({
      [SEARCH_PARAM]: "analyst",
      [STATUS_PARAM]: "Applied",
      [WORK_TERM_PARAM]: "Winter 2027",
      [CATEGORY_PARAM]: "Business Analysis",
    });

    expect(filters).toEqual({
      search: "analyst",
      status: "Applied",
      workTermSeason: "Winter 2027",
      category: "Business Analysis",
    });
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseApplicationFilters({ [SEARCH_PARAM]: "  rbc  " }).search,
    ).toBe("rbc");
  });

  it("treats a blank or whitespace-only value as no filter", () => {
    expect(parseApplicationFilters({ [SEARCH_PARAM]: "" })).toEqual({});
    expect(parseApplicationFilters({ [SEARCH_PARAM]: "   " })).toEqual({});
  });

  it("accepts a controlled value however it was capitalized", () => {
    expect(parseApplicationFilters({ [STATUS_PARAM]: "applied" }).status).toBe(
      "Applied",
    );
    expect(
      parseApplicationFilters({ [CATEGORY_PARAM]: "finance" }).category,
    ).toBe("Finance");
  });

  it("reads an explicit broad summary without confusing it with an exact status", () => {
    expect(
      parseApplicationFilters({ [STATUS_PARAM]: "summary:applied" }),
    ).toEqual({ statusSummary: "applied" });
    expect(parseApplicationFilters({ [STATUS_PARAM]: "Applied" })).toEqual({
      status: "Applied",
    });
  });
});

describe("invalid query parameters are ignored, not rejected", () => {
  it("drops a status outside the known vocabulary", () => {
    expect(parseApplicationFilters({ [STATUS_PARAM]: "ghosted" })).toEqual({});
  });

  it("drops a category outside the known vocabulary", () => {
    expect(parseApplicationFilters({ [CATEGORY_PARAM]: "Wizardry" })).toEqual(
      {},
    );
  });

  it("keeps the valid filters when another one is nonsense", () => {
    const filters = parseApplicationFilters({
      [SEARCH_PARAM]: "rbc",
      [STATUS_PARAM]: "not-a-status",
    });

    expect(filters).toEqual({ search: "rbc" });
  });

  it("drops an absurdly long value rather than searching for it", () => {
    expect(
      parseApplicationFilters({ [SEARCH_PARAM]: "a".repeat(5000) }),
    ).toEqual({});
    expect(
      parseApplicationFilters({ [WORK_TERM_PARAM]: "b".repeat(5000) }),
    ).toEqual({});
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(
      parseApplicationFilters({ [STATUS_PARAM]: ["Applied", "Offer"] }).status,
    ).toBe("Applied");
  });

  it("ignores a parameter that arrived with no usable value", () => {
    expect(parseApplicationFilters({ [SEARCH_PARAM]: undefined })).toEqual({});
    expect(parseApplicationFilters({ [STATUS_PARAM]: [] })).toEqual({});
  });

  it("cannot be talked into showing archived applications", () => {
    // Archive state is not a parameter this page reads, so any attempt to
    // supply one is simply not part of the resulting filters.
    const filters = parseApplicationFilters({
      archive_state: "all",
      archived: "true",
      archiveState: "archived",
    });

    expect(filters).toEqual({});
    expect(filters).not.toHaveProperty("archiveState");
  });

  it("cannot be talked into filtering by another owner", () => {
    const filters = parseApplicationFilters({
      user_id: "11111111-1111-4111-8111-111111111111",
      [SEARCH_PARAM]: "rbc",
    });

    expect(filters).toEqual({ search: "rbc" });
    expect(filters).not.toHaveProperty("user_id");
  });

  it("does not accept a limit from the URL", () => {
    expect(parseApplicationFilters({ limit: "9999" })).toEqual({});
  });
});

describe("describing the applied filters", () => {
  it("says nothing when the list is unfiltered", () => {
    expect(describeActiveFilters({})).toEqual([]);
  });

  it("describes each filter in the order the controls appear", () => {
    expect(
      describeActiveFilters({
        search: "rbc",
        status: "Applied",
        workTermSeason: "Winter 2027",
        category: "Finance",
      }),
    ).toEqual([
      'matching "rbc"',
      "with status Applied",
      "for Winter 2027",
      "in Finance",
    ]);
  });
});

describe("building status-summary URLs", () => {
  const preserved = {
    search: "data analyst",
    status: "Interview" as const,
    workTermSeason: "Winter 2027",
    category: "Finance" as const,
  };

  it.each([
    ["saved", "summary:saved"],
    ["applied", "summary:applied"],
    ["interview", "summary:interview"],
    ["offer", "summary:offer"],
  ] as const)("applies the %s summary and preserves the other filters", (key, value) => {
    const summary = APPLICATION_STATUS_SUMMARIES.find(
      (candidate) => candidate.key === key,
    );
    const url = new URL(
      toApplicationStatusSummaryUrl("/demo/applications", preserved, summary),
      "https://example.test",
    );

    expect(url.searchParams.get(STATUS_PARAM)).toBe(value);
    expect(url.searchParams.get(SEARCH_PARAM)).toBe("data analyst");
    expect(url.searchParams.get(WORK_TERM_PARAM)).toBe("Winter 2027");
    expect(url.searchParams.get(CATEGORY_PARAM)).toBe("Finance");
  });

  it("clears only status when All is selected", () => {
    const url = new URL(
      toApplicationStatusSummaryUrl("/applications", preserved),
      "https://example.test",
    );

    expect(url.searchParams.has(STATUS_PARAM)).toBe(false);
    expect(url.searchParams.get(SEARCH_PARAM)).toBe("data analyst");
    expect(url.searchParams.get(WORK_TERM_PARAM)).toBe("Winter 2027");
    expect(url.searchParams.get(CATEGORY_PARAM)).toBe("Finance");
  });
});
