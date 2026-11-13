import {
  InMemoryTransport,
  LATEST_PROTOCOL_VERSION,
  McpServer,
  type AuthInfo,
  type JSONRPCMessage,
} from "@modelcontextprotocol/server";
import type { LedgerRow } from "@/lib/agent/ledger";
import { sameCompanyAndTitle } from "@/lib/agent/dedupe";
import type { LibraryStory, LibraryVariant } from "@/lib/agent/library/scoring";
import type {
  AgentProfile,
  AgentRule,
  AgentTemplate,
  Requirement,
} from "@/lib/agent/types";
import { displayOptionalText, toApplicationInsert } from "@/lib/applications/mapper";
import type {
  AgentRepository,
  AgentRepositoryFactory,
  SavedAnswer,
} from "@/lib/mcp/agent-tools";
import { configureMcpServer, type McpServerKind } from "@/lib/mcp/servers";
import type { JobTrackRepositoryFactory } from "@/lib/mcp/tools";
import { toMonthDate } from "@/lib/validation/agent";

export const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const STRANGER = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export function authFor(userId: string): AuthInfo {
  return { token: `token-for-${userId}`, clientId: "claude", scopes: [], extra: { userId } };
}

type StoredApplication = {
  id: string;
  user_id: string;
  company_name: string;
  original_job_title: string;
  location: string;
  job_id: string | null;
  job_description: string | null;
  application_url: string | null;
  current_status: string;
  date_applied: string | null;
  application_deadline: string | null;
  jd_requirements: Requirement[] | null;
  partner_functions: string[] | null;
  created_at: string;
};

/** In-memory agent data, shared by every repository the factory hands out. */
export class FakeAgentStore {
  applications: StoredApplication[] = [];
  ledger = new Map<string, LedgerRow[]>();
  library: LibraryStory[] = [];
  experiences: { id: string; org: string; official_title: string; start_date: string }[] = [];
  rules: (AgentRule & { user_id: string })[] = [];
  templates: AgentTemplate[] = [];
  profile: AgentProfile | null = null;
  answers: SavedAnswer[] = [];
  edits: { before_text: string; after_text: string }[] = [];
  usage: { applicationId: string | null; tool: string; bytes: number }[] = [];
  /** How many repositories were created, so tests can prove none was. */
  repositoriesCreated = 0;
  private sequence = 0;

  nextId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  factory: AgentRepositoryFactory = ({ userId }) => {
    this.repositoriesCreated += 1;
    return this.repositoryFor(userId);
  };

