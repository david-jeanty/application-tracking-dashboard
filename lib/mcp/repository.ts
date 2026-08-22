import "server-only";

import {
  createApplication,
  getApplicationById,
  listApplications,
  updateApplication,
} from "@/lib/applications/repository";
import type { JobTrackRepositoryFactory } from "@/lib/mcp/tools";
import { createBearerClient } from "@/lib/supabase/bearer";

/**
 * Binds the existing repository to one verified MCP request.
 *
 * The Supabase client carries the request's access token, so every query runs
 * as that user and the row-level security policies in `supabase/migrations`
 * stay the enforcing boundary — the same one the website goes through. The
 * user id is applied to each call here, which is why no tool body, and no
 * tool argument, can reach another student's rows.
 */
export const createSupabaseJobTrackRepository: JobTrackRepositoryFactory = ({
  token,
  userId,
}) => {
  const supabase = createBearerClient(token);

  return {
    createApplication: (input) => createApplication(supabase, input),
    getApplication: (applicationId) =>
      getApplicationById(supabase, userId, applicationId),
    listApplications: (filters) =>
      listApplications(supabase, userId, filters),
    updateApplication: (applicationId, input) =>
      updateApplication(supabase, userId, applicationId, input),
  };
};
