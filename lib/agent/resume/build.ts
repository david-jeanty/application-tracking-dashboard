/**
 * Building a tailored resume on resume.lol, checking it, and storing the PDF.
 *
 * Three jobs, each run with injected dependencies (resume.lol client, Chrome
 * renderer, database and storage) so every rule here is unit tested:
 *
 * - `calibrateTemplate`: reads the template's base resume (read-only),
 *   measures its real lines in Chrome, and saves the character targets and
 *   the skeleton the builder fills.
 * - `buildResume` (mode "build"): renders the stored content onto the
 *   skeleton, runs check_bullets, creates a NEW resume on resume.lol named
 *   `{Name}_{Company}_{Role}`, fetches its printable HTML once, renders it in
 *   Chrome, checks the layout, and stores the PDF and HTML privately.
 * - `buildResume` (mode "rebuild"): David's edits at apply time. Updates the
 *   resume Interndex made, in place, markdown only, and only if its content
 *   was not changed in resume.lol since the last build.
 *
 * Rules enforced here:
 *
 * - At most 2 builds per resume (also a database constraint). A build is
 *   reserved before resume.lol is called and released if resume.lol fails,
 *   so a failed call does not use one up.
 * - Every page passes check_bullets before anything is sent.
 * - If Chrome cannot render (memory, time, a font host down), the build still
 *   saves the resume and its HTML, keeps the character-count check result,
 *   and marks the layout check as skipped with the reason. Which path ran is
 *   logged and stored (decision record 0008).
 * - Base resumes are only ever read.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { deriveLineTargets } from "@/lib/agent/calibration";
import { checkBullets, lineFillCheck, type BulletIssue, type LineTargets } from "@/lib/agent/checks/bullets";
import type { LibraryStory } from "@/lib/agent/library/scoring";
import { phrasesFromRules } from "@/lib/agent/checks/text-rules";
import type { LedgerStatus, RunStep } from "@/lib/agent/ledger";
import {
  plainBulletText,
  renderTailoredResume,
  resumeNameFor,
  tailoredContentSchema,
  type TailoredContent,
} from "@/lib/agent/resume/content";
import {
  evaluateCharacterLines,
  evaluateLayout,
  fullLineLengths,
  type LayoutIssue,
} from "@/lib/agent/resume/layout";
import { allowsOneLine, bulletCountFor, type BulletOwner } from "@/lib/agent/resume/line-rules";
import { nextLineHeight, readLineHeight, setLineHeight } from "@/lib/agent/resume/line-height";
import {
  addBullet,
  bulletMinimums,
  cutBullet,
  pickNextBullet,
  pickWeakestBullet,
  type PageAdjustment,
} from "@/lib/agent/resume/page-fill";
import { resolveSkeleton, type ResumeSources } from "@/lib/agent/resume/library-entries";
import { countPdfPages } from "@/lib/agent/resume/pdf";
import type { ResumeRenderer } from "@/lib/agent/resume/render";
import {
  parseBaseResume,
  readNameVariable,
  resumeSkeletonSchema,
  type ResumeSkeleton,
} from "@/lib/agent/resume/skeleton";
import { editorUrlFor, ResumeLolError, type ResumeLolClient } from "@/lib/agent/resumelol/client";
import type { AgentRule, RuleScope, TemplateName, TemplateSectionSummary } from "@/lib/agent/types";

export const MAX_BUILDS = 2;

/**
 * Page-fill changes one build may make (add or cut a bullet, then re-render
 * on the same resume.lol resume). They do not count toward MAX_BUILDS.
 */
export const MAX_PAGE_ADJUSTMENTS = 3;

/** No new page-fill change starts after this long, so a build ends inside the MCP time limit. */
export const PAGE_ADJUST_BUDGET_MS = 50_000;

/** Line-height steps one build may try after adding or cutting bullets. */
export const MAX_LINE_HEIGHT_STEPS = 3;

/** Which resume.lol roles each template is for, until David changes them. */
export const DEFAULT_USE_FOR: Readonly<Record<TemplateName, readonly string[]>> = {
  zero2sudo: ["pm", "tpm", "data", "ai", "solutions"],
  jakes: ["consulting", "business"],
};

// ------------------------------------------------------------------ types --

/** What calibration stores in `templates.header_config`. */
export const templateLayoutSchema = z.object({
  version: z.literal(1),
  skeleton: resumeSkeletonSchema,
  css: z.string(),
  meta_css: z.string(),
  base_updated_at: z.string(),
});
export type TemplateLayout = z.infer<typeof templateLayoutSchema>;

