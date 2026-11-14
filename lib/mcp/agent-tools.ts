import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { buildApplicationBrief, type BriefSource } from "@/lib/agent/brief";
import { byteLength, serializeCapped, truncate, type CappedTool } from "@/lib/agent/caps";
import { boldProblems } from "@/lib/agent/checks/bold";
import { checkBullets, lineFillCheck, type LineTargets } from "@/lib/agent/checks/bullets";
import { phrasesFromRules } from "@/lib/agent/checks/text-rules";
import { pickDuplicate } from "@/lib/agent/dedupe";
import {
  mayRunStep,
  summarizeRunState,
  type LedgerRow,
  type LedgerStatus,
  type RunStep,
} from "@/lib/agent/ledger";
import { rankStories, tokenize, type LibraryStory, type VariantUsability } from "@/lib/agent/library/scoring";
import { assessFit, degreeRisks, VERDICT_LABELS, verdictAllowed } from "@/lib/agent/fit";
import { isAgentOwner } from "@/lib/agent/owner";
import { buildPlaybook, type PlaybookContext } from "@/lib/agent/playbook";
import { allowsOneLine } from "@/lib/agent/resume/line-rules";
import { bulletCountProblems } from "@/lib/agent/resume/page-fill";
import {
  buildResume,
  calibrateTemplate,
  readTemplateLayout,
  resolveTemplateSkeleton,
  type BuildDependencies,
  type BuildRepository,
} from "@/lib/agent/resume/build";
import { renderTailoredResume, type TailoredContent } from "@/lib/agent/resume/content";
import type { ResumeRenderer } from "@/lib/agent/resume/render";
import type { ResumeLolClient } from "@/lib/agent/resumelol/client";
import type {
  AgentRule,
  AgentTemplate,
  Requirement,
  RuleScope,
  TemplateName,
  VariantSource,
  VariantStyle,
} from "@/lib/agent/types";
import { externalJobRecordSchema, toApplicationCreationValues } from "@/lib/applications/external-record";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/instructions";
import { instrumentToolCall, type ToolCallContext } from "@/lib/mcp/telemetry";
import { readUserId } from "@/lib/mcp/user";
import {
  addRuleInputSchema,
  applicationOnlyInputSchema,
  buildResumeInputSchema,
  calibrateTemplateInputSchema,
  checkBulletsInputSchema,
  completeRunInputSchema,
  createApplicationFromJdInputSchema,
  getPlaybookInputSchema,
  importLibraryInputSchema,
  rebuildWithEditsInputSchema,
  recordEditInputSchema,
  saveAnswerInputSchema,
  saveVariantInputSchema,
  searchAnswersInputSchema,
  searchStoriesInputSchema,
  toMonthDate,
  type CompleteRunInput,
  type ImportLibraryInput,
} from "@/lib/validation/agent";
import {
  applicationCreationSchema,
  type ApplicationCreationInput,
} from "@/lib/validation/application";

/**
 * The recruiting agent's MCP tools (Spec 1). Owner only.
 *
 * These are registered only on the `agent` server (`lib/mcp/servers.ts`),
 * which the route serves to the `OWNER_USER_ID` account alone. Each tool also
 * checks the owner again before doing anything, so registering one on the
 * wrong server by mistake would still refuse every other user. Underneath
 * both, row-level security limits every row to its owner.
 *
 * Conventions every tool here follows:
 *
 * - Compact JSON results, no prose (Spec 1: "Compact JSON responses").
 * - A size cap per tool (`lib/agent/caps.ts`), and the bytes of every result
 *   written to `usage_log` with the application it was for.
 * - The full job description is stored once by `create_application_from_jd`
 *   and never returned by any agent tool.
 * - No tool takes a user id. Ownership comes from the access token.
 */

/** Added to the standard instructions on the owner's server only. */
export const AGENT_SERVER_INSTRUCTIONS = `${MCP_SERVER_INSTRUCTIONS}

This account also has the Interndex recruiting agent. When David pastes a job description or asks to run on a posting, call get_playbook with phase "run" first and follow its steps in order, without stopping for approval. Use get_application_brief, never get_job or old chat history, to pick a posting back up. Agent tools answer in compact JSON; summarize, do not restate it.`;

// ------------------------------------------------------------ repository --

type DbError = { code?: string } | null;
type Read<T> = Promise<{ data: T | null; error: DbError }>;

export type MatchingApplication = {
  id: string;
  job_id: string | null;
  has_job_description: boolean;
  has_application_url: boolean;
  created_at: string;
};

export type AgentApplicationExtras = {
  jd_requirements: Requirement[];
  job_id: string | null;
  partner_functions: string[];
};

export type AgentApplicationPatch = Partial<
  AgentApplicationExtras & { job_description: string; application_url: string }
