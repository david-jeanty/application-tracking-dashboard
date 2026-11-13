/**
 * The resume.lol client: the only code that talks to resume.lol.
 *
 * resume.lol's API is an MCP server at https://www.resume.lol/api/mcp,
 * authenticated with "Authorization: Bearer <key>". Interndex calls it
 * directly over HTTP (JSON-RPC, Streamable HTTP transport) from server code.
 * It is not an MCP connection in anyone's Claude session.
 *
 * The client offers only the four calls the builder needs, and nothing that
 * could reach resumes Interndex did not make:
 *
 * - `getResume` and `getResumeHtml`, reads,
 * - `createResume`, every build makes a new resume,
 * - `updateResumeMarkdown`, for rebuilds of a resume Interndex created. It
 *   sends only the markdown, so design tweaks David makes in resume.lol
 *   survive, and always with `expected_updated_at`, so an edit he made there
 *   is never overwritten. Base resumes are refused before any call.
 *
 * There is no list, delete or share-link call. Interndex never browses the
 * account, which also holds resumes for other people.
 *
 * The key is read from `RESUMELOL_API_KEY` by the caller, sent only in the
 * Authorization header, and scrubbed from every error message. It is never
 * logged or returned.
 */

export const RESUMELOL_ENDPOINT = "https://www.resume.lol/api/mcp";
const RESUMELOL_SITE = "https://www.resume.lol";
const PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TIMEOUT_MS = 20_000;

export type ResumeLolErrorKind =
  | "not_configured"
  | "auth"
  | "http"
  | "timeout"
  | "tool"
  | "conflict"
  | "protocol"
  | "protected";

export class ResumeLolError extends Error {
  constructor(
    readonly kind: ResumeLolErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "ResumeLolError";
  }
}

export type ResumeDocuments = {
  id: string;
  name: string;
  markdown: string;
  css: string;
  meta_css: string;
  updated_at: string;
};

export type ResumeLolClient = {
  getResume: (resumeId: string) => Promise<ResumeDocuments>;
  getResumeHtml: (resumeId: string) => Promise<string>;
  createResume: (input: {
    name: string;
    markdown: string;
    css: string;
    meta_css: string;
  }) => Promise<{ id: string; updated_at: string }>;
  updateResumeMarkdown: (input: {
    resume_id: string;
    markdown: string;
    expected_updated_at: string;
  }) => Promise<{ updated_at: string }>;
};

export type ResumeLolClientOptions = {
  apiKey: string | undefined;
  fetch?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  /** Resume ids that must never be written (the template base resumes). */
  protectedIds?: readonly string[];
};

/** The resume.lol editor page for a resume (it asks David to sign in). */
export function editorUrlFor(resumeId: string): string {
  return `${RESUMELOL_SITE}/editor/${encodeURIComponent(resumeId)}`;
}

type JsonRpcResponse = {
  result?: { content?: { type: string; text?: string }[]; isError?: boolean };
  error?: { code: number; message: string };
};

