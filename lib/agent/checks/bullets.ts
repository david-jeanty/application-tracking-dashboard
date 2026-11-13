/**
 * `check_bullets`: the resume bullet checker.
 *
 * Enforces every rule marked [checked] in `docs/STANDARDS.md` Part 2, in code,
 * so David never sees a draft that breaks one. It is a pure function: the
 * same bullets and targets always give the same answer, with no I/O.
 *
 * Two kinds of result:
 *
 * - **Failures** block the draft. The assistant must fix every one before a
 *   resume is built: filler words, first person, more than one sentence, em
 *   dashes, the banned adverb, repeated openers on one page, and line fill.
 * - **Warnings** are for review, as STANDARDS.md asks: an opening verb not on
 *   the result-verb list, a number that looks too big for an intern, the same
 *   metric with two values on one page, and a few style nudges.
 *
 * The result lists only bullets that have something to report, so a clean
 * page is a very small response.
 */

import {
  containsBannedAdverb,
  containsEmDash,
  findBlockedPhrases,
  literalPhrase,
  type BlockedPhrase,
} from "@/lib/agent/checks/text-rules";

// ------------------------------------------------------------------ types --

/** Character targets for one template, from calibration. */
export type LineTargets = {
  /** The most characters that reliably fit on one line. */
  oneLineChars: number;
  /** Shortest two-line bullet whose second line is at least 80% full. */
  twoLineMin: number;
  /** Longest bullet that still fits on two lines. */
  twoLineMax: number;
};

export type BulletRule =
  | "empty"
  | "filler"
  | "first_person"
  | "one_sentence"
  | "em_dash"
  | "banned_adverb"
  | "line_fill"
  | "repeated_opener"
  | "opener_review"
  | "believability"
  | "metric_conflict"
  | "round_confidently"
  | "effort_metric"
  | "claude_actor"
  | "line_fill_unchecked";

export type BulletIssue = { rule: BulletRule; detail: string };

export type BulletReport = {
  /** Zero-based position in the list that was checked. */
  index: number;
  failures: BulletIssue[];
  warnings: BulletIssue[];
};

export type BulletCheckResult = {
  /** True when there are no failures anywhere. Warnings do not block. */
  pass: boolean;
  /** Only bullets with at least one failure or warning. */
  bullets: BulletReport[];
  page: { failures: BulletIssue[]; warnings: BulletIssue[] };
};

export type BulletCheckOptions = {
  /** Null when the template is not calibrated yet: line fill is skipped. */
  targets: LineTargets | null;
  /**
   * Per bullet: may it be one line? Only bullets under the experiences in
   * `lib/agent/config/one-line-experiences.ts` may. Missing means no.
   */
  oneLineAllowed?: readonly boolean[];
  /** Extra phrases from saved rules (see `phrasesFromRules`). */
  extraBlocked?: readonly BlockedPhrase[];
};

// ------------------------------------------------------------ word lists --

/**
 * The filler blocklist from STANDARDS.md. Verbs also match their other forms
 * ("utilize", "utilizing"), because the rule is about the word, not the tense.
 * Matching is whole-word, so "Claude-assisted" or "help desk" do not trip it.
 */
const FILLER: readonly BlockedPhrase[] = [
  { label: "helped", pattern: /(?<![\w-])help(?:ed|ing|s)(?![\w-])/i },
  { label: "assisted", pattern: /(?<![\w-])assist(?:ed|ing|s)?(?![\w-])/i },
  literalPhrase("various"),
  literalPhrase("successfully"),
  literalPhrase("effectively"),
  { label: "utilized", pattern: /(?<![\w-])utiliz(?:e|ed|es|ing)(?![\w-])/i },
  literalPhrase("responsible for"),
  literalPhrase("worked on"),
  literalPhrase("in order to"),
  literalPhrase("robust"),
  { label: "seamless", pattern: /(?<![\w-])seamless(?:ly)?(?![\w-])/i },
  literalPhrase("actionable"),
  { label: "ensuring", pattern: /(?<![\w-])ensur(?:e|ed|es|ing)(?![\w-])/i },
  { label: "showcasing", pattern: /(?<![\w-])showcas(?:e|ed|es|ing)(?![\w-])/i },
  { label: "leveraged", pattern: /(?<![\w-])leverag(?:e|ed|es|ing)(?![\w-])/i },
  literalPhrase("a variety of"),
  literalPhrase("key stakeholders"),
  literalPhrase("cutting-edge"),
  literalPhrase("dynamic"),
  literalPhrase("passionate"),
];

/** "Supported" is only filler as the main verb, which in a bullet is the opener. */
const SUPPORT_OPENERS = new Set(["supported", "supporting", "supports"]);

