import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { byteLength, TOOL_RESULT_CAPS } from "@/lib/agent/caps";
import type { TemplateLayout } from "@/lib/agent/resume/build";
import { parseBaseResume } from "@/lib/agent/resume/skeleton";
import { connect, FakeAgentStore, json, OWNER } from "./agent-mcp-harness";
import { ZERO2SUDO_BASE } from "./fixtures/resume-bases";

const BULLET_A = "Reduced the open ticket backlog by 35% by redesigning service request triage.";
const BULLET_B = "Grew the tracker to 100 student sign-ups in its first month.";
const STORY_ID = "50000000-0000-4000-8000-000000000001";

function layout(): TemplateLayout {
  const parsed = parseBaseResume(ZERO2SUDO_BASE);
  if (!parsed.ok) throw new Error("fixture");
  return { version: 1, skeleton: parsed.skeleton, css: "", meta_css: "", base_updated_at: "b1" };
}

const originalOwner = process.env.OWNER_USER_ID;
let store: FakeAgentStore;
let client: Awaited<ReturnType<typeof connect>>;
let applicationId: string;

function payload(overrides: Record<string, unknown> = {}) {
  return {
    application_id: applicationId,
    template: "zero2sudo",
    fit_read: { verdict: "strong_fit", summary: "Matches program management and SQL.", gaps: ["Jira"], gap_requirements: [] },
    resume: {
      entries: [
        { key: "information-management-analyst-intern", bullets: [BULLET_A] },
        { key: "tracker-app", bullets: [BULLET_B] },
      ],
    },
    new_variants: [{ story_id: STORY_ID, text: BULLET_A, explain_note: "Measured in Azure DevOps." }],
    answers: [{ question: "Why Tinder?", answer: "The role partners with engineering." }],
    ...overrides,
  };
}

beforeEach(async () => {
  process.env.OWNER_USER_ID = OWNER;
  store = new FakeAgentStore();
  store.templates = [
    {
      id: "t-z2s",
      name: "zero2sudo",
      use_for: ["pm"],
      one_line_chars: null,
      two_line_min: null,
      two_line_max: null,
      calibrated_at: "2026-11-13T00:00:00Z",
      resumelol_template_ref: "base-z2s",
      header_config: layout(),
    },
  ];
  store.library = [
    { id: STORY_ID, label: "Backlog", summary: null, tags: [], org: "IRB", official_title: "Analyst", variants: [] },
  ];
  client = await connect("agent", store);
  const created = json<{ application_id: string }>(
    await client.call("create_application_from_jd", {
      company: "Tinder",
      title: "Technical Program Manager Intern",
      location: "Los Angeles, CA",
      jd_text: "We are hiring.",
      requirements: [{ text: "Program management", must_have: true }],
    }),
  );
  applicationId = created.application_id;
});

afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

