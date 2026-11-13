import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAgentOwner, readOwnerUserId } from "@/lib/agent/owner";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { MCP_INSTRUCTIONS_BY_KIND, selectMcpServerKind } from "@/lib/mcp/servers";
import { authFor, connect, FakeAgentStore, OWNER, STRANGER } from "./agent-mcp-harness";

const TRACKER_TOOLS = ["save_job", "import_jobs", "list_jobs", "get_job", "update_job"];

const AGENT_TOOLS = [
  "get_playbook",
  "get_run_state",
  "get_application_brief",
  "create_application_from_jd",
  "search_stories",
  "save_variant",
  "record_edit",
  "add_rule",
  "check_bullets",
  "save_answer",
  "search_answers",
  "import_library",
];

const READ_ONLY_TOOLS = [
  "get_playbook",
  "get_run_state",
  "get_application_brief",
  "search_stories",
  "check_bullets",
  "search_answers",
];

const originalOwner = process.env.OWNER_USER_ID;

beforeEach(() => {
  process.env.OWNER_USER_ID = OWNER;
});

afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

describe("the OWNER_USER_ID gate", () => {
  it("recognizes the owner, whatever the letter case", () => {
    expect(isAgentOwner(OWNER, { OWNER_USER_ID: OWNER })).toBe(true);
    expect(isAgentOwner(OWNER.toUpperCase(), { OWNER_USER_ID: ` ${OWNER} ` })).toBe(true);
  });

  it("refuses everyone else", () => {
    expect(isAgentOwner(STRANGER, { OWNER_USER_ID: OWNER })).toBe(false);
    expect(isAgentOwner(null, { OWNER_USER_ID: OWNER })).toBe(false);
    expect(isAgentOwner("", { OWNER_USER_ID: OWNER })).toBe(false);
  });

  it("fails closed when the variable is unset, empty or not a UUID", () => {
    for (const value of [undefined, "", "   ", "david", "not-a-uuid-at-all", `${OWNER}x`]) {
      expect(readOwnerUserId({ OWNER_USER_ID: value })).toBeNull();
      expect(isAgentOwner(OWNER, { OWNER_USER_ID: value })).toBe(false);
    }
  });
});

describe("which server a request gets", () => {
  it("serves the agent only to the owner", () => {
    expect(selectMcpServerKind(authFor(OWNER), { OWNER_USER_ID: OWNER })).toBe("agent");
    expect(selectMcpServerKind(authFor(STRANGER), { OWNER_USER_ID: OWNER })).toBe("standard");
    expect(selectMcpServerKind(undefined, { OWNER_USER_ID: OWNER })).toBe("standard");
    expect(selectMcpServerKind(authFor(OWNER), {})).toBe("standard");
  });

  it("keeps the standard instructions byte for byte", () => {
    expect(MCP_INSTRUCTIONS_BY_KIND.standard).toBe(MCP_SERVER_INSTRUCTIONS);
    expect(MCP_INSTRUCTIONS_BY_KIND.agent.startsWith(MCP_SERVER_INSTRUCTIONS)).toBe(true);
  });

  it("offers every other student exactly the five tracker tools", async () => {
    const client = await connect("standard", new FakeAgentStore());
    const names = (await client.listTools()).map((tool) => tool.name);
    expect(names.sort()).toEqual([...TRACKER_TOOLS].sort());
  });

  it("offers the owner the tracker tools plus the agent tools", async () => {
    const client = await connect("agent", new FakeAgentStore());
    const names = (await client.listTools()).map((tool) => tool.name);
    expect(names.sort()).toEqual([...TRACKER_TOOLS, ...AGENT_TOOLS].sort());
  });

  it("marks the read tools read-only and the rest not", async () => {
    const client = await connect("agent", new FakeAgentStore());
    for (const tool of await client.listTools()) {
      if (!AGENT_TOOLS.includes(tool.name)) continue;
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(READ_ONLY_TOOLS.includes(tool.name));
    }
  });

  it("names no user id in any agent tool's arguments", async () => {
    const client = await connect("agent", new FakeAgentStore());
    const tools = (await client.listTools()) as { name: string; inputSchema?: unknown }[];
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema), tool.name).not.toMatch(/user_?id/i);
    }
  });
});

describe("defense in depth", () => {
  it("refuses an agent tool to anyone but the owner, before touching data", async () => {
    const store = new FakeAgentStore();
    const client = await connect("agent", store);
    for (const name of AGENT_TOOLS) {
      const result = await client.call(name, {}, STRANGER);
      expect(result.isError, name).toBe(true);
    }
    // Arguments that do validate, so the refusal comes from the gate itself.
    const gated = await client.call("get_playbook", { phase: "run" }, STRANGER);
    expect(gated.content[0].text).toBe("This tool is not available for this account.");
    expect(store.repositoriesCreated).toBe(0);
  });

  it("refuses a call with no verified identity", async () => {
    const client = await connect("agent", new FakeAgentStore());
    const result = await client.call("get_playbook", { phase: "run" }, null);
    expect(result).toMatchObject({ isError: true, content: [{ text: "Not signed in to Interndex." }] });
  });

  it("refuses everyone when OWNER_USER_ID is unset, owner included", async () => {
    delete process.env.OWNER_USER_ID;
    const store = new FakeAgentStore();
    const client = await connect("agent", store);
    const result = await client.call("get_playbook", { phase: "run" }, OWNER);
    expect(result.isError).toBe(true);
    expect(store.repositoriesCreated).toBe(0);
  });
});
