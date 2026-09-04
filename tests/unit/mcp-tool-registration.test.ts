import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
  type AuthInfo,
  type JSONRPCMessage,
} from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
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
import {
  IMPORT_JOBS_MAXIMUM_BATCH,
  LIST_JOBS_MAXIMUM_LIMIT,
} from "@/lib/validation/mcp";

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
    // One call for the whole batch, as the real statement is, and owned by the
    // bound user rather than by anything the caller sent.
    createApplications: async (inputs) => {
      const created = inputs.map((input, index) =>
        stored(userId, {
          ...toApplicationInsert(input),
          id: `9999999${index}-9999-4999-8999-999999999999`,
        }),
      );
      rows.push(...created);
      return {
        data: created.map((row) => ({
          id: row.id,
          company_name: row.company_name,
          original_job_title: row.original_job_title,
        })),
        error: null,
      };
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
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

type ToolDefinition = {
  name: string;
  description?: string;
  _meta?: Record<string, unknown>;
  inputSchema: {
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
  };
};

type ResourceDefinition = {
  uri: string;
  name: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
};

type ResourceTemplateDefinition = {
  uriTemplate: string;
  name: string;
  mimeType?: string;
  _meta?: Record<string, unknown>;
};

type ResourceContents = {
  contents: {
    uri: string;
    mimeType?: string;
    text?: string;
    _meta?: Record<string, unknown>;
  }[];
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
    listResources: () =>
      request<{ resources: ResourceDefinition[] }>("resources/list", {}).then(
        (result) => result.resources,
      ),
    listResourceTemplates: () =>
      request<{ resourceTemplates: ResourceTemplateDefinition[] }>(
        "resources/templates/list",
        {},
      ).then((result) => result.resourceTemplates),
    readResource: (uri: string) =>
      request<ResourceContents>("resources/read", { uri }),
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
  it("registers all five tools on a real MCP server", async () => {
    const connection = await connectServer();

    const names = (await connection.listTools()).map((tool) => tool.name);

    expect(names.sort()).toEqual(
      ["get_job", "import_jobs", "list_jobs", "save_job", "update_job"].sort(),
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
    expect(result.content[0].text).toBe("No applications found.");
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

    // Still exactly the five tools, with the field added to existing schemas.
    expect(tools).toHaveLength(5);
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

/**
 * What Claude is actually told about `company_domain`.
 *
 * These assert the advertised JSON Schema a connected client reads, not our
 * source strings, because the description is the whole mechanism here: nothing
 * in Interndex derives a domain, so whether a saved application gets a logo
 * depends entirely on what this text asks Claude to do.
 *
 * They are written against the intent rather than the exact prose — that the
 * guidance is active rather than permissive, that it names the hosts to avoid,
 * and that it still keeps the field optional — so wording can be improved
 * without rewriting the suite.
 */
describe("the company_domain guidance Claude reads", () => {
  const describedDomain = (tools: ToolDefinition[], name: string) =>
    String(
      tools.find((tool) => tool.name === name)!.inputSchema.properties
        .company_domain.description ?? "",
    );

  it("asks save_job to fill the domain in whenever the employer is identifiable", async () => {
    const connection = await connectServer();
    const description = describedDomain(await connection.listTools(), "save_job");

    expect(description).toMatch(/fill it in/i);
    expect(description).toMatch(/reasonably identified/i);
    // Active guidance, not a request to wait for permission. The field used to
    // say "supply it when you already know it; never guess", which is exactly
    // what left applications saved through Claude without a logo.
    expect(description).not.toMatch(/never guess/i);
    await connection.close();
  });

  it("names the applicant-tracking hosts that are not the employer", async () => {
    const connection = await connectServer();
    const tools = await connection.listTools();

    for (const name of ["save_job", "update_job"]) {
      const description = describedDomain(tools, name);
      for (const host of [
        "Workday",
        "Greenhouse",
        "Lever",
        "LinkedIn",
        "Indeed",
      ]) {
        expect(description).toContain(host);
      }
      expect(description).toMatch(/canonical/i);
    }
    await connection.close();
  });

  it("carries the same worked examples on both tools", async () => {
    const connection = await connectServer();
    const tools = await connection.listTools();

    for (const name of ["save_job", "update_job"]) {
      const description = describedDomain(tools, name);
      for (const example of [
        "shopify.com",
        "kpmg.com",
        "rbc.com",
        "bmo.com",
        "microsoft.com",
      ]) {
        expect(description).toContain(example);
      }
    }
    await connection.close();
  });

  it("asks update_job to fill in a domain an application is missing", async () => {
    const connection = await connectServer();
    const description = describedDomain(
      await connection.listTools(),
      "update_job",
    );

    expect(description).toMatch(/none stored/i);
    expect(description).toMatch(/fill it in/i);
    // Clearing is still reachable, so a student is never stuck with a domain
    // Claude guessed wrong.
    expect(description).toMatch(/clear it/i);
    await connection.close();
  });

  it("says so in the tool descriptions Claude reads before any argument", async () => {
    const connection = await connectServer();
    const tools = await connection.listTools();
    const description = (name: string) =>
      String(tools.find((tool) => tool.name === name)!.description ?? "");

    expect(description("save_job")).toMatch(/company_domain/);
    expect(description("save_job")).toMatch(/without the student having to ask/i);
    expect(description("update_job")).toMatch(/company_domain/);
    await connection.close();
  });

  it("keeps the field optional, so storage stays nullable", async () => {
    const connection = await connectServer();
    const tools = await connection.listTools();

    for (const name of ["save_job", "update_job"]) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      expect(tool.inputSchema.required ?? []).not.toContain("company_domain");
    }
    // And the guidance says as much, rather than only leaving it out.
    expect(describedDomain(tools, "save_job")).toMatch(
      /still saves without it/i,
    );
    await connection.close();
  });

  it("still saves a job when the employer cannot be identified", async () => {
    // The behavioural half of the promise above: encouraging the domain must
    // not have turned it into something a save depends on.
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "A local startup with no website",
      job_title: "Marketing Assistant",
    });
    const read = await connection.callTool("get_job", {
      application_id: MISSING_ID,
    });

    expect(saved.isError).toBeUndefined();
    expect(read.structuredContent).toMatchObject({ company_domain: null });
    await connection.close();
  });
});

describe("import_jobs served by the real server", () => {
  const application = (overrides: Record<string, unknown> = {}) => ({
    company: "RBC",
    job_title: "Business Analyst Intern",
    status: "Applied",
    category: "Business Analysis",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    date_applied: "2026-08-12",
    source: "LinkedIn",
    work_term: "Winter 2027",
    notes: "Imported from previous tracker.",
    ...overrides,
  });

  it("advertises applications as its only argument, with no user_id", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "import_jobs",
    );

    expect(Object.keys(tool!.inputSchema.properties)).toEqual(["applications"]);
    expect(tool!.inputSchema.required).toEqual(["applications"]);
    await connection.close();
  });

  it("tells the assistant it takes records rather than a file", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "import_jobs",
    );
    const description = tool!.description ?? "";

    // The workflow is stated once, at the tool level, where a client reads it.
    expect(description).toContain("takes records, never files");
    expect(description).toContain("list_jobs");
    expect(description).toContain("YYYY-MM-DD");
    expect(description).toContain(String(IMPORT_JOBS_MAXIMUM_BATCH));
    expect(description.toLowerCase()).toContain("never invent history");
    await connection.close();
  });

  it("imports a batch and reports what it stored", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("import_jobs", {
      applications: [
        application(),
        application({
          company: "Deloitte",
          job_title: "Consulting Intern",
          status: "Interview",
          date_applied: "2026-08-03",
        }),
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("Imported 2 applications into Interndex.");
    expect(result.structuredContent).toMatchObject({ imported: 2 });

    const summaries = result.structuredContent!.applications as {
      application_id: string;
      company: string;
      job_title: string;
    }[];
    expect(summaries.map((summary) => summary.company)).toEqual([
      "RBC",
      "Deloitte",
    ]);
    for (const summary of summaries) {
      expect(Object.keys(summary)).toEqual([
        "application_id",
        "company",
        "job_title",
      ]);
    }
    await connection.close();
  });

  it("puts what it imported into the student's own tracker", async () => {
    const connection = await connectServer();

    await connection.callTool("import_jobs", {
      applications: [
        application({ company: "Wealthsimple", job_title: "Growth Intern" }),
      ],
    });

    const mine = await connection.callTool("list_jobs", {
      company: "Wealthsimple",
    });
    const theirs = await connection.callTool(
      "list_jobs",
      { company: "Wealthsimple" },
      ANOTHER_STUDENT,
    );

    expect(mine.structuredContent!.returned).toBe(1);
    // Imported into the caller's tracker, and only theirs.
    expect(theirs.structuredContent!.returned).toBe(0);
    await connection.close();
  });

  it("keeps the status an application arrived at", async () => {
    const connection = await connectServer();

    await connection.callTool("import_jobs", {
      applications: [
        application({
          company: "Deloitte",
          job_title: "Consulting Intern",
          status: "Interview",
          date_applied: "2026-08-03",
        }),
      ],
    });

    const listed = await connection.callTool("list_jobs", {
      company: "Deloitte",
    });
    const [imported] = listed.structuredContent!.applications as {
      status: string;
      date_applied: string | null;
    }[];

    expect(imported.status).toBe("Interview");
    expect(imported.date_applied).toBe("2026-08-03");
    await connection.close();
  });

  it("stores nothing when one record in the batch is invalid", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("import_jobs", {
      applications: [
        application({ company: "Faire", job_title: "Ops Intern" }),
        application({
          company: "Ada",
          job_title: "Marketing Intern",
          next_action_due_date: "2026-09-04",
        }),
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Nothing was imported.");
    expect(result.content[0].text).toContain(
      "Import record 2 (Ada — Marketing Intern)",
    );

    // The valid first record was not left behind.
    const listed = await connection.callTool("list_jobs", { company: "Faire" });
    expect(listed.structuredContent!.returned).toBe(0);
    await connection.close();
  });

  it("refuses a free-text status before any handler runs", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("import_jobs", {
      applications: [application({ status: "Ghosted" })],
    });

    expect(result.isError).toBe(true);
    await connection.close();
  });

  it("refuses an empty batch and one beyond the maximum", async () => {
    const connection = await connectServer();

    const empty = await connection.callTool("import_jobs", { applications: [] });
    const tooMany = await connection.callTool("import_jobs", {
      applications: Array.from({ length: IMPORT_JOBS_MAXIMUM_BATCH + 1 }, () =>
        application(),
      ),
    });
    const full = await connection.callTool("import_jobs", {
      applications: Array.from({ length: IMPORT_JOBS_MAXIMUM_BATCH }, (_, index) =>
        application({ job_title: `Intern ${index}` }),
      ),
    });

    expect(empty.isError).toBe(true);
    expect(tooMany.isError).toBe(true);
    expect(full.isError).toBeUndefined();
    expect(full.structuredContent!.imported).toBe(IMPORT_JOBS_MAXIMUM_BATCH);
    await connection.close();
  });

  it("refuses to import for a caller who is not signed in", async () => {
    const connection = await connectServer();

    const result = await connection.callTool(
      "import_jobs",
      { applications: [application()] },
      null,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Not signed in");
    await connection.close();
  });
});

describe("save_job reports what it created", () => {
  it("returns the new application's id, employer, title and status", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
      status: "Applied",
    });

    // work_term and location fall back to null, matching list_jobs's own
    // records, rather than the internal "Not specified" sentinel or an
    // absent field a client would have to special-case. category always
    // carries the tool's own determination (default "Other"), which is real
    // saved data, never an invented value.
    expect(saved.structuredContent).toEqual({
      application_id: MISSING_ID,
      company: "Nokia",
      job_title: "Marketing Student",
      status: "Applied",
      category: "Other",
      work_term: null,
      location: null,
      duration: null,
      deadline: null,
      source: null,
      salary: null,
      notes: null,
    });
    await connection.close();
  });

  it("reports the work term and location when the posting named them", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "RBC",
      job_title: "Business Analyst Intern",
      work_term: "Summer 2027",
      location: "Toronto, ON",
    });

    expect(saved.structuredContent).toMatchObject({
      work_term: "Summer 2027",
      location: "Toronto, ON",
    });
    await connection.close();
  });

  it("can now save the fields only the website could set before", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Telus",
      job_title: "Business Operations Intern",
      work_arrangement: "Remote",
      salary: "$24/hour",
      next_action: "Follow up with the recruiter",
      next_action_due_date: "2026-09-04",
    });

    expect(saved.isError).toBeUndefined();
    expect(saved.structuredContent!.company).toBe("Telus");
    expect(saved.structuredContent!.salary).toBe("$24/hour");
    await connection.close();
  });
});

