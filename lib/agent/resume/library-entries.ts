/**
 * Resume headings from the story library, in the base resume's format.
 *
 * David's rule (decision record 0014): employers, titles, dates, locations
 * and schools on a built resume come from the story library, never from the
 * base resume. The base resume supplies only the layout: its CSS, the
 * variable header (@NAME and friends), the section order, and how a heading
 * is written in that template (which line holds the dates, whether dates
 * read "Sep 2026 - Dec 2026" or "Sep. 2026 – Dec. 2026", where the location
 * sits).
 *
 * `resolveSkeleton` takes the skeleton parsed from the base resume and
 * returns one whose entries are the library's experiences (and the school
 * from the fit-read profile), each heading written in the format of the base
 * entry it matches, or of the first entry in its section. Every rebuilt
 * heading is read back with the same parser and compared to the library, so
 * a heading that still carries a base employer, title or date is rejected
 * instead of built.
 *
 * When the library has no experiences yet, the base resume's entries are
 * used as they are and the caller logs it.
 *
 * Pure functions, no I/O.
 */

import type { AgentProfile } from "@/lib/agent/types";
import {
  asciiFold,
  decodeEntities,
  orgOf,
  slug,
  stripMarkup,
  titleOf,
  uniqueKey,
  type ResumeEntry,
  type ResumeSection,
  type ResumeSkeleton,
} from "@/lib/agent/resume/skeleton";

export const LIBRARY_SECTIONS = ["experience", "projects", "leadership"] as const;
export type LibrarySection = (typeof LIBRARY_SECTIONS)[number];
export type SectionKind = LibrarySection | "education";

/** One row of `experiences`, as the builder needs it. Dates are YYYY-MM or YYYY-MM-DD. */
export type LibraryExperience = {
  org: string;
  official_title: string;
  start: string;
  end: string | null;
  location: string | null;
  sort_order: number;
  section: LibrarySection | null;
};

export type ResumeSources = {
  experiences: readonly LibraryExperience[];
  profile: AgentProfile | null;
};

export type ResolvedSkeleton =
  | {
      ok: true;
      skeleton: ResumeSkeleton;
      /** "base" only when the library has no experiences yet. */
      source: "library" | "base";
      /** Things worth a log line: library_empty, education_from_base, skipped entries. */
      notes: string[];
    }
  | { ok: false; problems: string[] };

// ----------------------------------------------------------------- dates --

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_YEAR = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{4}";
/** A date or date range as a resume heading writes it. */
const DATE_TEXT = new RegExp(
  `(?:Expected\\s+)?${MONTH_YEAR}(?:\\s*[\\u2013\\u2014-]\\s*(?:${MONTH_YEAR}|Present|Current))?`,
  "g",
);

const YEAR = /\b(?:19|20)\d{2}\b/g;

export type DateStyle ={ separator: string; dot: boolean; expected: boolean };

const DEFAULT_DATE_STYLE: DateStyle = { separator: " - ", dot: false, expected: false };

export function detectDateStyle(dates: string | null): DateStyle {
  if (!dates) return DEFAULT_DATE_STYLE;
  const separator = /\s*[–—-]\s*/.exec(dates.replace(/^Expected\s+/, ""))?.[0];
  return {
    // Never write an em dash, even when a base resume uses one.
    separator: (separator ?? DEFAULT_DATE_STYLE.separator).replace("—", "–"),
    dot: /\b[A-Z][a-z]{2,3}\.\s/.test(dates),
    expected: /^Expected\b/.test(dates),
  };
}

function formatMonth(date: string, dot: boolean): string {
  const [year, month] = date.split("-");
  const name = MONTHS[Number(month) - 1];
  return `${name}${dot && name !== "May" ? "." : ""} ${year}`;
}

/** Formats library dates in a base heading's style. Null when a needed date is missing. */
export function formatDates(
  start: string | null,
  end: string | null,
  style: DateStyle,
): string | null {
  if (style.expected) return end ? `Expected ${formatMonth(end, style.dot)}` : null;
  if (!start) return null;
  return `${formatMonth(start, style.dot)}${style.separator}${end ? formatMonth(end, style.dot) : "Present"}`;
}

function lastDateIn(line: string): string | null {
  const matches = line.match(DATE_TEXT);
  return matches ? matches[matches.length - 1] : null;
}

// --------------------------------------------------------------- headings --

