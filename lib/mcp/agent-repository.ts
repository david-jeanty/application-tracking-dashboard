import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sameCompanyAndTitle, type DedupeCandidate } from "@/lib/agent/dedupe";
import type { LedgerRow } from "@/lib/agent/ledger";
import type { LibraryStory, LibraryVariant } from "@/lib/agent/library/scoring";
import {
  parseStoredRequirements,
  type AgentProfile,
  type AgentRule,
  type AgentTemplate,
} from "@/lib/agent/types";
import { displayOptionalText, toApplicationInsert } from "@/lib/applications/mapper";
import type { AgentRepositoryFactory, BriefRows, ImportSummary } from "@/lib/mcp/agent-tools";
import { timeDbCall } from "@/lib/mcp/telemetry";
import { createBearerClient } from "@/lib/supabase/bearer";
import { toMonthDate, type ImportLibraryInput } from "@/lib/validation/agent";

/**
 * The agent tools' data access, bound to one verified MCP request.
 *
 * Every query runs through a client carrying the caller's own access token,
 * so row-level security on the agent tables (and on `applications`) is the
 * enforcing boundary, exactly as it is for the tracker tools in
 * `lib/mcp/repository.ts`. No service key is involved. Reads are also scoped
 * to the bound user id, so a query cannot reach another owner even in
 * principle.
 *
 * Only short columns are read from `applications`. The job description is
 * written here and never selected.
 */

const PROFILE_COLUMNS =
  "school,program,degree_level,expected_graduation,year_of_study,notes";
const TEMPLATE_COLUMNS =
  "id,name,use_for,one_line_chars,two_line_min,two_line_max,calibrated_at";
const VARIANT_COLUMNS =
  "id,story_id,text,style,angles,template_fit,char_count,is_gold,explain_note,created_at";

/** The most applications read to look for a duplicate posting. */
const DEDUPE_SCAN_LIMIT = 2000;

