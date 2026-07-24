import {
  CANADIAN_LOCATIONS,
  PROVINCE_CODES,
  formatLocation,
} from "@/lib/job-description-parser/rules/canadian-locations";
import { matchLabel } from "@/lib/job-description-parser/rules/labels";
import { resolveField } from "@/lib/job-description-parser/score";
import type {
  ExtractedField,
  FieldCandidate,
  NormalizedDocument,
} from "@/lib/job-description-parser/types";

/** The form caps location at 200 characters. */
const MAX_LOCATION_LENGTH = 200;

/** Word-boundary containment, so "London" does not match inside "Londoner". */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(
    haystack,
  );
}

/**
 * Detects every explicit `City, Province` pair in the text, in the order they
 * appear. This is the most reliable form because the province disambiguates
 * cities that exist in several countries.
 *
 * All pairs are returned rather than just the first: a posting that lists
 * "Calgary, AB / Edmonton, AB / Regina, SK" states three equally valid work
 * locations, and reporting only the first as though it were the answer hides a
 * choice the user has to make. Returning them all lets the scoring tie-break
 * downgrade confidence and flag the ambiguity.
 */
function matchCityProvince(
  text: string,
): Array<{ value: string; city: string; offset: number }> {
  const found = new Map<string, { value: string; city: string; offset: number }>();

  for (const location of CANADIAN_LOCATIONS) {
    for (const alias of [location.city.toLowerCase(), ...location.aliases]) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(?:^|[^a-z0-9])${escaped}\\s*,\\s*([a-zé][a-zé\\s]{1,30})(?:[^a-z]|$)`,
        "gi",
      );

      for (const match of text.matchAll(pattern)) {
        const provinceText = match[1].trim().toLowerCase();
        const code = PROVINCE_CODES.get(provinceText);
        if (!code || code !== location.provinceCode) continue;

        const value = formatLocation(location);
        // One entry per distinct place, keyed on the formatted value so the
        // same city written two ways is corroboration, not a second option.
        if (!found.has(value)) {
          found.set(value, {
            value,
            city: location.city,
            offset: match.index ?? 0,
          });
        }
      }
    }
  }

  return [...found.values()].sort((left, right) => left.offset - right.offset);
}

function matchCityAlone(
  text: string,
): { value: string; city: string } | null {
  for (const location of CANADIAN_LOCATIONS) {
    for (const alias of [location.city.toLowerCase(), ...location.aliases]) {
      // Aliases that already embed a province are handled by the pair matcher.
      if (alias.includes(",")) continue;
      if (containsPhrase(text, alias)) {
        return { value: formatLocation(location), city: location.city };
      }
    }
  }
  return null;
}

export function extractLocation(
  document: NormalizedDocument,
): ExtractedField<string> {
  const candidates: FieldCandidate<string>[] = [];

  for (const line of document.lines) {
    const labelled = matchLabel(line.original, "location");
    const haystack = labelled ?? line.original;

    const pairs = matchCityProvince(haystack);
    if (pairs.length) {
      for (const pair of pairs) {
        candidates.push({
          value: pair.value,
          score: labelled ? 125 : 100,
          evidence: line.original,
          ruleId: "location:city-province",
          lineIndex: line.index,
        });
      }
      continue;
    }

    const city = matchCityAlone(haystack);
    if (city) {
      candidates.push({
        value: city.value,
        score: labelled ? 105 : 60,
        evidence: line.original,
        ruleId: "location:city-only",
        lineIndex: line.index,
      });
      continue;
    }

    // A labelled line with unrecognized content is still the stated location;
    // trusting the label beats discarding it, but it scores below known cities.
    if (labelled && labelled.length <= MAX_LOCATION_LENGTH) {
      candidates.push({
        value: labelled,
        score: 70,
        evidence: line.original,
        ruleId: "location:labelled-freeform",
        lineIndex: line.index,
        warnings: ["The location was taken from a label but not recognized."],
      });
    }
  }

  return resolveField(candidates);
}
