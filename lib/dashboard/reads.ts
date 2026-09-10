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

/** Authentication state known immediately before the dashboard reads start. */
export type DashboardAuthDiagnostics = {
  sessionExistedAtRead: boolean;
  authResolvedMs: number;
};

type DashboardReadRetryClassification =
  | "jwt_clock_skew"
  | "transient_http_status"
  | "transient_database_error"
  | "not_retryable";

type DashboardReadRetryOutcome = "retrying" | "stopped";

/**
 * Logs a failed dashboard read through a fixed, privacy-safe diagnostic
 * schema.
 *
 * This is the one place production is allowed to learn that a dashboard read
 * failed, so the fields are an allowlist rather than "whatever the error
 * object happens to carry": a validated error code, numeric status, fixed
 * retry classification/outcome, which read and attempt this was, the fixed
 * page path, a per-request correlation id, and — best effort — whether the
 * request looks like the first one after signing in. Raw upstream messages,
 * details, and hints never enter a log payload.
 *
 * `requestId` is temporary incident instrumentation, minted fresh per page
 * render (see `DashboardPage`) with no relationship to the session or the
 * user — its only job is letting two log lines from the same failed load
 * (one per read) be tied together when reading Vercel's runtime logs, and
 * giving a reporter something exact to search for. Safe to delete once this
 * incident is closed.
 */
export function logDashboardReadFailure(input: {
  read: DashboardReadName;
  code: string | null;
  status: number;
  retryClassification: DashboardReadRetryClassification;
  retryOutcome: DashboardReadRetryOutcome;
  attempt: number;
  path: string;
  likelyFirstLoadAfterSignIn: boolean | null;
  requestId: string;
  sessionExistedAtRead: boolean | null;
  authResolvedMs: number | null;
}): void {
  console.error("[dashboard] read failed", {
    read: input.read,
    status: input.status,
    code: input.code,
    retryClassification: input.retryClassification,
    retryOutcome: input.retryOutcome,
    attempt: input.attempt,
    path: input.path,
    likelyFirstLoadAfterSignIn: input.likelyFirstLoadAfterSignIn,
    requestId: input.requestId,
    sessionExistedAtRead: input.sessionExistedAtRead,
    authResolvedMs: input.authResolvedMs,
  });
}