/**
 * The canonical Markdown `save_job` returns, over a real MCP server, from a
 * realistic populated posting — the shape the connector-only rewrite exists
 * to guarantee: a confirmation sentence, a field table holding only what was
 * actually saved, a capped "Key details" list built from real notes, and no
 * deadline follow-up line because a deadline was supplied. See
 * `tests/unit/mcp-markdown.test.ts` for the formatter's own unit coverage,
 * including the omitted-fields and capped-notes cases.
 */
describe("save_job returns the canonical Markdown confirmation", () => {
  it("matches the exact shape for a realistic, fully-populated save", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "RBC",
      job_title: "Business Analyst Intern",
      status: "Applied",
      category: "Business Analysis",
      location: "Toronto, ON",
      work_term: "Summer 2027",
      duration: "4 months",
      deadline: "2026-09-04",
      source: "LinkedIn",
      salary: "$22/hour",
      notes: "Referred by a classmate.\nRecruiter is Jane Smith.",
    });

    expect(saved.content[0].text).toBe(
      [
        "Saved **Business Analyst Intern** at **RBC** as **Applied**.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Company | RBC |",
        "| Title | Business Analyst Intern |",
        "| Status | Applied |",
        "| Category | Business Analysis |",
        "| Location | Toronto, ON |",
        "| Work term | Summer 2027 |",
        "| Duration | 4 months |",
        "| Deadline | 2026-09-04 |",
        "| Source | LinkedIn |",
        "| Salary | $22/hour |",
        "",
        "**Key details**",
        "",
        "- Referred by a classmate.",
        "- Recruiter is Jane Smith.",
      ].join("\n"),
    );
    await connection.close();
  });

  it("omits every row and section whose value was not supplied", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });

    expect(saved.content[0].text).toBe(
      [
        "Saved **Marketing Student** at **Nokia** as **Interested**.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Company | Nokia |",
        "| Title | Marketing Student |",
        "| Status | Interested |",
        "| Category | Other |",
        "",
        "No deadline was listed.",
      ].join("\n"),
    );
    // Nothing invented: no Location, Work term, Duration, Source, Salary row,
    // and no "Key details" section, because none of those were supplied.
    expect(saved.content[0].text).not.toContain("Location");
    expect(saved.content[0].text).not.toContain("Work term");
    expect(saved.content[0].text).not.toContain("Duration");
    expect(saved.content[0].text).not.toContain("Source");
    expect(saved.content[0].text).not.toContain("Salary");
    expect(saved.content[0].text).not.toContain("Key details");
    await connection.close();
  });

  it("caps notes at four bullets and never invents one", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Shopify",
      job_title: "Product Analyst",
      notes: [
        "First note.",
        "Second note.",
        "Third note.",
        "Fourth note.",
        "Fifth note that must not appear.",
      ].join("\n"),
    });

    const text = saved.content[0].text;
    expect(text).toContain("- First note.");
    expect(text).toContain("- Fourth note.");
    expect(text).not.toContain("Fifth note");
    expect((text.match(/^- /gm) ?? []).length).toBe(4);
    await connection.close();
  });

  it("does not dump the full job description into the confirmation", async () => {
    const connection = await connectServer();
    const description = "x".repeat(2000);

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
      job_description: description,
    });

    expect(saved.content[0].text).not.toContain(description);
    await connection.close();
  });
});

