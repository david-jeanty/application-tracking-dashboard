/**
 * Tailored resume content, and rendering it onto a base resume's skeleton.
 *
 * This is what `tailored_resumes.content` holds and what the build sends to
 * resume.lol. The assistant supplies only what tailoring may change:
 *
 * - bullets for each entry (plain text; **bold** is allowed),
 * - which entries to leave out (`omit`),
 * - the section order (projects can outrank jobs),
 * - a mirrored role title, when David asks for one,
 * - the skills lines.
 *
 * Everything else comes verbatim from the base resume (see `skeleton.ts`).
 * Entries keep the base order inside a section, so reverse-chronological order
 * cannot be broken. An entry that had bullets in the base must be filled or
 * omitted on purpose, so nothing is dropped by accident.
 *
 * Pure functions, no I/O.
 */

import { z } from "zod";
import {
  asciiFold,
  decodeEntities,
  type ResumeEntry,
  type ResumeSkeleton,
} from "@/lib/agent/resume/skeleton";

const oneLine = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !/[\r\n]/.test(text), "Must be one line.");

const contentKey = z.string().trim().min(1).max(80);

export const tailoredContentSchema = z.object({
  section_order: z
    .array(contentKey)
    .max(12)
    .optional()
    .describe("Every section key of the template, in the order to show them. Omit to keep the base order."),
  entries: z
    .array(
      z.object({
        key: contentKey.describe("An entry key of the template."),
        bullets: z.array(oneLine(600)).max(6).default([]),
        omit: z.boolean().default(false).describe("Leave this entry off the resume."),
        mirrored_title: oneLine(200)
          .optional()
          .describe("Replaces the role title in the heading, only when David asks."),
      }),
    )
    .max(30),
  skills: z
    .array(z.object({ label: oneLine(60), items: oneLine(500) }))
    .max(10)
    .optional()
    .describe("Replaces the skills lines. Omit to keep the base skills."),
});

export type TailoredContent = z.infer<typeof tailoredContentSchema>;
/** Content as a caller writes it, before defaults (omit, bullets) are filled. */
export type TailoredContentInput = z.input<typeof tailoredContentSchema>;

export type RenderResult =
  | {
      ok: true;
      markdown: string;
      /** Every bullet as plain text, in page order. */
      bullets: string[];
      /** The first mirrored title, for `tailored_resumes.mirrored_title`. */
      mirrored_title: string | null;
    }
  | { ok: false; problems: string[] };

/** What a bullet reads as on the page: the text without bold markers. */
export function plainBulletText(text: string): string {
  return text.replace(/\*\*/g, "");
}

/** Escapes text placed into markdown that may sit inside HTML. */
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mirrorTitle(entry: ResumeEntry, mirrored: string): string | null {
  const [first, ...rest] = entry.heading.split("\n");
  const replacement = escapeText(mirrored);
  for (const form of [escapeText(entry.title), entry.title, decodeEntities(entry.title)]) {
    if (first.includes(form)) return [first.replace(form, replacement), ...rest].join("\n");
  }
  return null;
}

function renderSkills(
  skeleton: ResumeSkeleton,
  skills: NonNullable<TailoredContent["skills"]>,
): string {
  const format = skeleton.skills!;
  const lines = skills.map(({ label, items }) =>
    format.style === "html"
      ? `<p><strong>${escapeText(label)}:</strong> ${escapeText(items)}</p>`
      : `**${escapeText(label)}** | ${escapeText(items)}`,
  );
  const body = format.style === "html" ? lines.join("\n") : lines.join("\n\n");
  return [...format.before, body, ...format.after].join("\n");
}

export function renderTailoredResume(
  skeleton: ResumeSkeleton,
  content: TailoredContent,
): RenderResult {
  const problems: string[] = [];
  const allEntries = skeleton.sections.flatMap((section) => section.entries);
  const entryKeys = new Set(allEntries.map((entry) => entry.key));
  const sectionKeys = skeleton.sections.map((section) => section.key);

  const byKey = new Map<string, TailoredContent["entries"][number]>();
  for (const entry of content.entries) {
    if (!entryKeys.has(entry.key)) problems.push(`Unknown entry key "${entry.key}".`);
    else if (byKey.has(entry.key)) problems.push(`Entry "${entry.key}" appears twice.`);
    else byKey.set(entry.key, entry);
  }

  const missing = allEntries
    .filter((entry) => entry.base_bullet_count > 0 && !byKey.has(entry.key))
    .map((entry) => entry.key);
  if (missing.length) {
    problems.push(
      `Give bullets for these entries, or list them with omit: true: ${missing.join(", ")}.`,
    );
  }

  let order = sectionKeys;
  if (content.section_order) {
    const requested = content.section_order;
    const sameSet =
      requested.length === sectionKeys.length &&
      new Set(requested).size === requested.length &&
      requested.every((key) => sectionKeys.includes(key));
    if (sameSet) order = requested;
    else problems.push(`section_order must list each of these once: ${sectionKeys.join(", ")}.`);
  }

  if (content.skills && !skeleton.skills) {
    problems.push("This template has no skills lines Interndex can replace; leave skills out.");
  }

  const bullets: string[] = [];
  let mirroredTitle: string | null = null;
  const blocks: string[] = [];

  for (const key of order) {
    const section = skeleton.sections.find((candidate) => candidate.key === key)!;
    const kept = section.entries.filter((entry) => !byKey.get(entry.key)?.omit);
    if (section.entries.length && !kept.length) continue;

    const parts = [section.heading];
    if (content.skills && skeleton.skills?.section_key === section.key) {
      parts.push(renderSkills(skeleton, content.skills));
    } else if (section.intro) {
      parts.push(section.intro);
    }

    for (const entry of kept) {
      const tailored = byKey.get(entry.key);
      let heading = entry.heading;
      if (tailored?.mirrored_title) {
        const mirrored = mirrorTitle(entry, tailored.mirrored_title);
        if (mirrored === null) {
          problems.push(`Could not find the title of "${entry.key}" in its heading to mirror it.`);
        } else {
          heading = mirrored;
          mirroredTitle ??= tailored.mirrored_title;
        }
      }
      const entryBullets = tailored?.bullets ?? [];
      bullets.push(...entryBullets.map(plainBulletText));
      const entryParts = [heading];
      if (entryBullets.length) entryParts.push(entryBullets.map((text) => `- ${escapeText(text)}`).join("\n"));
      if (entry.tail) entryParts.push(entry.tail);
      parts.push(entryParts.join("\n\n"));
    }
    blocks.push(parts.join("\n\n"));
  }

  if (problems.length) return { ok: false, problems };

  const joiner = skeleton.separator ? `\n\n${skeleton.separator}\n\n` : "\n\n";
  return {
    ok: true,
    markdown: `${skeleton.header}\n\n${blocks.join(joiner)}\n`,
    bullets,
    mirrored_title: mirroredTitle,
  };
}

function words(text: string): string[] {
  return asciiFold(text).split(/[^A-Za-z0-9]+/).filter(Boolean);
}

/** `David_Jeanty_{Company}_{Role}`: the name comes from the base's @NAME. */
export function resumeNameFor(name: string | null, company: string, role: string): string {
  const parts = [
    words(name ?? "").join("_") || "Resume",
    words(company).join(""),
    words(role).join("_"),
  ].filter(Boolean);
  return parts.join("_").slice(0, 200);
}