export function sectionKindOf(title: string): SectionKind | null {
  const text = title.toLowerCase();
  if (/educat|academic/.test(text)) return "education";
  if (/project/.test(text)) return "projects";
  if (/leader|involve|activit|volunteer|extracurricular|community/.test(text)) return "leadership";
  if (/experience|employment|work|professional|internship/.test(text)) return "experience";
  return null;
}

/** What a heading says, read the same way for base and rebuilt headings. */
export type HeadingFields = {
  /** Role or school; for projects, the project name. */
  title: string;
  /** Employer or degree; for projects, the role after the name. */
  org: string | null;
  dates: string | null;
  location: string | null;
};

function headingLines(heading: string): { lines: string[]; first: number; second: number | null } {
  const lines = heading.split("\n");
  const nonBlank = lines.flatMap((line, index) => (line.trim() ? [index] : []));
  return { lines, first: nonBlank[0] ?? 0, second: nonBlank[1] ?? null };
}

function locationOf(line: string): string | null {
  const inLastSpan = /<span[^>]*>([^<]*)<\/span>\s*$/.exec(line);
  if (inLastSpan && inLastSpan[1].trim()) return decodeEntities(inLastSpan[1]).trim();
  const afterSpan = /<\/span>\s*([^<]+?)\s*$/.exec(line);
  return afterSpan ? decodeEntities(afterSpan[1]).trim() : null;
}

