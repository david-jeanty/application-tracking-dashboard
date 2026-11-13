import { describe, expect, it } from "vitest";
import {
  applyEdits,
  buildResume,
  calibrateTemplate,
  sha256,
  type BuildDependencies,
  type BuildPatch,
  type BuildRepository,
  type BuildRow,
  type BuildTemplate,
  type TemplateLayout,
} from "@/lib/agent/resume/build";
import { tailoredContentSchema, type TailoredContent } from "@/lib/agent/resume/content";
import type { LayoutMeasurement } from "@/lib/agent/resume/layout";
import type { RenderOutcome } from "@/lib/agent/resume/render";
import { parseBaseResume } from "@/lib/agent/resume/skeleton";
import { ResumeLolError, type ResumeLolClient } from "@/lib/agent/resumelol/client";
import { ZERO2SUDO_BASE } from "./fixtures/resume-bases";

const USER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESUME_ID = "f0000000-0000-4000-8000-000000000001";
const APPLICATION_ID = "a0000000-0000-4000-8000-000000000001";
const BASE_ID = "base-zero2sudo";

const BULLET_A = "Reduced the open ticket backlog by 35% by redesigning service request triage.";
const BULLET_B = "Grew the tracker to 100 student sign-ups in its first month.";

function skeleton() {
  const parsed = parseBaseResume(ZERO2SUDO_BASE);
  if (!parsed.ok) throw new Error("fixture");
  return parsed.skeleton;
}

const LAYOUT: TemplateLayout = {
  version: 1,
  skeleton: skeleton(),
  css: "body { font-family: Tinos; }",
  meta_css: "@page { size: letter; margin: 0.45in; }",
  base_updated_at: "2026-11-07T17:53:21.612+00:00",
};

function content(bullets: string[] = [BULLET_A], project: string[] = [BULLET_B]): TailoredContent {
  return tailoredContentSchema.parse({
    entries: [
      { key: "information-management-analyst-intern", bullets },
      { key: "tracker-app", bullets: project },
    ],
    skills: [{ label: "Technical", items: "SQL, Power BI, Python" }],
  });
}

function goodMeasurement(texts: string[]): LayoutMeasurement {
  return {
    pages: 1,
    page_fill: 0.98,
    bullets: texts.map((text) => ({ text, lines: [{ text, fill: 0.95 }] })),
  };
}

/** A minimal one-page PDF, as Chrome writes page objects. */
const ONE_PAGE_PDF = new TextEncoder().encode("%PDF-1.4\n<< /Type /Pages /Count 1 >>\n<< /Type /Page >>\n%%EOF");

class Fakes {
  row: BuildRow;
  template: BuildTemplate;
  saved: BuildPatch[] = [];
  uploads: { path: string; contentType: string; bytes: number }[] = [];
  ledger: string[] = [];
  edits: { before_text: string; after_text: string }[] = [];
  calibrations: unknown[] = [];
  logs: Record<string, unknown>[] = [];
  resumeLolCalls: string[] = [];
  remote = { markdown: "", updated_at: "t0" };
  renderOutcome: (html: string) => RenderOutcome = () => ({
    ok: true,
    measurement: goodMeasurement([BULLET_A, BULLET_B]),
    pdf: ONE_PAGE_PDF,
    durationMs: 900,
  });
  createError: Error | null = null;
  updateError: Error | null = null;
  rules: string[] = [];

  constructor() {
    this.template = {
      id: "t-1",
      name: "zero2sudo",
      resumelol_template_ref: BASE_ID,
      header_config: LAYOUT,
      one_line_chars: null,
      two_line_min: null,
      two_line_max: null,
    };
    this.row = {
      id: RESUME_ID,
      application_id: APPLICATION_ID,
      company: "Pinterest",
      title: "Strategy & Operations Intern",
      status: "draft",
      build_count: 0,
      content: content(),
      resumelol_resume_id: null,
      resumelol_updated_at: null,
      built_markdown_sha256: null,
      template: this.template,
    };
  }

