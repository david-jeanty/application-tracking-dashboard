import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
  type AuthInfo,
  type JSONRPCMessage,
} from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { toApplicationInsert } from "@/lib/applications/mapper";
import type { ApplicationListFilters } from "@/lib/applications/repository";
import type {
  ApplicationListItem,
  ApplicationRecord,
} from "@/lib/applications/types";
import {
  registerJobTrackTools,
  type JobTrackRepositoryFactory,
} from "@/lib/mcp/tools";
import { LIST_JOBS_MAXIMUM_LIMIT } from "@/lib/validation/mcp";

const STUDENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ANOTHER_STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RBC_ID = "11111111-1111-4111-8111-111111111111";
const SHOPIFY_ID = "22222222-2222-4222-8222-222222222222";
const NOKIA_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_STUDENTS_ID = "44444444-4444-4444-8444-444444444444";
const MISSING_ID = "55555555-5555-4555-8555-555555555555";

type StoredApplication = ApplicationRecord & { user_id: string };

function stored(
  userId: string,
  overrides: Partial<ApplicationRecord>,
): StoredApplication {
  return {
    user_id: userId,
    id: RBC_ID,
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst",
    normalized_job_category: "Business Analysis",
    classification_confidence: null,
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    application_url: "https://jobs.rbc.com/example",
    application_source: "LinkedIn",
    job_description: "Support reporting for the retail banking team.",
    application_deadline: "2026-09-04",
    date_applied: "2026-08-22",
    current_status: "Applied",
    work_term_season: "Summer 2027",
    work_term_duration: "4 months",
    salary: null,
    notes: "Referred by a classmate.",
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-22T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

const SEED: StoredApplication[] = [
  stored(STUDENT, { id: RBC_ID, created_at: "2026-08-20T10:00:00.000Z" }),
  stored(STUDENT, {
    id: SHOPIFY_ID,
    company_name: "Shopify",
    original_job_title: "Product Analyst",
    current_status: "Interested",
    work_term_season: "Fall 2026",
    date_applied: null,
    created_at: "2026-08-19T10:00:00.000Z",
  }),
  stored(STUDENT, {
    id: NOKIA_ID,
    company_name: "Nokia",
    original_job_title: "Marketing Student",
    current_status: "Rejected",
    archived_at: "2026-08-18T10:00:00.000Z",
    created_at: "2026-08-18T10:00:00.000Z",
  }),
  stored(ANOTHER_STUDENT, {
    id: OTHER_STUDENTS_ID,
    company_name: "RBC",
    original_job_title: "Data Analyst",
    job_description: "A different student's private posting.",
  }),
];

/**
 * A stand-in for the RLS-protected repository.
 *
 * Every operation is bound to one user id, exactly as the real factory binds
 * the id carried by the verified access token, and the list read projects the
 * same bounded column set the real query selects. That is what makes the
 * ownership assertions below meaningful: nothing in the tool layer can widen
 * the owner, because the owner is applied before the tools are reached.
 */
function fakeRepositoryFactory(
  rows: StoredApplication[] = SEED.map((row) => ({ ...row })),
): JobTrackRepositoryFactory {
  const summarize = (row: StoredApplication): ApplicationListItem => ({
    id: row.id,
    company_name: row.company_name,
    company_domain: row.company_domain,
    original_job_title: row.original_job_title,
    normalized_job_category: row.normalized_job_category,
    current_status: row.current_status,
    location: row.location,
    work_arrangement: row.work_arrangement,
    work_term_season: row.work_term_season,
    date_applied: row.date_applied,
    application_deadline: row.application_deadline,
    next_action: row.next_action,
    next_action_due_date: row.next_action_due_date,
    created_at: row.created_at,
    archived_at: row.archived_at,
  });

  const contains = (value: string, term: string) =>
    value.toLowerCase().includes(term.toLowerCase());

  return ({ userId }) => ({
    createApplication: async (input) => {
      const insert = toApplicationInsert(input);
      const row = stored(userId, { ...insert, id: MISSING_ID });
      rows.push(row);
      return { data: { id: row.id }, error: null };
    },
    getApplication: async (applicationId) => ({
      data:
        rows.find((row) => row.id === applicationId && row.user_id === userId) ??
        null,
      error: null,
    }),
    listApplications: async (filters: ApplicationListFilters) => {
      const archiveState = filters.archiveState ?? "active";
      const matched = rows
        .filter((row) => row.user_id === userId)
        .filter((row) =>
          archiveState === "all"
            ? true
            : archiveState === "archived"
              ? row.archived_at !== null
              : row.archived_at === null,
        )
        .filter((row) => !filters.status || row.current_status === filters.status)
        .filter(
          (row) => !filters.company || contains(row.company_name, filters.company),
        )
        .filter(
          (row) =>
            !filters.workTermSeason ||
            contains(row.work_term_season, filters.workTermSeason),
        )
        .sort((first, second) => second.created_at.localeCompare(first.created_at))
        .map(summarize);

      return {
        data:
          filters.limit === undefined ? matched : matched.slice(0, filters.limit),
        error: null,
      };
    },
    updateApplication: async (applicationId, input) => {
      const index = rows.findIndex(
        (row) => row.id === applicationId && row.user_id === userId,
      );
      if (index === -1) return { outcome: "not_found" };

      const updated: StoredApplication = {
        ...rows[index],
        ...toApplicationInsert(input),
        updated_at: "2026-08-23T10:00:00.000Z",
      };
      rows[index] = updated;
      return { outcome: "updated", application: updated };
    },
  });
}

type ToolResult = {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  inputSchema: {
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
};

function authFor(userId: string): AuthInfo {
  return {
    token: `token-for-${userId}`,
    clientId: "claude",
    scopes: [],
    extra: { userId },
  };
}

/**
 * Serves the real tool registration over a real MCP server.
 *
 * The route registers exactly this, so a schema that cannot be converted, a
 * handler that returns something the output schema rejects, or a tool that
 * leaks another student's row fails here rather than on a live connector.
 */
async function connectServer(repositoryFactory = fakeRepositoryFactory()) {
  const server = new McpServer({ name: "jobtrack", version: "0.1.0" });
  registerJobTrackTools(server, repositoryFactory);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const pending = new Map<number, (message: JSONRPCMessage) => void>();
  let nextId = 0;

  clientTransport.onmessage = (message) => {
    const id = (message as { id?: number }).id;
    if (typeof id === "number") pending.get(id)?.(message);
  };
  await clientTransport.start();

  async function request<T>(
    method: string,
    params: Record<string, unknown>,
    authInfo?: AuthInfo,
  ): Promise<T> {
    const id = (nextId += 1);
    const response = new Promise<JSONRPCMessage>((resolve) =>
      pending.set(id, resolve),
    );
    await clientTransport.send({ jsonrpc: "2.0", id, method, params }, { authInfo });
    const message = (await response) as { result?: T; error?: unknown };

    if (message.error) throw new Error(JSON.stringify(message.error));
    return message.result as T;
  }

  await request("initialize", {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "test-client", version: "0.1.0" },
  });
  await clientTransport.send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  return {
    listTools: () =>
      request<{ tools: ToolDefinition[] }>("tools/list", {}).then(
        (result) => result.tools,
      ),
    callTool: (
      name: string,
      args: Record<string, unknown>,
      userId: string | null = STUDENT,
    ) =>
      request<ToolResult>(
        "tools/call",
        { name, arguments: args },
        userId ? authFor(userId) : undefined,
      ),
    close: () => server.close(),
  };
}

describe("MCP tool registration", () => {
  it("registers all four tools on a real MCP server", async () => {
    const connection = await connectServer();

    const names = (await connection.listTools()).map((tool) => tool.name);

    expect(names.sort()).toEqual(
      ["get_job", "list_jobs", "save_job", "update_job"].sort(),
    );
    await connection.close();
  });

  it("converts every tool schema into the JSON Schema Claude reads", async () => {
    const connection = await connectServer();

    for (const tool of await connection.listTools()) {
      expect(tool.inputSchema.properties).toBeTypeOf("object");
    }
    await connection.close();
  });

  it("advertises no user_id on any tool", async () => {
    const connection = await connectServer();

    for (const tool of await connection.listTools()) {
      expect(Object.keys(tool.inputSchema.properties)).not.toContain("user_id");
    }
    await connection.close();
  });

  it("advertises get_job as needing the application id and nothing else", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "get_job",
    );

    expect(Object.keys(tool!.inputSchema.properties)).toEqual([
      "application_id",
    ]);
    expect(tool!.inputSchema.required).toEqual(["application_id"]);
    await connection.close();
  });

  it("advertises list_jobs as needing nothing, with a capped limit", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "list_jobs",
    );

    expect(tool!.inputSchema.required ?? []).toEqual([]);
    expect(tool!.inputSchema.properties.limit.maximum).toBe(
      LIST_JOBS_MAXIMUM_LIMIT,
    );
    expect(tool!.inputSchema.properties.status.enum).toHaveLength(10);
    await connection.close();
  });

  it("advertises update_job with its application id required", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "update_job",
    );

    expect(Object.keys(tool!.inputSchema.properties)).toContain(
      "application_id",
    );
    expect(tool!.inputSchema.required).toEqual(["application_id"]);
    await connection.close();
  });

  it("advertises the full status vocabulary on update_job", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "update_job",
    );

    expect(tool!.inputSchema.properties.status.enum).toContain("Interview");
    expect(tool!.inputSchema.properties.status.enum).toContain("Applied");
    expect(tool!.inputSchema.properties.status.enum).toHaveLength(10);
    await connection.close();
  });
});