>;

/**
 * A run's usage as the server can see it: tool calls, and the bytes they sent
 * in and got back (estimated tokens are bytes / 4). Calls that named no
 * application but fell between this run's first and last call count too.
 * It cannot see the chat's own tokens (the conversation, reasoning, project
 * files), so it is a lower bound.
 */
export type RunUsage = {
  tool_calls: number;
  request_bytes: number;
  response_bytes: number;
  est_tokens: number;
  by_tool: Record<string, number>;
};

export type BriefRows = Omit<BriefSource, "runState"> & { ledger: LedgerRow[] };

export type NewVariant = {
  story_id: string;
  text: string;
  style: VariantStyle;
  angles: string[];
  template_fit: TemplateName[];
  explain_note: string | null;
  source: VariantSource;
};

export type SavedAnswer = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  application_id: string | null;
};

export type ImportSummary = {
  experiences: number;
  stories: number;
  variants_added: number;
  variants_existing: number;
  profile_saved: boolean;
};

/**
 * Data access for the agent tools, already bound to one verified user.
 *
 * `lib/mcp/agent-repository.ts` implements it over Supabase with the caller's
 * own token, so row-level security is the enforcing boundary. Tests inject an
 * in-memory version, exactly as `lib/mcp/tools.ts` does for the tracker tools.
 */
export type AgentRepository = {
  readPlaybookContext: () => Read<PlaybookContext>;
  /** Same company and title (normalized), newest first. */
  findMatchingApplications: (company: string, title: string) => Read<MatchingApplication[]>;
  createAgentApplication: (
    input: ApplicationCreationInput,
    extras: AgentApplicationExtras,
  ) => Read<{ id: string }>;
  enrichAgentApplication: (id: string, patch: AgentApplicationPatch) => Promise<{ error: DbError }>;
  readLedger: (applicationId: string) => Read<LedgerRow[]>;
  writeLedger: (applicationId: string, step: RunStep, status: LedgerStatus) => Promise<{ error: DbError }>;
  /** Null data with no error means the application is not in this tracker. */
  readBriefRows: (applicationId: string) => Read<BriefRows>;
  listLibrary: () => Read<LibraryStory[]>;
  insertVariant: (variant: NewVariant) => Read<{ id: string; created: boolean }>;
  insertEditExample: (row: {
    variant_id: string | null;
    before_text: string;
    after_text: string;
    note: string | null;
  }) => Promise<{ error: DbError }>;
  insertRule: (scope: RuleScope, text: string) => Read<{ created: boolean }>;
  readRules: (scopes: readonly RuleScope[]) => Read<AgentRule[]>;
  readTemplate: (name: TemplateName) => Read<AgentTemplate>;
  insertAnswer: (row: {
    question: string;
    answer: string;
    tags: string[];
    application_id: string | null;
  }) => Read<{ id: string }>;
  listAnswers: () => Read<SavedAnswer[]>;
  importLibrary: (input: ImportLibraryInput) => Read<ImportSummary>;
  /**
   * The one-transaction save at the end of a run (the `complete_run`
   * database function): fit read, tailored resume, new variants, answers and
   * ledger, or nothing.
   */
  completeRun: (input: {
    application_id: string;
    template: TemplateName;
    fit_read: CompleteRunInput["fit_read"];
    content: TailoredContent;
    mirrored_title: string | null;
    variants: CompleteRunInput["new_variants"];
    answers: CompleteRunInput["answers"];
  }) => Read<{ tailored_resume_id: string; created: boolean; variants_added: number; answers_added: number }>;
  /** Every template's base resume id, so the resume.lol client never writes one. */
  listTemplateRefs: () => Read<string[]>;
  /** Never throws: a usage-log failure must not fail the tool call. */
  logUsage: (applicationId: string | null, tool: string, bytes: number, requestBytes?: number) => Promise<void>;
  /** What one application's run has used so far, from usage_log. */
  readRunUsage: (applicationId: string) => Read<RunUsage>;
} & BuildRepository;

/**
 * The outside services the resume tools use: resume.lol and headless Chrome.
 * The route passes the real ones (`lib/agent/resume/services.ts`); tests pass
 * fakes, so no test reaches the network or needs a browser.
 */
export type AgentServices = {
  resumeLol: (protectedIds: readonly string[]) => ResumeLolClient;
  render: ResumeRenderer;
  log: (event: Record<string, unknown>) => void;
};

export type AgentRepositoryFactory = (identity: {
  token: string;
  userId: string;
}) => AgentRepository;

// ---------------------------------------------------------------- helpers --

const NOT_SIGNED_IN = "Not signed in to Interndex.";
const NOT_AVAILABLE = "This tool is not available for this account.";
const NOT_IN_TRACKER = "No application with that id is in this tracker.";