  private repositoryFor(userId: string): AgentRepository {
    const ok = <T>(data: T) => Promise.resolve({ data, error: null });
    const owned = () => this.applications.filter((row) => row.user_id === userId);

    return {
      readPlaybookContext: () =>
        ok({
          rules: this.rules.filter((rule) => rule.user_id === userId),
          profile: this.profile,
          templates: this.templates,
        }),
      findMatchingApplications: (company, title) =>
        ok(
          sameCompanyAndTitle(owned(), company, title).map((row) => {
            const stored = owned().find((application) => application.id === row.id)!;
            return {
              id: stored.id,
              job_id: stored.job_id,
              has_job_description: stored.job_description !== null,
              has_application_url: stored.application_url !== null,
              created_at: stored.created_at,
            };
          }),
        ),
      createAgentApplication: (input, extras) => {
        const insert = toApplicationInsert(input);
        const id = this.nextId();
        this.applications.push({
          id,
          user_id: userId,
          company_name: insert.company_name,
          original_job_title: insert.original_job_title,
          location: insert.location,
          job_id: extras.job_id,
          job_description: insert.job_description ?? null,
          application_url: insert.application_url ?? null,
          current_status: insert.current_status,
          date_applied: null,
          application_deadline: insert.application_deadline ?? null,
          jd_requirements: extras.jd_requirements,
          partner_functions: extras.partner_functions,
          created_at: new Date(2026, 10, this.sequence).toISOString(),
        });
        return ok({ id });
      },
      enrichAgentApplication: async (id, patch) => {
        const row = owned().find((application) => application.id === id);
        if (row) Object.assign(row, patch);
        return { error: null };
      },
      readLedger: (applicationId) => ok(this.ledger.get(applicationId) ?? []),
      writeLedger: async (applicationId, step, status) => {
        const rows = this.ledger.get(applicationId) ?? [];
        const existing = rows.find((row) => row.step === step);
        if (existing) {
          existing.status = status;
          existing.count += 1;
        } else {
          rows.push({ step, status, count: 1 });
        }
        this.ledger.set(applicationId, rows);
        return { error: null };
      },
      readBriefRows: (applicationId) => {
        const row = owned().find((application) => application.id === applicationId);
        if (!row) return ok(null);
        return ok({
          application: {
            id: row.id,
            company_name: row.company_name,
            original_job_title: row.original_job_title,
            location: displayOptionalText(row.location),
            job_id: row.job_id,
            application_url: row.application_url,
            current_status: row.current_status,
            date_applied: row.date_applied,
            application_deadline: row.application_deadline,
            partner_functions: row.partner_functions,
          },
          requirements: row.jd_requirements ?? [],
          ledger: this.ledger.get(applicationId) ?? [],
          resume: null,
          answersCount: this.answers.filter((answer) => answer.application_id === applicationId).length,
        });
      },
      listLibrary: () => ok(this.library),
      insertVariant: (variant) => {
        const story = this.library.find((entry) => entry.id === variant.story_id);
        if (!story) return Promise.resolve({ data: null, error: { code: "23503" } });
        const existing = story.variants.find((entry) => entry.text === variant.text);
        if (existing) return ok({ id: existing.id, created: false });
        const saved: LibraryVariant = {
          id: this.nextId(),
          text: variant.text,
          style: variant.style,
          angles: variant.angles,
          template_fit: variant.template_fit,
          char_count: variant.text.length,
          is_gold: false,
          explain_note: variant.explain_note,
          created_at: new Date().toISOString(),
        };
        story.variants = [...story.variants, saved];
        return ok({ id: saved.id, created: true });
      },
      insertEditExample: async (row) => {
        this.edits.push(row);
        return { error: null };
      },
      insertRule: (scope, text) => {
        const exists = this.rules.some(
          (rule) => rule.user_id === userId && rule.scope === scope && rule.text === text,
        );
        if (!exists) this.rules.push({ user_id: userId, scope, text });
        return ok({ created: !exists });
      },
      readRules: (scopes) =>
        ok(this.rules.filter((rule) => rule.user_id === userId && scopes.includes(rule.scope))),
      readTemplate: (name) => ok(this.templates.find((template) => template.name === name) ?? null),
      insertAnswer: (row) => {
        const id = this.nextId();
        this.answers.push({ id, ...row });
        return ok({ id });
      },
      listAnswers: () => ok(this.answers),
      importLibrary: (input) => {
        if (input.profile) {
          this.profile = {
            school: input.profile.school ?? null,
            program: input.profile.program ?? null,
            degree_level: input.profile.degree_level ?? null,
            expected_graduation: input.profile.expected_graduation
              ? toMonthDate(input.profile.expected_graduation)
              : null,
            year_of_study: input.profile.year_of_study ?? null,
            notes: null,
          };
        }
        const experienceIds = new Map<string, string>();
        for (const experience of input.experiences) {
          const start = toMonthDate(experience.start);
          let row = this.experiences.find(
            (saved) =>
              saved.org === experience.org &&
              saved.official_title === experience.official_title &&
              saved.start_date === start,
          );
          if (!row) {
            row = { id: this.nextId(), org: experience.org, official_title: experience.official_title, start_date: start };
            this.experiences.push(row);
          }
          experienceIds.set(experience.key, row.id);
        }
        const storyIds = new Map<string, string>();
        for (const story of input.stories) {
          const experience = this.experiences.find((row) => row.id === experienceIds.get(story.experience_key))!;
          let saved = this.library.find(
            (entry) => entry.org === experience.org && entry.label === story.label,
          );
          if (!saved) {
            saved = {
              id: this.nextId(),
              label: story.label,
              summary: story.summary ?? null,
              tags: story.tags,
              org: experience.org,
              official_title: experience.official_title,
              variants: [],
            };
            this.library.push(saved);
          }
          storyIds.set(story.key, saved.id);
        }
        let added = 0;
        for (const variant of input.variants) {
          const story = this.library.find((entry) => entry.id === storyIds.get(variant.story_key))!;
          if (story.variants.some((entry) => entry.text === variant.text)) continue;
          story.variants = [
            ...story.variants,
            {
              id: this.nextId(),
              text: variant.text,
              style: variant.style,
              angles: variant.angles,
              template_fit: variant.template_fit,
              char_count: variant.text.length,
              is_gold: variant.is_gold,
              explain_note: variant.explain_note ?? null,
              created_at: new Date().toISOString(),
            },
          ];
          added += 1;
        }
        return ok({
          experiences: experienceIds.size,
          stories: storyIds.size,
          variants_added: added,
          variants_existing: input.variants.length - added,
          profile_saved: Boolean(input.profile),
        });
      },
      logUsage: async (applicationId, tool, bytes) => {
        this.usage.push({ applicationId, tool, bytes });
      },
    };
  }
}

/** The tracker tools are not under test here; any call to them is a bug. */
const unusedJobTrack: JobTrackRepositoryFactory = () => {
  throw new Error("The tracker repository should not be used by agent tools.");
};

export type ToolResult = {
  isError?: boolean;
  content: { type: string; text: string }[];
};

export type ListedTool = {
  name: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean };
};

export async function connect(kind: McpServerKind, store: FakeAgentStore) {
  const server = new McpServer(
    { name: "interndex", version: "0.1.0" },
  );
  configureMcpServer(server, kind, { jobTrack: unusedJobTrack, agent: store.factory });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const pending = new Map<number, (message: JSONRPCMessage) => void>();
  let nextId = 0;
  clientTransport.onmessage = (message) => {
    const id = (message as { id?: number }).id;
    if (typeof id === "number") pending.get(id)?.(message);
  };
  await clientTransport.start();

  async function request<T>(method: string, params: Record<string, unknown>, authInfo?: AuthInfo): Promise<T> {
    const id = (nextId += 1);
    const response = new Promise<JSONRPCMessage>((resolve) => pending.set(id, resolve));
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
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  return {
    listTools: () => request<{ tools: ListedTool[] }>("tools/list", {}).then((result) => result.tools),
    call: (name: string, args: Record<string, unknown>, userId: string | null = OWNER) =>
      request<ToolResult>(
        "tools/call",
        { name, arguments: args },
        userId ? authFor(userId) : undefined,
      ),
  };
}

/** Parses an agent tool's compact JSON answer. */
export function json<T = Record<string, unknown>>(result: ToolResult): T {
  if (result.isError) throw new Error(`Tool error: ${result.content[0]?.text}`);
  return JSON.parse(result.content[0].text) as T;
}
