import type { CaptureWorkArrangement } from "./types.js";

/**
 * The three factual details a posting states about the term itself.
 *
 * Work arrangement, work term and duration are facts a student cares about and
 * a posting usually says out loud — "Summer 2027 Co-op", "Duration: 4 months",
 * "Work arrangement: Hybrid". They are also three of the easiest fields in
 * JobTrack to get plausibly, invisibly wrong, because every one of them has a
 * neighbouring sentence that looks like an answer and is not:
 *
 * - a Toronto address does not make a role On-site, and "flexible working
 *   environment" does not make one Hybrid;
 * - "applications for our Fall 2026 cohort are closed" is not this posting's
 *   work term, and today's date is not evidence of anything;
 * - a "2-week training period" and a "3-month probation" are not how long the
 *   job lasts, and neither is the gap between a start date and an end date.
 *
 * So this file recognizes statements rather than topics. Each helper takes the
 * bounded text the extractor has already tied to the selected posting — its
 * title, its description, its structured `jobLocationType` — and returns either
 * one value with the evidence behind it, a conflict, or nothing. Nothing is the
 * common answer and the correct one: the server already defaults a missing
 * arrangement to `Unknown` and a missing term to `Not specified`, and a blank
 * field asks the student a question they can answer in a second.
 *
 * There is no model here, no network call and no dependency. Every rule is a
 * bounded pattern over text the student is looking at.
 */

/** Which bounded posting field a candidate was read out of. */
export type RichOrigin = "structured" | "title" | "description";

export type RichConfidence = "exact" | "strong";

type RichCandidate<T extends string> = {
  value: T;
  confidence: RichConfidence;
  origin: RichOrigin;
};

/**
 * One field's outcome: a value with its evidence, a conflict, or nothing.
 *
 * `conflict` is deliberately distinct from `absent`. The extractor records it
 * as an ambiguous field so the local diagnostics can say the posting contained
 * a candidate that was refused, without the value ever reaching a record.
 */
export type RichResult<T extends string> =
  | {
      state: "established";
      value: T;
      confidence: RichConfidence;
      origin: RichOrigin;
    }
  | { state: "conflict"; origins: readonly RichOrigin[] }
  | { state: "absent" };

const ABSENT = { state: "absent" } as const;

/**
 * One agreed value, or a refusal.
 *
 * Two candidates that disagree end the field. There is no precedence table
 * that resolves "the structured data says Remote and the posting says Hybrid",
 * because there is no generic fact about publishing that makes either of them
 * right — and a coin toss is exactly the kind of wrong that survives unnoticed.
 */
function resolve<T extends string>(
  candidates: readonly RichCandidate<T>[],
): RichResult<T> {
  if (candidates.length === 0) return ABSENT;

  const values = new Set(candidates.map((candidate) => candidate.value));
  if (values.size > 1) {
    return {
      state: "conflict",
      origins: [...new Set(candidates.map((candidate) => candidate.origin))],
    };
  }

  const best =
    candidates.find((candidate) => candidate.confidence === "exact") ??
    candidates[0];
  if (!best) return ABSENT;

  return {
    state: "established",
    value: best.value,
    confidence: best.confidence,
    origin: best.origin,
  };
}

/** Bounded text: long enough for a real posting, short enough to stay cheap. */
const MAXIMUM_SCANNED_CHARACTERS = 50_000;

function scannable(text: string | undefined): string {
  if (!text) return "";

  return text.length > MAXIMUM_SCANNED_CHARACTERS
    ? text.slice(0, MAXIMUM_SCANNED_CHARACTERS)
    : text;
}

/* ------------------------------------------------------------------ *
 * Work arrangement
 * ------------------------------------------------------------------ */

/**
 * The only words that name an arrangement, and nothing that merely suggests one.
 *
 * `telecommute` is `schema.org`'s own term for `jobLocationType`, which is the
 * one standardized structured signal in this vocabulary.
 */
const ARRANGEMENT_WORDS: Readonly<Record<string, CaptureWorkArrangement>> = {
  remote: "Remote",
  telecommute: "Remote",
  telecommuting: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  "on-site": "On-site",
  "on site": "On-site",
};