function logDashboardReadRecovery(input: {
  read: DashboardReadName;
  attempt: number;
  path: string;
  requestId: string;
  status: number;
  recoveredFromCode: string | null;
  recoveredFromClassification: DashboardReadRetryClassification;
  elapsedMs: number;
  diagnostics?: DashboardAuthDiagnostics;
}): void {
  console.info("[dashboard] read recovered", {
    read: input.read,
    attempt: input.attempt,
    path: input.path,
    requestId: input.requestId,
    status: input.status,
    recoveredFromCode: input.recoveredFromCode,
    recoveredFromClassification: input.recoveredFromClassification,
    elapsedMs: input.elapsedMs,
    sessionExistedAtRead: input.diagnostics?.sessionExistedAtRead ?? null,
    authResolvedMs: input.diagnostics?.authResolvedMs ?? null,
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
const TRANSIENT_STATUS_CODES = new Set([
  0,
  500,
  502,
  503,
  504,
  520,
  521,
  522,
  523,
  524,
  598,
  599,
]);

/**
 * Postgres/PostgREST codes for "the database is not ready for connections
 * right now" — a pool warming up, a restart in progress, the schema cache not
 * yet loaded. Never a permission, ownership, or validation code: retrying one
 * of those would only ask the same question and get the same honest answer.
 *
 * `PGRST303` is deliberately absent from this set. It is not a single
 * condition: PostgREST's own source (`JwtClaimsErr` in
 * PostgREST/postgrest's `src/library/PostgREST/Error.hs`) returns this one
 * code, at HTTP 401, for nine different JWT-claim outcomes sharing the same
 * status — an actually expired token, a wrong `aud`, unparseable claims, four
 * flavors of a malformed claim, and exactly two that are a clock
 * disagreement between the Auth node that minted the token and the PostgREST
 * node validating it: "JWT issued at future" and "JWT not yet valid"
 * (documented against this exact shape in supabase/supabase#41294 and
 * supabase/supabase discussion #48123). Only those two are a moment's wait
 * from succeeding; the other seven report the same thing again no matter how
 * many times they are asked. Treating the whole code as retryable — as an
 * earlier version of this file did — retries a genuinely expired or
 * otherwise invalid session for existing, already-working accounts too,
 * which is what turned a same-attempt, honest `unavailable` into a slower
 * one for every session that failed for a reason a retry cannot fix.
 * `classifyReadFailure` below checks `PGRST303`'s exact message instead.
 */
const TRANSIENT_ERROR_CODES = new Set([
  "PGRST002", // PostgREST could not load the schema cache yet
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

/**
 * The exact two `PGRST303` messages that are a clock disagreement rather
 * than a genuinely dead or malformed session — see the comment on
 * `TRANSIENT_ERROR_CODES` above for the full set PostgREST can report under
 * this one code and why the other seven are excluded on purpose. Matched
 * verbatim against PostgREST's own source strings, not by substring: a
 * message this file does not recognize is a message this file must not
 * guess about, so it is left unretried like any other claim failure.
 */
const TRANSIENT_JWT_CLAIM_MESSAGES = new Set([
  "JWT issued at future",
  "JWT not yet valid",
]);

function classifyReadFailure(
  error: DashboardReadError | null,
  status: number,
): DashboardReadRetryClassification {
  if (
    status === 401 &&
    error?.code === "PGRST303" &&
    error.message &&
    TRANSIENT_JWT_CLAIM_MESSAGES.has(error.message)
  ) {
    return "jwt_clock_skew";
  }
  if (TRANSIENT_STATUS_CODES.has(status)) return "transient_http_status";
  if (error?.code && TRANSIENT_ERROR_CODES.has(error.code)) {
    return "transient_database_error";
  }
  return "not_retryable";
}

// PostgREST codes are `PGRST` plus three digits; PostgreSQL SQLSTATE values
// are exactly five uppercase alphanumeric characters. Anything outside those
// two bounded public identifier formats is untrusted text and is redacted.
const SAFE_ERROR_CODE = /^(?:PGRST[0-9]{3}|[A-Z0-9]{5})$/;

function safeErrorCode(error: DashboardReadError | null): string | null {
  return error?.code && SAFE_ERROR_CODE.test(error.code) ? error.code : null;
}

function toSafeDashboardReadError(
  error: DashboardReadError | null,
  status: number,
): {
  code: string | null;
  retryClassification: DashboardReadRetryClassification;
} {
  return {
    code: safeErrorCode(error),
    retryClassification: classifyReadFailure(error, status),
  };
}

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 300;
const JWT_CLOCK_SKEW_RETRY_DELAY_MS = 1_000;

function retryDelayMs(
  classification: DashboardReadRetryClassification,
): number {
  // Supabase's managed-infrastructure incident reports include the same
  // freshly issued token being rejected and then accepted about 700 ms
  // later (github.com/orgs/supabase/discussions/48123). The old 300 ms retry
  // was therefore shorter than the observed failure window. Keep the longer
  // wait exclusive to the two exact clock-skew messages; every other transient
  // read keeps the existing bound.
  if (classification === "jwt_clock_skew") {
    return JWT_CLOCK_SKEW_RETRY_DELAY_MS;
  }
  return RETRY_DELAY_MS;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs one dashboard read with a small bounded retry — one retry, after a
 * short fixed delay — and only for the class of failure a moment's wait can
 * actually fix.
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
  requestId: string,
  run: () => PromiseLike<DashboardReadAttempt<Row>>,
  diagnostics?: DashboardAuthDiagnostics,
): Promise<{ data: Row[] | null; error: DashboardReadError | null }> {
  let attempt = 1;
  const startedAt = performance.now();
  let retryFailure: ReturnType<typeof toSafeDashboardReadError> | null = null;

  while (true) {
    const result = await run();
    if (!result.error) {
      if (retryFailure) {
        logDashboardReadRecovery({
          read,
          attempt,
          path,
          requestId,
          status: result.status,
          recoveredFromCode: retryFailure.code,
          recoveredFromClassification: retryFailure.retryClassification,
          elapsedMs: Math.round(performance.now() - startedAt),
          diagnostics,
        });
      }
      return { data: result.data, error: null };
    }

    const safeError = toSafeDashboardReadError(result.error, result.status);
    const canRetry =
      attempt < MAX_ATTEMPTS &&
      safeError.retryClassification !== "not_retryable";

    logDashboardReadFailure({
      read,
      code: safeError.code,
      status: result.status,
      retryClassification: safeError.retryClassification,
      retryOutcome: canRetry ? "retrying" : "stopped",
      attempt,
      path,
      likelyFirstLoadAfterSignIn,
      requestId,
      sessionExistedAtRead: diagnostics?.sessionExistedAtRead ?? null,
      authResolvedMs: diagnostics?.authResolvedMs ?? null,
    });

    if (!canRetry) return { data: result.data, error: result.error };

    retryFailure = safeError;
    attempt += 1;
    await delay(retryDelayMs(safeError.retryClassification));
  }
}