describe("list_jobs served by the real server", () => {
  it("returns only the signed-in student's own applications", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});
    const applications = result.structuredContent!
      .applications as { application_id: string; company: string }[];

    expect(applications.map((job) => job.application_id).sort()).toEqual(
      [RBC_ID, SHOPIFY_ID].sort(),
    );
    // The other student also has an RBC application; it is not in this list.
    expect(
      applications.some((job) => job.application_id === OTHER_STUDENTS_ID),
    ).toBe(false);
    await connection.close();
  });

  it("shows a second student their own applications instead", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {}, ANOTHER_STUDENT);
    const applications = result.structuredContent!
      .applications as { application_id: string }[];

    expect(applications.map((job) => job.application_id)).toEqual([
      OTHER_STUDENTS_ID,
    ]);
    await connection.close();
  });

  it("returns an empty list for a student with nothing saved", async () => {
    const connection = await connectServer();

    const result = await connection.callTool(
      "list_jobs",
      {},
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      applications: [],
      returned: 0,
      has_more: false,
    });
    expect(result.content[0].text).toBe("No applications match.");
    await connection.close();
  });

  it("filters by status, employer, and work term", async () => {
    const connection = await connectServer();

    const byStatus = await connection.callTool("list_jobs", {
      status: "Applied",
    });
    const byCompany = await connection.callTool("list_jobs", {
      company: "shopify",
    });
    const byWorkTerm = await connection.callTool("list_jobs", {
      work_term: "Summer 2027",
    });

    expect(byStatus.structuredContent!.returned).toBe(1);
    expect(byCompany.structuredContent!.returned).toBe(1);
    expect(byWorkTerm.structuredContent!.returned).toBe(1);
    await connection.close();
  });

  it("leaves archived applications out until they are asked for", async () => {
    const connection = await connectServer();

    const active = await connection.callTool("list_jobs", {});
    const archived = await connection.callTool("list_jobs", {
      archive_state: "archived",
    });
    const all = await connection.callTool("list_jobs", { archive_state: "all" });

    expect(active.structuredContent!.returned).toBe(2);
    expect(archived.structuredContent!.returned).toBe(1);
    expect(
      (archived.structuredContent!.applications as { archived: boolean }[])[0]
        .archived,
    ).toBe(true);
    expect(all.structuredContent!.returned).toBe(3);
    await connection.close();
  });

  it("honours a limit and says when more applications matched", async () => {
    const connection = await connectServer();

    const limited = await connection.callTool("list_jobs", { limit: 1 });

    expect(limited.structuredContent!.returned).toBe(1);
    expect(limited.structuredContent!.has_more).toBe(true);
    await connection.close();
  });

  it("rejects a limit beyond the advertised ceiling", async () => {
    const connection = await connectServer();

    // The server validates arguments against the advertised schema before a
    // handler runs, so an oversized page is refused rather than trimmed.
    const result = await connection.callTool("list_jobs", {
      limit: LIST_JOBS_MAXIMUM_LIMIT + 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("limit");
    await connection.close();
  });

  it("keeps list records free of descriptions and notes", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});

    const serialized = JSON.stringify(result.structuredContent);
    expect(serialized).not.toContain("retail banking");
    expect(serialized).not.toContain("Referred by a classmate");
    await connection.close();
  });
});

