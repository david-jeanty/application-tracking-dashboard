/**
 * Reading a resume.lol base resume into a skeleton the builder can fill.
 *
 * resume.lol has no templates in its API: a "template" is one of David's own
 * resumes (markdown, CSS and @page settings). Each Interndex template points
 * at one base resume by id (`templates.resumelol_template_ref`), and
 * calibration stores the skeleton parsed here.
 *
 * The skeleton keeps everything Interndex must never change, verbatim: the
 * variable header (name, contact details, @REDACTED), every heading with its
 * employer, title, school, degree and dates, and the template's spacers and
 * skills format. A tailored resume only supplies bullets, skills lines, the
 * section order, which entries to leave out, and a mirrored role title. That
 * is how the "locked" rule in STANDARDS.md (employers, dates, degrees,
 * schools) is enforced in code rather than in a prompt.
 *
 * Pure functions, no I/O.
 *
 * The markdown shape this reads (both of David's bases follow it):
 *
 *   @VARIABLE lines, "# {NAME}", contact lines       the header
 *   ## Section                                       one section
 *   ### Role or school <span>dates</span>            one entry (or <h3 ...>)
 *   #### Employer <span>location</span>              more heading lines
 *   - bullet                                         the entry's bullets
 *   <div class="...spacer..."></div>                 between sections
 */

import { z } from "zod";

export type ResumeEntry = {
  /** Stable id within the template, used by tailored content. */
  key: string;
  section_key: string;
  /** The role, school or project name, as the heading states it. */
  title: string;
  /** The employer or degree line under the heading, when there is one. */
  org: string | null;
  /** Every heading line, verbatim, without the bullets. */
  heading: string;
  /** How many bullets the base had here. Entries with bullets must be filled or omitted. */
  base_bullet_count: number;
  /** Lines after the bullets that are not bullets, verbatim. */
  tail: string;
};

export type ResumeSection = {
  key: string;
  title: string;
  /** The "## Title" line, verbatim. */
  heading: string;
  /** Lines between the heading and the first entry, verbatim. */
  intro: string;
  entries: ResumeEntry[];
};

export type SkillsFormat = {
  section_key: string;
  /** html: <p><strong>Label:</strong> items</p>. markdown: **Label** | items. */
  style: "html" | "markdown";
  /** Lines before and after the skills lines (a wrapping div, for example). */
  before: string[];
  after: string[];
};

export type ResumeSkeleton = {
  /** Everything before the first section: variables, name and contact lines. */
  header: string;
  /** The spacer line placed between sections, or null when there is none. */
  separator: string | null;
  sections: ResumeSection[];
  skills: SkillsFormat | null;
};

/** Validates a skeleton read back from `templates.header_config`. */
export const resumeSkeletonSchema: z.ZodType<ResumeSkeleton> = z.object({
  header: z.string(),
  separator: z.string().nullable(),
  sections: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      heading: z.string(),
      intro: z.string(),
      entries: z.array(
        z.object({
          key: z.string(),
          section_key: z.string(),
          title: z.string(),
          org: z.string().nullable(),
          heading: z.string(),
          base_bullet_count: z.number().int().min(0),
          tail: z.string(),
        }),
      ),
    }),
  ),
  skills: z
    .object({
      section_key: z.string(),
      style: z.enum(["html", "markdown"]),
      before: z.array(z.string()),
      after: z.array(z.string()),
    })
    .nullable(),
});

export type ParseResult =
  | { ok: true; skeleton: ResumeSkeleton }
  | { ok: false; problems: string[] };

// ---------------------------------------------------------------- patterns --