export type BuildTemplate = {
  id: string;
  name: TemplateName;
  resumelol_template_ref: string | null;
  header_config: unknown;
  one_line_chars: number | null;
  two_line_min: number | null;
  two_line_max: number | null;
};

export type BuildRow = {
  id: string;
  application_id: string;
  company: string;
  title: string;
  status: string;
  build_count: number;
  content: unknown;
  resumelol_resume_id: string | null;
  resumelol_updated_at: string | null;
  built_markdown_sha256: string | null;
  /** The posting's requirements, for choosing what to add or cut. */
  requirements: string[];
  template: BuildTemplate;
};

export type LayoutCheck = "passed" | "failed" | "skipped";

export type LayoutReport = {
  path: "chromium" | "skipped";
  /** Where the headings came from: the library, or the base when the library is empty. */
  experience_source?: "library" | "base";
  /** On the fallback path: whether line rules were estimated from character counts. */
  line_check?: "characters" | "none";
  /** Empty space below the last line, as a share of the page height. */
  bottom_gap?: number | null;
  /** Bullets the build added or cut, and line-height steps, to fill one page. */
  page_adjustments?: PageAdjustment[];
  /** The bullet and paragraph line height the resume ended with. */
  line_height?: number;
  /** Why page filling stopped early, when it did. */
  adjust_stop?: string;
  reason?: string;
  detail?: string;
  pages?: number;
  pdf_pages?: number | null;
  page_fill?: number | null;
  failures?: LayoutIssue[];
  warnings?: LayoutIssue[];
  duration_ms?: number;
};

export type BuildPatch = {
  status?: "built" | "edited";
  content?: TailoredContent;
  mirrored_title?: string | null;
  resumelol_resume_id?: string;
  resumelol_url?: string;
  resumelol_updated_at?: string;
  built_markdown_sha256?: string;
  pdf_path?: string | null;
  html_path?: string | null;
  layout_check?: LayoutCheck;
  layout_report?: LayoutReport;
};

type DbError = { code?: string } | null;
type Read<T> = Promise<{ data: T | null; error: DbError }>;

/** The database and storage calls a build needs, bound to one user. */
export type BuildRepository = {
  readBuildRow: (tailoredResumeId: string) => Read<BuildRow>;
  /** Sets build_count to expected + 1 only if it is still `expected`. */
  reserveBuild: (tailoredResumeId: string, expected: number) => Read<{ reserved: boolean }>;
  /** Undoes a reservation when resume.lol failed. */
  releaseBuild: (tailoredResumeId: string, reservedCount: number) => Promise<{ error: DbError }>;
  saveBuild: (tailoredResumeId: string, applicationId: string, patch: BuildPatch) => Promise<{ error: DbError }>;
  uploadResumeFile: (path: string, bytes: Uint8Array, contentType: string) => Promise<{ error: DbError }>;
  readRules: (scopes: readonly RuleScope[]) => Read<AgentRule[]>;
  /** The story library, for adding a bullet when the page is short. */
  listLibrary: () => Read<LibraryStory[]>;
  /** The library's experiences and the fit-read profile: where headings come from. */
  readResumeSources: () => Read<ResumeSources>;
  writeLedger: (applicationId: string, step: RunStep, status: LedgerStatus) => Promise<{ error: DbError }>;
  insertEditExample: (row: {
    variant_id: string | null;
    before_text: string;
    after_text: string;
    note: string | null;
  }) => Promise<{ error: DbError }>;
  readTemplateForCalibration: (name: TemplateName) => Read<BuildTemplate>;
  saveCalibration: (
    name: TemplateName,
    values: {
      resumelol_template_ref: string;
      use_for?: readonly string[];
      header_config: TemplateLayout;
      targets: LineTargets;
    },
  ) => Promise<{ error: DbError }>;
};

export type BuildDependencies = {
  userId: string;
  repository: BuildRepository;
  resumeLol: ResumeLolClient;
  render: ResumeRenderer;
  /** One structured line per build: never content, never the key. */
  log: (event: Record<string, unknown>) => void;
};

export type Edit = { before_text: string; after_text: string; note?: string; variant_id?: string };

export type Failure = { ok: false; message: string };
export type Success<T> = { ok: true; value: T };

const fail = (message: string): Failure => ({ ok: false, message });
const dbFail = (what: string, error: DbError): Failure =>
  fail(`${what} failed. Database error ${error?.code ?? "unknown"}.`);

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function targetsOf(template: BuildTemplate): LineTargets | null {
  const { one_line_chars, two_line_min, two_line_max } = template;
  if (one_line_chars === null || two_line_min === null || two_line_max === null) return null;
  return { oneLineChars: one_line_chars, twoLineMin: two_line_min, twoLineMax: two_line_max };
}