describe("get_job served by the real server", () => {
  it("returns the caller's complete application", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("get_job", {
      application_id: RBC_ID,
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      application_id: RBC_ID,
      company: "RBC",
      job_title: "Business Analyst",
      status: "Applied",
      job_description: "Support reporting for the retail banking team.",
      notes: "Referred by a classmate.",
      work_term: "Summer 2027",
      job_url: "https://jobs.rbc.com/example",
      archived: false,
    });
    await connection.close();
  });

  it("cannot read another student's application", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("get_job", {
      application_id: OTHER_STUDENTS_ID,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("Data Analyst");
    expect(result.content[0].text).not.toContain("private posting");
    await connection.close();
  });

  it("answers identically for a non-owned and a nonexistent application", async () => {
    const connection = await connectServer();

    const notOwned = await connection.callTool("get_job", {
      application_id: OTHER_STUDENTS_ID,
    });
    const missing = await connection.callTool("get_job", {
      application_id: MISSING_ID,
    });

    expect(notOwned).toEqual(missing);
    await connection.close();
  });
});

describe("every tool requires a signed-in student", () => {
  it.each([
    ["list_jobs", {}],
    ["get_job", { application_id: RBC_ID }],
    ["save_job", { company: "Nokia", job_title: "Marketing Student" }],
    ["update_job", { application_id: RBC_ID, status: "Applied" }],
  ])("refuses %s without a verified identity", async (name, args) => {
    const connection = await connectServer();

    const result = await connection.callTool(name, args, null);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Not signed in to the application tracker.",
    );
    await connection.close();
  });
});

