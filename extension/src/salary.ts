/**
 * Explicit compensation stated in a posting description.
 *
 * This parser knows only bounded description text. It neither knows which site
 * supplied it nor makes any inference about a currency or a pay period. A
 * monetary figure qualifies only when a nearby salary/pay label names it.
 */

export type ExplicitSalaryResult =
  | { state: "established"; value: string }
  | { state: "conflict" }
  | { state: "absent" };

type Amount = {
  currency?: string;
  value: string;
  end: number;
};

const NUMBER = "(?:\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d{1,2})?)";
const AMOUNT_PATTERN = new RegExp(
  `^\\s*(?:(CAD|USD)\\s*)?(US\\$|\\$|£)?\\s*(${NUMBER})`,
  "i",
);

const RANGE_LABEL_PATTERN =
  /\b(?:(?:anticipated\s+)?(?:overall\s+)?(?:(?:annual\s+)?(?:base\s+)?salary|(?:hourly\s+)?(?:base\s+)?pay|compensation)\s+range)\b(?:\s+for\s+(?:this\s+)?position)?\s*(?:is\s*)?[:\-–—]?\s*/gi;

const SINGLE_LABEL_PATTERN =
  /\b(?:(?:annual\s+)?(?:base\s+)?salary|(?:base\s+)?pay|hourly\s+(?:pay|rate)|compensation)\b(?:\s+for\s+(?:this\s+)?position)?\s*(?:is\s*)?[:\-–—]?\s*/gi;

/** A study-year table is context for an overall range, never salary on its own. */
const SUBORDINATE_RATE_PATTERN =
  /\b(?:first|second|third|fourth|fifth)[-\s]year\s+(?:student|students)\s*:\s*/gi;

const PERIODS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\s*\/\s*(?:hr|hour)s?\b/i, "per hour"],
  [/^\s*per\s+hour(?:s)?\b/i, "per hour"],
  [/^\s*hourly\b/i, "per hour"],
  [/^\s*\/\s*day(?:s)?\b/i, "per day"],
  [/^\s*per\s+day(?:s)?\b/i, "per day"],
  [/^\s*daily\b/i, "per day"],
  [/^\s*\/\s*week(?:s)?\b/i, "per week"],
  [/^\s*per\s+week(?:s)?\b/i, "per week"],
  [/^\s*weekly\b/i, "per week"],
  [/^\s*\/\s*month(?:s)?\b/i, "per month"],
  [/^\s*per\s+month(?:s)?\b/i, "per month"],
  [/^\s*monthly\b/i, "per month"],
  [/^\s*\/\s*(?:yr|year)s?\b/i, "per year"],
  [/^\s*per\s+year(?:s)?\b/i, "per year"],
  [/^\s*annually\b/i, "per year"],
  [/^\s*annual\b/i, "per year"],
];

function formatNumber(raw: string): string | undefined {
  const normalized = raw.replace(/,/g, "");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0) return undefined;

  const [whole, fraction] = normalized.split(".");
  const formattedWhole = Number(whole).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  return fraction && Number(fraction) !== 0
    ? `${formattedWhole}.${fraction}`
    : formattedWhole;
}

function readAmount(input: string, currencyRequired: boolean): Amount | undefined {
  const match = AMOUNT_PATTERN.exec(input);
  if (!match) return undefined;

  const code = match[1]?.toUpperCase();
  const symbol = match[2];
  const currency = code ?? symbol;
  if (currencyRequired && !currency) return undefined;

  const value = formatNumber(match[3] ?? "");
  if (!value) return undefined;

  return { ...(currency ? { currency } : {}), value, end: match[0].length };
}

function readPeriod(input: string): { value?: string; end: number } {
  for (const [pattern, value] of PERIODS) {
    const match = pattern.exec(input);
    if (match) return { value, end: match[0].length };
  }

  return { end: 0 };
}