/**
 * Result-first opening verbs. The STANDARDS.md list, plus the openers its gold
 * set uses, so every gold bullet opens with an allowed verb. Anything else is
 * a warning for review, never a failure.
 */
export const RESULT_VERBS: ReadonlySet<string> = new Set(
  [
    // From the rule itself.
    "reduced", "eliminated", "cut", "identified", "improved", "standardized",
    "launched", "grew", "designed", "rescoped", "traced",
    // From the gold set.
    "translate", "translated", "spearheaded", "formulated", "dropped",
    "structured", "assessed",
  ],
);

const REDUCTION_VERBS = new Set([
  "reduced", "cut", "eliminated", "decreased", "lowered", "shortened",
]);

const PEOPLE_NOUNS =
  /^(users?|customers?|students?|clients?|sign-?ups?|members?|followers?|subscribers?|employees?|visitors?)$/i;

const EFFORT_NOUNS =
  /^(pull|prs?|commits?|hours?|meetings?|calls?|emails?|lines)$/i;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "by",
  "with", "from", "across", "over", "into", "through", "per", "than", "its",
  "their", "his", "her", "all", "each", "every", "that", "which", "while",
]);

// --------------------------------------------------------------- helpers --

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** The first word, lowercased, without punctuation. */
export function openingWord(text: string): string {
  const first = words(text.trim())[0] ?? "";
  return first.replace(/[^\p{L}\p{N}-]/gu, "").toLowerCase();
}