describe("save_job never returns list-shaped data", () => {
  it("never carries list-shaped data — no applications array, ever", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });

    expect(saved.structuredContent).not.toHaveProperty("applications");
    expect(saved.structuredContent).not.toHaveProperty("returned");
    expect(saved.structuredContent).not.toHaveProperty("has_more");
    await connection.close();
  });

  it("never calls listApplications while saving", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });

    // The regression this pins: a save must never read the tracker on its
    // own, which is what would let a stray list read hide inside the save
    // path itself rather than arriving as a host's own separate call.
    expect(calls.listApplications).toBe(0);
    await connection.close();
  });
});

/**
 * A student asking "which jobs did I apply to this week" should cost exactly
 * one `list_jobs` call, not one plus a `get_job` per row to double-check a
 * date the list already carries. The audit that added this traced a real,
 * multi-second-per-round-trip wait to exactly that pattern; this pins the
 * fact the list result already carries what such a question needs, so an
 * assistant reading the advertised description has no reason to reach for
 * `get_job` at all.
 */
describe("list_jobs advertises that it alone answers date-based questions", () => {
  it("names date_applied in its own description, not only in the schema", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "list_jobs",
    );

    expect(tool!.description).toMatch(/date applied/i);
    expect(tool!.description).toMatch(/without a follow-up call/i);
    await connection.close();
  });

  it("still tells the assistant get_job is for the full posting, not for fields list_jobs already has", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "list_jobs",
    );

    expect(tool!.description).toMatch(/get_job only for the full posting/i);
    await connection.close();
  });

  it("keeps date_applied and deadline in every returned record", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});
    const applications = result.structuredContent!.applications as Record<
      string,
      unknown
    >[];

    for (const application of applications) {
      expect(application).toHaveProperty("date_applied");
      expect(application).toHaveProperty("deadline");
    }
    await connection.close();
  });
});