/** The run's usage for a result, or nothing when it cannot be read. */
async function usageField(repository: AgentRepository, applicationId: string) {
  const usage = await repository.readRunUsage(applicationId);
  return usage.data ? { usage: usage.data } : {};
}

type Outcome =
  | { ok: true; value: unknown; applicationId?: string | null }
  | { ok: false; message: string };

const fail = (message: string): Outcome => ({ ok: false, message });
const dbFail = (what: string, error: DbError): Outcome =>
  fail(`${what} failed. Database error ${error?.code ?? "unknown"}.`);

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const IDEMPOTENT_WRITE: ToolAnnotations = { ...WRITE, idempotentHint: true };
/** Calls resume.lol, outside Interndex. */
const EXTERNAL_WRITE: ToolAnnotations = { ...WRITE, openWorldHint: true };

function targetsOf(
  template: Pick<AgentTemplate, "one_line_chars" | "two_line_min" | "two_line_max"> | null,
): LineTargets | null {
  if (
    !template ||
    template.one_line_chars === null ||
    template.two_line_min === null ||
    template.two_line_max === null
  ) {
    return null;
  }
  return {
    oneLineChars: template.one_line_chars,
    twoLineMin: template.two_line_min,
    twoLineMax: template.two_line_max,
  };
}

/** Every number on a resume needs a talking point (STANDARDS.md). */
const HAS_NUMBER = /\d/;

/**
 * Registers one agent tool with the checks every agent tool shares: a signed-in
 * caller, the owner gate, the size cap, and the usage log.
 */
function registerAgentTool<Schema extends z.ZodObject>(
  server: McpServer,
  repositoryFor: AgentRepositoryFactory,
  name: CappedTool,
  config: {
    title: string;
    description: string;
    inputSchema: Schema;
    annotations: ToolAnnotations;
  },
  run: (args: z.infer<Schema>, repository: AgentRepository, userId: string) => Promise<Outcome>,
): void {
  // Widened to a concrete schema type so the SDK can type its callback; the
  // tool body still receives `args` typed from the specific schema.
  const inputSchema: z.ZodObject = config.inputSchema;
  server.registerTool(name, { ...config, inputSchema }, async (rawArgs, ctx) =>
    instrumentToolCall(name, ctx as ToolCallContext, async () => {
      // The SDK has already validated rawArgs against inputSchema.
      const args = rawArgs as z.infer<Schema>;
      const authInfo = ctx.http?.authInfo;
      const userId = readUserId(authInfo);
      if (!authInfo || !userId) return toolError(NOT_SIGNED_IN);
      if (!isAgentOwner(userId)) return toolError(NOT_AVAILABLE);

      const repository = repositoryFor({ token: authInfo.token, userId });
      const outcome = await run(args, repository, userId);
      if (!outcome.ok) return toolError(outcome.message);

      const serialized = serializeCapped(name, outcome.value);
      const applicationId =
        outcome.applicationId ??
        ((args as { application_id?: string }).application_id ?? null);
      await repository.logUsage(applicationId, name, serialized.bytes, byteLength(JSON.stringify(rawArgs ?? {})));

      if (!serialized.ok) {
        return toolError(
          `The ${name} result was ${serialized.bytes} bytes, over its ${serialized.cap}-byte cap, so it was not sent.`,
        );
      }
      return { content: [{ type: "text" as const, text: serialized.text }] };
    }),
  );
}

// ------------------------------------------------------------------ tools --

