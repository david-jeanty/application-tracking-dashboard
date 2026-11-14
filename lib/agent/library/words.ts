/**
 * The words the story ranking, the phrase matcher and the bold check compare:
 * a fixed stopword list, a crude stemmer and the posting words that have
 * close neighbours in David's stories. Pure, no I/O.
 */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "by",
  "with", "from", "as", "is", "are", "be", "will", "you", "your", "our", "we",
  "ability", "able", "experience", "skills", "skill", "strong", "excellent",
  "knowledge", "understanding", "proficiency", "proficient", "familiarity",
  "work", "working", "including", "etc", "plus", "preferred", "required",
  "years", "year", "related", "using", "use",
]);

/** A crude, fixed stemmer: enough to match "analyzing" with "analyzed". */
function stem(token: string): string {
  // "cross-functionally" should meet "cross-functional".
  if (token.length > 6 && token.endsWith("ally")) return token.slice(0, -2);
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
    .map(stem);
}

/**
 * Words a posting uses for work David's stories describe in other words
 * (decision record 0018). Keys and values are stems, as `tokenize` makes
 * them. Only true neighbours belong here: a synonym that turns a real gap
 * (forecasting, pricing, inventory) into a match would mislead the fit read.
 */
export const RELATED: Readonly<Record<string, readonly string[]>> = {
  collateral: ["content", "case", "studi", "video", "youtube", "title", "description"],
  catalog: ["content", "case", "studi", "video", "title", "description"],
  bulletin: ["content", "case", "studi", "video", "title", "description"],
  brochure: ["content", "case", "studi", "video", "title", "description"],
  promotional: ["content", "campaign", "outreach", "audience", "visibility"],
  campaign: ["outreach", "audience", "linkedin", "reddit", "visibility", "email", "hubspot"],
  marcomm: ["marketing", "content"],
  marketing: ["seo", "visibility", "audience", "content"],
  launch: ["launch", "launched"],
  metric: ["kpi", "dashboard", "track", "metric"],
  kpi: ["kpi", "dashboard", "metric"],
  process: ["triage", "workflow", "redesign", "backlog", "standard"],
  workflow: ["workflow", "triage", "automat"],
  improvement: ["reduc", "cut", "improv", "eliminat", "redesign"],
  roadmap: ["priorit", "requirement", "rescop"],
  customer: ["user", "interview", "feedback", "client"],
  user: ["user", "interview", "feedback"],
  stakeholder: ["stakeholder", "requirement", "director", "client"],
  engineer: ["engineer", "engineering"],
  engineering: ["engineer", "engineering"],
  requirement: ["requirement", "scope", "rescop"],
  detail: ["audit", "tracker", "timeline", "data", "quality"],
  organizational: ["tracker", "timeline", "deliverable", "event", "logistic"],
  communication: ["present", "document", "email", "call", "outreach"],
  analytic: ["dashboard", "data", "sql", "power", "kpi"],
  data: ["data", "record", "sql", "dashboard"],
  ai: ["ai", "claude", "llm", "mcp"],
  // Phrases a posting uses for leading and teamwork (decision record 0023).
  lead: ["led", "lead", "manag", "head"],
  led: ["lead", "led", "manag", "head"],
  group: ["team", "group"],
  team: ["group", "team"],
  cross: ["partner", "engineer", "design", "stakeholder"],
  functional: ["partner", "engineer", "design", "stakeholder"],
  manag: ["lead", "led", "manag"],
  collaborat: ["partner", "collaborat", "collaborate"],
  collaborate: ["partner", "collaborat", "collaborate"],
  // "worked cross-functionally": the stem of "worked" survives the stopwords.
  work: ["partner", "collaborat", "collaborate"],
};

/** True when a document word is the posting's word or one of its neighbours. */
export function relatedTo(postingToken: string, documentToken: string): boolean {
  return postingToken === documentToken || (RELATED[postingToken] ?? []).includes(documentToken);
}

