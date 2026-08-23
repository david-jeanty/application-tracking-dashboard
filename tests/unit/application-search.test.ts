import { describe, expect, it } from "vitest";
import {
  SEARCHABLE_COLUMNS,
  toContainsPattern,
  toSearchFilter,
} from "@/lib/applications/search";

/**
 * Parses a PostgREST `or` expression back into its parts, the way the server
 * does: split on commas that are not inside a double-quoted value.
 */
function splitOrExpression(expression: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];

    if (quoted && character === "\\") {
      current += character + expression[index + 1];
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "," && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }

  parts.push(current);
  return parts;
}

/** Undoes the quoting layer, leaving the pattern Postgres would receive. */
function unquote(value: string): string {
  return value
    .replace(/^"|"$/g, "")
    .replace(/\\(["\\])/g, (_match, character: string) => character);
}

describe("search patterns match text literally", () => {
  it("looks for the term anywhere in the value", () => {
    expect(toContainsPattern("RBC")).toBe("%RBC%");
  });

  it("escapes the wildcards a student's own text may contain", () => {
    expect(toContainsPattern("100%_Inc")).toBe("%100\\%\\_Inc%");
    expect(toContainsPattern("a\\b")).toBe("%a\\\\b%");
  });
});

describe("search filter expression", () => {
  it("covers every searchable column", () => {
    const parts = splitOrExpression(toSearchFilter("RBC"));

    expect(parts).toHaveLength(SEARCHABLE_COLUMNS.length);
    expect(SEARCHABLE_COLUMNS).toEqual([
      "company_name",
      "original_job_title",
      "location",
    ]);
  });

  it("searches each column case-insensitively", () => {
    for (const part of splitOrExpression(toSearchFilter("RBC"))) {
      expect(part).toContain(".ilike.");
    }
  });

  it("does not reach into job descriptions or notes", () => {
    const expression = toSearchFilter("anything");

    expect(expression).not.toContain("job_description");
    expect(expression).not.toContain("notes");
  });

  it("quotes the value so punctuation is searched, not parsed", () => {
    // A comma would otherwise end the filter and start a new one.
    const parts = splitOrExpression(toSearchFilter("Toronto, ON"));

    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(unquote(part.split(".ilike.")[1])).toBe("%Toronto, ON%");
    }
  });

  it.each([
    ["a period", "Shopify Inc."],
    ["brackets", "Nokia (Canada)"],
    ["a colon", "Role: Analyst"],
    ["an ampersand", "Ernst & Young"],
  ])("keeps %s inside one filter value", (_label, term) => {
    const parts = splitOrExpression(toSearchFilter(term));

    expect(parts).toHaveLength(3);
    expect(unquote(parts[0].split(".ilike.")[1])).toBe(`%${term}%`);
  });

  it("survives a double quote in the search term", () => {
    const parts = splitOrExpression(toSearchFilter('the "big" bank'));

    expect(parts).toHaveLength(3);
    // One unquoting layer leaves the LIKE pattern Postgres receives.
    expect(unquote(parts[0].split(".ilike.")[1])).toBe('%the "big" bank%');
  });

  it("leaves a literal wildcard escaped after the quoting layer is undone", () => {
    // Postgres must still see `\%`, so the quoted form carries `\\%`.
    const parts = splitOrExpression(toSearchFilter("50%"));
    const pattern = unquote(parts[0].split(".ilike.")[1]);

    expect(pattern).toBe("%50\\%%");
  });

  it("never emits raw user input into the expression structure", () => {
    // A term crafted to look like filter syntax stays one value.
    const parts = splitOrExpression(
      toSearchFilter('x,user_id.eq."00000000-0000-0000-0000-000000000000"'),
    );

    // Three parts, not four: the injected `,user_id.eq.…` stayed inside the
    // search value instead of becoming a filter of its own.
    expect(parts).toHaveLength(3);
    expect(parts[0].startsWith("company_name.ilike.")).toBe(true);
    expect(parts[1].startsWith("original_job_title.ilike.")).toBe(true);
    expect(parts[2].startsWith("location.ilike.")).toBe(true);

    // The underscore is escaped too, so it matches a literal `_` rather than
    // standing in for any character.
    expect(unquote(parts[0].split(".ilike.")[1])).toContain("user\\_id.eq.");
  });
});