export function registerAgentTools(
  server: McpServer,
  repositoryFor: AgentRepositoryFactory,
  services: AgentServices,
): void {
  async function buildDependencies(
    repository: AgentRepository,
    userId: string,
  ): Promise<BuildDependencies | Outcome> {
    const refs = await repository.listTemplateRefs();
    if (refs.error || !refs.data) return dbFail("Reading the templates", refs.error);
    return {
      userId,
      repository,
      resumeLol: services.resumeLol(refs.data),
      render: services.render,
      log: services.log,
    };
  }

  registerAgentTool(
    server,
    repositoryFor,
    "get_playbook",
    {
      title: "Get playbook",
      description:
        "Returns the steps for a phase (run, library_session, import), the matching standards, David's fit-read profile, template status and every saved rule. Call first in every run.",
      inputSchema: getPlaybookInputSchema,
      annotations: READ_ONLY,
    },
    async ({ phase }, repository) => {
      const { data, error } = await repository.readPlaybookContext();
      if (error || !data) return dbFail("Reading the playbook", error);
      return { ok: true, value: buildPlaybook(phase, data) };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "get_run_state",
    {
      title: "Get run state",
      description:
        "Which run steps are done for an application, and the next one. Never redo a done step unless David asks.",
      inputSchema: applicationOnlyInputSchema,
      annotations: READ_ONLY,
    },
    async ({ application_id }, repository) => {
      const brief = await repository.readBriefRows(application_id);
      if (brief.error) return dbFail("Reading the run state", brief.error);
      if (!brief.data) return fail(NOT_IN_TRACKER);
      return {
        ok: true,
        value: {
          application_id,
          ...summarizeRunState(brief.data.ledger),
          ...(await usageField(repository, application_id)),
          resume: brief.data.resume
            ? {
                status: brief.data.resume.status,
                builds_left: Math.max(0, 2 - brief.data.resume.build_count),
                has_pdf: brief.data.resume.has_pdf,
              }
            : null,
        },
      };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "get_application_brief",
    {
      title: "Get application brief",
      description:
        "Everything needed to pick a posting back up in a new chat, under 300 words: the posting's facts and requirements, run state and resume. Never includes the job description.",
      inputSchema: applicationOnlyInputSchema,
      annotations: READ_ONLY,
    },
    async ({ application_id }, repository) => {
      const { data, error } = await repository.readBriefRows(application_id);
      if (error) return dbFail("Reading the application", error);
      if (!data) return fail(NOT_IN_TRACKER);
      const { ledger, ...rows } = data;
      return {
        ok: true,
        value: buildApplicationBrief({ ...rows, runState: summarizeRunState(ledger) }),
      };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "create_application_from_jd",
    {
      title: "Create application from job description",
      description:
        "Saves a posting with its requirements once per run. Dedupes on company, title and job id: an existing match is reused and filled in, not duplicated. The job description is stored and never returned.",
      inputSchema: createApplicationFromJdInputSchema,
      annotations: IDEMPOTENT_WRITE,
    },
    async (args, repository) => {
      // The same record schema and creation rules save_job and the web form
      // use, so an agent-created application obeys exactly the same checks.
      const record = externalJobRecordSchema.safeParse({
        company: args.company,
        job_title: args.title,
        location: args.location,
        job_description: args.jd_text,
        job_url: args.source_url,
        source: args.source,
        deadline: args.deadline,
        work_term: args.work_term,
        work_arrangement: args.work_arrangement,
        category: args.category,
        company_domain: args.company_domain,
      });
      const parsed = record.success
        ? applicationCreationSchema.safeParse(toApplicationCreationValues(record.data))
        : record;
      if (!parsed.success) {
        return fail(
          `That posting could not be saved. ${parsed.error.issues.map((issue) => issue.message).join(" ")}`,
        );
      }

      const extras: AgentApplicationExtras = {
        jd_requirements: args.requirements,
        job_id: args.job_id ?? null,
        partner_functions: args.partner_functions,
      };

      const matches = await repository.findMatchingApplications(args.company, args.title);
      if (matches.error || !matches.data) return dbFail("Checking for duplicates", matches.error);

      const match = pickDuplicate(matches.data, args.job_id);

      let applicationId: string;
      let created: boolean;

      if (match) {
        const patch: AgentApplicationPatch = {};
        if (extras.jd_requirements.length) patch.jd_requirements = extras.jd_requirements;
        if (extras.partner_functions.length) patch.partner_functions = extras.partner_functions;
        if (extras.job_id && !match.job_id) patch.job_id = extras.job_id;
        if (!match.has_job_description) patch.job_description = args.jd_text;
        if (!match.has_application_url && parsed.data.applicationUrl) {
          patch.application_url = parsed.data.applicationUrl;
        }
        const { error } = await repository.enrichAgentApplication(match.id, patch);
        if (error) return dbFail("Updating the existing application", error);
        applicationId = match.id;
        created = false;
      } else {
        const { data, error } = await repository.createAgentApplication(parsed.data, extras);
        if (error || !data) return dbFail("Saving the posting", error);
        applicationId = data.id;
        created = true;
      }

      const ledger = await repository.readLedger(applicationId);
      if (ledger.error || !ledger.data) return dbFail("Reading the run state", ledger.error);
      if (mayRunStep(ledger.data, "application", false)) {
        const { error } = await repository.writeLedger(applicationId, "application", "done");
        if (error) return dbFail("Recording the run state", error);
      }
      const refreshed = await repository.readLedger(applicationId);

      return {
        ok: true,
        applicationId,
        value: {
          application_id: applicationId,
          created,
          ...summarizeRunState(refreshed.data ?? ledger.data),
        },
      };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "search_stories",
    {
      title: "Search story library",
      description:
        "Finds the library's best stories for the requirements in one call: up to 8 ranked stories, each with its facts (summary) and best 2 variants with explain notes, then the best story of every other experience on the resume (1 variant), plus the requirements no story matched. Deterministic.",
      inputSchema: searchStoriesInputSchema,
      annotations: READ_ONLY,
    },
    async ({ requirements, angles, template }, repository) => {
      const [library, templateRow, rules] = await Promise.all([
        repository.listLibrary(),
        repository.readTemplate(template),
        repository.readRules(["bullets", "all"]),
      ]);
      if (library.error || !library.data) return dbFail("Reading the library", library.error);
      if (templateRow.error) return dbFail("Reading the template", templateRow.error);
      if (rules.error || !rules.data) return dbFail("Reading saved rules", rules.error);
      // Offer first the wordings that can go on the page as they are: the
      // right length for this template, and not blocked by a saved rule.
      const targets = targetsOf(templateRow.data);
      const blocked = phrasesFromRules(rules.data.map((rule) => rule.text));
      const usability: VariantUsability = (variant, story) => {
        const plain = variant.text.replace(/\*\*/g, "");
        const isBlocked = blocked.some((phrase) => phrase.pattern.test(plain));
        const owner = story.org === story.official_title ? { title: story.org, org: null } : { title: story.official_title, org: story.org };
        const fits =
          targets !== null &&
          (lineFillCheck(plain.length, targets, { oneLineAllowed: allowsOneLine(owner) }) === null ||
            lineFillCheck(plain.length, targets, { oneLineAllowed: allowsOneLine({ title: story.org, org: null }) }) === null);
        return (fits ? 4 : 0) - (isBlocked ? 8 : 0);
      };
      return { ok: true, value: rankStories(library.data, { requirements, angles, template }, { usability }) };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "save_variant",
    {
      title: "Save story variant",
      description:
        "Saves a new wording of a story. House-style text must pass check_bullets first, and any text with a number needs an explain note. Saving the same text twice returns the existing variant.",
      inputSchema: saveVariantInputSchema,
      annotations: IDEMPOTENT_WRITE,
    },
    async (args, repository) => {
      if (HAS_NUMBER.test(args.text) && !args.explain_note) {
        return fail("This text has a number, so it needs an explain_note.");
      }
      if (args.style === "house") {
        const rules = await repository.readRules(["bullets", "all"]);
        if (rules.error || !rules.data) return dbFail("Reading saved rules", rules.error);
        const check = checkBullets([args.text], {
          targets: null,
          extraBlocked: phrasesFromRules(rules.data.map((rule) => rule.text)),
        });
        const failures = check.bullets.flatMap((bullet) => bullet.failures);
        if (failures.length) {
          return fail(
            `Not saved: it fails check_bullets. ${failures.map((failure) => failure.detail).join(" ")}`,
          );
        }
      }
      const { data, error } = await repository.insertVariant({
        story_id: args.story_id,
        text: args.text,
        style: args.style,
        angles: args.angles,
        template_fit: args.template_fit,
        explain_note: args.explain_note ?? null,
        source: args.source,
      });
      if (error?.code === "23503") return fail("No story with that id is in the library.");
      if (error || !data) return dbFail("Saving the variant", error);
      return { ok: true, value: { variant_id: data.id, created: data.created } };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "record_edit",
    {
      title: "Record an edit",
      description:
        "Saves a correction David made to a bullet (before and after) as an example for later runs.",
      inputSchema: recordEditInputSchema,
      annotations: WRITE,
    },
    async (args, repository) => {
      const { error } = await repository.insertEditExample({
        variant_id: args.variant_id ?? null,
        before_text: args.before_text,
        after_text: args.after_text,
        note: args.note ?? null,
      });
      if (error?.code === "23503") return fail("No variant with that id is in the library.");
      if (error) return dbFail("Saving the edit", error);
      return { ok: true, value: { saved: true } };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "add_rule",
    {
      title: "Add a rule",
      description:
        'Saves a general instruction from David ("don\'t mention X", "always do Y"). Rules load in every later get_playbook and override the defaults. Rules like Never use "word" also extend the bullet blocklist.',
      inputSchema: addRuleInputSchema,
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ scope, text }, repository) => {
      const { data, error } = await repository.insertRule(scope, text);
      if (error || !data) return dbFail("Saving the rule", error);
      return { ok: true, value: { saved: true, created: data.created } };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "check_bullets",
    {
      title: "Check bullets",
      description:
        "Checks a whole page of bullets against David's standards for the template. Returns failures (must fix) and warnings (review), per bullet and for the page. Only bullets with issues are listed.",
      inputSchema: checkBulletsInputSchema,
      annotations: READ_ONLY,
    },
    async ({ template, bullets, one_line_ok }, repository) => {
      const [templateRow, rules] = await Promise.all([
        repository.readTemplate(template),
        repository.readRules(["bullets", "all"]),
      ]);
      if (templateRow.error) return dbFail("Reading the template", templateRow.error);
      if (rules.error || !rules.data) return dbFail("Reading saved rules", rules.error);
      return {
        ok: true,
        value: checkBullets(bullets, {
          targets: targetsOf(templateRow.data),
          oneLineAllowed: bullets.map((_, index) => one_line_ok?.includes(index) ?? false),
          extraBlocked: phrasesFromRules(rules.data.map((rule) => rule.text)),
        }),
      };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "save_answer",
    {
      title: "Save an answer",
      description: "Saves an application question and David's answer for reuse.",
      inputSchema: saveAnswerInputSchema,
      annotations: WRITE,
    },
    async (args, repository) => {
      const { data, error } = await repository.insertAnswer({
        question: args.question,
        answer: args.answer,
        tags: args.tags,
        application_id: args.application_id ?? null,
      });
      if (error?.code === "23503") return fail(NOT_IN_TRACKER);
      if (error || !data) return dbFail("Saving the answer", error);
      return { ok: true, value: { answer_id: data.id } };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "search_answers",
    {
      title: "Search saved answers",
      description:
        "Finds David's saved answers closest to a question: at most 5, long answers shortened.",
      inputSchema: searchAnswersInputSchema,
      annotations: READ_ONLY,
    },
    async ({ query }, repository) => {
      const { data, error } = await repository.listAnswers();
      if (error || !data) return dbFail("Reading saved answers", error);
      const queryTokens = new Set(tokenize(query));
      const ranked = data
        .map((answer) => {
          const tokens = new Set(tokenize(`${answer.question} ${answer.tags.join(" ")}`));
          let score = 0;
          for (const token of queryTokens) if (tokens.has(token)) score += 1;
          return { answer, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.answer.id.localeCompare(b.answer.id))
        .slice(0, 5)
        .map(({ answer, score }) => ({
          answer_id: answer.id,
          question: truncate(answer.question, 300),
          answer: truncate(answer.answer, 1000),
          score,
        }));
      return { ok: true, value: { answers: ranked } };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "import_library",
    {
      title: "Import story library",
      description:
        "One-time import of experiences, stories, variants and the fit-read profile. Safe to repeat: anything already saved is skipped. Keys only link items within this call. Any variant with a number needs an explain note.",
      inputSchema: importLibraryInputSchema,
      annotations: IDEMPOTENT_WRITE,
    },
    async (args, repository) => {
      const experienceKeys = new Set(args.experiences.map((experience) => experience.key));
      const storyKeys = new Set(args.stories.map((story) => story.key));
      const problems: string[] = [];

      // One upsert per level cannot touch the same row twice, so the same
      // experience or story may appear only once in a call.
      const seenExperiences = new Set<string>();
      args.experiences.forEach((experience, index) => {
        const naturalKey = `${experience.org}\u0000${experience.official_title}\u0000${toMonthDate(experience.start)}`;
        if (seenExperiences.has(naturalKey)) {
          problems.push(`experiences[${index}] repeats an earlier experience.`);
        }
        seenExperiences.add(naturalKey);
      });
      const seenStories = new Set<string>();
      args.stories.forEach((story, index) => {
        if (!experienceKeys.has(story.experience_key)) {
          problems.push(`stories[${index}] names unknown experience_key "${story.experience_key}".`);
        }
        const naturalKey = `${story.experience_key}\u0000${story.label}`;
        if (seenStories.has(naturalKey)) {
          problems.push(`stories[${index}] repeats a label already used for that experience.`);
        }
        seenStories.add(naturalKey);
      });
      args.variants.forEach((variant, index) => {
        if (!storyKeys.has(variant.story_key)) {
          problems.push(`variants[${index}] names unknown story_key "${variant.story_key}".`);
        }
        if (HAS_NUMBER.test(variant.text) && !variant.explain_note) {
          problems.push(`variants[${index}] has a number but no explain_note.`);
        }
      });
      if (problems.length) {
        return fail(`Nothing was imported. ${problems.slice(0, 10).join(" ")}`);
      }

      const { data, error } = await repository.importLibrary(args);
      if (error || !data) return dbFail("Importing the library", error);
      return { ok: true, value: data };
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "calibrate_template",
    {
      title: "Calibrate a template",
      description:
        "Measures the template's base resume on resume.lol (read only, never changed) in a real browser and saves its line targets and the entry keys tailored content uses. Run once per template, and again after David changes the base resume.",
      inputSchema: calibrateTemplateInputSchema,
      annotations: { ...IDEMPOTENT_WRITE, openWorldHint: true },
    },
    async (args, repository, userId) => {
      const deps = await buildDependencies(repository, userId);
      if ("ok" in deps) return deps;
      const result = await calibrateTemplate(deps, args);
      return result.ok ? { ok: true, value: result.value } : fail(result.message);
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "build_resume",
    {
      title: "Build resume",
      description:
        "Builds a saved tailored resume once: checks every bullet, creates a new resume on resume.lol, prints the PDF on the server, checks it is one page with no widows, and stores it privately. At most 2 builds per resume, counting rebuilds. If the server cannot print, the resume and its HTML are still saved and layout_check is skipped.",
      inputSchema: buildResumeInputSchema,
      annotations: EXTERNAL_WRITE,
    },
    async ({ tailored_resume_id }, repository, userId) => {
      const deps = await buildDependencies(repository, userId);
      if ("ok" in deps) return deps;
      const result = await buildResume(deps, { tailored_resume_id, mode: "build" });
      return result.ok
        ? { ok: true, value: result.value, applicationId: result.value.application_id }
        : fail(result.message);
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "rebuild_with_edits",
    {
      title: "Rebuild with David's edits",
      description:
        "Applies David's exact edits from the apply step, updates the same resume.lol resume in place (never if he changed its content there), reprints and rechecks the PDF, and saves each edit as an example. Counts toward the 2-build cap.",
      inputSchema: rebuildWithEditsInputSchema,
      annotations: EXTERNAL_WRITE,
    },
    async ({ tailored_resume_id, edits, keep_failing_edits }, repository, userId) => {
      const deps = await buildDependencies(repository, userId);
      if ("ok" in deps) return deps;
      const result = await buildResume(deps, {
        tailored_resume_id,
        mode: "rebuild",
        edits,
        keep_failing_edits,
      });
      return result.ok
        ? { ok: true, value: result.value, applicationId: result.value.application_id }
        : fail(result.message);
    },
  );

  registerAgentTool(
    server,
    repositoryFor,
    "complete_run",
    {
      title: "Complete the run",
      description:
        "Saves the end of a run in one transaction: the fit read, the tailored resume, new variants with their explain notes, and any answers. Checks the whole page first and saves nothing if it fails. Then builds the resume (as build_resume does). Call once per run.",
      inputSchema: completeRunInputSchema,
      annotations: EXTERNAL_WRITE,
    },
    async (args, repository, userId) => {
      if (args.people?.length) return fail("The people step is not available yet. Leave people out.");

      const ledger = await repository.readLedger(args.application_id);
      if (ledger.error || !ledger.data) return dbFail("Reading the run state", ledger.error);
      if (!mayRunStep(ledger.data, "tailor", args.force)) {
        return fail("This run is already saved. Use get_run_state. Pass force: true only if David asks to redo it.");
      }

      const [template, rules] = await Promise.all([
        repository.readTemplateForCalibration(args.template),
        repository.readRules(["bullets", "all"]),
      ]);
      if (template.error) return dbFail("Reading the template", template.error);
      if (rules.error || !rules.data) return dbFail("Reading saved rules", rules.error);
      const layout = template.data ? readTemplateLayout(template.data) : null;
      if (!template.data || !layout) {
        return fail(`The ${args.template} template is not calibrated yet. Call calibrate_template first.`);
      }

      // Check everything before saving anything. Headings come from the library.
      const resolved = await resolveTemplateSkeleton(repository, layout.skeleton);
      if (!resolved.ok) return fail(`Nothing was saved. ${resolved.message}`);
      const rendered = renderTailoredResume(resolved.value.skeleton, args.resume, { interests: resolved.value.interests });
      if (!rendered.ok) return fail(`Nothing was saved. ${rendered.problems.join(" ")}`);
      // The verdict follows from the must-have gaps (decision record 0019).
      const brief = await repository.readBriefRows(args.application_id);
      if (brief.error) return dbFail("Reading the application", brief.error);
      if (!brief.data) return fail(NOT_IN_TRACKER);
      const requirements = brief.data.requirements;
      const outOfRange = args.fit_read.gap_requirements.filter((index) => index >= requirements.length);
      if (outOfRange.length) {
        return fail(`Nothing was saved: gap_requirements ${outOfRange.join(", ")} are not requirements of this posting (it has ${requirements.length}).`);
      }
      // A degree in fields David's degree does not cover is a risk the fit
      // read must name and count (decision record 0019).
      const sources = await repository.readResumeSources();
      const degreeGaps = degreeRisks(requirements, sources.data?.profile ?? null).filter(
        (index) => !args.fit_read.gap_requirements.includes(index),
      );
      if (degreeGaps.length) {
        return fail(
          `Nothing was saved: the posting asks for ${degreeGaps
            .map((index) => `"${requirements[index].text}"`)
            .join(" and ")}, which David's degree (${[sources.data?.profile?.degree_level, sources.data?.profile?.program]
            .filter(Boolean)
            .join(", ")}) does not cover. Add it to gap_requirements and name it as a risk in the fit read.`,
        );
      }
      const fit = assessFit(requirements, args.fit_read.gap_requirements);
      if (!verdictAllowed(args.fit_read.verdict, fit)) {
        return fail(
          `Nothing was saved: the fit read says ${VERDICT_LABELS[args.fit_read.verdict]}, but ${fit.core_gaps.length} of ${fit.core} must-have requirements are gaps (${fit.core_gaps
            .map((index) => `"${requirements[index].text.slice(0, 50)}"`)
            .join(", ")}). The verdict can be at most ${VERDICT_LABELS[fit.allowed]}.`,
        );
      }

      // Every entry gets at least one bullet when the library has a story for it.
      const library = await repository.listLibrary();
      if (library.error || !library.data) return dbFail("Reading the library", library.error);
      // Bold only what mirrors the posting (decision record 0022).
      const bold = boldProblems(
        args.resume.entries.filter((entry) => !entry.omit).flatMap((entry) => entry.bullets),
        requirements.map((requirement) => requirement.text),
        args.fit_read.mirror_words,
      );
      if (bold.length) {
        return fail(
          `Nothing was saved: bold only what mirrors the posting or proves a requirement it lists. Unbold or reword: ${bold
            .slice(0, 6)
            .map((problem) => `"**${problem.phrase}**"`)
            .join(", ")}.`,
        );
      }

      // David's layout: each experience's bullet count (config/bullet-counts.ts).
      const counts = bulletCountProblems(
        args.resume,
        resolved.value.skeleton.sections.flatMap((section) => section.entries),
        library.data,
      );
      if (counts.length) {
        return fail(
          `Nothing was saved: bullet counts are off. ${counts
            .map((problem) =>
              problem.min === problem.max
                ? `${problem.entry} takes ${problem.min} (has ${problem.has})`
                : `${problem.entry} takes ${problem.min} to ${problem.max} (has ${problem.has})`,
            )
            .join("; ")}. Bullets under entries marked one_line_ok may be one line.`,
        );
      }
      const extraBlocked = phrasesFromRules(rules.data.map((rule) => rule.text));
      const page = checkBullets(rendered.bullets, {
        targets: targetsOf(template.data),
        oneLineAllowed: rendered.bullet_owners.map((owner) => allowsOneLine(owner)),
        extraBlocked,
      });
      if (!page.pass) {
        const failures = [...page.page.failures, ...page.bullets.flatMap((bullet) =>
          bullet.failures.map((failure) => ({ ...failure, detail: `Bullet ${bullet.index}: ${failure.detail}` })),
        )];
        return fail(
          `Nothing was saved: the page fails check_bullets. ${failures.slice(0, 8).map((failure) => failure.detail).join(" ")}`,
        );
      }
      const variantProblems = args.new_variants.flatMap((variant, index) => {
        if (HAS_NUMBER.test(variant.text) && !variant.explain_note) {
          return [`new_variants[${index}] has a number but no explain_note.`];
        }
        if (variant.style !== "house") return [];
        const check = checkBullets([variant.text], { targets: null, extraBlocked });
        return check.bullets.flatMap((bullet) =>
          bullet.failures.map((failure) => `new_variants[${index}]: ${failure.detail}`),
        );
      });
      if (variantProblems.length) return fail(`Nothing was saved. ${variantProblems.slice(0, 8).join(" ")}`);

      const saved = await repository.completeRun({
        application_id: args.application_id,
        template: args.template,
        fit_read: args.fit_read,
        content: args.resume,
        mirrored_title: rendered.mirrored_title,
        variants: args.new_variants,
        answers: args.answers,
      });
      if (saved.error?.code === "P0002") return fail(NOT_IN_TRACKER);
      if (saved.error?.code === "23503") {
        return fail("Nothing was saved: a story_id in new_variants is not in the library.");
      }
      if (saved.error || !saved.data) return dbFail("Saving the run", saved.error);

      const value: Record<string, unknown> = {
        application_id: args.application_id,
        tailored_resume_id: saved.data.tailored_resume_id,
        variants_added: saved.data.variants_added,
        answers_added: saved.data.answers_added,
      };
      if (!args.build) return { ok: true, value, applicationId: args.application_id };

      const deps = await buildDependencies(repository, userId);
      if ("ok" in deps) return deps;
      const built = await buildResume(deps, { tailored_resume_id: saved.data.tailored_resume_id, mode: "build" });
      value.build = built.ok
        ? built.value
        : { built: false, message: `${built.message} The run is saved; retry with build_resume.` };
      // The run's tool usage so far, for the last line of the summary.
      Object.assign(value, await usageField(repository, args.application_id));
      return { ok: true, value, applicationId: args.application_id };
    },
  );
}
