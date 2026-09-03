import "server-only";

/** Which of the dashboard's two owner-scoped reads produced the error. */
export type DashboardReadName = "applications" | "statusTimeline";

/**
 * The parts of a PostgREST error this module ever touches.
 *
 * Deliberately not the full `PostgrestError` type: widening this would invite
 * some future caller to reach for a field this file was never audited to
 * handle safely in a log line.
 */
export type DashboardReadError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/** What one attempt at a dashboard read resolves to. */
export type DashboardReadAttempt<Row> = {
  data: Row[] | null;
  error: DashboardReadError | null;
  status: number;
};

/**
 * Logs a failed dashboard read, and only what a database error already says
 * about itself.
 *
 * This is the one place production is allowed to learn that a dashboard read
 * failed, so the fields are an allowlist rather than "whatever the error
 * object happens to carry": the query's own code/message/details/hint, which
 * read it was, which attempt this was, the fixed page path, and — best
 * effort — whether the request looks like the first one after signing in.
 * Nothing here can carry a cookie, a JWT, an email, a user id, or anything
 * about the applications a student saved, because none of those are ever
 * passed in.
 */
export function logDashboardReadFailure(input: {
  read: DashboardReadName;
  error: DashboardReadError | null;
  status: number;
  attempt: number;
  path: string;
  likelyFirstLoadAfterSignIn: boolean | null;
}): void {
  console.error("[dashboard] read failed", {
    read: input.read,
    status: input.status,
    code: input.error?.code ?? null,
    message: input.error?.message ?? null,
    details: input.error?.details ?? null,
    hint: input.error?.hint ?? null,
    attempt: input.attempt,
    path: input.path,
    likelyFirstLoadAfterSignIn: input.likelyFirstLoadAfterSignIn,
  });
}

/**
 * HTTP statuses that mean "the database or its API was not ready to answer
 * this yet", not "the request was invalid" or "you may not see this".
 *
 * `0` is what the installed `@supabase/postgrest-js` reports when the fetch
 * itself never reached a server (DNS, TCP, TLS) after its own three built-in
 * retries on GET requests are exhausted. 502/504 are a fronting proxy or
 * pooler answering while PostgREST/Postgres is still coming up — the gap
 * postgrest-js's own retry does not cover, since it only retries 503 and 520.
 * 500 covers the same "connection not ready" failures surfacing as a plain
 * server error rather than a recognized gateway status.
 */
const TRANSIENT_STATUS_CODES = new Set([500, 502, 503, 504, 520, 521, 522, 523, 524, 598, 599]);

/**
 * Postgres/PostgREST codes for "the database is not ready for connections
 * right now" — a pool warming up, a restart in progress, the schema cache not
 * yet loaded. Never a permission, ownership, or validation code: retrying one
 * of those would only ask the same question and get the same honest answer.
 *
 * `PGRST303` is the one exception to "never a permission code" and belongs
 * here deliberately: PostgREST returns it, at HTTP 401, when the JWT's own
 * `iat`/`exp` timestamps disagree with the clock on the node validating it —
 * a genuine clock-skew race between the Auth node that minted the token and
 * whichever PostgREST node answers the very next request, documented against
 * this exact shape (supabase/supabase#41294, supabase/supabase discussion
 * #48123). It hits a token that was issued moments ago hardest, because an
 * older token has already outlived the skew window — which is exactly what a
 * user's very first request is, right after signing in, signing up, or
 * confirming a new account. The same token is routinely accepted a moment
 * later, which is the honest, evidence-backed reason a retry belongs here and
 * not a session refresh or a client-side reload: nothing about the session
 * was ever wrong. A genuinely expired or otherwise invalid token reports a
 * different PostgREST code (`PGRST301`) and is correctly left unretried.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "PGRST002", // PostgREST could not load the schema cache yet
  "PGRST303", // JWT timestamp vs. validator clock skew — see comment above
  "57P01", // admin shutdown mid-request
  "57P02", // crash shutdown
  "57P03", // the database system is not yet accepting connections
  "53300", // too many connections
  "08000",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01", // connection-exception class
]);

function isTransientReadFailure(
  error: DashboardReadError | null,
  status: number,
): boolean {
  if (TRANSIENT_STATUS_CODES.has(status)) return true;
  return Boolean(error?.code && TRANSIENT_ERROR_CODES.has(error.code));
}

const MAX_ATTEMPTS = 3;
/** One entry per retry: the delay before that attempt, indexed from 0. */
const RETRY_DELAYS_MS = [300, 600];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one dashboard read with a small bounded retry — up to two retries,
 * spaced further apart each time — and only for the class of failure a
 * moment's wait can actually fix.
 *
 * Everything else — an expired session, a row-level security denial, a
 * malformed filter — is returned exactly as PostgREST reported it, on the
 * first attempt, because trying it again would only ask Postgres the same
 * question and get the same honest answer. That is what keeps this retry
 * from ever turning a real failure into a false "it worked", and what keeps
 * the dashboard's `unavailable` state honest when a retry is genuinely
 * exhausted.
 */
export async function withTransientReadRetry<Row>(
  read: DashboardReadName,
  path: string,
  likelyFirstLoadAfterSignIn: boolean | null,
  run: () => PromiseLike<DashboardReadAttempt<Row>>,
): Promise<{ data: Row[] | null; error: DashboardReadError | null }> {
  let attempt = 1;

  while (true) {
    const result = await run();
    if (!result.error) return { data: result.data, error: null };

    logDashboardReadFailure({
      read,
      error: result.error,
      status: result.status,
      attempt,
      path,
      likelyFirstLoadAfterSignIn,
    });

    const canRetry =
      attempt < MAX_ATTEMPTS && isTransientReadFailure(result.error, result.status);
    if (!canRetry) return { data: result.data, error: result.error };

    await delay(RETRY_DELAYS_MS[attempt - 1]);
    attempt += 1;
  }
}
