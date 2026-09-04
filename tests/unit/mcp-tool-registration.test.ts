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
import { APPLICATION_LIST_VIEW_HTML } from "@/lib/mcp/app-views/application-list-html";
import { SAVE_CONFIRMATION_VIEW_HTML } from "@/lib/mcp/app-views/save-confirmation-html";
import {
  APP_VIEW_MIME_TYPE,
  APPLICATION_LIST_VIEW_DOMAIN,
  APPLICATION_LIST_VIEW_URI,
  MCP_APPS_VIEW_MIME_TYPE,
  SAVE_CONFIRMATION_VIEW_DOMAIN,
  SAVE_CONFIRMATION_VIEW_URI,
} from "@/lib/mcp/app-views";
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
    expect(result.content[0].text).toBe("0 applications found.");
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
    // absent field a client would have to special-case.
    expect(saved.structuredContent).toEqual({
      application_id: MISSING_ID,
      company: "Nokia",
      job_title: "Marketing Student",
      status: "Applied",
      work_term: null,
      location: null,
    });
    // The sentence a student reads is unchanged.
    expect(saved.content[0].text).toBe(
      "Saved Marketing Student at Nokia with status Applied.",
    );
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
    await connection.close();
  });
});

/*
 * The regression this pins: ChatGPT showed a student two existing RBC
 * application cards from the generic list widget above the confirmation of
 * a job that had just saved correctly. `save_job` carries no widget
 * association of its own, so the widget could only have reached that
 * response by ChatGPT separately calling `list_jobs` to put something
 * visual next to a plain-text confirmation. Giving `save_job` its own view
 * removes the reason for that: these tests pin that it renders its own
 * confirmation, never list-shaped data, and never reads the tracker as part
 * of the save itself.
 */
describe("save_job stays confirmation-only", () => {
  it("attaches its own save-confirmation view, never the application list", async () => {
    const connection = await connectServer();

    const saveJob = (await connection.listTools()).find(
      (candidate) => candidate.name === "save_job",
    );
    // The descriptor, read once at connection time: `ui.resourceUri` names
    // save_job's own view.
    expect(saveJob!._meta?.["openai/outputTemplate"]).toBe(
      SAVE_CONFIRMATION_VIEW_URI,
    );
    expect(saveJob!._meta?.ui).toMatchObject({
      resourceUri: SAVE_CONFIRMATION_VIEW_URI,
    });

    const saved = await connection.callTool("save_job", {
      company: "Nokia",
      job_title: "Marketing Student",
    });

    // The result, travelling with the payload the host is about to render.
    expect(saved._meta?.["openai/outputTemplate"]).toBe(
      SAVE_CONFIRMATION_VIEW_URI,
    );
    expect(saved._meta?.["openai/outputTemplate"]).not.toBe(
      APPLICATION_LIST_VIEW_URI,
    );
    await connection.close();
  });

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
});

