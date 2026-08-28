/**
 * Turns the HTML a posting uses for its description into readable plain text.
 *
 * Job descriptions in `schema.org` markup are routinely HTML fragments, and
 * Interndex stores a plain-text description. The conversion happens here, on the
 * student's machine, before anything is sent anywhere.
 *
 * It is written as string handling rather than as DOM work on purpose. Nothing
 * in this file parses, builds, or evaluates markup: no `innerHTML`, no
 * `DOMParser`, no element is ever constructed from posting content, so there is
 * no arrangement of page input that causes something to run. That also leaves
 * the function pure and context-free — it behaves identically in the popup, in
 * a test, and in a service worker that has no DOM at all.
 *
 * The result is only ever written to the page with `textContent` or sent as a
 * JSON string, so a decoded entity that happens to spell out a tag stays what
 * it is: characters.
 */

/**
 * Block-level markup becomes a line break, so lists and paragraphs survive.
 *
 * A whole run of adjacent block tags collapses to one break rather than one
 * each: `</li><li>` is a single boundary between two bullets, and treating it
 * as two would put a blank line between every item in every list.
 */
const BLOCK_TAG_PATTERN =
  /(?:\s*<\/?(?:p|div|section|article|header|footer|ul|ol|li|br|hr|h[1-6]|tr|td|th|table|thead|tbody|blockquote|pre)\b[^>]*>\s*)+/gi;

/** Elements whose contents are not prose and must not become description text. */
const NON_PROSE_PATTERN =
  /<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi;

const REMAINING_TAG_PATTERN = /<[^>]*>/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#")) {
        const digits = entity.slice(1);
        const codePoint = digits.startsWith("x") || digits.startsWith("X")
          ? Number.parseInt(digits.slice(1), 16)
          : Number.parseInt(digits, 10);

        if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
          return match;
        }
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }

      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** Whether a value looks like markup rather than text already. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z!/][^>]*>/i.test(value);
}

/**
 * Converts posting description markup to the plain text Interndex stores.
 *
 * Plain text passes through unchanged apart from whitespace tidying, so a
 * posting that already supplies text is not damaged by pretending it is HTML.
 */
export function htmlToPlainText(value: string): string {
  const withoutNonProse = value.replace(NON_PROSE_PATTERN, " ");
  const withLineBreaks = withoutNonProse.replace(BLOCK_TAG_PATTERN, "\n");
  const withoutTags = withLineBreaks.replace(REMAINING_TAG_PATTERN, "");

  return normalizeWhitespace(decodeEntities(withoutTags));
}

/**
 * Collapses runs of spaces and blank lines without joining separate lines.
 *
 * Bullet lists are the reason line structure is kept at all: a description
 * flattened into one paragraph is technically the same words and materially
 * harder to read later.
 */
export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