  repository: BuildRepository = {
    readBuildRow: async (id) => ({ data: id === this.row.id ? { ...this.row, template: this.template } : null, error: null }),
    reserveBuild: async (_id, expected) => {
      if (this.row.build_count !== expected) return { data: { reserved: false }, error: null };
      this.row.build_count = expected + 1;
      return { data: { reserved: true }, error: null };
    },
    releaseBuild: async (_id, reserved) => {
      if (this.row.build_count === reserved) this.row.build_count = reserved - 1;
      return { error: null };
    },
    saveBuild: async (_id, _applicationId, patch) => {
      this.saved.push(patch);
      if (patch.resumelol_resume_id) this.row.resumelol_resume_id = patch.resumelol_resume_id;
      if (patch.built_markdown_sha256) this.row.built_markdown_sha256 = patch.built_markdown_sha256;
      if (patch.content) this.row.content = patch.content;
      if (patch.status) this.row.status = patch.status;
      return { error: null };
    },
    uploadResumeFile: async (path, bytes, contentType) => {
      this.uploads.push({ path, contentType, bytes: bytes.length });
      return { error: null };
    },
    readRules: async () => ({ data: this.rules.map((text) => ({ scope: "bullets" as const, text })), error: null }),
    writeLedger: async (_applicationId, step, status) => {
      this.ledger.push(`${step}:${status}`);
      return { error: null };
    },
    insertEditExample: async (row) => {
      this.edits.push({ before_text: row.before_text, after_text: row.after_text });
      return { error: null };
    },
    readTemplateForCalibration: async () => ({ data: this.template, error: null }),
    saveCalibration: async (name, values) => {
      this.calibrations.push({ name, ...values });
      return { error: null };
    },
  };

  resumeLol: ResumeLolClient = {
    getResume: async (id) => {
      this.resumeLolCalls.push(`get_resume:${id}`);
      if (id === BASE_ID) {
        return { id, name: "Base", markdown: ZERO2SUDO_BASE, css: LAYOUT.css, meta_css: LAYOUT.meta_css, updated_at: "b1" };
      }
      return { id, name: "Built", markdown: this.remote.markdown, css: "", meta_css: "", updated_at: this.remote.updated_at };
    },
    getResumeHtml: async (id) => {
      this.resumeLolCalls.push(`get_resume_html:${id}`);
      return "<html>printable</html>";
    },
    createResume: async (input) => {
      this.resumeLolCalls.push(`create_resume:${input.name}`);
      if (this.createError) throw this.createError;
      this.remote = { markdown: input.markdown, updated_at: "t1" };
      return { id: "rl-new-1", updated_at: "t1" };
    },
    updateResumeMarkdown: async (input) => {
      this.resumeLolCalls.push(`update_resume:${input.resume_id}:${input.expected_updated_at}`);
      if (this.updateError) throw this.updateError;
      this.remote = { markdown: input.markdown, updated_at: "t2" };
      return { updated_at: "t2" };
    },
  };

  deps(): BuildDependencies {
    return {
      userId: USER,
      repository: this.repository,
      resumeLol: this.resumeLol,
      render: async (html) => this.renderOutcome(html),
      log: (event) => this.logs.push(event),
    };
  }
}

const build = (fakes: Fakes) => buildResume(fakes.deps(), { tailored_resume_id: RESUME_ID, mode: "build" });