describe("the existing write tools still work through the real server", () => {
  it("saves a job and then finds it in the caller's own list", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
      work_term: "Summer 2027",
    });
    const listed = await connection.callTool("list_jobs", { company: "Nokia" });

    expect(saved.isError).toBeUndefined();
    expect(listed.structuredContent!.returned).toBe(1);
    await connection.close();
  });

  it("updates a status and reports the change", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      status: "Applied",
      date_applied: "2026-08-22",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      application_id: SHOPIFY_ID,
      status_history_recorded: true,
    });
    await connection.close();
  });

  it("cannot update another student's application", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("update_job", {
      application_id: OTHER_STUDENTS_ID,
      status: "Rejected",
    });

    expect(result.isError).toBe(true);
    await connection.close();
  });
});

describe("company domain over MCP", () => {
  it("offers company_domain on save_job and update_job, and nowhere else", async () => {
    const connection = await connectServer();
    const tools = await connection.listTools();
    const properties = (name: string) =>
      Object.keys(
        tools.find((tool) => tool.name === name)!.inputSchema.properties,
      );

    expect(properties("save_job")).toContain("company_domain");
    expect(properties("update_job")).toContain("company_domain");
    // list_jobs filters by what a student would say out loud; a brand domain
    // is not a way anyone chooses between applications.
    expect(properties("list_jobs")).not.toContain("company_domain");
    expect(properties("get_job")).not.toContain("company_domain");

    // Still exactly the four tools, with the field added to existing schemas.
    expect(tools).toHaveLength(4);
    await connection.close();
  });

  it("never requires company_domain to save a job", async () => {
    const connection = await connectServer();
    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "save_job",
    );

    expect(tool!.inputSchema.required ?? []).not.toContain("company_domain");
    await connection.close();
  });

  it("saves a job with the domain Claude supplied", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Shopify",
      job_title: "Data Analyst Intern",
      company_domain: "shopify.com",
    });
    const listed = await connection.callTool("list_jobs", {
      company: "Shopify",
    });
    const id = (
      listed.structuredContent!.applications as { application_id: string }[]
    ).find((job) => job.application_id === MISSING_ID)!.application_id;
    const read = await connection.callTool("get_job", { application_id: id });

    expect(saved.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({
      company: "Shopify",
      company_domain: "shopify.com",
    });
    await connection.close();
  });

  it("saves a job without a domain, exactly as before", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });
    const read = await connection.callTool("get_job", {
      application_id: MISSING_ID,
    });

    expect(saved.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({ company_domain: null });
    await connection.close();
  });

  it("normalizes a pasted URL at the runtime boundary", async () => {
    const connection = await connectServer();

    await connection.callTool("save_job", {
      company: "KPMG",
      job_title: "Audit Intern",
      company_domain: "https://WWW.KPMG.com/ca/en/careers",
    });
    const read = await connection.callTool("get_job", {
      application_id: MISSING_ID,
    });

    expect(read.structuredContent).toMatchObject({ company_domain: "kpmg.com" });
    await connection.close();
  });

  it("rejects a malformed domain rather than storing it", async () => {
    const connection = await connectServer();

    for (const company_domain of [
      "Royal Bank of Canada",
      "javascript://evil.example",
      "shopify",
    ]) {
      const result = await connection.callTool("save_job", {
        company: "RBC",
        job_title: "Business Analyst",
        company_domain,
      });

      expect(result.isError).toBe(true);
    }
    await connection.close();
  });

  it("sets, changes, and clears the domain through update_job", async () => {
    const connection = await connectServer();

    const set = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      company_domain: "shopify.com",
    });
    expect(set.structuredContent!.changed_fields).toEqual([
      { field: "company_domain", from: null, to: "shopify.com" },
    ]);

    const changed = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      company_domain: "https://www.shopify.ca/",
    });
    expect(changed.structuredContent!.changed_fields).toEqual([
      { field: "company_domain", from: "shopify.com", to: "shopify.ca" },
    ]);

    // An empty string clears, which is the same partial-update semantics every
    // other clearable field already has.
    const cleared = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      company_domain: "",
    });
    expect(cleared.structuredContent!.changed_fields).toEqual([
      { field: "company_domain", from: "shopify.ca", to: null },
    ]);

    const read = await connection.callTool("get_job", {
      application_id: SHOPIFY_ID,
    });
    expect(read.structuredContent).toMatchObject({ company_domain: null });
    await connection.close();
  });

  it("leaves every other field alone when only the domain changes", async () => {
    const connection = await connectServer();

    const before = await connection.callTool("get_job", {
      application_id: RBC_ID,
    });
    await connection.callTool("update_job", {
      application_id: RBC_ID,
      company_domain: "rbc.com",
    });
    const after = await connection.callTool("get_job", {
      application_id: RBC_ID,
    });

    expect(after.structuredContent).toMatchObject({
      ...(before.structuredContent as Record<string, unknown>),
      company_domain: "rbc.com",
      updated_at: (after.structuredContent as { updated_at: string }).updated_at,
    });
    await connection.close();
  });

  it("rejects a malformed domain on update without changing the record", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      company_domain: "not a domain",
    });
    const read = await connection.callTool("get_job", {
      application_id: SHOPIFY_ID,
    });

    expect(result.isError).toBe(true);
    expect(read.structuredContent).toMatchObject({ company_domain: null });
    await connection.close();
  });

  it("still takes no user_id and grants no new authority", async () => {
    const connection = await connectServer();

    const forged = await connection.callTool("save_job", {
      company: "Shopify",
      job_title: "Analyst",
      company_domain: "shopify.com",
      user_id: ANOTHER_STUDENT,
    });
    const otherStudentsRow = await connection.callTool("update_job", {
      application_id: OTHER_STUDENTS_ID,
      company_domain: "rbc.com",
    });

    // The forged owner is ignored, not honoured: the row is saved to the
    // caller, and another student's application stays unreachable.
    expect(forged.isError).toBeUndefined();
    expect(otherStudentsRow.isError).toBe(true);

    const mine = await connection.callTool("list_jobs", {});
    expect(
      (mine.structuredContent!.applications as { company: string }[]).some(
        (job) => job.company === "Data Analyst",
      ),
    ).toBe(false);
    await connection.close();
  });
});