/*
 * `list_jobs`'s Markdown, over a real MCP server: a compact table of only
 * the matching applications, never a UI resource of any kind. This replaces
 * the ChatGPT Apps SDK widget the tool used to point at.
 */
describe("list_jobs returns plain Markdown, never a widget", () => {
  it("keeps full list records in structured content, and renders a compact table as text", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});

    // Sorted newest first: RBC (2026-08-20) before Shopify (2026-08-19), the
    // two active applications the default archive_state includes.
    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "**2** applications found.",
          "",
          "| Company | Title | Status | Work term | Deadline |",
          "| --- | --- | --- | --- | --- |",
          "| RBC | Business Analyst | Applied | Summer 2027 | 2026-09-04 |",
          "| Shopify | Product Analyst | Interested | Fall 2026 | 2026-09-04 |",
        ].join("\n"),
      },
    ]);
    expect(result.structuredContent).toHaveProperty("applications");
    expect(result.structuredContent).toHaveProperty("has_more");
    await connection.close();
  });

  it("says so in plain text rather than rendering an empty-state widget", async () => {
    const connection = await connectServer(fakeRepositoryFactory([]));

    const result = await connection.callTool("list_jobs", {});

    expect(result.content).toEqual([
      { type: "text", text: "No applications found." },
    ]);
    await connection.close();
  });

  it("still works when explicitly requested, and stays text/structured only", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", { company: "RBC" });

    expect(result.content[0].text).toContain("RBC");
    expect(result.content[0].text).not.toContain("Shopify");
    expect(result.structuredContent).toMatchObject({ returned: 1 });
    await connection.close();
  });
});

