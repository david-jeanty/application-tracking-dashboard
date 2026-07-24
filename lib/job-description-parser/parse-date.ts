import { isDateOnly } from "@/lib/dates/date-only";

export type DateMatch = {
  /** Always `YYYY-MM-DD`, never a Date, so no timezone can shift the day. */
  value: string;
  /** The exact substring that produced the value, used as evidence. */
  text: string;
  /** Index of the match within the source line. */
  offset: number;
  /** True when the source omitted a year and one had to be inferred. */
  yearInferred: boolean;
  /** True when the numeric order was genuinely ambiguous (e.g. 03/04/2026). */
  ambiguousOrder: boolean;
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, janvier: 1,
  february: 2, feb: 2, februar: 2, "février": 2, fevrier: 2,
  march: 3, mar: 3, mars: 3,
  april: 4, apr: 4, avril: 4,
  may: 5, mai: 5,
  june: 6, jun: 6, juin: 6,
  july: 7, jul: 7, juillet: 7,
  august: 8, aug: 8, "août": 8, aout: 8,
  september: 9, sep: 9, sept: 9, septembre: 9,
  october: 10, oct: 10, octobre: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, "décembre": 12, decembre: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length);
const MONTH_ALTERNATION = MONTH_NAMES.join("|");

/**
 * `July 17, 2026` / `Jul 17 2026` / `July 17`
 *
 * The day is guarded with `(?!\d)` so a bare month-year such as "May 2026"
 * cannot be read as the 20th; the year group is optional as a whole so a
 * day without a year still matches.
 */
const MONTH_FIRST = new RegExp(
  `\\b(${MONTH_ALTERNATION})\\b\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:(?:\\s*,\\s*|\\s+)(\\d{4}))?`,
  "gi",
);

/** `17 July 2026` / `17th of July, 2026` / `17 July` */
const DAY_FIRST = new RegExp(
  `\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_ALTERNATION})\\b\\.?(?:(?:\\s*,\\s*|\\s+)(\\d{4}))?`,
  "gi",
);

/** ISO `2026-07-17` */
const ISO = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/** Numeric `17/07/2026` or `07/17/2026`, separator `/` or `.` */
const NUMERIC = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateOnly(year: number, month: number, day: number): string | null {
  const candidate = `${year}-${pad(month)}-${pad(day)}`;
  return isDateOnly(candidate) ? candidate : null;
}

/**
 * Chooses the year for a date that omitted one. Deadlines are forward-looking,
 * so an omitted year means the next occurrence of that month/day — rolling to
 * next year only once the date has already passed.
 */
function inferYear(month: number, day: number, today: Date): number {
  const year = today.getUTCFullYear();
  const thisYear = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return thisYear >= todayUtc ? year : year + 1;
}

/**
 * Finds every date in a string. Deliberately returns all matches rather than
 * the first: a posting line can contain both a start date and a deadline, and
 * the caller scores them by surrounding context.
 */
export function findDates(text: string, today: Date): DateMatch[] {
  const matches: DateMatch[] = [];
  const claimed: Array<[number, number]> = [];

  const overlaps = (start: number, end: number) =>
    claimed.some(([from, to]) => start < to && end > from);

  const push = (match: DateMatch, start: number, end: number) => {
    if (overlaps(start, end)) return;
    claimed.push([start, end]);
    matches.push(match);
  };

  // ISO first: unambiguous, and its digits would otherwise feed NUMERIC.
  for (const match of text.matchAll(ISO)) {
    const value = toDateOnly(Number(match[1]), Number(match[2]), Number(match[3]));
    if (!value || match.index === undefined) continue;
    push(
      { value, text: match[0], offset: match.index, yearInferred: false, ambiguousOrder: false },
      match.index,
      match.index + match[0].length,
    );
  }

  for (const match of text.matchAll(MONTH_FIRST)) {
    if (match.index === undefined) continue;
    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    const yearInferred = !match[3];
    const year = match[3] ? Number(match[3]) : inferYear(month, day, today);
    const value = toDateOnly(year, month, day);
    if (!value) continue;
    push(
      { value, text: match[0].trim(), offset: match.index, yearInferred, ambiguousOrder: false },
      match.index,
      match.index + match[0].length,
    );
  }

  for (const match of text.matchAll(DAY_FIRST)) {
    if (match.index === undefined) continue;
    const day = Number(match[1]);
    const month = MONTHS[match[2].toLowerCase()];
    const yearInferred = !match[3];
    const year = match[3] ? Number(match[3]) : inferYear(month, day, today);
    const value = toDateOnly(year, month, day);
    if (!value) continue;
    push(
      { value, text: match[0].trim(), offset: match.index, yearInferred, ambiguousOrder: false },
      match.index,
      match.index + match[0].length,
    );
  }

  for (const match of text.matchAll(NUMERIC)) {
    if (match.index === undefined) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);

    // Only one ordering can be valid when a component exceeds 12; when both
    // are <= 12 the value is truly ambiguous and the caller is warned.
    let month: number;
    let day: number;
    let ambiguousOrder = false;
    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else {
      // Canadian postings mix both conventions; day-first is the ISO-adjacent
      // reading and matches the en-CA locale this app already uses.
      day = first;
      month = second;
      ambiguousOrder = true;
    }

    const value = toDateOnly(year, month, day);
    if (!value) continue;
    push(
      { value, text: match[0], offset: match.index, yearInferred: false, ambiguousOrder },
      match.index,
      match.index + match[0].length,
    );
  }

  return matches.sort((left, right) => left.offset - right.offset);
}
