import "server-only";

import {
  createApplication,
  createApplications,
  getApplicationById,
  listApplications,
  updateApplication,
} from "@/lib/applications/repository";
import { timeDbCall } from "@/lib/mcp/telemetry";
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

  // Each call is timed and folded into the enclosing tool call's database
  // duration — see `lib/mcp/telemetry.ts`. Nothing about the query or its
  // result passes through the timer; it only measures how long the promise
  // took to settle.
  return {
    createApplication: (input) =>
      timeDbCall(() => createApplication(supabase, input)),
    // No `userId` argument, and none is possible: the rows carry no owner
    // column, so `auth.uid()` from this request's own token fills it in and
    // the insert policy checks it again.
    createApplications: (inputs) =>
      timeDbCall(() => createApplications(supabase, inputs)),
    getApplication: (applicationId) =>
      timeDbCall(() => getApplicationById(supabase, userId, applicationId)),
    listApplications: (filters) =>
      timeDbCall(() => listApplications(supabase, userId, filters)),
    updateApplication: (applicationId, input) =>
      timeDbCall(() =>
        updateApplication(supabase, userId, applicationId, input),
      ),
  };
};