/** Only `jobLocationType` values that stand for remote work, per schema.org. */
const STRUCTURED_ARRANGEMENTS: Readonly<Record<string, CaptureWorkArrangement>> =
  {
    remote: "Remote",
    telecommute: "Remote",
    telecommuting: "Remote",
  };

/**
 * A field the posting dedicates to the arrangement, and its stated value.
 *
 * The value has to *be* an arrangement word. "Work model: Remote-first culture"
 * is prose about the company, not a stated arrangement, and it yields nothing.
 */
const ARRANGEMENT_LABEL_PATTERN =
  /\b(?:work arrangement|work model|work setting|work style|workplace type|work location type)\s*[:\-–—]\s*([A-Za-z][A-Za-z \-]{0,24})/gi;

/** `Analyst Intern (Hybrid)` — an arrangement the title states as its own. */
const TITLE_BRACKETED_PATTERN =
  /[(\[]\s*(remote|hybrid|on[\s-]?site)\s*[)\]]/gi;

/** `Analyst Intern — Remote` — the same statement, made with a separator. */
const TITLE_SUFFIX_PATTERN = /[-–—|·,]\s*(remote|hybrid|on[\s-]?site)\s*$/i;

function arrangementWord(raw: string): CaptureWorkArrangement | undefined {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");

  return ARRANGEMENT_WORDS[normalized];
}

/**
 * The role's arrangement, only when the posting names it.
 *
 * Three kinds of statement qualify, and prose does not. A description that
 * mentions working remotely on Fridays, an office address, or a "flexible
 * environment" says something real about the job and nothing determinate about
 * this field.
 */
export function extractWorkArrangement(input: {
  jobLocationType?: string;
  title?: string;
  description?: string;
}): RichResult<CaptureWorkArrangement> {
  const candidates: RichCandidate<CaptureWorkArrangement>[] = [];

  const structured = input.jobLocationType?.trim().toLowerCase();
  const fromStructured = structured
    ? STRUCTURED_ARRANGEMENTS[structured.replace(/\s+/g, " ")]
    : undefined;
  if (fromStructured) {
    candidates.push({
      value: fromStructured,
      confidence: "exact",
      origin: "structured",
    });
  }

  for (const [origin, text] of [
    ["title", scannable(input.title)],
    ["description", scannable(input.description)],
  ] as const) {
    if (!text) continue;

    for (const match of text.matchAll(ARRANGEMENT_LABEL_PATTERN)) {
      const stated = arrangementWord(match[1] ?? "");
      if (stated) {
        candidates.push({ value: stated, confidence: "exact", origin });
      }
    }
  }

  const title = scannable(input.title);
  if (title) {
    for (const match of title.matchAll(TITLE_BRACKETED_PATTERN)) {
      const stated = arrangementWord(match[1] ?? "");
      if (stated) {
        candidates.push({ value: stated, confidence: "strong", origin: "title" });
      }
    }

    const suffix = arrangementWord(TITLE_SUFFIX_PATTERN.exec(title)?.[1] ?? "");
    if (suffix) {
      candidates.push({ value: suffix, confidence: "strong", origin: "title" });
    }
  }

  return resolve(candidates);
}

/* ------------------------------------------------------------------ *
 * Work term
 * ------------------------------------------------------------------ */

const SEASONS: Readonly<Record<string, string>> = {
  winter: "Winter",
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
};

/** `Summer 2027`, wherever a bounded posting field states it. */
const TERM_PATTERN = /\b(winter|spring|summer|fall)\s+(20\d{2})\b/gi;

/**
 * `Summer/Fall 2027` — two terms sharing one year, which is two terms.
 *
 * Without this the plain pattern would see only the second season and quietly
 * file a posting advertising both under one of them.
 */
const SHARED_YEAR_PATTERN =
  /\b(winter|spring|summer|fall)\s*(?:\/|&|,|\bor\b|\band\b)\s*(winter|spring|summer|fall)\s+(20\d{2})\b/gi;

/** A field the posting dedicates to the term: `Work term: Summer 2027`. */
const TERM_LABEL_PATTERN =
  /\b(?:work term(?: season)?|co-?op term|recruiting term|term)\s*[:\-–—]\s*(winter|spring|summer|fall)\s+(20\d{2})\b/gi;

