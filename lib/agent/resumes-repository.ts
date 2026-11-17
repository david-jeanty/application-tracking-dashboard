import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { readTemplateLayout, type BuildTemplate } from "@/lib/agent/resume/build";
import { readNameVariable } from "@/lib/agent/resume/skeleton";
import { summarizeUsage, type UsageRow, type UsageSummary } from "@/lib/agent/web";

/**
 * Reads for the owner's Resumes page, application panel and file routes.
 *
 * Every query runs through the signed-in session's own client, so row-level
 * security (and the storage policies on the private bucket) are the boundary.
 * Callers check the OWNER_USER_ID gate before calling, so no other user's
 * page ever runs one of these queries.
 */

export type ResumeListItem = {
  id: string;
  application_id: string;
  company: string;
  role: string;
  template: string | null;
  status: string;
  layout_check: string | null;
  builds_left: number;
  has_pdf: boolean;
  has_html: boolean;
  resumelol_url: string | null;
  created_at: string;
  estimated_tokens: number;
};

type ResumeRow = {
  id: string;
  application_id: string;
  template_id: string;
  status: string;
  layout_check: string | null;
  build_count: number;
  pdf_path: string | null;
  html_path: string | null;
  resumelol_url: string | null;
  created_at: string;
};

const RESUME_COLUMNS =
  "id,application_id,template_id,status,layout_check,build_count,pdf_path,html_path,resumelol_url,created_at";

type DbError = { code?: string } | null;

async function describeResumes(
  supabase: SupabaseClient,
  userId: string,
  rows: ResumeRow[],
): Promise<{ data: ResumeListItem[] | null; error: DbError }> {
  if (!rows.length) return { data: [], error: null };
  const applicationIds = [...new Set(rows.map((row) => row.application_id))];
  const [applications, templates, usage] = await Promise.all([
    supabase
      .from("applications")
      .select("id,company_name,original_job_title")
      .eq("user_id", userId)
      .in("id", applicationIds)
      .returns<{ id: string; company_name: string; original_job_title: string }[]>(),
    supabase.from("templates").select("id,name").eq("user_id", userId).returns<{ id: string; name: string }[]>(),
    supabase
      .from("usage_log")
      .select("application_id,tool,response_bytes")
      .eq("user_id", userId)
      .in("application_id", applicationIds)
      .limit(10_000)
      .returns<(UsageRow & { application_id: string })[]>(),
  ]);
  const error = applications.error ?? templates.error ?? usage.error;
  if (error) return { data: null, error };

  const applicationById = new Map((applications.data ?? []).map((row) => [row.id, row]));
  const templateById = new Map((templates.data ?? []).map((row) => [row.id, row.name]));
  return {
    data: rows.map((row) => {
      const application = applicationById.get(row.application_id);
      return {
        id: row.id,
        application_id: row.application_id,
        company: application?.company_name ?? "",
        role: application?.original_job_title ?? "",
        template: templateById.get(row.template_id) ?? null,
        status: row.status,
        layout_check: row.layout_check,
        builds_left: Math.max(0, 2 - row.build_count),
        has_pdf: row.pdf_path !== null,
        has_html: row.html_path !== null,
        resumelol_url: row.resumelol_url,
        created_at: row.created_at,
        estimated_tokens: summarizeUsage(
          (usage.data ?? []).filter((entry) => entry.application_id === row.application_id),
        ).estimated_tokens,
      };
    }),
    error: null,
  };
}

/** Every tailored resume, newest first. */
export async function listTailoredResumes(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("tailored_resumes")
    .select(RESUME_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<ResumeRow[]>();
  if (error) return { data: null, error };
  return describeResumes(supabase, userId, data ?? []);
}

export type ApplicationAgentPanel = {
  resume: ResumeListItem | null;
  usage: UsageSummary;
};

/** The newest resume for one application, and what the run cost. */
export async function readApplicationAgentPanel(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
): Promise<{ data: ApplicationAgentPanel | null; error: DbError }> {
  const [resume, usage] = await Promise.all([
    supabase
      .from("tailored_resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<ResumeRow[]>(),
    supabase
      .from("usage_log")
      .select("tool,response_bytes")
      .eq("user_id", userId)
      .eq("application_id", applicationId)
      .limit(5_000)
      .returns<UsageRow[]>(),
  ]);
  const error = resume.error ?? usage.error;
  if (error) return { data: null, error };
  const described = await describeResumes(supabase, userId, resume.data ?? []);
  if (described.error) return { data: null, error: described.error };
  return {
    data: { resume: described.data?.[0] ?? null, usage: summarizeUsage(usage.data ?? []) },
    error: null,
  };
}

export type ResumeFile = {
  pdf_path: string | null;
  html_path: string | null;
  company: string;
  role: string;
  name: string | null;
};

/** What the file routes need to serve one resume. */
export async function readResumeFile(
  supabase: SupabaseClient,
  userId: string,
  tailoredResumeId: string,
): Promise<ResumeFile | null> {
  const resume = await supabase
    .from("tailored_resumes")
    .select("id,pdf_path,html_path,application_id,template_id")
    .eq("user_id", userId)
    .eq("id", tailoredResumeId)
    .maybeSingle<{ id: string; pdf_path: string | null; html_path: string | null; application_id: string; template_id: string }>();
  if (resume.error || !resume.data) return null;

  const [application, template] = await Promise.all([
    supabase
      .from("applications")
      .select("company_name,original_job_title")
      .eq("user_id", userId)
      .eq("id", resume.data.application_id)
      .maybeSingle<{ company_name: string; original_job_title: string }>(),
    supabase
      .from("templates")
      .select("header_config")
      .eq("user_id", userId)
      .eq("id", resume.data.template_id)
      .maybeSingle<Pick<BuildTemplate, "header_config">>(),
  ]);
  const layout = template.data
    ? readTemplateLayout({ header_config: template.data.header_config } as BuildTemplate)
    : null;
  return {
    pdf_path: resume.data.pdf_path,
    html_path: resume.data.html_path,
    company: application.data?.company_name ?? "",
    role: application.data?.original_job_title ?? "",
    name: layout ? readNameVariable(layout.skeleton.header) : null,
  };
}