export function createAgentRepositoryForClient(
  supabase: SupabaseClient,
  userId: string,
): ReturnType<AgentRepositoryFactory> {
  async function readLedger(applicationId: string) {
    const { data, error } = await supabase
      .from("run_ledger")
      .select("step,status,count")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .returns<LedgerRow[]>();
    return { data, error };
  }

  return {
    readPlaybookContext: async () => {
      const [rules, profile, templates] = await Promise.all([
        supabase
          .from("rules")
          .select("scope,text")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
          .returns<AgentRule[]>(),
        supabase
          .from("agent_profile")
          .select(PROFILE_COLUMNS)
          .eq("user_id", userId)
          .maybeSingle<AgentProfile>(),
        supabase
          .from("templates")
          .select(TEMPLATE_COLUMNS)
          .eq("user_id", userId)
          .order("name", { ascending: true })
          .returns<AgentTemplate[]>(),
      ]);
      const error = rules.error ?? profile.error ?? templates.error;
      if (error) return { data: null, error };
      return {
        data: {
          rules: rules.data ?? [],
          profile: profile.data ?? null,
          templates: templates.data ?? [],
        },
        error: null,
      };
    },

    findMatchingApplications: async (company, title) => {
      const { data, error } = await supabase
        .from("applications")
        .select("id,company_name,original_job_title,job_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(DEDUPE_SCAN_LIMIT)
        .returns<DedupeCandidate[]>();
      if (error || !data) return { data: null, error };

      const sameNamed = sameCompanyAndTitle(data, company, title);
      if (sameNamed.length === 0) return { data: [], error: null };

      // Which of them already hold a description or link, without reading
      // either long column.
      const ids = sameNamed.map((row) => row.id);
      const [withDescription, withUrl] = await Promise.all([
        supabase
          .from("applications")
          .select("id")
          .eq("user_id", userId)
          .in("id", ids)
          .not("job_description", "is", null)
          .returns<{ id: string }[]>(),
        supabase
          .from("applications")
          .select("id")
          .eq("user_id", userId)
          .in("id", ids)
          .not("application_url", "is", null)
          .returns<{ id: string }[]>(),
      ]);
      const followUpError = withDescription.error ?? withUrl.error;
      if (followUpError) return { data: null, error: followUpError };

      const describedIds = new Set((withDescription.data ?? []).map((row) => row.id));
      const linkedIds = new Set((withUrl.data ?? []).map((row) => row.id));
      return {
        data: sameNamed.map((row) => ({
          id: row.id,
          job_id: row.job_id,
          has_job_description: describedIds.has(row.id),
          has_application_url: linkedIds.has(row.id),
          created_at: row.created_at,
        })),
        error: null,
      };
    },

    createAgentApplication: async (input, extras) => {
      const { data, error } = await supabase
        .from("applications")
        .insert({
          ...toApplicationInsert(input),
          jd_requirements: extras.jd_requirements,
          job_id: extras.job_id,
          partner_functions: extras.partner_functions,
        })
        .select("id")
        .single<{ id: string }>();
      return { data, error };
    },

    enrichAgentApplication: async (id, patch) => {
      if (Object.keys(patch).length === 0) return { error: null };
      const { error } = await supabase
        .from("applications")
        .update(patch)
        .eq("user_id", userId)
        .eq("id", id);
      return { error };
    },

    readLedger,

    writeLedger: async (applicationId, step, status) => {
      const existing = await readLedger(applicationId);
      if (existing.error) return { error: existing.error };
      const previous = existing.data?.find((row) => row.step === step);
      const { error } = await supabase.from("run_ledger").upsert(
        {
          user_id: userId,
          application_id: applicationId,
          step,
          status,
          count: (previous?.count ?? 0) + 1,
        },
        { onConflict: "application_id,step" },
      );
      return { error };
    },

    readBriefRows: async (applicationId) => {
      const application = await supabase
        .from("applications")
        .select(
          "id,company_name,original_job_title,location,job_id,application_url,current_status,date_applied,application_deadline,partner_functions,jd_requirements",
        )
        .eq("user_id", userId)
        .eq("id", applicationId)
        .maybeSingle<{
          id: string;
          company_name: string;
          original_job_title: string;
          location: string;
          job_id: string | null;
          application_url: string | null;
          current_status: string;
          date_applied: string | null;
          application_deadline: string | null;
          partner_functions: string[] | null;
          jd_requirements: unknown;
        }>();
      if (application.error) return { data: null, error: application.error };
      if (!application.data) return { data: null, error: null };

      const [ledger, answers, resume] = await Promise.all([
        readLedger(applicationId),
        supabase
          .from("answer_bank")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("application_id", applicationId),
        supabase
          .from("tailored_resumes")
          .select("id,status,build_count,pdf_path,resumelol_url,template_id")
          .eq("user_id", userId)
          .eq("application_id", applicationId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{
            id: string;
            status: string;
            build_count: number;
            pdf_path: string | null;
            resumelol_url: string | null;
            template_id: string;
          }>(),
      ]);
      const error = ledger.error ?? answers.error ?? resume.error;
      if (error) return { data: null, error };

      let templateName: string | null = null;
      if (resume.data) {
        const template = await supabase
          .from("templates")
          .select("name")
          .eq("user_id", userId)
          .eq("id", resume.data.template_id)
          .maybeSingle<{ name: string }>();
        if (template.error) return { data: null, error: template.error };
        templateName = template.data?.name ?? null;
      }

      const { jd_requirements, ...row } = application.data;
      const data: BriefRows = {
        application: { ...row, location: displayOptionalText(row.location) },
        requirements: parseStoredRequirements(jd_requirements),
        ledger: ledger.data ?? [],
        resume: resume.data
          ? {
              id: resume.data.id,
              status: resume.data.status,
              build_count: resume.data.build_count,
              template: templateName,
              has_pdf: resume.data.pdf_path !== null,
              resumelol_url: resume.data.resumelol_url,
            }
          : null,
        answersCount: answers.count ?? 0,
      };
      return { data, error: null };
    },

    listLibrary: async () => {
      const [experiences, stories, variants] = await Promise.all([
        supabase
          .from("experiences")
          .select("id,org,official_title")
          .eq("user_id", userId)
          .returns<{ id: string; org: string; official_title: string }[]>(),
        supabase
          .from("stories")
          .select("id,experience_id,label,summary,tags")
          .eq("user_id", userId)
          .returns<
            {
              id: string;
              experience_id: string;
              label: string;
              summary: string | null;
              tags: string[];
            }[]
          >(),
        supabase
          .from("story_variants")
          .select(VARIANT_COLUMNS)
          .eq("user_id", userId)
          .returns<(LibraryVariant & { story_id: string })[]>(),
      ]);
      const error = experiences.error ?? stories.error ?? variants.error;
      if (error) return { data: null, error };

      const experienceById = new Map((experiences.data ?? []).map((row) => [row.id, row]));
      const variantsByStory = new Map<string, LibraryVariant[]>();
      for (const { story_id, ...variant } of variants.data ?? []) {
        variantsByStory.set(story_id, [...(variantsByStory.get(story_id) ?? []), variant]);
      }

      const library: LibraryStory[] = (stories.data ?? []).map((story) => {
        const experience = experienceById.get(story.experience_id);
        return {
          id: story.id,
          label: story.label,
          summary: story.summary,
          tags: story.tags,
          org: experience?.org ?? "",
          official_title: experience?.official_title ?? "",
          variants: variantsByStory.get(story.id) ?? [],
        };
      });
      return { data: library, error: null };
    },

    insertVariant: async (variant) => {
      const inserted = await supabase
        .from("story_variants")
        .upsert(
          { ...variant, user_id: userId },
          { onConflict: "story_id,text", ignoreDuplicates: true },
        )
        .select("id")
        .returns<{ id: string }[]>();
      if (inserted.error) return { data: null, error: inserted.error };
      if (inserted.data?.[0]) return { data: { id: inserted.data[0].id, created: true }, error: null };

      const existing = await supabase
        .from("story_variants")
        .select("id")
        .eq("user_id", userId)
        .eq("story_id", variant.story_id)
        .eq("text", variant.text)
        .single<{ id: string }>();
      if (existing.error || !existing.data) return { data: null, error: existing.error };
      return { data: { id: existing.data.id, created: false }, error: null };
    },

    insertEditExample: async (row) => {
      const { error } = await supabase
        .from("edit_examples")
        .insert({ ...row, user_id: userId });
      return { error };
    },

    insertRule: async (scope, text) => {
      const { data, error } = await supabase
        .from("rules")
        .upsert(
          { user_id: userId, scope, text },
          { onConflict: "user_id,scope,text", ignoreDuplicates: true },
        )
        .select("id")
        .returns<{ id: string }[]>();
      if (error) return { data: null, error };
      return { data: { created: (data ?? []).length > 0 }, error: null };
    },

    readRules: async (scopes) => {
      const { data, error } = await supabase
        .from("rules")
        .select("scope,text")
        .eq("user_id", userId)
        .in("scope", [...scopes])
        .order("created_at", { ascending: true })
        .returns<AgentRule[]>();
      return { data, error };
    },

    readTemplate: async (name) => {
      const { data, error } = await supabase
        .from("templates")
        .select(TEMPLATE_COLUMNS)
        .eq("user_id", userId)
        .eq("name", name)
        .maybeSingle<AgentTemplate>();
      return { data, error };
    },

    insertAnswer: async (row) => {
      const { data, error } = await supabase
        .from("answer_bank")
        .insert({ ...row, user_id: userId })
        .select("id")
        .single<{ id: string }>();
      return { data, error };
    },

    listAnswers: async () => {
      const { data, error } = await supabase
        .from("answer_bank")
        .select("id,question,answer,tags,application_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<
          {
            id: string;
            question: string;
            answer: string;
            tags: string[];
            application_id: string | null;
          }[]
        >();
      return { data, error };
    },

    importLibrary: (input) => importLibrary(supabase, userId, input),

    logUsage: async (applicationId, tool, bytes) => {
      try {
        await supabase.from("usage_log").insert({
          user_id: userId,
          application_id: applicationId,
          tool,
          response_bytes: bytes,
        });
      } catch {
        // The usage log is a record, not a dependency of the tool call.
      }
    },
  };
}

/**
 * The one-time library import. Each level is one upsert on its natural key,
 * so running the same import again changes nothing, and a run that failed
 * partway is finished by running it again.
 */
async function importLibrary(
  supabase: SupabaseClient,
  userId: string,
  input: ImportLibraryInput,
): Promise<{ data: ImportSummary | null; error: { code?: string } | null }> {
  let profileSaved = false;
  if (input.profile && Object.keys(input.profile).length > 0) {
    const { expected_graduation, ...rest } = input.profile;
    const { error } = await supabase.from("agent_profile").upsert(
      {
        user_id: userId,
        ...rest,
        ...(expected_graduation ? { expected_graduation: toMonthDate(expected_graduation) } : {}),
      },
      { onConflict: "user_id" },
    );
    if (error) return { data: null, error };
    profileSaved = true;
  }

  const experienceIds = new Map<string, string>();
  if (input.experiences.length) {
    const { data, error } = await supabase
      .from("experiences")
      .upsert(
        input.experiences.map((experience) => ({
          user_id: userId,
          org: experience.org,
          official_title: experience.official_title,
          start_date: toMonthDate(experience.start),
          end_date: experience.end ? toMonthDate(experience.end) : null,
          location: experience.location ?? null,
          sort_order: experience.sort_order,
        })),
        { onConflict: "user_id,org,official_title,start_date" },
      )
      .select("id,org,official_title,start_date")
      .returns<{ id: string; org: string; official_title: string; start_date: string }[]>();
    if (error) return { data: null, error };
    for (const experience of input.experiences) {
      const row = (data ?? []).find(
        (saved) =>
          saved.org === experience.org &&
          saved.official_title === experience.official_title &&
          saved.start_date === toMonthDate(experience.start),
      );
      if (row) experienceIds.set(experience.key, row.id);
    }
  }

  const storyIds = new Map<string, string>();
  const storyRows = input.stories.flatMap((story) => {
    const experienceId = experienceIds.get(story.experience_key);
    return experienceId
      ? [{
          user_id: userId,
          experience_id: experienceId,
          label: story.label,
          summary: story.summary ?? null,
          tags: story.tags,
        }]
      : [];
  });
  if (storyRows.length) {
    const { data, error } = await supabase
      .from("stories")
      .upsert(storyRows, { onConflict: "experience_id,label" })
      .select("id,experience_id,label")
      .returns<{ id: string; experience_id: string; label: string }[]>();
    if (error) return { data: null, error };
    for (const story of input.stories) {
      const experienceId = experienceIds.get(story.experience_key);
      const row = (data ?? []).find(
        (saved) => saved.experience_id === experienceId && saved.label === story.label,
      );
      if (row) storyIds.set(story.key, row.id);
    }
  }

  const variantRows = input.variants.flatMap((variant) => {
    const storyId = storyIds.get(variant.story_key);
    return storyId
      ? [{
          user_id: userId,
          story_id: storyId,
          text: variant.text,
          style: variant.style,
          angles: variant.angles,
          template_fit: variant.template_fit,
          is_gold: variant.is_gold,
          explain_note: variant.explain_note ?? null,
          source: "import" as const,
        }]
      : [];
  });
  let added = 0;
  if (variantRows.length) {
    const { data, error } = await supabase
      .from("story_variants")
      .upsert(variantRows, { onConflict: "story_id,text", ignoreDuplicates: true })
      .select("id")
      .returns<{ id: string }[]>();
    if (error) return { data: null, error };
    added = (data ?? []).length;
  }

  return {
    data: {
      experiences: experienceIds.size,
      stories: storyIds.size,
      variants_added: added,
      variants_existing: variantRows.length - added,
      profile_saved: profileSaved,
    },
    error: null,
  };
}

/** The factory the MCP route uses: a token-scoped client, every call timed. */
export const createSupabaseAgentRepository: AgentRepositoryFactory = ({ token, userId }) => {
  const repository = createAgentRepositoryForClient(createBearerClient(token), userId);
  const timed = Object.fromEntries(
    Object.entries(repository).map(([name, method]) => [
      name,
      (...args: unknown[]) =>
        timeDbCall(() => (method as (...a: unknown[]) => Promise<unknown>)(...args)),
    ]),
  );
  return timed as ReturnType<AgentRepositoryFactory>;
};
