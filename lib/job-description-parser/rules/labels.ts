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
    labelPattern("rate\\s*of\\s*pay"),
    labelPattern("wage"),
    labelPattern("hourly\\s*rate"),
  ],
} as const;

export type LabelKind = keyof typeof LABEL_RULES;

/** Returns the trimmed value following a recognized label, if any. */
export function matchLabel(line: string, kind: LabelKind): string | null {
  for (const pattern of LABEL_RULES[kind]) {
    const match = pattern.exec(line);
    const captured = match?.[1]?.trim();
    if (captured?.length) return captured;
  }
  return null;
}
