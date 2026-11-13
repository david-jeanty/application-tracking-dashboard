import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { byteLength, TOOL_RESULT_CAPS } from "@/lib/agent/caps";
import type { BuildRow, TemplateLayout } from "@/lib/agent/resume/build";
import { tailoredContentSchema } from "@/lib/agent/resume/content";
import { parseBaseResume } from "@/lib/agent/resume/skeleton";
import { connect, FakeAgentStore, json, OWNER, STRANGER, type ListedTool } from "./agent-mcp-harness";
import { ZERO2SUDO_BASE } from "./fixtures/resume-bases";

const RESUME_ID = "f0000000-0000-4000-8000-0000000000aa";
const APPLICATION_ID = "a0000000-0000-4000-8000-0000000000aa";
const BASE_ID = "base-z2s";

const BULLET_A = "Reduced the open ticket backlog by 35% by redesigning service request triage.";
const BULLET_B = "Grew the tracker to 100 student sign-ups in its first month.";

function layout(): TemplateLayout {
  const parsed = parseBaseResume(ZERO2SUDO_BASE);
  if (!parsed.ok) throw new Error("fixture");
  return { version: 1, skeleton: parsed.skeleton, css: "", meta_css: "", base_updated_at: "b1" };
}

const originalOwner = process.env.OWNER_USER_ID;
let store: FakeAgentStore;
let client: Awaited<ReturnType<typeof connect>>;

beforeEach(async () => {
  process.env.OWNER_USER_ID = OWNER;
  store = new FakeAgentStore();
  const template = {
    id: "t-z2s",
    name: "zero2sudo" as const,
    use_for: ["pm"],
    one_line_chars: null,
    two_line_min: null,
    two_line_max: null,
    calibrated_at: "2026-11-13T00:00:00Z",
    resumelol_template_ref: BASE_ID,
    header_config: layout(),
  };
  store.templates = [template];
  const row: BuildRow = {
    id: RESUME_ID,
    application_id: APPLICATION_ID,
    company: "Pinterest",
    title: "Strategy & Operations Intern",
    status: "draft",
    build_count: 0,
    content: tailoredContentSchema.parse({
      entries: [
        { key: "information-management-analyst-intern", bullets: [BULLET_A] },
        { key: "tracker-app", bullets: [BULLET_B] },
      ],
    }),
    resumelol_resume_id: null,
    resumelol_updated_at: null,
    built_markdown_sha256: null,
    template,
  };
  store.buildRows.set(RESUME_ID, row);
  client = await connect("agent", store);
});

afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

describe("resume tools on the MCP server", () => {
  it("are marked as writes that reach outside Interndex", async () => {
    const tools = await client.listTools();
    const byName = new Map<string, ListedTool & { annotations?: Record<string, boolean> }>(
      tools.map((tool) => [tool.name, tool]),
    );
    for (const name of ["calibrate_template", "build_resume", "rebuild_with_edits"]) {
      expect(byName.get(name)?.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
      expect(byName.get(name)?.description).not.toMatch(/—/);
    }
  });

  it("build_resume falls back cleanly when the server cannot run Chrome", async () => {
    const result = json(await client.call("build_resume", { tailored_resume_id: RESUME_ID }));
    expect(result).toMatchObject({
      character_check: "passed",
      layout_check: "skipped",
      layout_path: "skipped",
      skipped_reason: "launch_failed",
      has_pdf: false,
      builds_left: 1,
    });
    expect(store.resumeLolCalls).toEqual([
      "create_resume:Sam_Example_Pinterest_Strategy_Operations_Intern",
      "get_resume_html:rl-created",
    ]);
    expect(store.uploads.map((upload) => upload.contentType)).toEqual(["text/html"]);
    expect(store.logs).toEqual([expect.objectContaining({ event: "resume_build", path: "skipped" })]);
    // The base resume is protected in the client it was given.
    expect(store.protectedIdSets).toEqual([[BASE_ID]]);
    expect(store.usage.at(-1)).toMatchObject({ applicationId: APPLICATION_ID, tool: "build_resume" });
  });

  it("build_resume stores the PDF when Chrome renders a clean page", async () => {
    store.renderOutcome = {
      ok: true,
      measurement: {
        pages: 1,
        page_fill: 0.97,
        bullets: [BULLET_A, BULLET_B].map((text) => ({ text, lines: [{ text, fill: 0.95 }] })),
      },
      pdf: new TextEncoder().encode("%PDF-1.4 << /Type /Page >> %%EOF"),
      durationMs: 1200,
    };
    const response = await client.call("build_resume", { tailored_resume_id: RESUME_ID });
    expect(json(response)).toMatchObject({ layout_check: "passed", layout_path: "chromium", has_pdf: true, pages: 1 });
    expect(byteLength(response.content[0].text)).toBeLessThan(TOOL_RESULT_CAPS.build_resume);
  });

  it("rebuild_with_edits updates the built resume and records the edit", async () => {
    await client.call("build_resume", { tailored_resume_id: RESUME_ID });
    store.resumeLolCalls = [];
    const result = json(
      await client.call("rebuild_with_edits", {
        tailored_resume_id: RESUME_ID,
        edits: [{ before_text: "35%", after_text: "40%" }],
      }),
    );
    expect(result).toMatchObject({ builds_left: 0, edits_recorded: 1 });
    expect(store.resumeLolCalls).toEqual(["get_resume:rl-created", "update_resume:rl-created", "get_resume_html:rl-created"]);
    expect(store.edits.at(-1)).toMatchObject({ before_text: BULLET_A, after_text: BULLET_A.replace("35%", "40%") });

    const third = await client.call("rebuild_with_edits", {
      tailored_resume_id: RESUME_ID,
      edits: [{ before_text: "40%", after_text: "45%" }],
    });
    expect(third.isError).toBe(true);
    expect(third.content[0].text).toContain("both of its 2 builds");
  });

  it("calibrate_template reads the base and saves its id", async () => {
    store.baseResumes.set("base-new", { markdown: ZERO2SUDO_BASE, html: "<html></html>" });
    store.renderOutcome = {
      ok: true,
      measurement: {
        pages: 1,
        page_fill: 1,
        bullets: Array.from({ length: 5 }, () => ({
          text: "x",
          lines: [{ text: "a".repeat(132), fill: 1 }, { text: "b", fill: 0.9 }],
        })),
      },
      pdf: null,
      durationMs: 10,
    };
    const result = json<{ targets: Record<string, number>; sections: { key: string }[] }>(
      await client.call("calibrate_template", { template: "zero2sudo", base_resume_id: "base-new" }),
    );
    expect(result.targets.one_line_chars).toBe(132);
    expect(result.sections.map((section) => section.key)).toEqual(["education", "experience", "projects", "skills"]);
    expect(store.calibrations).toEqual([{ name: "zero2sudo", resumelol_template_ref: "base-new" }]);
    expect(store.resumeLolCalls).toEqual(["get_resume:base-new", "get_resume_html:base-new"]);
  });

  it("refuses every other user before any resume.lol call", async () => {
    for (const [name, args] of [
      ["build_resume", { tailored_resume_id: RESUME_ID }],
      ["rebuild_with_edits", { tailored_resume_id: RESUME_ID, edits: [{ before_text: "a", after_text: "b" }] }],
      ["calibrate_template", { template: "jakes", base_resume_id: "x" }],
    ] as const) {
      const result = await client.call(name, args, STRANGER);
      expect(result.isError).toBe(true);
    }
    expect(store.resumeLolCalls).toHaveLength(0);
    expect(store.protectedIdSets).toHaveLength(0);
  });
});