function term(season: string | undefined, year: string | undefined): string | undefined {
  const name = SEASONS[(season ?? "").toLowerCase()];

  return name && year ? `${name} ${year}` : undefined;
}

/**
 * The recruiting term the posting belongs to, only when it names one.
 *
 * A season needs its year: "summer" alone is a word, and supplying the year
 * from today's date, from the posting date, or from a university calendar would
 * be inventing the field. The title may state the term as a title states things
 * — "Summer 2027 Marketing Intern" — but the description must label it, because
 * a description mentioning a season is usually talking about something else.
 */
export function extractWorkTerm(input: {
  title?: string;
  description?: string;
}): RichResult<string> {
  const candidates: RichCandidate<string>[] = [];

  const collectShared = (text: string, origin: RichOrigin): void => {
    for (const match of text.matchAll(SHARED_YEAR_PATTERN)) {
      const first = term(match[1], match[3]);
      const second = term(match[2], match[3]);
      if (first) candidates.push({ value: first, confidence: "strong", origin });
      if (second) candidates.push({ value: second, confidence: "strong", origin });
    }
  };

  const title = scannable(input.title);
  if (title) {
    collectShared(title, "title");
    for (const match of title.matchAll(TERM_PATTERN)) {
      const value = term(match[1], match[2]);
      if (value) {
        candidates.push({ value, confidence: "strong", origin: "title" });
      }
    }
  }

  const description = scannable(input.description);
  if (description) {
    collectShared(description, "description");
    for (const match of description.matchAll(TERM_LABEL_PATTERN)) {
      const value = term(match[1], match[2]);
      if (value) {
        candidates.push({ value, confidence: "exact", origin: "description" });
      }
    }
  }

  return resolve(candidates);
}

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

/** A field the posting dedicates to length: `Duration: 4 months`. */
const DURATION_LABEL_PATTERN =
  /\b(?:work[\s-]?term duration|term duration|term length|length of (?:the )?(?:work )?term|internship duration|co-?op duration|duration)\s*(?:is\s*)?[:\-–—]?\s*(\d{1,2})[\s-]*(month|week)s?\b/gi;

/**
 * `4-month internship`, `16-week co-op term` — a length attached to the job.
 *
 * The noun is what makes this an employment duration rather than a number.
 * "2-week training", "3-month probation" and "5 years of experience" all state
 * a real length of something that is not how long the role lasts, and none of
 * them reaches this pattern.
 */
const DURATION_CONTEXT_PATTERN =
  /\b(\d{1,2})[\s-]*(month|week)s?[\s-]+(?:long\s+)?(?:internship|intern|co-?op|work term|term|placement|position|role|contract|assignment|program|rotation|student)\b/gi;

function duration(count: string | undefined, unit: string | undefined): string | undefined {
  const amount = Number(count);
  const measure = unit?.toLowerCase();
  if (!Number.isInteger(amount) || amount < 1 || amount > 99) return undefined;
  if (measure !== "month" && measure !== "week") return undefined;

  // Weeks are never converted into months, nor months into weeks: "16 weeks"
  // and "4 months" are different statements and the posting made one of them.
  return `${amount} ${measure}${amount === 1 ? "" : "s"}`;
}

/**
 * How long the work term runs, only when the posting states it as a length.
 *
 * No arithmetic happens here. A posting giving a start date and an end date has
 * not stated a duration, and subtracting them would produce a figure the
 * posting never made — off by however the publisher counts partial months.
 */
export function extractDuration(input: {
  title?: string;
  description?: string;
}): RichResult<string> {
  const candidates: RichCandidate<string>[] = [];

  for (const [origin, text] of [
    ["title", scannable(input.title)],
    ["description", scannable(input.description)],
  ] as const) {
    if (!text) continue;

    for (const match of text.matchAll(DURATION_LABEL_PATTERN)) {
      const value = duration(match[1], match[2]);
      if (value) candidates.push({ value, confidence: "exact", origin });
    }

    for (const match of text.matchAll(DURATION_CONTEXT_PATTERN)) {
      const value = duration(match[1], match[2]);
      if (value) candidates.push({ value, confidence: "strong", origin });
    }
  }

  return resolve(candidates);
}
