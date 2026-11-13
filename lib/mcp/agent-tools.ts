import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { buildApplicationBrief, type BriefSource } from "@/lib/agent/brief";
import { serializeCapped, truncate, type CappedTool } from "@/lib/agent/caps";
import { checkBullets, type LineTargets } from "@/lib/agent/checks/bullets";
import { phrasesFromRules } from "@/lib/agent/checks/text-rules";
import { pickDuplicate } from "@/lib/agent/dedupe";
import {
  mayRunStep,
  summarizeRunState,
  type LedgerRow,
  type LedgerStatus,
  type RunStep,
} from "@/lib/agent/ledger";
import { rankStories, tokenize, type LibraryStory } from "@/lib/agent/library/scoring";
import { isAgentOwner } from "@/lib/agent/owner";
import { buildPlaybook, type PlaybookContext } from "@/lib/agent/playbook";
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
  checkBulletsInputSchema,
  createApplicationFromJdInputSchema,
  getPlaybookInputSchema,
  importLibraryInputSchema,
  recordEditInputSchema,
  saveAnswerInputSchema,
  saveVariantInputSchema,
  searchAnswersInputSchema,
  searchStoriesInputSchema,
  toMonthDate,
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
  /** Never throws: a usage-log failure must not fail the tool call. */
  logUsage: (applicationId: string | null, tool: string, bytes: number) => Promise<void>;
};

export type AgentRepositoryFactory = (identity: {
  token: string;
  userId: string;
}) => AgentRepository;

// ---------------------------------------------------------------- helpers --

const NOT_SIGNED_IN = "Not signed in to Interndex.";
const NOT_AVAILABLE = "This tool is not available for this account.";
const NOT_IN_TRACKER = "No application with that id is in this tracker.";

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

function targetsOf(template: AgentTemplate | null): LineTargets | null {
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
  run: (args: z.infer<Schema>, repository: AgentRepository) => Promise<Outcome>,
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
      const outcome = await run(args, repository);
      if (!outcome.ok) return toolError(outcome.message);

      const serialized = serializeCapped(name, outcome.value);
      const applicationId =
        outcome.applicationId ??
        ((args as { application_id?: string }).application_id ?? null);
      await repository.logUsage(applicationId, name, serialized.bytes);

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
): void {
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
        "Finds the library's best stories for the requirements: at most 5 stories, best 2 variants each, with explain notes, plus the requirements no story matched. Deterministic.",
      inputSchema: searchStoriesInputSchema,
      annotations: READ_ONLY,
    },
    async ({ requirements, angles, template }, repository) => {
      const { data, error } = await repository.listLibrary();
      if (error || !data) return dbFail("Reading the library", error);
      return { ok: true, value: rankStories(data, { requirements, angles, template }) };
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
    async ({ template, bullets }, repository) => {
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
}