function projectRole(firstLine: string): string | null {
  const segments = stripMarkup(firstLine.replace(/^###\s+/, "")).split(" | ");
  if (segments.length < 2) return null;
  const role = segments[1].replace(DATE_TEXT, "").trim();
  return role || null;
}

export function readHeading(entry: ResumeEntry, kind: SectionKind): HeadingFields {
  const { lines, first, second } = headingLines(entry.heading);
  const firstLine = lines[first] ?? "";
  // Read from the heading itself, never from entry.title, so a rebuilt
  // heading is checked on what it really says.
  const title = firstLine ? titleOf(firstLine) : entry.title;
  if (kind === "projects") {
    return { title, org: projectRole(firstLine), dates: lastDateIn(firstLine), location: null };
  }
  const orgLine = second === null ? null : lines[second];
  return {
    title,
    org: orgLine === null ? null : orgOf(orgLine),
    dates: lastDateIn(firstLine),
    location: orgLine === null ? null : locationOf(orgLine),
  };
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replaces the first (or last) appearance of `old` in a line, in any of its written forms. */
function replaceIn(line: string, old: string, next: string, which: "first" | "last"): string | null {
  for (const form of [escapeText(old), old, decodeEntities(old)]) {
    const at = which === "first" ? line.indexOf(form) : line.lastIndexOf(form);
    if (at !== -1) return `${line.slice(0, at)}${escapeText(next)}${line.slice(at + form.length)}`;
  }
  return null;
}

function normalize(text: string | null): string {
  return asciiFold(decodeEntities(text ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function contains(a: string, b: string): boolean {
  if (!a || !b) return false;
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

// ------------------------------------------------------------ rebuilding --

type Target = {
  /** Shown in the title slot (role, school, or project name). */
  title: string;
  /** Shown in the org slot (employer, degree, or project role). */
  org: string;
  dates: string | null;
  location: string | null;
};

/**
 * Writes a heading for `target` in the format of `pattern`. Returns the new
 * heading, or a problem when a field of the pattern could not be found.
 */
function rewriteHeading(
  pattern: ResumeEntry,
  kind: SectionKind,
  target: Target,
  options: { keepExtraLines: boolean },
): { heading: string } | { problem: string } {
  const fields = readHeading(pattern, kind);
  const { lines, first, second } = headingLines(pattern.heading);
  // A heading copied from another entry keeps only its title and employer
  // lines: anything after them (a project link, say) belongs to that entry.
  const lastKept = kind === "projects" || second === null ? first : second;
  const out = options.keepExtraLines ? [...lines] : lines.slice(0, lastKept + 1);
  const label = target.title;

  let line: string | null = out[first];
  line = replaceIn(line, fields.title, target.title, "first");
  if (line === null) return { problem: `Could not place the title of "${label}" in the base resume's heading format.` };
  if (kind === "projects") {
    if (fields.org) line = replaceIn(line, fields.org, target.org, "first");
    if (line === null) return { problem: `Could not place the role of "${label}" in the base resume's heading format.` };
  }
  if (fields.dates) {
    if (target.dates === null) return { problem: `"${label}" has no dates in the library for this heading format.` };
    line = replaceIn(line, fields.dates, target.dates, "last");
    if (line === null) return { problem: `Could not place the dates of "${label}".` };
  }
  out[first] = line;

  if (kind !== "projects" && second !== null && second < out.length) {
    let orgLine: string | null = out[second];
    if (fields.org) {
      orgLine = replaceIn(orgLine, fields.org, target.org, "first");
      if (orgLine === null) return { problem: `Could not place the employer of "${label}".` };
    }
    if (fields.location) {
      orgLine = replaceIn(orgLine, fields.location, target.location ?? "", "last");
      if (orgLine === null) return { problem: `Could not place the location of "${label}".` };
    }
    out[second] = orgLine;
  }
  return { heading: out.join("\n") };
}

/**
 * Reads a rebuilt heading back and compares it with the library. Any field
 * that does not match means a base value survived: the heading is rejected.
 */
function verifyHeading(entry: ResumeEntry, kind: SectionKind, target: Target, hasOrgLine: boolean): string[] {
  const fields = readHeading(entry, kind);
  const problems: string[] = [];
  const label = `"${target.title}"`;
  if (normalize(fields.title) !== normalize(target.title)) {
    problems.push(`The heading for ${label} shows "${fields.title}", which is not the library's title.`);
  }
  if ((kind === "projects" || hasOrgLine) && fields.org !== null && normalize(fields.org) !== normalize(target.org)) {
    problems.push(`The heading for ${label} shows "${fields.org}", which is not the library's employer.`);
  }
  if (fields.dates !== null && fields.dates !== target.dates) {
    problems.push(`The heading for ${label} shows "${fields.dates}", which are not the library's dates.`);
  }
  if (fields.location !== null && target.location !== null && normalize(fields.location) !== normalize(target.location)) {
    problems.push(`The heading for ${label} shows "${fields.location}", which is not the library's location.`);
  }
  // A base date in a form the parser does not know ("Summer 2026") would
  // survive the rewrite. Any year the library did not supply is rejected.
  const { lines, first, second } = headingLines(entry.heading);
  const shown = stripMarkup([lines[first], second === null ? "" : lines[second]].join(" "));
  const allowed = new Set(
    [target.dates, target.title, target.org, target.location].join(" ").match(YEAR) ?? [],
  );
  for (const year of shown.match(YEAR) ?? []) {
    if (!allowed.has(year)) {
      problems.push(`The heading for ${label} shows the year ${year}, which is not in the library.`);
      break;
    }
  }
  return problems;
}

function sortReverseChronological(experiences: LibraryExperience[]): LibraryExperience[] {
  return [...experiences].sort(
    (a, b) =>
      b.start.localeCompare(a.start) ||
      (b.end ?? "9999").localeCompare(a.end ?? "9999") ||
      a.sort_order - b.sort_order,
  );
}

/** How well a base entry stands for a library experience: 0 means not at all. */
function matchScore(entry: ResumeEntry, kind: SectionKind, experience: LibraryExperience): number {
  const libOrg = normalize(experience.org);
  const libTitle = normalize(experience.official_title);
  if (kind === "projects") {
    return contains(normalize(entry.title), libOrg) ? 2 : 0;
  }
  const orgHit = contains(normalize(entry.org), libOrg) ? 1 : 0;
  const titleHit = contains(normalize(entry.title), libTitle) ? 2 : 0;
  return orgHit + titleHit;
}

function patternFor(section: ResumeSection, kind: SectionKind): ResumeEntry | null {
  if (kind === "projects") return section.entries[0] ?? null;
  return section.entries.find((entry) => entry.org !== null) ?? section.entries[0] ?? null;
}

export function resolveSkeleton(base: ResumeSkeleton, sources: ResumeSources): ResolvedSkeleton {
  if (sources.experiences.length === 0) {
    return { ok: true, skeleton: base, source: "base", notes: ["library_empty"] };
  }

  const problems: string[] = [];
  const notes: string[] = [];
  const usedKeys = new Set<string>();
  const allBaseEntries = base.sections.flatMap((section) =>
    section.entries.map((entry) => ({ entry, kind: sectionKindOf(section.title) })),
  );

  // Which section each experience goes in: its own, else where the base has it.
  const kindOf = (experience: LibraryExperience): LibrarySection => {
    if (experience.section) return experience.section;
    let best: { kind: SectionKind | null; score: number } = { kind: null, score: 0 };
    for (const { entry, kind } of allBaseEntries) {
      if (!kind || kind === "education") continue;
      const score = matchScore(entry, kind, experience);
      if (score > best.score) best = { kind, score };
    }
    return (best.kind as LibrarySection | null) ?? "experience";
  };
  const byKind = new Map<LibrarySection, LibraryExperience[]>();
  for (const experience of sources.experiences) {
    const kind = kindOf(experience);
    byKind.set(kind, [...(byKind.get(kind) ?? []), experience]);
  }
  const placed = new Set<LibrarySection>();

  const sections: ResumeSection[] = [];
  for (const section of base.sections) {
    const kind = sectionKindOf(section.title);

    if (kind === null) {
      // Skills, summary and the like have no entries to rebuild. A section
      // with entries the library cannot account for is left off.
      if (section.entries.length === 0) sections.push(section);
      else notes.push(`dropped_section:${section.key}`);
      continue;
    }

    if (kind === "education") {
      const profile = sources.profile;
      const pattern = section.entries[0];
      if (!pattern || !profile?.school) {
        sections.push(section);
        if (pattern) notes.push("education_from_base");
        continue;
      }
      const style = detectDateStyle(readHeading(pattern, "education").dates);
      const target: Target = {
        title: profile.school,
        org: [profile.degree_level, profile.program].filter(Boolean).join(", "),
        dates: formatDates(profile.study_start, profile.expected_graduation, style),
        location: profile.school_location,
      };
      const rewritten = rewriteHeading(pattern, "education", target, { keepExtraLines: true });
      if ("problem" in rewritten) {
        problems.push(`${rewritten.problem} Add it to the fit-read profile.`);
        continue;
      }
      const entry: ResumeEntry = {
        ...pattern,
        key: uniqueKey(slug(profile.school), usedKeys),
        title: profile.school,
        org: target.org || null,
        heading: rewritten.heading,
        base_bullet_count: 0,
      };
      problems.push(...verifyHeading(entry, "education", target, entry.org !== null));
      sections.push({ ...section, entries: [entry] });
      continue;
    }

    if (placed.has(kind)) {
      notes.push(`dropped_section:${section.key}`);
      continue;
    }
    placed.add(kind);
    const experiences = sortReverseChronological(byKind.get(kind) ?? []);
    if (experiences.length === 0) {
      notes.push(`empty_section:${section.key}`);
      continue;
    }
    const fallbackPattern = patternFor(section, kind);
    if (!fallbackPattern) {
      problems.push(`The base resume's ${section.title} section has no entry to copy the heading format from.`);
      continue;
    }

    const claimed = new Set<ResumeEntry>();
    const entries: ResumeEntry[] = [];
    for (const experience of experiences) {
      let match: ResumeEntry | null = null;
      let bestScore = 0;
      for (const candidate of section.entries) {
        if (claimed.has(candidate)) continue;
        const score = matchScore(candidate, kind, experience);
        if (score > bestScore) {
          bestScore = score;
          match = candidate;
        }
      }
      if (match) claimed.add(match);
      const pattern = match ?? fallbackPattern;
      const style = detectDateStyle(readHeading(pattern, kind).dates);
      const isProject = kind === "projects";
      const target: Target = {
        title: isProject ? experience.org : experience.official_title,
        org: isProject ? experience.official_title : experience.org,
        dates: formatDates(experience.start, experience.end, style),
        location: experience.location,
      };
      const rewritten = rewriteHeading(pattern, kind, target, { keepExtraLines: match !== null });
      if ("problem" in rewritten) {
        problems.push(rewritten.problem);
        continue;
      }
      const entry: ResumeEntry = {
        key: uniqueKey(slug(target.title), usedKeys),
        section_key: section.key,
        title: target.title,
        org: isProject ? null : experience.org,
        heading: rewritten.heading,
        // Every library entry must be listed in the content: with bullets,
        // with none (heading only), or with omit: true.
        base_bullet_count: 1,
        tail: match?.tail ?? "",
      };
      const hasOrgLine = headingLines(rewritten.heading).second !== null;
      problems.push(...verifyHeading(entry, kind, target, hasOrgLine));
      entries.push(entry);
    }
    sections.push({ ...section, entries });
  }

  for (const kind of LIBRARY_SECTIONS) {
    if (byKind.has(kind) && !placed.has(kind)) {
      notes.push(`no_${kind}_section_in_base`);
    }
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, skeleton: { ...base, sections }, source: "library", notes };
}