function compactIssues(issues: readonly (BulletIssue & { index?: number })[], max = 8): string {
  return issues
    .slice(0, max)
    .map((issue) => issue.detail)
    .join(" ");
}

function resumeLolMessage(error: unknown): string {
  if (error instanceof ResumeLolError) return error.message;
  return "resume.lol could not be reached.";
}

export function readTemplateLayout(template: BuildTemplate): TemplateLayout | null {
  const parsed = templateLayoutSchema.safeParse(template.header_config);
  return parsed.success ? parsed.data : null;
}

/**
 * The skeleton a tailored resume is built on: the base resume's layout with
 * every heading taken from the library (decision record 0014). Logs when the
 * library is empty and the base resume's entries are used instead.
 */
export async function resolveTemplateSkeleton(
  repository: Pick<BuildRepository, "readResumeSources">,
  base: ResumeSkeleton,
  log?: (event: Record<string, unknown>) => void,
): Promise<Success<{ skeleton: ResumeSkeleton; source: "library" | "base"; notes: string[]; interests: string | null }> | Failure> {
  const sources = await repository.readResumeSources();
  if (sources.error || !sources.data) return dbFail("Reading the library", sources.error);
  const resolved = resolveSkeleton(base, sources.data);
  if (!resolved.ok) {
    return fail(`The resume headings must come from the library, and these do not: ${resolved.problems.slice(0, 6).join(" ")}`);
  }
  if (resolved.source === "base" || resolved.notes.length) {
    log?.({ event: "resume_experiences", source: resolved.source, notes: resolved.notes });
  }
  return {
    ok: true,
    value: {
      skeleton: resolved.skeleton,
      source: resolved.source,
      notes: resolved.notes,
      interests: sources.data.profile?.interests ?? null,
    },
  };
}

/** The entry keys a tailored resume can use, for the playbook and calibration. */
export function summarizeLayout(skeleton: ResumeSkeleton): TemplateSectionSummary[] {
  return skeleton.sections.map((section) => ({
    key: section.key,
    entries: section.entries.map((entry) => ({
      key: entry.key,
      title: entry.title,
      org: entry.org,
      needs_bullets: entry.base_bullet_count > 0,
      bullets: bulletCountFor(entry),
      ...(allowsOneLine(entry) ? { one_line_ok: true } : {}),
    })),
  }));
}

// ------------------------------------------------------------------ edits --

/**
 * Applies David's edits to stored content. An edit's before_text must be a
 * whole bullet, or appear in exactly one bullet or skills line.
 */
export function applyEdits(
  content: TailoredContent,
  edits: readonly Edit[],
): Success<{ content: TailoredContent; recorded: { before: string; after: string; edit: Edit }[] }> | Failure {
  const next: TailoredContent = structuredClone(content);
  const recorded: { before: string; after: string; edit: Edit }[] = [];
  const problems: string[] = [];

  edits.forEach((edit, index) => {
    const before = edit.before_text.trim();
    const after = edit.after_text.trim();
    type Spot = { get: () => string; set: (value: string) => void };
    const bulletSpots: Spot[] = next.entries.flatMap((entry) =>
      entry.bullets.map((_, bulletIndex) => ({
        get: () => entry.bullets[bulletIndex],
        set: (value: string) => {
          entry.bullets[bulletIndex] = value;
        },
      })),
    );
    const skillSpots: Spot[] = (next.skills ?? []).map((line) => ({
      get: () => line.items,
      set: (value: string) => {
        line.items = value;
      },
    }));

    const whole = bulletSpots.filter(
      (spot) => spot.get() === before || plainBulletText(spot.get()) === before,
    );
    if (whole.length === 1) {
      recorded.push({ before: whole[0].get(), after, edit });
      whole[0].set(after);
      return;
    }
    const partial = [...bulletSpots, ...skillSpots].filter((spot) => spot.get().includes(before));
    if (partial.length === 1) {
      const old = partial[0].get();
      const updated = old.replace(before, after);
      recorded.push({ before: old, after: updated, edit });
      partial[0].set(updated);
      return;
    }
    problems.push(
      partial.length === 0
        ? `Edit ${index}: "${before.slice(0, 60)}" is not on the resume.`
        : `Edit ${index}: "${before.slice(0, 60)}" appears in more than one place; quote more of the line.`,
    );
  });

  if (problems.length) return fail(`No edits were applied. ${problems.join(" ")}`);
  return { ok: true, value: { content: next, recorded } };
}

