import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { readUserId, verifySupabaseAccessToken } from "@/lib/mcp/identity";
import { createApplication } from "@/lib/applications/repository";
import { createBearerClient, getResourceOrigin } from "@/lib/supabase/bearer";
import { applicationCreationSchema } from "@/lib/validation/application";
import {
  saveJobInputSchema,
  toApplicationCreationValues,
} from "@/lib/validation/mcp";

export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "save_job",
      {
        title: "Save job application",
        description:
          "Saves a job to the student's application tracker. Use this when they share a job posting and want it recorded, or say they have applied somewhere. Pass the full job description verbatim when it is available so they can reread it later.",
        inputSchema: saveJobInputSchema,
      },
      async (args, ctx) => {
        const authInfo = ctx.http?.authInfo;
        const userId = readUserId(authInfo);

        if (!authInfo || !userId) {
          return toolError("Not signed in to the application tracker.");
        }

        // The tool's wire schema is permissive so Claude can fill it easily.
        // The shared creation schema is the real gate, so an MCP write obeys
        // exactly the same rules as a write from the website's form.
        const parsed = applicationCreationSchema.safeParse(
          toApplicationCreationValues(args),
        );

        if (!parsed.success) {
          const details = parsed.error.issues
            .map((issue) => issue.message)
            .join(" ");
          return toolError(`That job could not be saved. ${details}`);
        }

        // Queries run as the token's user, so row-level security decides what
        // may be written. `user_id` is never taken from tool arguments: the
        // column defaults to `auth.uid()`, resolved from the access token.
        const supabase = createBearerClient(authInfo.token);
        const { data, error } = await createApplication(supabase, parsed.data);

        if (error || !data) {
          return toolError(
            `That job could not be saved. Database error ${error?.code ?? "unknown"}.`,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Saved ${parsed.data.originalJobTitle} at ${parsed.data.companyName} with status ${parsed.data.currentStatus}.`,
            },
          ],
        };
      },
    );
  },
  {
    serverInfo: { name: "jobtrack", version: "0.1.0" },
  },
);

// Every request must present a Supabase-issued access token. Unauthenticated
// requests get a 401 carrying `WWW-Authenticate` with the resource metadata
// URL, which is how an MCP client discovers where to send the user to sign in.
const authenticatedHandler = withMcpAuth(handler, verifySupabaseAccessToken, {
  required: true,
  resourceMetadataPath: RESOURCE_METADATA_PATH,
  // Advertise the configured public origin rather than trusting forwarding
  // headers, so the discovery URL cannot be pointed elsewhere by a request.
  resourceUrl: getResourceOrigin(),
});

export { authenticatedHandler as GET, authenticatedHandler as POST };