describe("complete_run", () => {
  it("saves the run, then builds, in one call", async () => {
    const response = await client.call("complete_run", payload());
    const result = json<{ tailored_resume_id: string; variants_added: number; answers_added: number; build: Record<string, unknown> }>(response);
    expect(result).toMatchObject({ variants_added: 1, answers_added: 1 });
    expect(result.build).toMatchObject({
      character_check: "passed",
      layout_check: "skipped",
      skipped_reason: "launch_failed",
      builds_left: 1,
    });
    expect(store.resumeLolCalls[0]).toBe("create_resume:Sam_Example_Tinder_Technical_Program_Manager_Intern");
    expect(store.ledger.get(applicationId)?.map((row) => `${row.step}=${row.status}`)).toEqual([
      "application=done",
      "fit_read=done",
      "tailor=done",
      "build=done",
    ]);
    expect(store.usage.at(-1)).toMatchObject({ applicationId, tool: "complete_run" });
    expect(byteLength(response.content[0].text)).toBeLessThan(TOOL_RESULT_CAPS.complete_run);
  });

  it("saves nothing when the page fails check_bullets", async () => {
    const response = await client.call(
      "complete_run",
      payload({
        resume: {
          entries: [
            { key: "information-management-analyst-intern", bullets: ["Helped reduce the backlog."] },
            { key: "tracker-app", bullets: [BULLET_B] },
          ],
        },
      }),
    );
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Nothing was saved");
    expect(response.content[0].text).toContain("Bullet 0");
    expect(store.completedRuns).toHaveLength(0);
    expect(store.resumeLolCalls).toHaveLength(0);
  });

  it("saves nothing when an entry's bullet count is off, such as a bare entry the library has a story for", async () => {
    store.library.push({
      id: "50000000-0000-4000-8000-000000000002",
      label: "Federal practice placement",
      summary: null,
      tags: [],
      org: "Big Consultancy, Federal Practice",
      official_title: "Incoming Consulting Intern",
      variants: [
        { id: "v-ibm", text: "Selected for the federal practice.", style: "story_voice", angles: [], template_fit: [], char_count: 34, is_gold: false, explain_note: null, created_at: "2026-11-14T00:00:00Z" },
      ],
    });
    const response = await client.call(
      "complete_run",
      payload({
        resume: {
          entries: [
            { key: "incoming-consulting-intern", bullets: [] },
            { key: "information-management-analyst-intern", bullets: [BULLET_A] },
            { key: "tracker-app", bullets: [BULLET_B] },
          ],
        },
      }),
    );
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("bullet counts are off");
    expect(response.content[0].text).toContain("incoming-consulting-intern takes 1 to 3 (has 0)");
    expect(store.completedRuns).toHaveLength(0);
  });

  it("refuses a verdict stronger than the must-have gaps allow (decision record 0019)", async () => {
    const response = await client.call(
      "complete_run",
      payload({
        fit_read: { verdict: "strong_fit", summary: "Strong.", gaps: ["Program management"], gap_requirements: [0] },
      }),
    );
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("1 of 1 must-have requirements are gaps");
    expect(response.content[0].text).toContain("at most Long shot");
    expect(store.completedRuns).toHaveLength(0);
  });

  it("requires a degree the profile does not cover to be named as a gap", async () => {
    store.profile = {
      school: "Example University", program: "Business Technology Management", degree_level: "Bachelor of Commerce",
      expected_graduation: "2028-04-01", year_of_study: 4, academic_standing: 3, study_start: null,
      school_location: null, interests: null, notes: null,
    };
    const ramp = json<{ application_id: string }>(
      await client.call("create_application_from_jd", {
        company: "Ramp",
        title: "Risk Strategy Intern",
        location: "New York, NY",
        jd_text: "We are hiring.",
        requirements: [
          { text: "Pursuing a B.S. in Computer Science or a related technical field", must_have: true },
          { text: "Program management", must_have: true },
        ],
      }),
    );
    const missing = await client.call("complete_run", payload({ application_id: ramp.application_id }));
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("Add it to gap_requirements and name it as a risk");
    const named = await client.call(
      "complete_run",
      payload({
        application_id: ramp.application_id,
        fit_read: { verdict: "moderate_fit", summary: "Degree risk: B.S. in Computer Science asked; BCom in BTM.", gaps: ["Degree field"], gap_requirements: [0] },
      }),
    );
    expect(named.isError).toBeFalsy();
  });

  it("refuses gap numbers that are not requirements of the posting", async () => {
    const response = await client.call(
      "complete_run",
      payload({ fit_read: { verdict: "long_shot", summary: "x", gaps: [], gap_requirements: [5] } }),
    );
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("not requirements of this posting");
  });

  it("saves nothing when the content does not fit the template", async () => {
    const response = await client.call("complete_run", payload({ resume: { entries: [{ key: "made-up", bullets: [BULLET_A] }] } }));
    expect(response.isError).toBe(true);
    expect(store.completedRuns).toHaveLength(0);
  });

  it("saves nothing when a new variant with a number has no explain note", async () => {
    const response = await client.call("complete_run", payload({ new_variants: [{ story_id: STORY_ID, text: BULLET_A }] }));
    expect(response.content[0].text).toContain("explain_note");
    expect(store.completedRuns).toHaveLength(0);
  });

  it("does not redo a saved run unless forced", async () => {
    await client.call("complete_run", payload({ build: false }));
    const again = await client.call("complete_run", payload({ build: false }));
    expect(again.isError).toBe(true);
    expect(again.content[0].text).toContain("force: true");
    expect(json(await client.call("complete_run", payload({ build: false, force: true })))).toHaveProperty("tailored_resume_id");
    expect(store.resumeLolCalls).toHaveLength(0);
  });

  it("refuses the people section until Spec 2", async () => {
    const response = await client.call("complete_run", payload({ people: [{ name: "Someone" }] }));
    expect(response.isError).toBe(true);
    expect(store.completedRuns).toHaveLength(0);
  });

  it("refuses an uncalibrated template", async () => {
    store.templates[0].header_config = {};
    const response = await client.call("complete_run", payload());
    expect(response.content[0].text).toContain("not calibrated");
  });
});