// ------------------------------------------------------------ calibration --

export type CalibrationResult = {
  template: TemplateName;
  base_resume_id: string;
  targets: { one_line_chars: number; two_line_min: number; two_line_max: number };
  lines_measured: number;
  sections: TemplateSectionSummary[];
};

export async function calibrateTemplate(
  deps: BuildDependencies,
  input: { template: TemplateName; base_resume_id?: string },
): Promise<Success<CalibrationResult> | Failure> {
  const existing = await deps.repository.readTemplateForCalibration(input.template);
  if (existing.error) return dbFail("Reading the template", existing.error);

  const baseId = input.base_resume_id ?? existing.data?.resumelol_template_ref ?? null;
  if (!baseId) {
    return fail(`No base resume is set for ${input.template}. Call again with base_resume_id.`);
  }

  let documents;
  let html;
  try {
    documents = await deps.resumeLol.getResume(baseId);
    html = await deps.resumeLol.getResumeHtml(baseId);
  } catch (error) {
    return fail(resumeLolMessage(error));
  }

  const parsed = parseBaseResume(documents.markdown);
  if (!parsed.ok) return fail(`The base resume cannot be used as a template. ${parsed.problems.join(" ")}`);

  const rendered = await deps.render(html, { withPdf: false });
  deps.log({
    event: "resume_calibration",
    template: input.template,
    path: rendered.ok ? "chromium" : "skipped",
    reason: rendered.ok ? undefined : rendered.reason,
    // Chrome's own first error line (paths, flags; never content or keys),
    // so a failure on the server can be diagnosed from the logs.
    detail: rendered.ok ? undefined : rendered.detail,
    duration_ms: rendered.durationMs,
  });
  if (!rendered.ok) {
    return fail(
      `Calibration measures the real page and Chrome could not render it (${rendered.reason}: ${rendered.detail}). Try again.`,
    );
  }

  const lengths = fullLineLengths(rendered.measurement);
  let targets: LineTargets;
  try {
    targets = deriveLineTargets(lengths);
  } catch (error) {
    return fail((error as Error).message);
  }

  const layout: TemplateLayout = {
    version: 1,
    skeleton: parsed.skeleton,
    css: documents.css,
    meta_css: documents.meta_css,
    base_updated_at: documents.updated_at,
  };
  const saved = await deps.repository.saveCalibration(input.template, {
    resumelol_template_ref: baseId,
    use_for: existing.data ? undefined : DEFAULT_USE_FOR[input.template],
    header_config: layout,
    targets,
  });
  if (saved.error) return dbFail("Saving the calibration", saved.error);
  const resolved = await resolveTemplateSkeleton(deps.repository, parsed.skeleton, deps.log);
  const resolvedSections = resolved.ok ? resolved.value.skeleton : parsed.skeleton;

  return {
    ok: true,
    value: {
      template: input.template,
      base_resume_id: baseId,
      targets: {
        one_line_chars: targets.oneLineChars,
        two_line_min: targets.twoLineMin,
        two_line_max: targets.twoLineMax,
      },
      lines_measured: lengths.length,
      sections: summarizeLayout(resolvedSections),
    },
  };
}

// ------------------------------------------------------------------ build --

export type BuildResult = {
  tailored_resume_id: string;
  application_id: string;
  resume_name: string;
  resumelol_url: string;
  builds_left: number;
  character_check: "passed" | "failures_kept";
  layout_check: LayoutCheck;
  layout_path: "chromium" | "skipped";
  skipped_reason?: string;
  pages?: number;
  layout_failures?: LayoutIssue[];
  layout_warnings?: LayoutIssue[];
  has_pdf: boolean;
  edits_recorded?: number;
};