describe("calibrateTemplate", () => {
  it("measures the base resume read-only and saves targets and the skeleton", async () => {
    const fakes = new Fakes();
    const lines = Array.from({ length: 6 }, (_, index) => ({
      text: "x",
      lines: [{ text: "a".repeat(130 + index), fill: 1 }, { text: "b", fill: 0.9 }],
    }));
    fakes.renderOutcome = () => ({ ok: true, measurement: { pages: 1, page_fill: 1, bullets: lines }, pdf: null, durationMs: 5 });

    const result = await calibrateTemplate(fakes.deps(), { template: "zero2sudo", base_resume_id: BASE_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.targets).toEqual({ one_line_chars: 130, two_line_min: 236, two_line_max: 260 });
    expect(result.value.lines_measured).toBe(6);
    expect(result.value.sections.flatMap((section) => section.entries.map((entry) => entry.key))).toContain("tracker-app");
    expect(fakes.resumeLolCalls).toEqual([`get_resume:${BASE_ID}`, `get_resume_html:${BASE_ID}`]);
    expect(fakes.calibrations).toHaveLength(1);
    expect(fakes.calibrations[0]).toMatchObject({ name: "zero2sudo", resumelol_template_ref: BASE_ID });
  });

  it("needs a base resume id the first time", async () => {
    const fakes = new Fakes();
    fakes.template = { ...fakes.template, resumelol_template_ref: null };
    const result = await calibrateTemplate(fakes.deps(), { template: "zero2sudo" });
    expect(result).toMatchObject({ ok: false });
    expect(fakes.resumeLolCalls).toHaveLength(0);
  });

  it("saves nothing when Chrome cannot measure the page", async () => {
    const fakes = new Fakes();
    fakes.renderOutcome = () => ({ ok: false, reason: "launch_failed", detail: "no chrome", durationMs: 1 });
    const result = await calibrateTemplate(fakes.deps(), { template: "zero2sudo" });
    expect(result.ok).toBe(false);
    expect(fakes.calibrations).toHaveLength(0);
    expect(fakes.logs[0]).toMatchObject({ event: "resume_calibration", path: "skipped", reason: "launch_failed" });
  });
});

describe("buildResume", () => {
  it("creates a new resume, renders it once, checks it, and stores the PDF and HTML", async () => {
    const fakes = new Fakes();
    const result = await build(fakes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(fakes.resumeLolCalls).toEqual([
      "create_resume:Sam_Example_Pinterest_Strategy_Operations_Intern",
      "get_resume_html:rl-new-1",
    ]);
    expect(fakes.remote.markdown.startsWith("@REDACTED=false\n@NAME=Sam Example||Hidden Name")).toBe(true);
    expect(fakes.uploads).toEqual([
      { path: `${USER}/${RESUME_ID}.html`, contentType: "text/html", bytes: 22 },
      { path: `${USER}/${RESUME_ID}.pdf`, contentType: "application/pdf", bytes: ONE_PAGE_PDF.length },
    ]);
    expect(result.value).toMatchObject({
      resumelol_url: "https://www.resume.lol/editor/rl-new-1",
      builds_left: 1,
      character_check: "passed",
      layout_check: "passed",
      layout_path: "chromium",
      pages: 1,
      has_pdf: true,
    });
    const final = fakes.saved[fakes.saved.length - 1];
    expect(final).toMatchObject({
      status: "built",
      layout_check: "passed",
      pdf_path: `${USER}/${RESUME_ID}.pdf`,
      html_path: `${USER}/${RESUME_ID}.html`,
    });
    expect(fakes.saved[0].built_markdown_sha256).toBe(sha256(fakes.remote.markdown));
    expect(fakes.row.build_count).toBe(1);
    expect(fakes.ledger).toEqual(["build:done"]);
    expect(fakes.logs).toEqual([
      expect.objectContaining({ event: "resume_build", mode: "build", path: "chromium", layout_check: "passed" }),
    ]);
  });

  it("falls back when Chrome fails: saves the resume and HTML, marks the layout check skipped", async () => {
    const fakes = new Fakes();
    fakes.renderOutcome = () => ({ ok: false, reason: "timeout", detail: "Rendering took longer than 45 seconds.", durationMs: 45_000 });
    const result = await build(fakes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      character_check: "passed",
      layout_check: "skipped",
      layout_path: "skipped",
      skipped_reason: "timeout",
      has_pdf: false,
      builds_left: 1,
    });
    expect(fakes.uploads.map((upload) => upload.contentType)).toEqual(["text/html"]);
    expect(fakes.saved[fakes.saved.length - 1]).toMatchObject({
      status: "built",
      layout_check: "skipped",
      layout_report: { path: "skipped", reason: "timeout" },
      pdf_path: null,
    });
    expect(fakes.logs[0]).toMatchObject({ path: "skipped", reason: "timeout" });
  });

  it("reports a page that fails the layout check, and still keeps the build", async () => {
    const fakes = new Fakes();
    fakes.renderOutcome = () => ({
      ok: true,
      measurement: {
        pages: 2,
        page_fill: 1,
        bullets: [
          { text: BULLET_A, lines: [{ text: "a", fill: 1 }, { text: "b", fill: 0.4 }] },
          { text: BULLET_B, lines: [{ text: BULLET_B, fill: 0.95 }] },
        ],
      },
      pdf: ONE_PAGE_PDF,
      durationMs: 800,
    });
    const result = await build(fakes);
    expect(result.ok && result.value.layout_check).toBe("failed");
    expect(result.ok && result.value.layout_failures?.map((failure) => failure.rule)).toEqual(["one_page", "widow"]);
  });

  it("refuses a page that fails check_bullets, before calling resume.lol", async () => {
    const fakes = new Fakes();
    fakes.row.content = content(["Helped reduce the backlog."]);
    const result = await build(fakes);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain("check_bullets");
    expect(fakes.resumeLolCalls).toHaveLength(0);
    expect(fakes.row.build_count).toBe(0);
  });

  it("applies the template's calibrated line targets to the page", async () => {
    const fakes = new Fakes();
    fakes.template = { ...fakes.template, one_line_chars: 130, two_line_min: 236, two_line_max: 260 };
    const result = await build(fakes);
    expect(!result.ok && result.message).toContain("Short single line");
  });

  it("applies saved rules to the check", async () => {
    const fakes = new Fakes();
    fakes.rules = ['Never use "tracker"'];
    const result = await build(fakes);
    expect(result.ok).toBe(false);
  });

  it("does not count a build when resume.lol fails", async () => {
    const fakes = new Fakes();
    fakes.createError = new ResumeLolError("http", "resume.lol answered HTTP 500.");
    const result = await build(fakes);
    expect(!result.ok && result.message).toContain("not counted");
    expect(fakes.row.build_count).toBe(0);
    expect(fakes.ledger).toEqual(["build:failed"]);
  });

  it("refuses a second build_resume and anything past the 2-build cap, with no calls", async () => {
    const built = new Fakes();
    built.row.resumelol_resume_id = "rl-1";
    built.row.build_count = 1;
    expect((await build(built)).ok).toBe(false);

    const capped = new Fakes();
    capped.row.resumelol_resume_id = "rl-1";
    capped.row.build_count = 2;
    const result = await buildResume(capped.deps(), {
      tailored_resume_id: RESUME_ID,
      mode: "rebuild",
      edits: [{ before_text: BULLET_A, after_text: "Cut the backlog by 35%." }],
    });
    expect(!result.ok && result.message).toContain("both of its 2 builds");
    expect([...built.resumeLolCalls, ...capped.resumeLolCalls]).toHaveLength(0);
  });

  it("counts builds from the number read before reserving, even if the row object changes", async () => {
    const fakes = new Fakes();
    // A repository that hands back its own row, which reserveBuild then changes.
    fakes.repository.readBuildRow = async () => {
      fakes.row.template = fakes.template;
      return { data: fakes.row, error: null };
    };
    const result = await build(fakes);
    expect(result.ok && result.value.builds_left).toBe(1);
  });

  it("refuses when the template is not calibrated", async () => {
    const fakes = new Fakes();
    fakes.template = { ...fakes.template, header_config: {} };
    expect(await build(fakes)).toMatchObject({ ok: false });
  });
});

describe("buildResume in rebuild mode", () => {
  async function builtFakes() {
    const fakes = new Fakes();
    const first = await build(fakes);
    if (!first.ok) throw new Error(first.message);
    fakes.resumeLolCalls = [];
    fakes.saved = [];
    fakes.uploads = [];
    fakes.logs = [];
    return fakes;
  }

  const rebuild = (fakes: Fakes, edits: { before_text: string; after_text: string }[], keep = false) =>
    buildResume(fakes.deps(), { tailored_resume_id: RESUME_ID, mode: "rebuild", edits, keep_failing_edits: keep });

  it("updates the same resume in place, markdown only, and records each edit", async () => {
    const fakes = await builtFakes();
    const edited = "Reduced the open ticket backlog by 40% by redesigning service request triage.";
    fakes.renderOutcome = () => ({ ok: true, measurement: goodMeasurement([edited, BULLET_B]), pdf: ONE_PAGE_PDF, durationMs: 700 });
    const result = await rebuild(fakes, [{ before_text: BULLET_A, after_text: edited }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fakes.resumeLolCalls).toEqual(["get_resume:rl-new-1", "update_resume:rl-new-1:t1", "get_resume_html:rl-new-1"]);
    expect(fakes.remote.markdown).toContain(edited);
    expect(result.value).toMatchObject({ builds_left: 0, layout_check: "passed", edits_recorded: 1 });
    expect(fakes.edits).toEqual([{ before_text: BULLET_A, after_text: edited }]);
    expect(fakes.row.status).toBe("edited");
    expect((fakes.row.content as TailoredContent).entries[0].bullets).toEqual([edited]);
  });

  it("never overwrites content David changed in resume.lol", async () => {
    const fakes = await builtFakes();
    fakes.remote.markdown += "\n- A line David added in the editor.";
    const result = await rebuild(fakes, [{ before_text: "35%", after_text: "40%" }]);
    expect(!result.ok && result.message).toContain("changed in resume.lol");
    expect(fakes.resumeLolCalls).toEqual(["get_resume:rl-new-1"]);
    expect(fakes.row.build_count).toBe(1);
  });

  it("treats a conflict from resume.lol as nothing overwritten, and uncounted", async () => {
    const fakes = await builtFakes();
    fakes.updateError = new ResumeLolError("conflict", "conflict");
    const result = await rebuild(fakes, [{ before_text: "35%", after_text: "40%" }]);
    expect(!result.ok && result.message).toContain("Nothing was overwritten");
    expect(fakes.row.build_count).toBe(1);
  });

  it("clears the stored PDF when the rebuild could not render", async () => {
    const fakes = await builtFakes();
    fakes.renderOutcome = () => ({ ok: false, reason: "launch_failed", detail: "x", durationMs: 1 });
    const result = await rebuild(fakes, [{ before_text: "35%", after_text: "40%" }]);
    expect(result.ok && result.value.layout_check).toBe("skipped");
    expect(fakes.saved[fakes.saved.length - 1]).toMatchObject({ pdf_path: null, layout_check: "skipped" });
  });

  it("holds an edit that breaks a rule unless David keeps it on purpose", async () => {
    const fakes = await builtFakes();
    const held = await rebuild(fakes, [{ before_text: "Reduced", after_text: "Helped reduce" }]);
    expect(held.ok).toBe(false);
    expect(fakes.resumeLolCalls).toHaveLength(0);

    const kept = await rebuild(fakes, [{ before_text: "Reduced", after_text: "Helped reduce" }], true);
    expect(kept.ok && kept.value.character_check).toBe("failures_kept");
  });
});

describe("applyEdits", () => {
  it("replaces a whole bullet, a phrase inside one, or a skills phrase", () => {
    const result = applyEdits(content([BULLET_A, "Cut weekly summaries by automating reports."]), [
      { before_text: BULLET_B, after_text: "Grew the tracker to 120 sign-ups." },
      { before_text: "weekly", after_text: "monthly" },
      { before_text: "Power BI", after_text: "Tableau" },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content.entries[0].bullets[1]).toBe("Cut monthly summaries by automating reports.");
    expect(result.value.content.entries[1].bullets[0]).toBe("Grew the tracker to 120 sign-ups.");
    expect(result.value.content.skills?.[0].items).toBe("SQL, Tableau, Python");
    expect(result.value.recorded[1]).toMatchObject({
      before: "Cut weekly summaries by automating reports.",
      after: "Cut monthly summaries by automating reports.",
    });
  });

  it("matches a bullet as David sees it, without bold markers", () => {
    const result = applyEdits(content(["Cut the **backlog** by 35%."]), [
      { before_text: "Cut the backlog by 35%.", after_text: "Cut the backlog by 40%." },
    ]);
    expect(result.ok && result.value.content.entries[0].bullets[0]).toBe("Cut the backlog by 40%.");
  });

  it("refuses an edit that is missing or ambiguous, and applies none", () => {
    expect(applyEdits(content(), [{ before_text: "not there", after_text: "x" }]).ok).toBe(false);
    const ambiguous = applyEdits(content(["Reduced costs by 10% by renegotiating.", "Reduced churn by 5% by renegotiating."]), [
      { before_text: "renegotiating", after_text: "rebidding" },
    ]);
    expect(!ambiguous.ok && ambiguous.message).toContain("more than one place");
  });
});
