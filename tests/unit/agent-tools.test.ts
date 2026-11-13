import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countWords } from "@/lib/agent/brief";
import { byteLength, TOOL_RESULT_CAPS } from "@/lib/agent/caps";
import { connect, FakeAgentStore, json, OWNER, type ToolResult } from "./agent-mcp-harness";
import { GOLD_SET } from "./agent-standards-fixtures";

/** A sentinel no tool may ever echo back after creation. */
const JD_MARKER = "ZEBRA-JD-SENTINEL";
const JD_TEXT = `We are hiring a Technical Program Manager Intern. ${JD_MARKER} ${"Details. ".repeat(400)}`;

const TINDER = {
  company: "Tinder",
  title: "Technical Program Manager Intern",
  location: "Los Angeles, CA",
  job_id: "JR-1001",
  source_url: "https://careers.tinder.com/jobs/JR-1001",
  jd_text: JD_TEXT,
  requirements: [
    { text: "Program management across engineering teams", must_have: true },
    { text: "SQL and dashboards", must_have: true },
    { text: "Experience with Jira", must_have: false },
  ],
  partner_functions: ["Engineering", "Product"],
};

const originalOwner = process.env.OWNER_USER_ID;
let store: FakeAgentStore;
let client: Awaited<ReturnType<typeof connect>>;
const seen: ToolResult[] = [];

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.call(name, args);
  seen.push(result);
  return result;
}

beforeEach(async () => {
  process.env.OWNER_USER_ID = OWNER;
  store = new FakeAgentStore();
  client = await connect("agent", store);
});

afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

