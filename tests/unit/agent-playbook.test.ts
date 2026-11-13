import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { containsBannedAdverb, containsEmDash } from "@/lib/agent/checks/text-rules";
import { normalizeForDedupe, pickDuplicate } from "@/lib/agent/dedupe";
import { mayRunStep, summarizeRunState } from "@/lib/agent/ledger";
import { buildPlaybook } from "@/lib/agent/playbook";
import {
  renderSkill,
  renderStandardsModule,
  splitStandards,
} from "@/lib/agent/playbook/generate";
import { PHASE_DEFINITIONS, PLAYBOOK_PHASES } from "@/lib/agent/playbook/phases";
import { AGENT_SERVER_INSTRUCTIONS } from "@/lib/mcp/agent-tools";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { connect, FakeAgentStore, OWNER } from "./agent-mcp-harness";

const root = process.cwd();
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8");

describe("generated playbook files", () => {
  it("standards.generated.ts matches docs/STANDARDS.md (run npm run agent:playbook)", () => {
    const expected = renderStandardsModule(splitStandards(read("docs", "STANDARDS.md")));
    expect(read("lib", "agent", "playbook", "standards.generated.ts")).toBe(expected);
  });

  it("the skill matches the playbook phases (run npm run agent:playbook)", () => {
    const expected = renderSkill(PLAYBOOK_PHASES, PHASE_DEFINITIONS);
    expect(read("skill", "interndex-pipeline", "SKILL.md")).toBe(expected);
  });

  it("splits STANDARDS.md into its three parts", () => {
    const parts = splitStandards(read("docs", "STANDARDS.md"));
    expect(parts.working.startsWith("## Part 1")).toBe(true);
    expect(parts.bullets.startsWith("## Part 2")).toBe(true);
    expect(parts.outreach.startsWith("## Part 3")).toBe(true);
    expect(parts.bullets).toContain("### Gold set");
    expect(parts.working).not.toContain("## Part 2");
  });

  it("refuses a STANDARDS.md that has lost a part", () => {
    expect(() => splitStandards("# Standards\n\n## Part 1: x\n")).toThrow(/Part 2/);
  });

  it("serves the same steps the skill was rendered from", () => {
    const playbook = buildPlaybook("run", { rules: [], profile: null, templates: [] });
    const skill = read("skill", "interndex-pipeline", "SKILL.md");
    for (const step of playbook.steps) expect(skill).toContain(step);
  });
});

describe("writing rules on every piece of agent text", () => {
  const originalOwner = process.env.OWNER_USER_ID;
  beforeEach(() => {
    process.env.OWNER_USER_ID = OWNER;
  });
  afterEach(() => {
    if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
    else process.env.OWNER_USER_ID = originalOwner;
  });

  function assertClean(label: string, text: string) {
    expect(containsEmDash(text), `${label} has an em dash`).toBe(false);
    expect(containsBannedAdverb(text), `${label} has the banned adverb`).toBe(false);
  }

  it("holds for the playbook steps and the skill", () => {
    for (const phase of PLAYBOOK_PHASES) {
      const definition = PHASE_DEFINITIONS[phase];
      assertClean(`${phase} title`, definition.title);
      definition.steps.forEach((step, index) => assertClean(`${phase} step ${index + 1}`, step));
    }
    assertClean("SKILL.md", read("skill", "interndex-pipeline", "SKILL.md"));
  });

  it("holds for the added server instructions", () => {
    // Only the agent's addition: the shared instructions before it are every
    // student's existing text and must stay byte for byte as they are.
    expect(AGENT_SERVER_INSTRUCTIONS.startsWith(MCP_SERVER_INSTRUCTIONS)).toBe(true);
    assertClean(
      "agent instructions",
      AGENT_SERVER_INSTRUCTIONS.slice(MCP_SERVER_INSTRUCTIONS.length),
    );
  });

  it("holds for every agent tool title, description and argument description", async () => {
    const client = await connect("agent", new FakeAgentStore());
    const tools = (await client.listTools()) as {
      name: string;
      description?: string;
      inputSchema?: unknown;
    }[];
    const tracker = new Set(["save_job", "import_jobs", "list_jobs", "get_job", "update_job"]);
    for (const tool of tools.filter((entry) => !tracker.has(entry.name))) {
      assertClean(`${tool.name} description`, tool.description ?? "");
      assertClean(`${tool.name} schema`, JSON.stringify(tool.inputSchema));
    }
  });

  it("holds for the agent docs and decision records", () => {
    assertClean("CLAUDE.md", read("CLAUDE.md"));
    assertClean("docs/BUILD-LOG.md", read("docs", "BUILD-LOG.md"));
    const decisions = readdirSync(join(root, "docs", "decisions")).filter((name) => name.endsWith(".md"));
    expect(decisions.length).toBeGreaterThan(0);
    for (const name of decisions) assertClean(name, read("docs", "decisions", name));
  });
});

describe("run ledger", () => {
  it("starts at the application step and moves on as steps finish", () => {
    expect(summarizeRunState([]).next_step).toBe("application");
    expect(
      summarizeRunState([
        { step: "application", status: "done", count: 1 },
        { step: "fit_read", status: "done", count: 1 },
      ]).next_step,
    ).toBe("tailor");
  });

  it("treats a failed step as unfinished and a skipped one as finished", () => {
    const state = summarizeRunState([
      { step: "application", status: "done", count: 1 },
      { step: "fit_read", status: "skipped", count: 1 },
      { step: "tailor", status: "failed", count: 1 },
    ]);
    expect(state.next_step).toBe("tailor");
  });

  it("reports a finished run", () => {
    const rows = ["application", "fit_read", "tailor", "build"].map((step) => ({
      step,
      status: "done" as const,
      count: 1,
    }));
    expect(summarizeRunState(rows).next_step).toBeNull();
  });

  it("will not redo a done step unless forced", () => {
    const rows = [{ step: "build", status: "done" as const, count: 1 }];
    expect(mayRunStep(rows, "build", false)).toBe(false);
    expect(mayRunStep(rows, "build", true)).toBe(true);
    expect(mayRunStep(rows, "tailor", false)).toBe(true);
  });

  it("ignores step names it does not know (a later spec's steps)", () => {
    const state = summarizeRunState([{ step: "people_search", status: "done", count: 1 }]);
    expect(Object.keys(state.steps)).toEqual(["application", "fit_read", "tailor", "build"]);
  });
});

describe("dedupe", () => {
  it("normalizes case, spacing and punctuation", () => {
    expect(normalizeForDedupe("  Technical Program Manager, Intern ")).toBe(
      normalizeForDedupe("technical program manager intern"),
    );
  });

  it("prefers the same job id, then a record with none", () => {
    const rows = [
      { id: "new", job_id: null },
      { id: "exact", job_id: "JR-1" },
    ];
    expect(pickDuplicate(rows, "JR-1")?.id).toBe("exact");
    expect(pickDuplicate(rows, "JR-9")?.id).toBe("new");
    expect(pickDuplicate([{ id: "other", job_id: "JR-2" }], "JR-1")).toBeNull();
    expect(pickDuplicate([{ id: "other", job_id: "JR-2" }], undefined)?.id).toBe("other");
  });
});
