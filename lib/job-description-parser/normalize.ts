import type { NormalizedDocument, NormalizedLine } from "@/lib/job-description-parser/types";

/** Bullet glyphs that survive copy-paste from job boards and PDFs. */
const BULLET_PATTERN = /^[\s•‣▪●◦·*\-–—]+/;

/**
 * Normalizes width, quotes, and dashes so downstream rules can match plain
 * ASCII. Dashes are preserved as-is because salary ranges depend on them.
 */
function normalizeGlyphs(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...");
}

/**
 * A line reads as a heading when it is short, lacks terminal punctuation, and
 * is either title-case, all-caps, or ends in a colon. Headings are strong
 * negative evidence for titles and useful section anchors elsewhere.
 */
function isHeadingLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.length || trimmed.length > 60) return false;
  if (/[.!?]$/.test(trimmed)) return false;

  const words = trimmed.split(/\s+/);
  if (words.length > 7) return false;
  if (trimmed.endsWith(":")) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;

  return words.every((word) => /^[^a-z]/.test(word) || word.length <= 3);
}

export function normalizeDocument(text: string): NormalizedDocument {
  const originalText = text;
  const normalizedText = normalizeGlyphs(text);

  const lines: NormalizedLine[] = [];
  for (const rawLine of normalizedText.split("\n")) {
    // Strip bullets for matching but keep the original for evidence display.
    const original = rawLine.replace(BULLET_PATTERN, "").replace(/\s+/g, " ").trim();
    if (!original.length) continue;

    lines.push({
      index: lines.length,
      original,
      normalized: original.toLowerCase(),
      isHeadingLike: isHeadingLike(original),
    });
  }

  return { originalText, normalizedText, lines };
}