describe("get_playbook", () => {
  it("serves the run steps, the matching standards, the profile and the templates", async () => {
    store.profile = {
      school: "University of Ottawa",
      program: "Business Technology Management",
      degree_level: "Bachelor's",
      expected_graduation: "2028-05-01",
      year_of_study: 4,
      academic_standing: 3,
      notes: null,
    };
    const playbook = json<{
      phase: string;
      steps: string[];
      standards: string;
      profile: { school: string; year_of_study: number; academic_standing: number };
      saved_rules: { rules: unknown[] };
    }>(await call("get_playbook", { phase: "run" }));

    expect(playbook.phase).toBe("run");
    expect(playbook.steps.length).toBeGreaterThan(5);
    expect(playbook.standards).toContain("## Part 1");
    expect(playbook.standards).toContain("## Part 2");
    // Outreach standards belong to Spec 2's people step, not this phase.
    expect(playbook.standards).not.toContain("## Part 3");
    expect(playbook.profile.school).toBe("University of Ottawa");
    expect(playbook.profile).toMatchObject({ year_of_study: 4, academic_standing: 3 });
    expect(playbook.saved_rules.rules).toEqual([]);
  });

  it("includes a rule saved with add_rule on the next call (acceptance criterion)", async () => {
    json(await call("add_rule", { scope: "bullets", text: 'Never use "spearheaded"' }));
    const playbook = json<{ saved_rules: { rules: { scope: string; text: string }[] } }>(
      await call("get_playbook", { phase: "library_session" }),
    );
    expect(playbook.saved_rules.rules).toEqual([
      { scope: "bullets", text: 'Never use "spearheaded"' },
    ]);
  });

  it("saves the same rule only once", async () => {
    const first = json<{ created: boolean }>(await call("add_rule", { scope: "all", text: "Lead with impact." }));
    const second = json<{ created: boolean }>(await call("add_rule", { scope: "all", text: "Lead with impact." }));
    expect([first.created, second.created]).toEqual([true, false]);
  });

  it("fits under its cap with standards and a realistic set of saved rules", async () => {
    for (let index = 0; index < 60; index += 1) {
      json(await call("add_rule", { scope: "bullets", text: `Rule ${index}: ${"keep it short and specific ".repeat(8)}` }));
    }
    const result = await call("get_playbook", { phase: "run" });
    expect(result.isError).toBeUndefined();
    expect(byteLength(result.content[0].text)).toBeLessThanOrEqual(TOOL_RESULT_CAPS.get_playbook);
  });

  it("refuses rather than sends a result over its cap", async () => {
    for (let index = 0; index < 120; index += 1) {
      json(await call("add_rule", { scope: "all", text: `Rule ${index} ${"x".repeat(480)}` }));
    }
    const result = await call("get_playbook", { phase: "run" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/over its 40000-byte cap/);
  });
});

describe("create_application_from_jd", () => {
  it("creates the application, records the step, and never returns the description", async () => {
    const created = json<{ application_id: string; created: boolean; next_step: string }>(
      await call("create_application_from_jd", TINDER),
    );
    expect(created.created).toBe(true);
    expect(created.next_step).toBe("fit_read");

    const stored = store.applications[0];
    // Stored as the web form stores it: trimmed, otherwise verbatim.
    expect(stored.job_description).toBe(JD_TEXT.trim());
    expect(stored.job_id).toBe("JR-1001");
    expect(stored.jd_requirements).toHaveLength(3);
    expect(stored.application_url).toBe(TINDER.source_url);
  });

  it("dedupes on company, title and job id, ignoring case and punctuation", async () => {
    const first = json<{ application_id: string }>(await call("create_application_from_jd", TINDER));
    const again = json<{ application_id: string; created: boolean }>(
      await call("create_application_from_jd", {
        ...TINDER,
        company: "tinder",
        title: "Technical Program Manager, Intern",
      }),
    );
    expect(again).toMatchObject({ application_id: first.application_id, created: false });
    expect(store.applications).toHaveLength(1);
  });

  it("treats a different job id as a different posting", async () => {
    json(await call("create_application_from_jd", TINDER));
    const other = json<{ created: boolean }>(
      await call("create_application_from_jd", { ...TINDER, job_id: "JR-2002" }),
    );
    expect(other.created).toBe(true);
    expect(store.applications).toHaveLength(2);
  });

  it("fills in a posting saved earlier without a job id, keeping what it had", async () => {
    store.applications.push({
      id: "11111111-1111-4111-8111-111111111111",
      user_id: OWNER,
      company_name: "Tinder",
      original_job_title: "Technical Program Manager Intern",
      location: "Los Angeles, CA",
      job_id: null,
      job_description: "Saved earlier by the extension.",
      application_url: null,
      current_status: "Interested",
      date_applied: null,
      application_deadline: null,
      jd_requirements: null,
      partner_functions: null,
      created_at: "2026-11-01T00:00:00.000Z",
    });
    const result = json<{ application_id: string; created: boolean }>(
      await call("create_application_from_jd", TINDER),
    );
    expect(result).toEqual(
      expect.objectContaining({ application_id: "11111111-1111-4111-8111-111111111111", created: false }),
    );
    const enriched = store.applications[0];
    expect(enriched.job_id).toBe("JR-1001");
    expect(enriched.jd_requirements).toHaveLength(3);
    expect(enriched.application_url).toBe(TINDER.source_url);
    expect(enriched.job_description).toBe("Saved earlier by the extension.");
  });

  it("does not record the application step twice", async () => {
    const { application_id } = json<{ application_id: string }>(await call("create_application_from_jd", TINDER));
    json(await call("create_application_from_jd", TINDER));
    expect(store.ledger.get(application_id)).toEqual([{ step: "application", status: "done", count: 1 }]);
  });

  it("rejects a posting link that is not http or https", async () => {
    const result = await call("create_application_from_jd", { ...TINDER, source_url: "javascript:alert(1)" });
    expect(result.isError).toBe(true);
    expect(store.applications).toHaveLength(0);
  });
});

describe("get_run_state and get_application_brief", () => {
  it("reports the next step for a fresh application", async () => {
    const { application_id } = json<{ application_id: string }>(await call("create_application_from_jd", TINDER));
    const state = json<{ steps: Record<string, string | null>; next_step: string; resume: null }>(
      await call("get_run_state", { application_id }),
    );
    expect(state.steps).toEqual({ application: "done", fit_read: null, tailor: null, build: null });
    expect(state.next_step).toBe("fit_read");
    expect(state.resume).toBeNull();
  });

  it("keeps the brief under 300 words, must-haves first", async () => {
    const requirements = Array.from({ length: 40 }, (_, index) => ({
      text: `Requirement number ${index} about stakeholder communication and cross-functional delivery at scale`,
      must_have: index % 2 === 0,
    }));
    const { application_id } = json<{ application_id: string }>(
      await call("create_application_from_jd", { ...TINDER, requirements }),
    );
    const brief = json<{
      requirements: { must_have: boolean }[];
      requirements_omitted: number;
    }>(await call("get_application_brief", { application_id }));

    expect(countWords(brief)).toBeLessThanOrEqual(300);
    expect(brief.requirements_omitted).toBeGreaterThan(0);
    expect(brief.requirements.slice(0, 5).every((requirement) => requirement.must_have)).toBe(true);
  });

  it("answers an unknown id the same way as another user's", async () => {
    const result = await call("get_application_brief", { application_id: "99999999-9999-4999-8999-999999999999" });
    expect(result).toMatchObject({ isError: true, content: [{ text: "No application with that id is in this tracker." }] });
  });
});

describe("the story library", () => {
  const IRB = GOLD_SET.find((role) => role.role.startsWith("IRB"))!;

  async function importIrb() {
    return json<{ variants_added: number; variants_existing: number; stories: number }>(
      await call("import_library", {
        experiences: [
          { key: "irb", org: "IRB", official_title: "Information Management Analyst Intern", start: "2025-05", end: "2025-08" },
        ],
        stories: [
          { key: "backlog", experience_key: "irb", label: "Ticket backlog", tags: ["ops"] },
          { key: "dashboard", experience_key: "irb", label: "Migration dashboard", tags: ["data"] },
        ],
        variants: [
          { story_key: "backlog", text: IRB.bullets[0], style: "house", is_gold: true, explain_note: "Backlog fell after the new triage rules." },
          { story_key: "dashboard", text: IRB.bullets[2], style: "house", is_gold: true, explain_note: "Leadership stopped asking for weekly summaries." },
        ],
        profile: { school: "University of Ottawa", expected_graduation: "2028-05", year_of_study: 4, academic_standing: 3 },
      }),
    );
  }

  it("imports once and changes nothing the second time (acceptance criterion)", async () => {
    const first = await importIrb();
    const second = await importIrb();
    expect(first).toMatchObject({ stories: 2, variants_added: 2, variants_existing: 0 });
    expect(second).toMatchObject({ stories: 2, variants_added: 0, variants_existing: 2 });
    expect(store.library).toHaveLength(2);
    expect(store.profile?.expected_graduation).toBe("2028-05-01");
    expect(store.profile).toMatchObject({ year_of_study: 4, academic_standing: 3 });
  });

  it("refuses an import with a broken link or a number without a note, writing nothing", async () => {
    const result = await call("import_library", {
      experiences: [{ key: "irb", org: "IRB", official_title: "Analyst", start: "2025-05", end: null }],
      stories: [{ key: "s", experience_key: "nope", label: "Backlog" }],
      variants: [{ story_key: "s", text: "Reduced the backlog by 35%.", style: "house" }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/unknown experience_key "nope"/);
    expect(result.content[0].text).toMatch(/has a number but no explain_note/);
    expect(store.experiences).toHaveLength(0);
  });

  it("refuses the same experience twice in one import", async () => {
    const experience = { key: "a", org: "IRB", official_title: "Analyst", start: "2025-05", end: null };
    const result = await call("import_library", {
      experiences: [experience, { ...experience, key: "b" }],
      stories: [],
      variants: [],
    });
    expect(result.content[0].text).toMatch(/experiences\[1\] repeats an earlier experience/);
  });

  it("ranks stories for the requirements, at most 5", async () => {
    await importIrb();
    const ranking = json<{ stories: { label: string; variants: { text: string }[] }[]; unmatched: number[] }>(
      await call("search_stories", {
        requirements: ["Power BI dashboards", "Kubernetes administration"],
        angles: ["data"],
        template: "zero2sudo",
      }),
    );
    expect(ranking.stories[0].label).toBe("Migration dashboard");
    expect(ranking.unmatched).toEqual([1]);
  });

  it("saves a clean house variant with its explain note, once", async () => {
    await importIrb();
    const storyId = store.library[0].id;
    const variant = {
      story_id: storyId,
      text: "Cut the open ticket backlog by 35% by recommending Azure DevOps and redesigning request triage.",
      style: "house",
      explain_note: "The backlog dropped once requests were triaged by type.",
    };
    const first = json<{ created: boolean }>(await call("save_variant", variant));
    const second = json<{ created: boolean }>(await call("save_variant", variant));
    expect([first.created, second.created]).toEqual([true, false]);
  });

  it("refuses a house variant that fails the checker, or a number without a note", async () => {
    await importIrb();
    const storyId = store.library[0].id;
    const filler = await call("save_variant", {
      story_id: storyId,
      text: "Successfully helped the team with tickets.",
      style: "house",
    });
    expect(filler.isError).toBe(true);
    expect(filler.content[0].text).toMatch(/fails check_bullets/);

    const noNote = await call("save_variant", {
      story_id: storyId,
      text: "Cut the backlog by 35% through triage.",
      style: "house",
    });
    expect(noNote.content[0].text).toBe("This text has a number, so it needs an explain_note.");
  });

  it("refuses a variant for a story that is not in the library", async () => {
    const result = await call("save_variant", {
      story_id: "99999999-9999-4999-8999-999999999999",
      text: "Cut review time through a research workflow.",
      style: "house",
    });
    expect(result.content[0].text).toBe("No story with that id is in the library.");
  });

  it("records an edit", async () => {
    json(await call("record_edit", { before_text: "Helped cut tickets.", after_text: "Cut tickets by 35%." }));
    expect(store.edits).toHaveLength(1);
  });
});

describe("check_bullets", () => {
  it("uses the template's targets once calibrated", async () => {
    const widow = `Reduced the open ticket backlog by 35% by assessing ticketing platforms and recommending a tool ${"x".repeat(40)}`;
    const uncalibrated = json<{ pass: boolean }>(
      await call("check_bullets", { template: "zero2sudo", bullets: [widow] }),
    );
    expect(uncalibrated.pass).toBe(true);

    store.templates.push({
      id: "t1",
      name: "zero2sudo",
      use_for: ["tpm"],
      one_line_chars: 110,
      two_line_min: 199,
      two_line_max: 220,
      calibrated_at: "2026-11-13T00:00:00.000Z",
    });
    const calibrated = json<{ pass: boolean; bullets: { failures: { rule: string }[] }[] }>(
      await call("check_bullets", { template: "zero2sudo", bullets: [widow] }),
    );
    expect(calibrated.pass).toBe(false);
    expect(calibrated.bullets[0].failures.map((failure) => failure.rule)).toContain("line_fill");
  });

  it("blocks phrases from saved rules", async () => {
    json(await call("add_rule", { scope: "bullets", text: 'Never use "spearheaded"' }));
    const result = json<{ pass: boolean }>(
      await call("check_bullets", {
        template: "jakes",
        bullets: ["Spearheaded the AI visibility strategy across 4 channels."],
      }),
    );
    expect(result.pass).toBe(false);
  });
});

describe("answers", () => {
  it("saves and finds the closest answers", async () => {
    json(await call("save_answer", { question: "Why do you want to work at Tinder?", answer: "Because of the product." }));
    json(await call("save_answer", { question: "Describe a time you led a project.", answer: "At IRB I led the migration." }));
    const found = json<{ answers: { question: string }[] }>(
      await call("search_answers", { query: "Tell us about a project you led" }),
    );
    expect(found.answers[0].question).toBe("Describe a time you led a project.");
  });
});

describe("usage log and responses", () => {
  it("logs the exact bytes of every result, with its application", async () => {
    const { application_id } = json<{ application_id: string }>(await call("create_application_from_jd", TINDER));
    const brief = await call("get_application_brief", { application_id });
    const logged = store.usage.find((entry) => entry.tool === "get_application_brief")!;
    expect(logged).toEqual({
      applicationId: application_id,
      tool: "get_application_brief",
      bytes: byteLength(brief.content[0].text),
    });
    expect(store.usage.find((entry) => entry.tool === "create_application_from_jd")?.applicationId).toBe(
      application_id,
    );
  });

  it("never returns the job description from any tool after creation", async () => {
    seen.length = 0;
    const { application_id } = json<{ application_id: string }>(await call("create_application_from_jd", TINDER));
    await call("create_application_from_jd", TINDER);
    await call("get_run_state", { application_id });
    await call("get_application_brief", { application_id });
    await call("get_playbook", { phase: "run" });
    for (const result of seen) {
      expect(result.content[0].text).not.toContain(JD_MARKER);
    }
  });

  it("answers in compact JSON, not indented text", async () => {
    const result = await call("get_playbook", { phase: "import" });
    expect(result.content[0].text.startsWith('{"phase":"import"')).toBe(true);
  });
});