describe("the save-confirmation view served by the real server", () => {
  it("is registered as its own resource, distinct from the application list", async () => {
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === SAVE_CONFIRMATION_VIEW_URI,
    );

    expect(resource).toBeDefined();
    expect(resource!.mimeType).toBe(APP_VIEW_MIME_TYPE);
    await connection.close();
  });

  it("reads as skybridge first, MCP Apps second, exactly like the list view", async () => {
    const connection = await connectServer();

    const read = await connection.readResource(SAVE_CONFIRMATION_VIEW_URI);

    expect(read.contents.map((item) => item.mimeType)).toEqual([
      APP_VIEW_MIME_TYPE,
      MCP_APPS_VIEW_MIME_TYPE,
    ]);
    for (const item of read.contents) {
      expect(item.text).toBe(SAVE_CONFIRMATION_VIEW_HTML);
      expect(item.text).toContain("<!doctype html>");
    }
    await connection.close();
  });

  it("carries no markup shaped like the application list", async () => {
    // The whole point of a separate view: it cannot accidentally render a
    // list even if a host fed it one, because it has no list markup at all.
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("ix-list");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("ix-row");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("No applications match");
  });

  it("never fetches anything of its own", async () => {
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("fetch(");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("XMLHttpRequest");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("/api/");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("supabase");
  });

  /*
   * The regression this pins: a ChatGPT connector showed "Widget CSP is not
   * set" and "Widget domain is not set" for this exact resource, because
   * `appViewResourceMeta` never declared either at all — an absent key, not
   * an empty one, and a required field the generic MCP Apps spec's "optional"
   * framing had wrongly excused. These assert both declarations reach the
   * wire on every place `_meta` can appear: the resource listing, and each
   * content item a `resources/read` returns.
   */
  it("declares an explicit, empty CSP and a present ui.domain on the resource listing", async () => {
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === SAVE_CONFIRMATION_VIEW_URI,
    );

    expect(resource!._meta?.ui).toMatchObject({
      csp: { connectDomains: [], resourceDomains: [] },
      domain: SAVE_CONFIRMATION_VIEW_DOMAIN,
    });
    expect(resource!._meta?.["openai/widgetCSP"]).toEqual({
      connect_domains: [],
      resource_domains: [],
    });
    await connection.close();
  });

  it("declares the same CSP and ui.domain on every resources/read content item", async () => {
    const connection = await connectServer();

    const read = await connection.readResource(SAVE_CONFIRMATION_VIEW_URI);

    for (const item of read.contents) {
      expect(item._meta?.ui).toMatchObject({
        csp: { connectDomains: [], resourceDomains: [] },
        domain: SAVE_CONFIRMATION_VIEW_DOMAIN,
      });
      expect(item._meta?.["openai/widgetCSP"]).toEqual({
        connect_domains: [],
        resource_domains: [],
      });
    }
    await connection.close();
  });

  it("declares a different ui.domain from the application-list view", async () => {
    // Required, not cosmetic: two Interndex resources sharing a ui.domain
    // would share a sandbox, and with it, each other's storage.
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === SAVE_CONFIRMATION_VIEW_URI,
    );

    expect((resource!._meta?.ui as { domain?: string } | undefined)?.domain).not.toBe(
      APPLICATION_LIST_VIEW_DOMAIN,
    );
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
 * The ChatGPT Apps SDK contract.
 *
 * These drive the same `registerJobTrackTools` the route serves, over a real
 * MCP server, so what is asserted here is what a host actually reads: a tool
 * that names a view, and a view that resolves. The rest of this file is the
 * other half of the guarantee — `list_jobs` keeps its arguments, its text
 * block, its structured content and its ownership behaviour with the metadata
 * attached.
 */
describe("Apps SDK view served by the real server", () => {
  it("binds list_jobs to the view with the key ChatGPT reads", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "list_jobs",
    );

    // `openai/outputTemplate` is the association ChatGPT resolves. The MCP
    // Apps spellings ride alongside; all three must name the same resource.
    expect(tool!._meta).toMatchObject({
      "openai/outputTemplate": APPLICATION_LIST_VIEW_URI,
      ui: { resourceUri: APPLICATION_LIST_VIEW_URI },
      "ui/resourceUri": APPLICATION_LIST_VIEW_URI,
    });
    // The view renders a result; it may not call back into the tracker.
    expect(tool!._meta!["openai/widgetAccessible"]).toBe(false);
    await connection.close();
  });

  it("labels the tool invocation for the host to show", async () => {
    const connection = await connectServer();

    const tool = (await connection.listTools()).find(
      (candidate) => candidate.name === "list_jobs",
    );

    expect(tool!._meta!["openai/toolInvocation/invoking"]).toBeTypeOf("string");
    expect(tool!._meta!["openai/toolInvocation/invoked"]).toBeTypeOf("string");
    await connection.close();
  });

  it("gives each tool at most its own view, never another tool's", async () => {
    const connection = await connectServer();

    const templates = new Map(
      (await connection.listTools()).map((tool) => [
        tool.name,
        tool._meta?.["openai/outputTemplate"],
      ]),
    );

    expect(templates.get("list_jobs")).toBe(APPLICATION_LIST_VIEW_URI);
    expect(templates.get("save_job")).toBe(SAVE_CONFIRMATION_VIEW_URI);
    // import_jobs, get_job and update_job render no widget: nothing points
    // one of them at either view, or at any view at all.
    expect(templates.get("import_jobs")).toBeUndefined();
    expect(templates.get("get_job")).toBeUndefined();
    expect(templates.get("update_job")).toBeUndefined();
    await connection.close();
  });

  it("lists the view as text/html+skybridge", async () => {
    // The regression this pins: ChatGPT resolves the tool's outputTemplate to
    // a resource and renders a custom component only when that resource is
    // `text/html+skybridge`. Advertising the newer MCP Apps profile type here
    // instead left ChatGPT rendering its default table, with every other part
    // of the integration working.
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === APPLICATION_LIST_VIEW_URI,
    );

    expect(resource).toBeDefined();
    expect(resource!.mimeType).toBe("text/html+skybridge");
    expect(resource!.mimeType).toBe(APP_VIEW_MIME_TYPE);
    await connection.close();
  });

  it("carries the view association on the resource listing too", async () => {
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === APPLICATION_LIST_VIEW_URI,
    );

    expect(resource!._meta).toMatchObject({
      "openai/outputTemplate": APPLICATION_LIST_VIEW_URI,
      ui: { prefersBorder: false },
    });
    // A resource's `ui` says how to render the document, not what points at
    // it — `resourceUri` there would be the tool's spelling in the wrong place.
    expect(resource!._meta!.ui).not.toHaveProperty("resourceUri");
    await connection.close();
  });

  /*
   * The regression this pins: a live ChatGPT connector showed "Widget CSP is
   * not set" and "Widget domain is not set" for this exact resource, because
   * `appViewResourceMeta` never declared either at all. Both CSP spellings a
   * host might read must reach the wire — the modern `ui.csp` (camelCase) and
   * the legacy flat `openai/widgetCSP` (snake_case) — with an explicit empty
   * policy, since this view fetches and loads nothing of its own. `ui.domain`
   * must also be present: ChatGPT's own app-submission checklist requires it
   * per resource, which supersedes the generic MCP Apps spec's "optional,
   * host assigns a default" framing — see lib/mcp/app-views.ts's top comment.
   */
  it("declares an explicit, empty CSP and a present ui.domain on the resource listing", async () => {
    const connection = await connectServer();

    const resource = (await connection.listResources()).find(
      (candidate) => candidate.uri === APPLICATION_LIST_VIEW_URI,
    );

    expect(resource!._meta?.ui).toMatchObject({
      csp: { connectDomains: [], resourceDomains: [] },
      domain: APPLICATION_LIST_VIEW_DOMAIN,
    });
    expect(resource!._meta?.["openai/widgetCSP"]).toEqual({
      connect_domains: [],
      resource_domains: [],
    });
    // Distinct from the save-confirmation view's domain: two resources
    // sharing one would share a sandbox, and with it, each other's storage.
    expect((resource!._meta?.ui as { domain?: string } | undefined)?.domain).not.toBe(
      SAVE_CONFIRMATION_VIEW_DOMAIN,
    );
    await connection.close();
  });

  it("advertises the view as a resource template as well", async () => {
    const connection = await connectServer();

    const template = (await connection.listResourceTemplates()).find(
      (candidate) => candidate.uriTemplate === APPLICATION_LIST_VIEW_URI,
    );

    expect(template).toBeDefined();
    expect(template!.mimeType).toBe(APP_VIEW_MIME_TYPE);
    expect(template!._meta).toMatchObject({
      "openai/outputTemplate": APPLICATION_LIST_VIEW_URI,
    });
    await connection.close();
  });

  it("lists the view exactly once", async () => {
    // The template lists nothing of its own, so registering the view twice
    // does not put it in `resources/list` twice.
    const connection = await connectServer();

    const matches = (await connection.listResources()).filter(
      (candidate) => candidate.uri === APPLICATION_LIST_VIEW_URI,
    );

    expect(matches).toHaveLength(1);
    await connection.close();
  });

  it("reads the view as skybridge first, MCP Apps second", async () => {
    const connection = await connectServer();

    const read = await connection.readResource(APPLICATION_LIST_VIEW_URI);

    // Order matters: a host that takes the first content item must get the
    // type it asked for.
    expect(read.contents.map((item) => item.mimeType)).toEqual([
      APP_VIEW_MIME_TYPE,
      MCP_APPS_VIEW_MIME_TYPE,
    ]);
    // One document, offered twice — not two views that could drift apart.
    for (const item of read.contents) {
      expect(item.text).toBe(APPLICATION_LIST_VIEW_HTML);
      expect(item.text).toContain("<!doctype html>");
      expect(item._meta).toMatchObject({
        "openai/outputTemplate": APPLICATION_LIST_VIEW_URI,
      });
      // Declared on every content item a resources/read can return, not only
      // on the resource listing — a host is entitled to read either.
      expect(item._meta?.ui).toMatchObject({
        csp: { connectDomains: [], resourceDomains: [] },
        domain: APPLICATION_LIST_VIEW_DOMAIN,
      });
      expect(item._meta?.["openai/widgetCSP"]).toEqual({
        connect_domains: [],
        resource_domains: [],
      });
    }
    await connection.close();
  });

  it("repeats the view association on the list_jobs result", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});

    expect(result._meta).toMatchObject({
      "openai/outputTemplate": APPLICATION_LIST_VIEW_URI,
    });
    await connection.close();
  });

  it("keeps full list records in structured content only", async () => {
    const connection = await connectServer();

    const result = await connection.callTool("list_jobs", {});

    expect(result.content).toEqual([
      { type: "text", text: "2 applications found." },
    ]);
    const content = result.content.map((item) => item.text).join("\n");
    expect(content).not.toContain("RBC");
    expect(content).not.toContain("Shopify");
    expect(content).not.toMatch(/^\s*\|?.+\|.+$/m);
    expect(result.structuredContent).toHaveProperty("applications");
    expect(result.structuredContent).toHaveProperty("has_more");
    await connection.close();
  });

  it("serves the view without ever reading a student's applications", async () => {
    // No auth is passed to `resources/read` here. The document is static, so
    // it resolves; nothing student-owned can be in it, and the assertion is
    // that no application text ever appears in the view's body.
    const connection = await connectServer();

    const read = await connection.readResource(APPLICATION_LIST_VIEW_URI);

    for (const item of read.contents) {
      expect(item.text).not.toContain("RBC");
      expect(item.text).not.toContain("Shopify");
      expect(item.text).not.toContain(STUDENT);
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