export function createResumeLolClient(options: ResumeLolClientOptions): ResumeLolClient {
  const apiKey = options.apiKey?.trim() ?? "";
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? RESUMELOL_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const protectedIds = new Set(options.protectedIds ?? []);
  let nextId = 1;
  let initialized: Promise<void> | null = null;

  const scrub = (text: string) => (apiKey ? text.split(apiKey).join("[redacted]") : text);
  const shorten = (text: string) => scrub(text).replace(/\s+/g, " ").trim().slice(0, 300);

  async function post(method: string, params: unknown, notification = false): Promise<JsonRpcResponse | null> {
    if (!apiKey) {
      throw new ResumeLolError("not_configured", "RESUMELOL_API_KEY is not set on the server.");
    }
    const body = notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", id: nextId++, method, params };

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && /abort|timeout/i.test(error.name);
      throw new ResumeLolError(
        timedOut ? "timeout" : "http",
        timedOut ? `resume.lol did not answer within ${timeoutMs / 1000} seconds.` : "Could not reach resume.lol.",
      );
    }

    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new ResumeLolError("auth", `resume.lol refused the API key (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      throw new ResumeLolError("http", `resume.lol answered HTTP ${response.status}.`);
    }
    if (notification) return null;

    // Streamable HTTP answers either plain JSON or one server-sent event.
    const payload = (response.headers.get("content-type") ?? "").includes("event-stream")
      ? text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .pop() ?? ""
      : text;
    try {
      return JSON.parse(payload) as JsonRpcResponse;
    } catch {
      throw new ResumeLolError("protocol", "resume.lol sent an answer Interndex could not read.");
    }
  }

  function ensureInitialized(): Promise<void> {
    initialized ??= (async () => {
      const answer = await post("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "interndex", version: "0.1.0" },
      });
      if (!answer?.result) {
        throw new ResumeLolError("protocol", "resume.lol did not accept the connection.");
      }
      await post("notifications/initialized", {}, true);
    })().catch((error: unknown) => {
      initialized = null;
      throw error;
    });
    return initialized;
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await ensureInitialized();
    const answer = await post("tools/call", { name, arguments: args });
    if (answer?.error) {
      throw new ResumeLolError("protocol", `resume.lol ${name} failed: ${shorten(answer.error.message)}`);
    }
    const text = answer?.result?.content?.find((part) => part.type === "text")?.text;
    if (answer?.result?.isError) {
      const detail = shorten(text ?? "no detail");
      const conflict = name === "update_resume" && /conflict|changed|no longer match|expected_updated_at/i.test(detail);
      throw new ResumeLolError(conflict ? "conflict" : "tool", `resume.lol ${name} failed: ${detail}`);
    }
    if (typeof text !== "string") {
      throw new ResumeLolError("protocol", `resume.lol ${name} returned no text.`);
    }
    return text;
  }

  function parseJson<T>(name: string, text: string, check: (value: Record<string, unknown>) => T | null): T {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ResumeLolError("protocol", `resume.lol ${name} returned something other than JSON.`);
    }
    const checked = value && typeof value === "object" ? check(value as Record<string, unknown>) : null;
    if (checked === null) {
      throw new ResumeLolError("protocol", `resume.lol ${name} returned an unexpected shape.`);
    }
    return checked;
  }

  const isString = (value: unknown): value is string => typeof value === "string";

  return {
    getResume: async (resumeId) => {
      const text = await callTool("get_resume", { resume_id: resumeId });
      return parseJson("get_resume", text, (value) =>
        isString(value.markdown) && isString(value.updated_at)
          ? {
              id: isString(value.id) ? value.id : resumeId,
              name: isString(value.name) ? value.name : "",
              markdown: value.markdown,
              css: isString(value.css) ? value.css : "",
              meta_css: isString(value.meta_css) ? value.meta_css : "",
              updated_at: value.updated_at,
            }
          : null,
      );
    },

    getResumeHtml: (resumeId) => callTool("get_resume_html", { resume_id: resumeId }),

    createResume: async ({ name, markdown, css, meta_css }) => {
      const text = await callTool("create_resume", { name, markdown, css, meta_css });
      return parseJson("create_resume", text, (value) =>
        isString(value.id) && isString(value.updated_at)
          ? { id: value.id, updated_at: value.updated_at }
          : null,
      );
    },

    updateResumeMarkdown: async ({ resume_id, markdown, expected_updated_at }) => {
      if (protectedIds.has(resume_id)) {
        throw new ResumeLolError("protected", "That resume is a template base and is never changed.");
      }
      const text = await callTool("update_resume", { resume_id, markdown, expected_updated_at });
      try {
        const value = JSON.parse(text) as { updated_at?: unknown };
        if (isString(value.updated_at)) return { updated_at: value.updated_at };
      } catch {
        // Some servers answer in prose; look for the timestamp instead.
      }
      const timestamp = /\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})/.exec(text)?.[0];
      if (!timestamp) {
        throw new ResumeLolError("protocol", "resume.lol update_resume did not return the new updated_at.");
      }
      return { updated_at: timestamp };
    },
  };
}
