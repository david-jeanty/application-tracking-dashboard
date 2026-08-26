/**
 * Finds the `schema.org` JobPosting nodes a page publishes about itself.
 *
 * Structured data is the one place a job page states its own facts in a form
 * meant to be read by software, which is why it is the extension's first and
 * strongly preferred source. Everything below is defensive: a page is untrusted
 * input, publishers emit every shape the specification allows and several it
 * does not, and a malformed block on one part of a page must never cost the
 * student the good block further down.
 */

export type JsonLdNode = Record<string, unknown>;

/** How deep `@graph`/array nesting is followed before giving up. */
const MAXIMUM_DEPTH = 6;

/** A ceiling on discovered nodes, so a pathological page cannot spin here. */
const MAXIMUM_NODES = 500;

function isRecord(value: unknown): value is JsonLdNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a node declares itself a JobPosting.
 *
 * `@type` is a string in most postings and an array in a fair number of them,
 * and the specification permits both. It is also sometimes a full IRI such as
 * `http://schema.org/JobPosting`, so the comparison looks at the final segment.
 */
export function isJobPosting(node: JsonLdNode): boolean {
  const declared = node["@type"];
  const types = Array.isArray(declared) ? declared : [declared];

  return types.some(
    (type) =>
      typeof type === "string" &&
      type.split(/[/#]/).pop()?.toLowerCase() === "jobposting",
  );
}

/**
 * Flattens one parsed JSON-LD value into the nodes it contains.
 *
 * Handles the shapes real pages use: a single object, a top-level array of
 * objects, an `@graph` container, and any of those nested inside each other.
 */
function flatten(value: unknown, depth: number, into: JsonLdNode[]): void {
  if (depth > MAXIMUM_DEPTH || into.length >= MAXIMUM_NODES) return;

  if (Array.isArray(value)) {
    for (const entry of value) flatten(entry, depth + 1, into);
    return;
  }

  if (!isRecord(value)) return;

  into.push(value);

  const graph = value["@graph"];
  if (graph !== undefined) flatten(graph, depth + 1, into);
}

/**
 * Every JobPosting node across every `ld+json` block on the page.
 *
 * A block that is not valid JSON is skipped rather than fatal: pages routinely
 * ship one broken block beside several good ones, and the student's capture
 * should not fail because of markup they cannot see or fix.
 */
export function findJobPostings(blocks: readonly string[]): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];

  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    flatten(parsed, 0, nodes);
  }

  return nodes.filter(isJobPosting);
}

/** The first string among a value, an array of values, or nothing usable. */
export function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstString(entry);
      if (found) return found;
    }
  }

  return undefined;
}

/** The first object among a value or an array of values. */
export function firstRecord(value: unknown): JsonLdNode | undefined {
  if (isRecord(value)) return value;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = firstRecord(entry);
      if (found) return found;
    }
  }

  return undefined;
}