/*
 * The hard guarantee behind this rewrite: no `ui://interndex/…` resource is
 * registered anymore, and no tool definition or result carries any of the
 * metadata that once pointed at one. Even if a host calls `list_jobs`
 * unnecessarily after a save, there is no widget left for it to render.
 */
describe("no ChatGPT widget resources or metadata remain", () => {
  const FORBIDDEN_META_KEYS = [
    "openai/outputTemplate",
    "openai/widgetAccessible",
    "openai/widgetCSP",
    "ui",
    "csp",
    "domain",
  ];

  it("registers no ui://interndex/... resource — resources/list is not even advertised", async () => {
    // Every resource this server ever served came from the deleted widget
    // layer. With nothing registered, `McpServer` does not advertise a
    // `resources` capability at all, so `resources/list` itself is unknown —
    // a stronger guarantee than an empty list would be.
    const connection = await connectServer();

    await expect(connection.listResources()).rejects.toThrow(/method not found/i);
    await connection.close();
  });

  it("registers no ui://interndex/... resource template — resources/templates/list is not even advertised", async () => {
    const connection = await connectServer();

    await expect(connection.listResourceTemplates()).rejects.toThrow(
      /method not found/i,
    );
    await connection.close();
  });

  it("carries none of the widget _meta keys on any tool definition", async () => {
    const connection = await connectServer();

    for (const tool of await connection.listTools()) {
      for (const key of FORBIDDEN_META_KEYS) {
        expect(tool._meta?.[key]).toBeUndefined();
      }
    }
    await connection.close();
  });

  it("carries none of the widget _meta keys on any tool result", async () => {
    const connection = await connectServer();

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });
    const listed = await connection.callTool("list_jobs", {});
    const fetched = await connection.callTool("get_job", {
      application_id: RBC_ID,
    });
    const updated = await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      status: "Applied",
    });

    for (const result of [saved, listed, fetched, updated]) {
      for (const key of FORBIDDEN_META_KEYS) {
        expect(result._meta?.[key]).toBeUndefined();
      }
    }
    await connection.close();
  });
});

