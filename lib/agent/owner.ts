/**
 * The owner-only feature flag for the recruiting agent.
 *
 * Every agent feature (MCP tools, pages, storage) is for one account: the user
 * whose Supabase id is in the server-only `OWNER_USER_ID` environment variable.
 * Every other Interndex user must see no change at all.
 *
 * The gate fails closed. An unset, empty, or malformed value means nobody is
 * the owner, so a deployment that forgot the variable behaves exactly like
 * Interndex before the agent existed. It is never a reason to open the
 * features to everyone.
 *
 * This is a pure function of its inputs (no `server-only` import, no network)
 * so it can be unit tested directly. The id is compared, never logged.
 *
 * The gate decides what is offered. It is not the only protection: every
 * agent table also has row-level security scoped to the row's owner, so even a
 * gate mistake could only ever let a user reach their own rows.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Environment = Record<string, string | undefined>;

/** The configured owner id, lowercased, or null when it is not a valid UUID. */
export function readOwnerUserId(
  environment: Environment = process.env,
): string | null {
  const value = environment.OWNER_USER_ID?.trim();
  if (!value || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

/** Whether this verified user id is the agent's owner. */
export function isAgentOwner(
  userId: string | null | undefined,
  environment: Environment = process.env,
): boolean {
  const ownerId = readOwnerUserId(environment);
  if (!ownerId || !userId) return false;
  return userId.trim().toLowerCase() === ownerId;
}
