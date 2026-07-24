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
 * Detects an explicit `City, Province` pair, which is the most reliable form
 * because the province disambiguates cities that exist in several countries.
 */
function matchCityProvince(text: string): { value: string; city: string } | null {
  for (const location of CANADIAN_LOCATIONS) {
    for (const alias of [location.city.toLowerCase(), ...location.aliases]) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `(?:^|[^a-z0-9])${escaped}\\s*,\\s*([a-zé][a-zé\\s]{1,30})(?:[^a-z]|$)`,
        "i",
      );
      const match = pattern.exec(text);
      if (!match) continue;

      const provinceText = match[1].trim().toLowerCase();
      const code = PROVINCE_CODES.get(provinceText);
      if (code && code === location.provinceCode) {
        return { value: formatLocation(location), city: location.city };
      }
    }
  }
  return null;
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

    const pair = matchCityProvince(haystack);
    if (pair) {
      candidates.push({
        value: pair.value,
        score: labelled ? 125 : 100,
        evidence: line.original,
        ruleId: "location:city-province",
        lineIndex: line.index,
      });
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