/**
 * Counts calls made to a `JobTrackRepository` produced by the given factory,
 * without changing what any call does — every call is forwarded to the real
 * fake underneath. This is what lets a test assert "exactly one round trip"
 * rather than only "the right data came back", which the tests above already
 * cover.
 */
function countingRepositoryFactory(repositoryFactory: JobTrackRepositoryFactory) {
  const calls = {
    createApplication: 0,
    createApplications: 0,
    getApplication: 0,
    listApplications: 0,
    updateApplication: 0,
  };

  const counting: JobTrackRepositoryFactory = (identity) => {
    const repository = repositoryFactory(identity);
    return {
      createApplication: (input) => {
        calls.createApplication += 1;
        return repository.createApplication(input);
      },
      createApplications: (inputs) => {
        calls.createApplications += 1;
        return repository.createApplications(inputs);
      },
      getApplication: (applicationId) => {
        calls.getApplication += 1;
        return repository.getApplication(applicationId);
      },
      listApplications: (filters) => {
        calls.listApplications += 1;
        return repository.listApplications(filters);
      },
      updateApplication: (applicationId, input) => {
        calls.updateApplication += 1;
        return repository.updateApplication(applicationId, input);
      },
    };
  };

  return { counting, calls };
}

/**
 * Each tool already made the minimum number of repository calls before the
 * latency audit that added instrumentation to this file — one round trip for
 * every read or write tool, and exactly a read-then-write for `update_job`,
 * which needs the current record to merge a partial patch onto and to detect
 * a concurrent change. These pin that count so wrapping every call for timing
 * (`lib/mcp/telemetry.ts`, `lib/mcp/repository.ts`) never quietly turns into
 * an extra query, now or later.
 */
