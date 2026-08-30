import type { CaptureWorkArrangement } from "./types.js";

/**
 * The three factual details a posting states about the term itself.
 *
 * Work arrangement, work term and duration are facts a student cares about and
 * a posting usually says out loud — "Summer 2027 Co-op", "Duration: 4 months",
 * "Work arrangement: Hybrid". They are also three of the easiest fields in
 * Interndex to get plausibly, invisibly wrong, because every one of them has a
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
export type RichOrigin = "structured" | "site" | "title" | "description";

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
  // Indeed's own wording for on-site work, observed alongside "Remote" and
  // "Hybrid" in the same metadata region. It names the same fact, not a
  // fourth arrangement.
  "in-person": "On-site",
  "in person": "On-site",
  inperson: "On-site",
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

/**
 * Whether one bounded piece of text names an arrangement, and nothing else.
 *
 * Exported so a site's own text-splitting logic (Indeed states location and
 * arrangement in one string) can ask "is this segment an arrangement word?"
 * against the same one table `extractWorkArrangement` itself uses, rather
 * than keeping a second list that could quietly drift from this one.
 */
export function arrangementWord(raw: string): CaptureWorkArrangement | undefined {
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
  /**
   * The arrangement a recognized site stated for the selected posting.
   *
   * LinkedIn writes it on the card its address names, either beside the
   * location — `Toronto, Ontario, Canada (Hybrid)` — or as a standalone pill
   * next to it, which makes it a dedicated statement about that posting rather
   * than something read out of prose.
   *
   * The site may pass more than one stated word, comma-separated, when the
   * selected posting stated the fact in both places. They are read through the
   * same table below and become separate candidates, so a card that
   * contradicts itself ends the field instead of handing over whichever the
   * collector happened to see first.
   */
  siteWorkplaceType?: string;
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

  for (const stated of (input.siteWorkplaceType ?? "").split(",")) {
    const fromSite = arrangementWord(stated);
    if (fromSite) {
      candidates.push({ value: fromSite, confidence: "exact", origin: "site" });
    }
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

/**
 * The words a title is allowed to put between its season and its year.
 *
 * Live Canadian student postings write the term as `Winter Intern 2027` and
 * `2027 Winter Co-op` at least as often as they write `Winter 2027`, and all
 * three say the same thing. What separates them from `Winter recruiting events
 * for our 2027 strategy` is what stands in the middle: this list is the things
 * an employer hires, deliberately narrow and deliberately about employment, so
 * an arbitrary sentence cannot bridge a season to an unrelated year.
 */
const TERM_BRIDGE = String.raw`(?:internships?|interns?|co-?\s?ops?|coops?|students?|work terms?)`;

/** `Winter Intern 2027` — the season, the thing being hired, then the year. */
const TERM_BRIDGED_PATTERN = new RegExp(
  String.raw`\b(winter|spring|summer|fall)\s+${TERM_BRIDGE}\s+(20\d{2})\b`,
  "gi",
);

/** `2027 Winter Co-op` — the same statement, written year first. */
const TERM_YEAR_FIRST_PATTERN = new RegExp(
  String.raw`\b(20\d{2})\s+(winter|spring|summer|fall)\s+${TERM_BRIDGE}\b`,
  "gi",
);

const MONTH_NAMES: Readonly<Record<string, string>> = {
  jan: "January",
  january: "January",
  feb: "February",
  february: "February",
  mar: "March",
  march: "March",
  apr: "April",
  april: "April",
  may: "May",
  jun: "June",
  june: "June",
  jul: "July",
  july: "July",
  aug: "August",
  august: "August",
  sep: "September",
  sept: "September",
  september: "September",
  oct: "October",
  october: "October",
  nov: "November",
  november: "November",
  dec: "December",
  december: "December",
};

const MONTH = String.raw`(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b\.?`;
/** `2027`, or the `'27` a posting writes inside a title's parentheses. */
const YEAR = String.raw`(?:20\d{2}|['’]\d{2})`;
const RANGE_SEPARATOR = String.raw`(?:\s*[-–—]\s*|\s+(?:to|through|thru|until|till)\s+)`;

/**
 * A calendar day, optional and never itself part of the stored term.
 *
 * `September 14, 2026` states a day, but `extractWorkTerm` only ever records
 * a month and a year — same as it always has, since no arithmetic happens
 * here and a day number changes no month-range value this file produces. The
 * `(?!\d)` guard exists so this cannot swallow the first digits of a bare
 * four-digit year: without it, `\d{1,2}` greedily eating "20" out of
 * "September 2027" would leave "27" behind, which is not a year on its own,
 * and the whole match would silently fail on ordinary month-only postings.
 */
const DAY = String.raw`(?:\s+\d{1,2}(?!\d)(?:st|nd|rd|th)?)?`;

/**
 * A stated month range, in the two shapes a posting writes one.
 *
 * Groups 1–4 are the both-years shape — `January 2027 to April 2027` — and
 * groups 5–7 the shared-year one — `January to August, 2027`. Every lead that
 * uses this fragment keeps its own groups non-capturing, so the numbering is
 * the same wherever it appears. A day number may appear after either month —
 * `September 14, 2026 to April 16, 2027` — and is simply skipped.
 */
const RANGE = String.raw`(?:(${MONTH})${DAY}\s*,?\s*(${YEAR})${RANGE_SEPARATOR}(${MONTH})${DAY}\s*,?\s*(${YEAR})|(${MONTH})${DAY}${RANGE_SEPARATOR}(${MONTH})${DAY}\s*,?\s*(${YEAR}))`;

/**
 * A range the posting labels as the term itself: `Co-op term is from …`.
 *
 * The word `term` has to be there. A description is full of real date ranges
 * that are not the work term — training, benefits enrollment, a hiring
 * campaign — and every one of them reads exactly like this sentence without it.
 */
const TERM_RANGE_LABEL_PATTERN = new RegExp(
  String.raw`\bterm\b(?:\s*[:\-–—]\s*|\s+(?:is|are|runs?|will\s+run)\s+(?:for\s+)?(?:from\s+)?|\s+from\s+|\s+for\s+)` +
    RANGE,
  "gi",
);

/** `The internship runs from January to April 2027` — the job, then its dates. */
const TERM_RANGE_RUNS_PATTERN = new RegExp(
  String.raw`\b(?:internships?|interns?|co-?\s?ops?|coops?|placements?|work[\s-]?terms?)(?:\s*\/\s*(?:internships?|co-?\s?ops?|coops?))?\s+(?:is|are|runs?|will\s+run)\s+(?:scheduled\s+)?(?:for\s+)?from\s+` +
    RANGE,
  "gi",
);

/**
 * `Consultant, Internship (Jan-April '27)` — a title's parenthetical term.
 *
 * Only a parenthetical that follows the word for the job itself, and closely.
 * That is what makes it the posting's statement of its own term rather than
 * some other bracketed aside, and it is strong rather than exact because a
 * title states things without labelling them.
 */
const TERM_RANGE_TITLE_PATTERN = new RegExp(
  String.raw`\b(?:internships?|interns?|co-?\s?ops?|coops?|students?|placements?|work[\s-]?terms?)\b[^()\[\]\n]{0,24}[(\[]\s*` +
    RANGE +
    String.raw`\s*[)\]]`,
  "gi",
);

function term(season: string | undefined, year: string | undefined): string | undefined {
  const name = SEASONS[(season ?? "").toLowerCase()];

  return name && year ? `${name} ${year}` : undefined;
}

/** `'27` is 2027. A two-digit year is expanded, never otherwise interpreted. */
function fullYear(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  return digits.length === 4 ? digits : `20${digits}`;
}

/**
 * One deterministic spelling of a stated month range, and no interpretation.
 *
 * `Jan-April '27` and `January to April 2027` are the same statement written
 * twice, so both become `January-April 2027`. What does not happen here is
 * anything the posting did not say: a range is never mapped onto a university
 * season, and its length is never counted — `January-August 2027` is eight
 * months only if the posting says so somewhere else, and `extractDuration` is
 * the only thing that reads that.
 */
function monthRange(match: RegExpMatchArray): string | undefined {
  const monthName = (raw: string | undefined): string | undefined =>
    MONTH_NAMES[(raw ?? "").toLowerCase().replace(/\.$/, "")];

  const [, fromDated, fromYear, toDated, toYear, from, to, sharedYear] = match;

  if (fromDated && fromYear && toDated && toYear) {
    const start = monthName(fromDated);
    const end = monthName(toDated);
    if (!start || !end) return undefined;

    const opens = fullYear(fromYear);
    const closes = fullYear(toYear);

    // A term that crosses a year keeps both. Collapsing `September 2026-April
    // 2027` onto one year would state a term the posting never advertised.
    return opens === closes
      ? `${start}-${end} ${closes}`
      : `${start} ${opens}-${end} ${closes}`;
  }

  if (from && to && sharedYear) {
    const start = monthName(from);
    const end = monthName(to);

    return start && end ? `${start}-${end} ${fullYear(sharedYear)}` : undefined;
  }

  return undefined;
}

/**
 * The recruiting term the posting belongs to, only when it names one.
 *
 * A season needs its year: "summer" alone is a word, and supplying the year
 * from today's date, from the posting date, or from a university calendar would
 * be inventing the field. The title may state the term as a title states things
 * — "Summer 2027 Marketing Intern", "Winter Intern 2027", "Internship
 * (Jan-April '27)" — but the description must label it, because a description
 * mentioning a season or a pair of months is usually talking about something
 * else: when applications close, when training runs, when benefits enrollment
 * opens. None of those is the term, and each of them reads like one.
 *
 * A month range is kept as a month range. `January-April 2027` is not filed as
 * `Winter 2027`, because which season a term belongs to is a fact about a
 * university calendar rather than about this posting, and no length is counted
 * from it either.
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

    for (const match of title.matchAll(TERM_BRIDGED_PATTERN)) {
      const value = term(match[1], match[2]);
      if (value) {
        candidates.push({ value, confidence: "strong", origin: "title" });
      }
    }

    for (const match of title.matchAll(TERM_YEAR_FIRST_PATTERN)) {
      const value = term(match[2], match[1]);
      if (value) {
        candidates.push({ value, confidence: "strong", origin: "title" });
      }
    }

    for (const match of title.matchAll(TERM_RANGE_TITLE_PATTERN)) {
      const value = monthRange(match);
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

    for (const pattern of [
      TERM_RANGE_LABEL_PATTERN,
      TERM_RANGE_RUNS_PATTERN,
    ]) {
      for (const match of description.matchAll(pattern)) {
        const value = monthRange(match);
        if (value) {
          candidates.push({ value, confidence: "exact", origin: "description" });
        }
      }
    }
  }

  return resolve(candidates);
}

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

/**
 * A field the posting dedicates to length: `Duration: 4 months`.
 *
 * Two shapes qualify, and what separates them is what the sentence is
 * measuring. A qualified label names it outright — `Term length`, `Contract
 * duration` — and only employment nouns qualify. Bare `duration` is read as
 * the job's only where it opens a statement or a list item, because anywhere
 * else the noun in front of it is the thing being measured: "Training
 * duration: 2 weeks", "the warranty duration is 6 months" and "Probation
 * duration is 3 months" each state a real length of something that is not how
 * long the role lasts.
 */
const DURATION_LABEL_PATTERN =
  /(?:\b(?:(?:work[\s-]?term|term|internship|co-?op|contract) (?:duration|length)|length of (?:the )?(?:work )?term)|(?:^|\n|[.!?]\s)\s*(?:[-–—•·*]\s*)?duration\b)\s*(?:is\s*)?[:\-–—]?\s*(\d{1,2})[\s-]*(month|week)s?\b/gi;

/**
 * `4-month internship`, `16-week co-op term` — a length attached to the job.
 *
 * The noun is what makes this an employment duration rather than a number.
 * "2-week training", "3-month probation" and "5 years of experience" all state
 * a real length of something that is not how long the role lasts, and none of
 * them reaches this pattern.
 *
 * Bare `intern` is deliberately not one of the nouns. It is a modifier as often
 * as it is the job — "our 2-week intern orientation" measures the orientation —
 * and `internship` states the same thing without the ambiguity. Missing the
 * occasional "4-month intern" costs a blank field; taking the orientation costs
 * a wrong one.
 */
const DURATION_CONTEXT_PATTERN =
  /\b(\d{1,2})[\s-]*(month|week)s?[\s-]+(?:long\s+)?(?:internship|co-?op|work term|term|placement|position|role|contract|assignment|program|rotation|student)\b/gi;

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

/* ------------------------------------------------------------------ *
 * Salary (plain text)
 * ------------------------------------------------------------------ */

/**
 * A field the posting dedicates to pay: `Compensation: $17.95/hour`.
 *
 * `extractor.ts`'s `readSalary` already reads a structured `baseSalary` when
 * a publisher provides one, and structured data keeps its priority — this is
 * only the fallback for postings that state pay in plain text instead. That
 * fallback matters more than it looks: LinkedIn, Indeed and Workday publish
 * no structured posting data on the pages a student actually reads at all
 * (`extractJobReport`'s own trust-order comment says so), so an explicit
 * hourly or annual rate on those sites has no path into a record without
 * this. The label has to be there — a bare dollar figure floating in prose is
 * as likely to be a fee, a budget, or someone else's example as a pay rate.
 *
 * Only the figure (or figures, for a range) and its unit are captured — never
 * trailing prose such as "paid biweekly" or a payment-frequency note, and
 * never a currency code this file has no evidence for: `$` alone does not say
 * USD or CAD, and guessing one would be inventing a fact the posting never
 * stated. A tight capture also means this cannot run on into whatever the
 * description says next: a label with no line break before the following
 * sentence is common enough in text converted out of HTML that this cannot be
 * assumed away.
 *
 * A statement does not have to be a colon-labelled line. `Salary range:
 * $60,000-$70,000`, `The expected annual salary for this position is between
 * $45,000 to $85,000`, and `Pay range is $22–$27 per hour` are all explicit
 * compensation statements a real posting writes in prose, and the context
 * word, an optional short filler ("for this position"), and a small closed
 * set of connecting phrases ("is", "is between", "ranges from") are what
 * stand between the label and the figure in each of them. What keeps this
 * from drifting into free-text salary guessing is that every one of those
 * connectors is a specific, enumerated phrase — never "any nearby text" —
 * so a sentence that merely mentions "pay" or "wage" near an unrelated dollar
 * figure ("the department's pay structure includes a $500 signing bonus")
 * does not match: nothing here reads as one of the enumerated connectors.
 */
const SALARY_MONEY = String.raw`\$\s?\d[\d,]*(?:\.\d{1,2})?`;
/** The second figure of a range may omit its own currency sign. */
const SALARY_SECOND_MONEY = String.raw`\$?\s?\d[\d,]*(?:\.\d{1,2})?`;
const SALARY_RANGE_SEPARATOR = String.raw`\s*(?:-|–|—|to)\s*`;
const SALARY_UNIT = String.raw`(?:\s*(?:\/|per)\s*(?:hour|hr|year|yr|annum|month|week|day)\b)?`;

/** Every labelled or verbosely-worded way a posting names its own pay. */
const SALARY_CONTEXT = String.raw`(?:annual\s+salary|starting\s+salary|base\s+salary|hourly\s+rate|hourly\s+wage|pay\s+rate|base\s+pay|salary\s+range|pay\s+range|compensation\s+range|salary|compensation|pay|wage)`;
/** Noise a sentence may put between the context word and the connector. */
const SALARY_FILLER = String.raw`(?:\s+for\s+(?:this|the)\s+(?:position|role|job))?`;
/** A closed set of phrases — never arbitrary nearby text — introducing a figure. */
const SALARY_CONNECTOR = String.raw`(?:\s*[:\-–—]\s*|\s+(?:is|are)\s+(?:expected\s+to\s+be\s+)?(?:between\s+|from\s+)?|\s+ranges?\s+from\s+)`;

const SALARY_STATEMENT_PATTERN = new RegExp(
  String.raw`\b${SALARY_CONTEXT}${SALARY_FILLER}${SALARY_CONNECTOR}(${SALARY_MONEY}(?:${SALARY_RANGE_SEPARATOR}${SALARY_SECOND_MONEY})?${SALARY_UNIT})`,
  "gi",
);

/** Whether a labelled figure states nothing but zeroes — a template left in. */
function statesOnlyZero(text: string): boolean {
  const numbers = text.match(/\d+(?:[.,]\d+)*/g);
  if (!numbers) return false;

  return numbers.every((number) => Number(number.replace(/,/g, "")) === 0);
}

/**
 * Pay, only when the posting labels it in text rather than in structured data.
 *
 * Two labelled statements that disagree end the field exactly as any other
 * rich fact does: a `Compensation: $17/hour` beside a `Salary: $20/hour`
 * elsewhere in the same description is a posting that contradicts itself, and
 * this file does not pick a side.
 */
export function extractSalary(input: { description?: string }): RichResult<string> {
  const candidates: RichCandidate<string>[] = [];
  const description = scannable(input.description);

  if (description) {
    for (const match of description.matchAll(SALARY_STATEMENT_PATTERN)) {
      const raw = match[1]?.trim().replace(/[,;\s]+$/, "");
      if (raw && !statesOnlyZero(raw)) {
        candidates.push({ value: raw, confidence: "exact", origin: "description" });
      }
    }
  }

  return resolve(candidates);
}