export async function buildResume(
  deps: BuildDependencies,
  input: {
    tailored_resume_id: string;
    mode: "build" | "rebuild";
    edits?: readonly Edit[];
    keep_failing_edits?: boolean;
  },
): Promise<Success<BuildResult> | Failure> {
  const { repository } = deps;
  const startedAt = Date.now();

  const row = await repository.readBuildRow(input.tailored_resume_id);
  if (row.error) return dbFail("Reading the tailored resume", row.error);
  if (!row.data) return fail("No tailored resume with that id is in this tracker.");
  const resume = row.data;

  const layout = readTemplateLayout(resume.template);
  if (!layout || !resume.template.resumelol_template_ref) {
    return fail(`The ${resume.template.name} template is not calibrated yet. Call calibrate_template first.`);
  }

  const built = resume.resumelol_resume_id !== null;
  if (input.mode === "build" && built) {
    return fail("This resume is already built. Use rebuild_with_edits for changes.");
  }
  if (input.mode === "rebuild" && !built) {
    return fail("This resume has not been built yet. Use build_resume first.");
  }
  if (resume.build_count >= MAX_BUILDS) {
    return fail(`This resume has used both of its ${MAX_BUILDS} builds. No more builds are allowed.`);
  }

  const stored = tailoredContentSchema.safeParse(resume.content);
  if (!stored.success) return fail("The stored resume content is not valid. Save it again with complete_run.");
  let content = stored.data;

  let recordedEdits: { before: string; after: string; edit: Edit }[] = [];
  if (input.mode === "rebuild") {
    if (!input.edits?.length) return fail("Give at least one edit.");
    const applied = applyEdits(content, input.edits);
    if (!applied.ok) return applied;
    content = applied.value.content;
    recordedEdits = applied.value.recorded;
  }

  const resolved = await resolveTemplateSkeleton(repository, layout.skeleton, deps.log);
  if (!resolved.ok) return fail(`Not built. ${resolved.message}`);
  const skeleton = resolved.value.skeleton;

  const renderOptions = { interests: resolved.value.interests };
  const firstRender = renderTailoredResume(skeleton, content, renderOptions);
  if (!firstRender.ok) return fail(`The resume content does not fit the template. ${firstRender.problems.join(" ")}`);
  let rendered = firstRender;

  // Every page passes check_bullets before anything is sent.
  const rules = await repository.readRules(["bullets", "all"]);
  if (rules.error || !rules.data) return dbFail("Reading saved rules", rules.error);
  const oneLineAllowed = rendered.bullet_owners.map((owner) => allowsOneLine(owner));
  const targets = targetsOf(resume.template);
  const extraBlocked = phrasesFromRules(rules.data.map((rule) => rule.text));
  const check = checkBullets(rendered.bullets, { targets, oneLineAllowed, extraBlocked });
  const checkFailures = [...check.page.failures, ...check.bullets.flatMap((bullet) => bullet.failures)];
  const keepFailures = input.mode === "rebuild" && input.keep_failing_edits === true;
  if (!check.pass && !keepFailures) {
    return fail(
      `Not built: the page fails check_bullets. Fix these and try again. ${compactIssues(checkFailures)}`,
    );
  }

  // Reserve a build before calling resume.lol. The count is taken first, so
  // nothing the reservation changes can shift it.
  const buildsBefore = resume.build_count;
  const buildNumber = buildsBefore + 1;
  const reservation = await repository.reserveBuild(resume.id, buildsBefore);
  if (reservation.error) return dbFail("Reserving a build", reservation.error);
  if (!reservation.data?.reserved) return fail("Another build of this resume is running. Try again.");

  const release = async (message: string): Promise<Failure> => {
    await repository.releaseBuild(resume.id, buildNumber);
    await repository.writeLedger(resume.application_id, "build", "failed");
    return fail(message);
  };

  const name = resumeNameFor(readNameVariable(layout.skeleton.header), resume.company, resume.title);
  const markdownSha = sha256(rendered.markdown);
  let resumeId: string;
  let updatedAt: string;

  try {
    if (input.mode === "build") {
      const created = await deps.resumeLol.createResume({
        name,
        markdown: rendered.markdown,
        css: layout.css,
        meta_css: layout.meta_css,
      });
      resumeId = created.id;
      updatedAt = created.updated_at;
    } else {
      resumeId = resume.resumelol_resume_id!;
      const current = await deps.resumeLol.getResume(resumeId);
      if (resume.built_markdown_sha256 && sha256(current.markdown) !== resume.built_markdown_sha256) {
        return release(
          "The resume's content was changed in resume.lol after it was built, so Interndex did not overwrite it. Make the edit there, or undo the change in resume.lol and try again.",
        );
      }
      const updated = await deps.resumeLol.updateResumeMarkdown({
        resume_id: resumeId,
        markdown: rendered.markdown,
        expected_updated_at: current.updated_at,
      });
      updatedAt = updated.updated_at;
    }
  } catch (error) {
    if (error instanceof ResumeLolError && error.kind === "conflict") {
      return release("The resume changed in resume.lol during the rebuild. Nothing was overwritten. Try again.");
    }
    return release(`Not built. ${resumeLolMessage(error)} The build was not counted.`);
  }

  // Record the resume.lol id right away, so it is never lost.
  const early = await repository.saveBuild(resume.id, resume.application_id, {
    resumelol_resume_id: resumeId,
    resumelol_url: editorUrlFor(resumeId),
    resumelol_updated_at: updatedAt,
    built_markdown_sha256: markdownSha,
  });
  if (early.error) return dbFail("Recording the resume.lol resume", early.error);

  // Fetch the printable HTML, render, check. A page that is short or runs
  // over is adjusted from the library and rendered again, on the same
  // resume.lol resume, inside this build (decision record 0016).
  const folder = deps.userId;
  const htmlPath = `${folder}/${resume.id}.html`;
  const pdfPath = `${folder}/${resume.id}.pdf`;
  let report: LayoutReport = { path: "skipped", reason: "html_unavailable" };
  let layoutCheck: LayoutCheck = "skipped";
  let storedHtmlPath: string | null = null;
  let storedPdfPath: string | null = null;
  const adjustments: PageAdjustment[] = [];
  let lineHeight = readLineHeight(layout.css);
  let adjustStop: string | undefined;
  // What resume.lol holds now; recorded so a later rebuild can tell David's
  // own changes in resume.lol from Interndex's.
  let remoteMarkdown = rendered.markdown;

  const fetchHtml = async (): Promise<{ html: string } | { error: string }> => {
    try {
      return { html: await deps.resumeLol.getResumeHtml(resumeId) };
    } catch (error) {
      return { error: resumeLolMessage(error) };
    }
  };
  const measure = async (html: string, page: { bullets: string[]; bullet_owners: BulletOwner[] }) => {
    const outcome = await deps.render(html, { withPdf: true });
    if (!outcome.ok || !outcome.pdf) return { outcome, result: null, pdf: null, pdfPages: null };
    const pdfPages = countPdfPages(outcome.pdf);
    const result = evaluateLayout(outcome.measurement, page.bullets, {
      pdfPages,
      oneLineAllowed: page.bullet_owners.map((owner) => allowsOneLine(owner)),
    });
    return { outcome, result, pdf: outcome.pdf, pdfPages };
  };
  const writeRemote = async (markdown: string, css?: string): Promise<boolean> => {
    try {
      const updated = await deps.resumeLol.updateResumeMarkdown({
        resume_id: resumeId,
        markdown,
        expected_updated_at: updatedAt,
        ...(css === undefined ? {} : { css }),
      });
      updatedAt = updated.updated_at;
      remoteMarkdown = markdown;
      return true;
    } catch {
      return false;
    }
  };

  const first = await fetchHtml();
  if ("error" in first) {
    report = { path: "skipped", reason: "html_unavailable", detail: first.error };
  } else {
    type PageState = {
      content: TailoredContent;
      rendered: Extract<ReturnType<typeof renderTailoredResume>, { ok: true }>;
      html: string;
      measured: Awaited<ReturnType<typeof measure>>;
    };
    let state: PageState = { content, rendered, html: first.html, measured: await measure(first.html, rendered) };
    const keep = new Set(recordedEdits.map((recorded) => recorded.after));
    const entries = skeleton.sections.flatMap((section) => section.entries);
    let library: LibraryStory[] | null = null;

    for (let step = 0; step < MAX_PAGE_ADJUSTMENTS && state.measured.result; step += 1) {
      const failures = state.measured.result.failures;
      const overflow = failures.some((failure) => failure.rule === "one_page");
      const short = !overflow && failures.some((failure) => failure.rule === "page_not_full");
      if (!overflow && !short) break;
      if (Date.now() - startedAt > PAGE_ADJUST_BUDGET_MS) {
        adjustStop = "time_budget";
        break;
      }

      let nextContent: TailoredContent;
      let record: PageAdjustment;
      if (overflow) {
        if (library === null) {
          const listed = await repository.listLibrary();
          library = listed.data ?? [];
        }
        // Cut only above David's counts here; line height comes next.
        const weakest = pickWeakestBullet(state.content, resume.requirements, keep, bulletMinimums(entries, library));
        if (!weakest) {
          adjustStop = "at_minimum_counts";
          break;
        }
        nextContent = cutBullet(state.content, weakest.entry, weakest.index);
        record = { action: "cut", entry: weakest.entry, text: weakest.text };
      } else {
        if (library === null) {
          const listed = await repository.listLibrary();
          library = listed.data ?? [];
        }
        const current = state;
        const pick = pickNextBullet({
          content: current.content,
          pageBullets: current.rendered.bullets,
          entries,
          library,
          requirements: resume.requirements,
          template: resume.template.name,
          accepts: (entryKey, text) => {
            const trial = renderTailoredResume(skeleton, addBullet(current.content, entryKey, text), renderOptions);
            if (!trial.ok) return false;
            const trialCheck = checkBullets(trial.bullets, { targets: null, extraBlocked });
            if (!trialCheck.pass) return false;
            const entry = entries.find((candidate) => candidate.key === entryKey);
            return (
              !targets ||
              !entry ||
              lineFillCheck(plainBulletText(text).length, targets, { oneLineAllowed: allowsOneLine(entry) }) === null
            );
          },
        });
        if (!pick) {
          adjustStop = "no_library_bullet_fits";
          break;
        }
        nextContent = addBullet(current.content, pick.entry, pick.text);
        record = { action: "added", entry: pick.entry, text: pick.text, explain_note: pick.explain_note };
      }

      const nextRendered = renderTailoredResume(skeleton, nextContent, renderOptions);
      if (!nextRendered.ok) break;
      const previousMarkdown = state.rendered.markdown;
      if (!(await writeRemote(nextRendered.markdown))) {
        adjustStop = "resumelol_update_failed";
        break;
      }
      const fetched = await fetchHtml();
      const measured = "error" in fetched ? null : await measure(fetched.html, nextRendered);
      const ranOver = short && measured?.result?.failures.some((failure) => failure.rule === "one_page");
      if ("error" in fetched || !measured?.result || ranOver) {
        // Could not check the new page, or the addition ran over a page:
        // put the last checked page back and stop.
        adjustStop = ranOver ? "added_bullet_ran_over" : "recheck_failed";
        if (!(await writeRemote(previousMarkdown))) adjustStop = `${adjustStop}_and_revert_failed`;
        break;
      }
      state = { content: nextContent, rendered: nextRendered, html: fetched.html, measured };
      adjustments.push(record);
    }

    // Room left after the bullets: the interests line from David's profile
    // goes in, unless the run already chose it (decision record 0022).
    const shortNow = state.measured.result?.failures.some((failure) => failure.rule === "page_not_full");
    if (shortNow && !state.content.include_interests && resolved.value.interests && skeleton.skills) {
      const withInterests: TailoredContent = { ...state.content, include_interests: true };
      const interestsRendered = renderTailoredResume(skeleton, withInterests, renderOptions);
      if (interestsRendered.ok && (await writeRemote(interestsRendered.markdown))) {
        const fetched = await fetchHtml();
        const measured = "error" in fetched ? null : await measure(fetched.html, interestsRendered);
        const ranOver = measured?.result?.failures.some((failure) => failure.rule === "one_page");
        if ("error" in fetched || !measured?.result || ranOver) {
          await writeRemote(state.rendered.markdown);
        } else {
          state = { content: withInterests, rendered: interestsRendered, html: fetched.html, measured };
          adjustments.push({ action: "interests_added" });
        }
      }
    }

    // Last, close what is left with line height, as David does by hand
    // (decision record 0020). Only on a resume this build created: a
    // rebuild sends markdown alone, so design changes David made survive.
    if (input.mode === "build") {
      for (let step = 0; step < MAX_LINE_HEIGHT_STEPS && state.measured.result && state.measured.outcome.ok; step += 1) {
        const failures = state.measured.result.failures;
        const overflow = failures.some((failure) => failure.rule === "one_page");
        const short = !overflow && failures.some((failure) => failure.rule === "page_not_full");
        if (!overflow && !short) break;
        if (Date.now() - startedAt > PAGE_ADJUST_BUDGET_MS) {
          adjustStop = "time_budget";
          break;
        }
        const next = nextLineHeight(lineHeight, state.measured.outcome.measurement, overflow);
        if (next === null) {
          // Still over a page at the tightest line height: one page comes
          // first, so cut the weakest bullet even below David's counts.
          if (!overflow) break;
          const weakest = pickWeakestBullet(state.content, resume.requirements, keep);
          const cutContent = weakest ? cutBullet(state.content, weakest.entry, weakest.index) : null;
          const cutRendered = cutContent ? renderTailoredResume(skeleton, cutContent, renderOptions) : null;
          if (!weakest || !cutContent || !cutRendered?.ok) break;
          if (!(await writeRemote(cutRendered.markdown, setLineHeight(layout.css, lineHeight)))) break;
          const refetched = await fetchHtml();
          const remeasured = "error" in refetched ? null : await measure(refetched.html, cutRendered);
          if ("error" in refetched || !remeasured?.result) break;
          state = { content: cutContent, rendered: cutRendered, html: refetched.html, measured: remeasured };
          adjustments.push({ action: "cut", entry: weakest.entry, text: weakest.text });
          adjustStop = "cut_below_counts_to_fit_one_page";
          continue;
        }
        const css = setLineHeight(layout.css, next);
        if (!(await writeRemote(state.rendered.markdown, css))) break;
        const fetched = await fetchHtml();
        const measured = "error" in fetched ? null : await measure(fetched.html, state.rendered);
        const ranOver = short && measured?.result?.failures.some((failure) => failure.rule === "one_page");
        if ("error" in fetched || !measured?.result || ranOver) {
          await writeRemote(state.rendered.markdown, setLineHeight(layout.css, lineHeight));
          if (ranOver) adjustStop = "line_height_ran_over";
          break;
        }
        lineHeight = next;
        state = { ...state, html: fetched.html, measured };
        adjustments.push({ action: "line_height", value: next });
      }
    }

    content = state.content;
    rendered = state.rendered;

    const upload = await repository.uploadResumeFile(htmlPath, new TextEncoder().encode(state.html), "text/html");
    if (!upload.error) storedHtmlPath = htmlPath;

    const { outcome, result, pdf, pdfPages } = state.measured;
    if (result && pdf && outcome.ok) {
      layoutCheck = result.status;
      report = {
        path: "chromium",
        experience_source: resolved.value.source,
        pages: result.pages,
        pdf_pages: pdfPages,
        page_fill: outcome.measurement.page_fill,
        bottom_gap: outcome.measurement.bottom_gap ?? null,
        failures: result.failures,
        warnings: result.warnings,
        duration_ms: outcome.durationMs,
        line_height: lineHeight,
        ...(adjustments.length ? { page_adjustments: adjustments } : {}),
        ...(adjustStop ? { adjust_stop: adjustStop } : {}),
      };
      const pdfUpload = await repository.uploadResumeFile(pdfPath, pdf, "application/pdf");
      if (!pdfUpload.error) storedPdfPath = pdfPath;
    } else {
      report = outcome.ok
        ? { path: "skipped", reason: "render_failed", detail: "No PDF was produced." }
        : { path: "skipped", reason: outcome.reason, detail: outcome.detail, duration_ms: outcome.durationMs };
    }
  }
  if (report.path === "skipped") {
    // Chrome did not run, so the line rules are estimated from character
    // counts with the calibrated targets (decision record 0015).
    const estimated = targets
      ? evaluateCharacterLines(rendered.bullets, targets, rendered.bullet_owners.map((owner) => allowsOneLine(owner)))
      : [];
    report = {
      ...report,
      experience_source: resolved.value.source,
      line_check: targets ? "characters" : "none",
      ...(estimated.length ? { failures: estimated } : {}),
    };
  }
  deps.log({
    event: "resume_build",
    mode: input.mode,
    experience_source: resolved.value.source,
    build: buildNumber,
    path: report.path,
    reason: report.reason,
    detail: report.path === "skipped" ? report.detail : undefined,
    layout_check: layoutCheck,
    duration_ms: Date.now() - startedAt,
  });

  const saved = await repository.saveBuild(resume.id, resume.application_id, {
    status: input.mode === "build" ? "built" : "edited",
    content,
    mirrored_title: rendered.mirrored_title,
    built_markdown_sha256: sha256(remoteMarkdown),
    resumelol_updated_at: updatedAt,
    // A rebuild that could not render must not leave the old PDF looking current.
    pdf_path: storedPdfPath,
    html_path: storedHtmlPath,
    layout_check: layoutCheck,
    layout_report: report,
  });
  if (saved.error) return dbFail("Saving the build", saved.error);
  await repository.writeLedger(resume.application_id, "build", "done");

  for (const { before, after, edit } of recordedEdits) {
    await repository.insertEditExample({
      variant_id: edit.variant_id ?? null,
      before_text: before,
      after_text: after,
      note: edit.note ?? null,
    });
  }

  return {
    ok: true,
    value: {
      tailored_resume_id: resume.id,
      application_id: resume.application_id,
      resume_name: name,
      resumelol_url: editorUrlFor(resumeId),
      builds_left: MAX_BUILDS - buildNumber,
      character_check: check.pass ? "passed" : "failures_kept",
      layout_check: layoutCheck,
      layout_path: report.path,
      ...(report.path === "skipped" ? { skipped_reason: report.reason } : {}),
      ...(report.pages !== undefined ? { pages: report.pages } : {}),
      ...(report.failures?.length ? { layout_failures: report.failures.slice(0, 10) } : {}),
      ...(report.warnings?.length ? { layout_warnings: report.warnings.slice(0, 5) } : {}),
      has_pdf: storedPdfPath !== null,
      ...(recordedEdits.length ? { edits_recorded: recordedEdits.length } : {}),
    },
  };
}