describe("database round trips per tool call", () => {
  it("list_jobs reads once", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("list_jobs", {});

    expect(calls.listApplications).toBe(1);
    expect(calls.getApplication).toBe(0);
    expect(calls.updateApplication).toBe(0);
    await connection.close();
  });

  it("get_job reads once", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("get_job", { application_id: RBC_ID });

    expect(calls.getApplication).toBe(1);
    expect(calls.listApplications).toBe(0);
    await connection.close();
  });

  it("save_job writes once", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });

    expect(calls.createApplication).toBe(1);
    // The regression this half pins: a save must never read the tracker on
    // its own, which is what would let a stray list read hide inside the
    // save path itself rather than arriving as ChatGPT's own separate call.
    expect(calls.listApplications).toBe(0);
    await connection.close();
  });

  it("import_jobs writes once for the whole batch, not once per record", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("import_jobs", {
      applications: [
        { company: "RBC", job_title: "Analyst Intern", status: "Applied" },
        { company: "Deloitte", job_title: "Consulting Intern", status: "Interview" },
      ],
    });

    expect(calls.createApplications).toBe(1);
    await connection.close();
  });

  it("update_job reads the record once and writes once", async () => {
    const { counting, calls } = countingRepositoryFactory(fakeRepositoryFactory());
    const connection = await connectServer(counting);

    await connection.callTool("update_job", {
      application_id: SHOPIFY_ID,
      status: "Applied",
    });

    expect(calls.getApplication).toBe(1);
    expect(calls.updateApplication).toBe(1);
    await connection.close();
  });
});

/**
 * `save_job` and `import_jobs` take whatever the assistant already read off
 * the posting; neither has ever fetched the URL itself, and this pins that so
 * a future change cannot reintroduce a server-side fetch of student-supplied
 * URLs without a test noticing.
 */
describe("saving a job never fetches the posting URL", () => {
  it("does not call fetch while saving one job", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch must not be called by save_job"));
    const connection = await connectServer();

    const result = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
      job_url: "https://jobs.nokia.example/posting/123",
    });

    expect(result.isError).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await connection.close();
  });

  it("does not call fetch while importing a batch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch must not be called by import_jobs"));
    const connection = await connectServer();

    const result = await connection.callTool("import_jobs", {
      applications: [
        { company: "RBC", job_title: "Analyst Intern", status: "Applied" },
      ],
    });

    expect(result.isError).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await connection.close();
  });
});

/**
 * The latency instrumentation added alongside these tests logs one line per
 * tool call (`lib/mcp/telemetry.ts`). These confirm that line actually shows
 * up through the real server, and — the part that matters for a tracker full
 * of a student's own job-search details — that it never carries any of the
 * content the tool call touched.
 */
describe("tool-call telemetry", () => {
  it("logs one line per call, naming the tool and outcome but nothing it touched", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const connection = await connectServer();

    await connection.callTool("get_job", { application_id: RBC_ID });

    const lines = logSpy.mock.calls.map((call) => String(call[0]));
    const toolCallLines = lines.filter((line) => line.includes("mcp.tool_call"));

    expect(toolCallLines).toHaveLength(1);
    const payload = JSON.parse(toolCallLines[0]);
    expect(payload).toMatchObject({ tool: "get_job", outcome: "success" });

    for (const line of lines) {
      expect(line).not.toContain("retail banking");
      expect(line).not.toContain("Referred by a classmate");
      expect(line).not.toContain("Business Analyst");
      expect(line).not.toContain(STUDENT);
      expect(line).not.toContain(`token-for-${STUDENT}`);
    }
    logSpy.mockRestore();
    await connection.close();
  });

  it("logs a tool_error outcome, still without the arguments that failed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const connection = await connectServer();

    await connection.callTool("get_job", { application_id: OTHER_STUDENTS_ID });

    const toolCallLines = logSpy.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.includes("mcp.tool_call"));

    expect(toolCallLines).toHaveLength(1);
    expect(JSON.parse(toolCallLines[0])).toMatchObject({
      tool: "get_job",
      outcome: "tool_error",
    });
    logSpy.mockRestore();
    await connection.close();
  });
});