const SECTION_LINE = /^##\s+\S/;
const ENTRY_LINE = /^(?:###\s+\S|<h3[\s>])/;
const BULLET_LINE = /^-\s+/;
const SPACER_LINE = /^<div class="[^"]*spacer[^"]*"><\/div>$/;
const NAME_HEADING = /^#\s+\S/m;
const REDACTED_LINE = /^@REDACTED=.*$/m;

export const SKILLS_HTML_LINE = /^<p><strong>(.+?):<\/strong>\s*(.*)<\/p>$/;
export const SKILLS_MARKDOWN_LINE = /^\*\*(.+?)\*\*\s*\|\s*(.*)$/;

/** Where a heading's title ends: a separator, a date, or "Expected". */
const TITLE_END =
  /\s\|\s|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b|\bExpected\b/;

// ---------------------------------------------------------------- helpers --

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

/** Folds accents away: "Société" becomes "Societe". */
export function asciiFold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function stripMarkup(text: string): string {
  return decodeEntities(
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|\*|__|_)(\S(?:.*?\S)?)\1/g, "$2"),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function slug(text: string): string {
  const base = asciiFold(decodeEntities(text))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base.length <= 60) return base || "item";
  const cut = base.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf("-") > 20 ? cut.lastIndexOf("-") : 60);
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = base;
  for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`;
  used.add(key);
  return key;
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function titleOf(headingLine: string): string {
  const text = stripMarkup(headingLine.replace(/^###\s+/, ""));
  const end = TITLE_END.exec(text);
  const title = (end ? text.slice(0, end.index) : text).replace(/[\s,;:|–-]+$/, "").trim();
  return title || text;
}

function orgOf(line: string): string | null {
  const beforeSpan = line.split(/<span\b/)[0].replace(/^#{1,6}\s+/, "");
  const text = stripMarkup(beforeSpan).replace(/[\s,;:|–-]+$/, "");
  return text || null;
}

/** Makes the header show real values: @REDACTED=false, always first line if added. */
export function forceRedactedFalse(header: string): string {
  if (REDACTED_LINE.test(header)) return header.replace(REDACTED_LINE, "@REDACTED=false");
  return `@REDACTED=false\n${header}`;
}

/** The real (public) value of the @NAME variable, or null. */
export function readNameVariable(header: string): string | null {
  const match = /^@NAME=([^|\n]*)/m.exec(header);
  const value = match?.[1].trim();
  return value ? value : null;
}

// ------------------------------------------------------------------ parse --

function parseEntries(
  sectionKey: string,
  bodyLines: string[],
  usedEntryKeys: Set<string>,
): { intro: string[]; entries: ResumeEntry[] } {
  const starts = bodyLines.flatMap((line, index) => (ENTRY_LINE.test(line) ? [index] : []));
  const intro = trimBlankEdges(bodyLines.slice(0, starts[0] ?? bodyLines.length));

  const entries = starts.map((start, position) => {
    const end = starts[position + 1] ?? bodyLines.length;
    const lines = bodyLines.slice(start, end);

    const firstBullet = lines.findIndex((line) => BULLET_LINE.test(line));
    const headingLines = trimBlankEdges(firstBullet === -1 ? lines : lines.slice(0, firstBullet));
    const rest = firstBullet === -1 ? [] : lines.slice(firstBullet);

    let bulletCount = 0;
    const tail: string[] = [];
    for (const line of rest) {
      if (BULLET_LINE.test(line)) bulletCount += 1;
      else if (/^\s+\S/.test(line) && tail.length === 0) continue; // a bullet's continuation
      else if (line.trim() || tail.length) tail.push(line);
    }

    const nonBlank = headingLines.filter((line) => line.trim());
    const title = titleOf(nonBlank[0]);
    return {
      key: uniqueKey(slug(title), usedEntryKeys),
      section_key: sectionKey,
      title,
      org: nonBlank[1] ? orgOf(nonBlank[1]) : null,
      heading: headingLines.join("\n"),
      base_bullet_count: bulletCount,
      tail: trimBlankEdges(tail).join("\n"),
    };
  });

  return { intro, entries };
}

function detectSkills(section: ResumeSection): SkillsFormat | null {
  if (section.entries.length) return null;
  const lines = section.intro.split("\n");
  for (const [style, pattern] of [
    ["html", SKILLS_HTML_LINE],
    ["markdown", SKILLS_MARKDOWN_LINE],
  ] as const) {
    const indexes = lines.flatMap((line, index) => (pattern.test(line.trim()) ? [index] : []));
    if (!indexes.length) continue;
    const first = indexes[0];
    const last = indexes[indexes.length - 1];
    return {
      section_key: section.key,
      style,
      before: trimBlankEdges(lines.slice(0, first)),
      after: trimBlankEdges(lines.slice(last + 1)),
    };
  }
  return null;
}

export function parseBaseResume(markdown: string): ParseResult {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const sectionStarts = lines.flatMap((line, index) => (SECTION_LINE.test(line) ? [index] : []));

  const problems: string[] = [];
  const headerLines = trimBlankEdges(lines.slice(0, sectionStarts[0] ?? lines.length));
  if (!NAME_HEADING.test(headerLines.join("\n"))) {
    problems.push('The base resume has no "# " name heading before its first section.');
  }
  if (!sectionStarts.length) problems.push('The base resume has no "## " sections.');
  if (problems.length) return { ok: false, problems };

  let separator: string | null = null;
  const usedSectionKeys = new Set<string>();
  const usedEntryKeys = new Set<string>();

  const sections: ResumeSection[] = sectionStarts.map((start, position) => {
    const end = sectionStarts[position + 1] ?? lines.length;
    const chunk = trimBlankEdges(lines.slice(start, end));
    // A spacer at the end of a section is the gap before the next one.
    while (chunk.length && SPACER_LINE.test(chunk[chunk.length - 1].trim())) {
      separator ??= chunk[chunk.length - 1].trim();
      chunk.pop();
      while (chunk.length && !chunk[chunk.length - 1].trim()) chunk.pop();
    }
    const heading = chunk[0];
    const title = stripMarkup(heading.replace(/^##\s+/, ""));
    const key = uniqueKey(slug(title), usedSectionKeys);
    const { intro, entries } = parseEntries(key, chunk.slice(1), usedEntryKeys);
    return { key, title, heading, intro: intro.join("\n"), entries };
  });

  const skillsSection =
    sections.find((section) => /skill/i.test(section.title) && detectSkills(section)) ??
    sections.find((section) => detectSkills(section));

  return {
    ok: true,
    skeleton: {
      header: forceRedactedFalse(headerLines.join("\n")),
      separator,
      sections,
      skills: skillsSection ? detectSkills(skillsSection) : null,
    },
  };
}