function findFirstPerson(text: string): string[] {
  const found: string[] = [];
  // "I" is only first person in capitals ("i.e." is not).
  if (/(?<![\w-])I(?:['’](?:m|ve|d|ll))?(?![\w-])/.test(text)) found.push("I");
  for (const pronoun of ["my", "me", "our", "we"]) {
    const pattern = new RegExp(`(?<![\\w-])(${pronoun})(?![\\w-])`, "gi");
    for (const match of text.matchAll(pattern)) {
      // All-caps two-letter forms are abbreviations (ME for Maine), not "me".
      if (match[1] === match[1].toUpperCase() && match[1].length === 2) continue;
      if (!found.includes(pronoun)) found.push(pronoun);
    }
  }
  return found;
}

/**
 * "multiple" is filler unless its number sits right beside it: "multiple (4)
 * regional offices" or "4 multiple". A number elsewhere in the bullet does
 * not count, because it is not the number of the multiple things.
 */
function hasVagueMultiple(text: string): boolean {
  const counted =
    /(?<![\w-])multiple\s*\(\s*\d|\d\+?\s+multiple(?![\w-])/i;
  const bare = /(?<![\w-])multiple(?![\w-])/gi;
  const total = [...text.matchAll(bare)].length;
  const withNumber = [...text.matchAll(new RegExp(counted, "gi"))].length;
  return total > withNumber;
}

const ABBREVIATIONS = [
  "U.S.", "U.K.", "e.g.", "i.e.", "etc.", "Inc.", "Ltd.", "Co.", "Corp.",
  "vs.", "Dr.", "Mr.", "Ms.", "St.", "No.", "Jr.", "Sr.", "Ph.D.",
];

/** How many sentences the bullet has. Semicolons do not end a sentence. */
export function countSentences(text: string): number {
  let masked = text;
  for (const abbreviation of ABBREVIATIONS) {
    masked = masked.split(abbreviation).join(abbreviation.replace(/\./g, "_"));
  }
  // Decimal points are not sentence ends.
  masked = masked.replace(/(\d)\.(\d)/g, "$1_$2");
  const parts = masked
    .split(/[.!?]+(?=\s+["'(“‘]?[\p{Lu}\d])/u)
    .map((part) => part.trim())
    .filter((part) => part.replace(/[.!?\s]/g, "").length > 0);
  return Math.max(parts.length, 1);
}

type ParsedNumber = {
  value: number;
  percent: boolean;
  money: boolean;
  /** Up to two meaningful words after the number. */
  after: string[];
  /** Up to two meaningful words before "by", for "X by N%". */
  beforeBy: string[];
};

const NUMBER_PATTERN =
  /(\$)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|b|million|billion|thousand)?\b(\+)?\s*(%)?/gi;

const MULTIPLIERS: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9,
};

function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/['’]s$/, "")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/s$/, "");
}

function meaningful(list: readonly string[]): string[] {
  return list.map(normalizeWord).filter((word) => word && !STOPWORDS.has(word));
}

function parseNumbers(text: string): ParsedNumber[] {
  const results: ParsedNumber[] = [];
  for (const match of text.matchAll(NUMBER_PATTERN)) {
    const [whole, dollar, digits, suffix, , percentSign] = match;
    const start = match.index ?? 0;
    const value =
      Number(digits.replace(/,/g, "")) *
      (suffix ? (MULTIPLIERS[suffix.toLowerCase()] ?? 1) : 1);

    // The words that follow, stopping at the first clause break.
    const tail = text.slice(start + whole.length).split(/[,;:()]/)[0];
    const after = meaningful(words(tail)).slice(0, 2);

    // "the open ticket backlog by 35%": the words just before "by".
    const head = text.slice(0, start);
    const byMatch = /(?:^|\s)by\s*$/i.exec(head);
    const beforeBy = byMatch
      ? meaningful(
          words(head.slice(0, byMatch.index).split(/[,;:()]/).pop() ?? ""),
        ).slice(-2)
      : [];

    results.push({
      value,
      percent: Boolean(percentSign),
      money: Boolean(dollar),
      after,
      beforeBy,
    });
  }
  return results;
}

function metricKey(number: ParsedNumber): string | null {
  if (number.percent) {
    return number.beforeBy.length ? number.beforeBy.join(" ") : null;
  }
  return number.after.length ? number.after.join(" ") : null;
}

// ----------------------------------------------------------------- checks --

function checkOne(
  text: string,
  options: BulletCheckOptions,
  oneLineAllowed?: boolean,
): Omit<BulletReport, "index"> {
  const failures: BulletIssue[] = [];
  const warnings: BulletIssue[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    return { failures: [{ rule: "empty", detail: "Bullet is empty." }], warnings };
  }

  const opener = openingWord(trimmed);

  const filler = findBlockedPhrases(trimmed, [
    ...FILLER,
    ...(options.extraBlocked ?? []),
  ]);
  if (SUPPORT_OPENERS.has(opener)) filler.unshift("supported");
  if (hasVagueMultiple(trimmed)) filler.push("multiple (without a number)");
  if (filler.length) {
    failures.push({ rule: "filler", detail: `Remove: ${filler.join(", ")}.` });
  }

  const pronouns = findFirstPerson(trimmed);
  if (pronouns.length) {
    failures.push({
      rule: "first_person",
      detail: `No first person: ${pronouns.join(", ")}.`,
    });
  }

  const sentences = countSentences(trimmed);
  if (sentences > 1) {
    failures.push({
      rule: "one_sentence",
      detail: `${sentences} sentences. Make it one sentence (a short trailing clause after a semicolon is fine).`,
    });
  }

  if (containsEmDash(trimmed)) {
    failures.push({
      rule: "em_dash",
      detail: "Em dash found. Use a comma, colon, period or parentheses.",
    });
  }

  if (containsBannedAdverb(trimmed)) {
    failures.push({ rule: "banned_adverb", detail: "Remove the banned adverb." });
  }

  if (options.targets) {
    // **bold** markers do not print, so they do not take up the line. Chrome's
    // layout check decides the real line count, so a character estimate is
    // only a warning here (decision record 0015).
    const issue = lineFillIssue(trimmed.replace(/\*\*/g, "").length, options.targets, {
      oneLineAllowed: oneLineAllowed ?? false,
    });
    if (issue) warnings.push({ rule: "line_fill", detail: `Character estimate: ${issue}` });
  }

  if (!RESULT_VERBS.has(opener)) {
    warnings.push({
      rule: "opener_review",
      detail: `Opens with "${opener}". Lead with the result verb (Reduced, Cut, Grew, Launched...).`,
    });
  }

  for (const number of parseNumbers(trimmed)) {
    if (number.percent && number.value > 100 && REDUCTION_VERBS.has(opener)) {
      warnings.push({
        rule: "believability",
        detail: `A ${number.value}% reduction is not possible.`,
      });
    } else if (number.percent && number.value > 1000) {
      warnings.push({
        rule: "believability",
        detail: `${number.value}% is very large for an intern's scope.`,
      });
    }
    if (number.money && number.value >= 1e6) {
      warnings.push({
        rule: "believability",
        detail: `$${number.value.toLocaleString("en-US")} is large for an intern's scope. Keep only if it can be explained in two sentences.`,
      });
    }
    if (
      !number.percent &&
      number.value >= 100_000 &&
      number.after[0] &&
      PEOPLE_NOUNS.test(number.after[0])
    ) {
      warnings.push({
        rule: "believability",
        detail: `${number.value.toLocaleString("en-US")} ${number.after[0]}s is large for an intern's scope.`,
      });
    }
    if (number.after[0] && EFFORT_NOUNS.test(number.after[0])) {
      warnings.push({
        rule: "effort_metric",
        detail: "Effort number. An outcome or usage number is stronger.",
      });
    }
  }

  if (/~\s*\d|\b(?:about|approximately|around|roughly|nearly)\s+\$?\d/i.test(trimmed)) {
    warnings.push({
      rule: "round_confidently",
      detail: 'Round confidently: "~40%" becomes "40%".',
    });
  }

  if (/\b(?:used|using|with|via|by)\s+Claude\b/i.test(trimmed)) {
    warnings.push({
      rule: "claude_actor",
      detail: 'Claude reads as the actor. Use "Claude-assisted workflow" as the object instead.',
    });
  }

  return { failures, warnings };
}

export type LineFillRule = "one_line" | "short_line" | "widow" | "three_lines";

/**
 * Line fill by character count, David's rule: exactly two lines whose last
 * line is at least 80% full. A bullet whose experience allows one line may
 * instead be one line at least 80% full. Returns what is wrong and by how
 * many characters, or null.
 */
export function lineFillCheck(
  length: number,
  targets: LineTargets,
  options: { oneLineAllowed?: boolean } = {},
): { rule: LineFillRule; detail: string } | null {
  const { oneLineChars, twoLineMin, twoLineMax } = targets;
  const oneLineMin = Math.ceil(oneLineChars * 0.8);
  const twoLines = `${twoLineMin}-${twoLineMax}`;

  if (length <= oneLineChars) {
    if (!options.oneLineAllowed) {
      return {
        rule: "one_line",
        detail: `One line (${length} chars). Bullets here run to two lines: add ${twoLineMin - length} or more to reach ${twoLines}.`,
      };
    }
    if (length >= oneLineMin) return null;
    return {
      rule: "short_line",
      detail: `Short single line (${length} chars). Add ${oneLineMin - length} or more to reach ${oneLineMin}-${oneLineChars}.`,
    };
  }
  if (length < twoLineMin) {
    return {
      rule: "widow",
      detail: options.oneLineAllowed
        ? `Widow (${length} chars). Cut ${length - oneLineChars} to fit one line, or add ${twoLineMin - length} to reach ${twoLines}.`
        : `Widow (${length} chars). Add ${twoLineMin - length} or more to reach ${twoLines}.`,
    };
  }
  if (length <= twoLineMax) return null;
  return {
    rule: "three_lines",
    detail: `Runs to three lines (${length} chars). Cut ${length - twoLineMax} to fit ${twoLines}.`,
  };
}

/** `lineFillCheck`, as the message only. */
export function lineFillIssue(
  length: number,
  targets: LineTargets,
  options: { oneLineAllowed?: boolean } = {},
): string | null {
  return lineFillCheck(length, targets, options)?.detail ?? null;
}

/** Checks a page of bullets. Order matters only for the reported indexes. */
export function checkBullets(
  bullets: readonly string[],
  options: BulletCheckOptions,
): BulletCheckResult {
  const reports: BulletReport[] = [];
  const page: BulletCheckResult["page"] = { failures: [], warnings: [] };

  bullets.forEach((text, index) => {
    const { failures, warnings } = checkOne(text, options, options.oneLineAllowed?.[index]);
    if (failures.length || warnings.length) {
      reports.push({ index, failures, warnings });
    }
  });

  // No two bullets on one page may open with the same verb.
  const byOpener = new Map<string, number[]>();
  bullets.forEach((text, index) => {
    const opener = openingWord(text);
    if (!opener) return;
    byOpener.set(opener, [...(byOpener.get(opener) ?? []), index]);
  });
  for (const [opener, indexes] of byOpener) {
    if (indexes.length > 1) {
      page.failures.push({
        rule: "repeated_opener",
        detail: `"${opener}" opens bullets ${indexes.join(", ")}. Vary the openers.`,
      });
    }
  }

  // The same metric with two different values on one page.
  const metrics = new Map<string, Set<number>>();
  for (const text of bullets) {
    for (const number of parseNumbers(text)) {
      const key = metricKey(number);
      if (!key) continue;
      const tag = `${number.percent ? "%" : "#"} ${key}`;
      metrics.set(tag, (metrics.get(tag) ?? new Set()).add(number.value));
    }
  }
  for (const [tag, values] of metrics) {
    if (values.size > 1) {
      const unit = tag.startsWith("%") ? "%" : "";
      page.warnings.push({
        rule: "metric_conflict",
        detail: `"${tag.slice(2)}" appears as ${[...values].map((value) => `${value}${unit}`).join(" and ")}. Use one value.`,
      });
    }
  }

  if (!options.targets) {
    page.warnings.push({
      rule: "line_fill_unchecked",
      detail: "Template not calibrated yet, so line fill was not checked.",
    });
  }

  const pass =
    page.failures.length === 0 &&
    reports.every((report) => report.failures.length === 0);

  return { pass, bullets: reports, page };
}
