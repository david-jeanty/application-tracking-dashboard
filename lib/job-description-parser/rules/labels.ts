/**
 * Explicit `Label: value` lines are the strongest signal in a posting, so these
 * patterns score far above any heuristic. Each captures the value after the
 * separator, which may be a colon, an en dash, or a hyphen.
 */
const SEPARATOR = "\\s*[:\\-–—]\\s*";

const labelPattern = (label: string) =>
  new RegExp(`^${label}${SEPARATOR}(.+)$`, "i");

export const LABEL_RULES = {
  title: [
    labelPattern("job\\s*title"),
    labelPattern("position\\s*title"),
    labelPattern("position"),
    labelPattern("role"),
    labelPattern("titre\\s*du\\s*poste"),
  ],
  company: [
    labelPattern("company\\s*name"),
    labelPattern("company"),
    labelPattern("employer"),
    labelPattern("organization"),
    labelPattern("organisation"),
    labelPattern("entreprise"),
  ],
  deadline: [
    labelPattern("application\\s*deadline"),
    labelPattern("closing\\s*date"),
    labelPattern("apply\\s*by"),
    labelPattern("applications?\\s*close"),
    labelPattern("deadline\\s*to\\s*apply"),
    labelPattern("deadline"),
    labelPattern("expires?"),
    labelPattern("date\\s*limite"),
  ],
  location: [
    labelPattern("locations?"),
    labelPattern("job\\s*locations?"),
    labelPattern("work\\s*locations?"),
    labelPattern("city"),
    labelPattern("lieu"),
  ],
  workArrangement: [
    labelPattern("work\\s*arrangement"),
    labelPattern("work\\s*model"),
    labelPattern("work\\s*setting"),
    labelPattern("remote\\s*status"),
  ],
  workTerm: [
    labelPattern("work\\s*term"),
    labelPattern("term"),
    labelPattern("season"),
    labelPattern("start\\s*date"),
  ],
  duration: [
    labelPattern("duration"),
    labelPattern("length\\s*of\\s*term"),
    labelPattern("term\\s*length"),
    labelPattern("contract\\s*length"),
    labelPattern("dur[ée]e"),
  ],
  salary: [
    labelPattern("salary"),
    labelPattern("compensation"),
    labelPattern("pay\\s*rate"),
    labelPattern("pay\\s*details"),
    labelPattern("rate\\s*of\\s*pay"),
    labelPattern("wage"),
    labelPattern("hourly\\s*rate"),
    labelPattern("(?:pay|salary|hiring|compensation)\\s*range"),
    labelPattern("range"),
  ],
} as const;

export type LabelKind = keyof typeof LABEL_RULES;

/**
 * Labels that carry employment metadata, never a job title. A line such as
 * "Type: Student Full Time" reads exactly like a title to a scoring heuristic —
 * short, title-case, and carrying the role word "Student" — so these have to be
 * rejected by name rather than by shape.
 */
const METADATA_LABELS = [
  "type",
  "employment\\s*type",
  "employment\\s*status",
  "job\\s*type",
  "position\\s*type",
  "schedule",
  "work\\s*schedule",
  "status",
  "category",
  "job\\s*category",
  "job\\s*family",
  "job\\s*function",
  "pay\\s*type",
  "vacanc(?:y|ies)",
  "work\\s*hours",
  "hours\\s*per\\s*week",
  "number\\s*of\\s*positions",
  "job\\s*(?:id|reference|req(?:uisition)?)",
].map((label) => new RegExp(`^${label}${SEPARATOR}`, "i"));

/** True when a line states employment metadata rather than the role itself. */
export function isMetadataLabelLine(line: string): boolean {
  return METADATA_LABELS.some((pattern) => pattern.test(line.trim()));
}

/** Every label kind that states a field other than the job title. */
const NON_TITLE_LABEL_KINDS = (
  Object.keys(LABEL_RULES) as LabelKind[]
).filter((kind) => kind !== "title");

/**
 * True when a line states some *other* field — "Duration: Fall (September -
 * December 2026)", "Range: $18.50 - $28.50", "Location: Toronto (Onsite)".
 *
 * Such a line already has an owner, so no other extractor should compete for
 * it. Title extraction in particular is vulnerable: these lines are short and
 * title-case, which is most of what its heuristic looks for.
 */
export function isFieldLabelLine(line: string): boolean {
  if (isMetadataLabelLine(line)) return true;
  return NON_TITLE_LABEL_KINDS.some((kind) =>
    LABEL_RULES[kind].some((pattern) => pattern.test(line.trim())),
  );
}

/** Returns the trimmed value following a recognized label, if any. */
export function matchLabel(line: string, kind: LabelKind): string | null {
  for (const pattern of LABEL_RULES[kind]) {
    const match = pattern.exec(line);
    const captured = match?.[1]?.trim();
    if (captured?.length) return captured;
  }
  return null;
}
