/**
 * Every number on a tailored resume comes from the story library (decision
 * record 0023).
 *
 * Runs reframe stories freely in the posting's language, bridging adjacent
 * experience, but never add a number the library does not hold. A bullet's
 * number traces when a story of the same experience (its facts or any of its
 * wordings) has the same number, or one within 10% of it, so "~40%" written
 * as "40%" or "5.2M" written as "5M+" still traces. Spelled numbers count:
 * "a team of five" traces to "5" and the other way round. Pure, no I/O.
 */

import type { LibraryStory } from "@/lib/agent/library/scoring";
import type { BulletOwner } from "@/lib/agent/resume/line-rules";

/** How far a number may round from the library's value and still trace. */
const ROUNDING = 0.1;

const SPELLED: Readonly<Record<string, number>> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

const SCALE: Readonly<Record<string, number>> = {
  k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9,
};

// A number standing on its own: not part of a word like B2B, Q3 or 3D.
const DIGITS = /(?<![A-Za-z0-9.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s?(k|m|b|thousand|million|billion)(?![A-Za-z]))?[%+]?(?![A-Za-z0-9])/gi;
const WORDS = new RegExp(`\\b(${Object.keys(SPELLED).join("|")})\\b`, "gi");

export type NumberFound = { text: string; value: number };

/** The numbers a text states, with their values. */
export function numbersIn(text: string): NumberFound[] {
  const plain = text.replace(/\*\*/g, "");
  const found: NumberFound[] = [];
  for (const match of plain.matchAll(DIGITS)) {
    const scale = match[2] ? SCALE[match[2].toLowerCase()] : 1;
    found.push({ text: match[0], value: Number(match[1].replace(/,/g, "")) * scale });
  }
  for (const match of plain.matchAll(WORDS)) {
    found.push({ text: match[0], value: SPELLED[match[1].toLowerCase()] });
  }
  return found;
}

function traces(value: number, known: readonly number[]): boolean {
  return known.some((candidate) => Math.abs(candidate - value) <= ROUNDING * Math.max(Math.abs(candidate), Math.abs(value)));
}

/** The stories behind an entry: the same org and title, as the page shows them. */
function storiesFor(owner: BulletOwner, library: readonly LibraryStory[]): LibraryStory[] {
  return library.filter((story) =>
    owner.org === null ? story.org === owner.title : story.org === owner.org && story.official_title === owner.title,
  );
}

export type UntracedNumber = { index: number; number: string; entry: string };

/**
 * Numbers in the bullets that no story of their experience holds. `owners`
 * is the entry each bullet sits under, in the same order. An entry with no
 * story in the library is checked against the whole library.
 */
export function untracedNumbers(
  bullets: readonly string[],
  owners: readonly BulletOwner[],
  library: readonly LibraryStory[],
): UntracedNumber[] {
  return bullets.flatMap((bullet, index) => {
    const owner = owners[index];
    const own = owner ? storiesFor(owner, library) : [];
    const sources = own.length ? own : library;
    const known = sources.flatMap((story) =>
      [story.summary ?? "", ...story.variants.map((variant) => variant.text)].flatMap((text) =>
        numbersIn(text).map((number) => number.value),
      ),
    );
    return numbersIn(bullet)
      .filter((number) => !traces(number.value, known))
      .map((number) => ({ index, number: number.text, entry: owner?.key ?? "" }));
  });
}