function compatibleCurrency(first: string | undefined, second: string | undefined): boolean {
  return Boolean(
    !second ||
      second === first ||
      (/^[A-Z]{3}$/.test(first ?? "") && second === "$"),
  );
}

function formatSalary(
  currency: string,
  figure: string,
  period: string | undefined,
): string {
  const prefix = /^[A-Z]{3}$/.test(currency)
    ? `${currency} ${figure}`
    : `${currency}${figure}`;

  return [prefix, period].filter(Boolean).join(" ");
}

function formatRange(currency: string, minimum: string, maximum: string): string {
  return /^[A-Z]{3}$/.test(currency)
    ? `${currency} ${minimum}–${maximum}`
    : `${currency}${minimum}–${currency}${maximum}`;
}

function parseSalaryValue(
  input: string,
  labelledPeriod: string | undefined,
): string | undefined {
  const first = readAmount(input, true);
  if (!first?.currency) return undefined;

  let rest = input.slice(first.end);
  const firstPeriod = readPeriod(rest);
  rest = rest.slice(firstPeriod.end);

  const connector = /^\s*(?:-|–|—|to)\s*/i.exec(rest);
  if (!connector) {
    if (
      labelledPeriod &&
      firstPeriod.value &&
      labelledPeriod !== firstPeriod.value
    ) {
      return undefined;
    }
    return formatSalary(first.currency, first.value, firstPeriod.value ?? labelledPeriod);
  }

  const second = readAmount(rest.slice(connector[0].length), false);
  if (!second || !compatibleCurrency(first.currency, second.currency)) return undefined;
  if (Number(second.value.replace(/,/g, "")) < Number(first.value.replace(/,/g, ""))) {
    return undefined;
  }

  const secondPeriod = readPeriod(
    rest.slice(connector[0].length + second.end),
  );
  if (
    firstPeriod.value &&
    secondPeriod.value &&
    firstPeriod.value !== secondPeriod.value
  ) {
    return undefined;
  }

  const period = secondPeriod.value ?? firstPeriod.value ?? labelledPeriod;
  if (
    labelledPeriod &&
    period &&
    labelledPeriod !== period
  ) {
    return undefined;
  }

  return [formatRange(first.currency, first.value, second.value), period]
    .filter(Boolean)
    .join(" ");
}

function collect(
  description: string,
  pattern: RegExp,
  priority: number,
  candidates: Array<{ value: string; priority: number }>,
): void {
  for (const match of description.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[0].length;
    const label = match[0].toLowerCase();
    const labelledPeriod = label.includes("annual")
      ? "per year"
      : label.includes("hourly")
        ? "per hour"
        : undefined;
    const value = parseSalaryValue(
      description.slice(start, start + 160),
      labelledPeriod,
    );
    if (!value) continue;

    candidates.push({
      value,
      priority: priority === 0 ? 0 : value.includes("–") ? 2 : priority,
    });
  }
}

/**
 * Parses one unambiguous, explicitly-labelled salary fact from a description.
 *
 * A labelled range is an overall compensation statement and takes precedence
 * over labelled single-value statements. That preserves a position-wide range
 * when a later table describes individual study years or classifications.
 */
export function parseExplicitSalary(
  description: string | undefined,
): ExplicitSalaryResult {
  if (!description) return { state: "absent" };

  const candidates: Array<{ value: string; priority: number }> = [];
  collect(description, RANGE_LABEL_PATTERN, 2, candidates);
  collect(description, SINGLE_LABEL_PATTERN, 1, candidates);
  collect(description, SUBORDINATE_RATE_PATTERN, 0, candidates);

  if (candidates.length === 0) return { state: "absent" };

  const priority = Math.max(...candidates.map((candidate) => candidate.priority));
  if (priority === 0) return { state: "absent" };
  const values = new Set(
    candidates
      .filter((candidate) => candidate.priority === priority)
      .map((candidate) => candidate.value),
  );
  if (values.size !== 1) return { state: "conflict" };

  const [value] = values;
  return value ? { state: "established", value } : { state: "absent" };
}
