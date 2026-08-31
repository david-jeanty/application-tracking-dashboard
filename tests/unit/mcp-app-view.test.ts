import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_VIEW_PROTOCOL_VERSION,
  APPLICATION_LIST_VIEW_HTML,
} from "@/lib/mcp/app-views/application-list-html";

/**
 * The ChatGPT view, driven the way a host drives it.
 *
 * The document is loaded and its script is actually executed, then the MCP
 * Apps messages a host sends are dispatched at it. Nothing here calls an
 * internal function the view exports for testing, because the view exports
 * none: what is asserted is the wire behaviour a host will see.
 *
 * `window.parent` is `window` in a JSDOM document, so the view posts its
 * handshake to the same window these tests listen on — which is exactly the
 * loopback needed to observe what it sends and to answer it.
 */

type Message = Record<string, unknown>;

let dom: JSDOM | null = null;

type OpenAiGlobals = { toolOutput: unknown; theme?: string };

function mountView(openai?: OpenAiGlobals) {
  // The document's globals poll runs on window.setInterval. Driving it by the
  // clock would mean an eleven-second test, so the window gets a controllable
  // interval instead and `tick()` below runs the callback exactly as often as
  // the real one would have.
  const intervals = new Map<number, () => void>();
  let nextIntervalId = 0;

  dom = new JSDOM(APPLICATION_LIST_VIEW_HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    // The globals must exist before the document's script runs, which is the
    // order a ChatGPT host injects them in.
    beforeParse: (win) => {
      if (openai) (win as unknown as { openai: OpenAiGlobals }).openai = openai;

      const scope = win as unknown as {
        setInterval: (callback: () => void) => number;
        clearInterval: (id: number) => void;
      };
      scope.setInterval = (callback) => {
        const id = (nextIntervalId += 1);
        intervals.set(id, callback);
        return id;
      };
      scope.clearInterval = (id) => {
        intervals.delete(id);
      };
    },
  });

  const { window } = dom;
  const sent: Message[] = [];

  window.addEventListener("message", (event) => {
    sent.push((event as MessageEvent).data as Message);
  });

  /**
   * Delivers a message as the host would.
   *
   * `source` is the JSDOM window, which is what the view compares against
   * `window.parent` before it trusts a message. The cast is only because
   * JSDOM's window type is not the ambient DOM `Window` TypeScript expects on
   * `MessageEventInit`.
   */
  const fromHost = (data: Message) => {
    window.dispatchEvent(
      new window.MessageEvent("message", {
        data,
        source: window as unknown as MessageEventSource,
      }),
    );
  };

  return {
    window,
    sent,
    fromHost,
    /** One `list_jobs` result, as the host forwards it. */
    toolResult: (structuredContent: unknown) =>
      fromHost({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { content: [], structuredContent },
      }),
    root: () => window.document.getElementById("ix-root")!,
    text: () => window.document.getElementById("ix-root")!.textContent ?? "",
    /** Announces a globals change the way a ChatGPT host does. */
    setGlobals: (next: Partial<OpenAiGlobals>) => {
      Object.assign(
        (window as unknown as { openai: OpenAiGlobals }).openai,
        next,
      );
      window.dispatchEvent(
        new window.CustomEvent("openai:set_globals", {
          detail: { globals: next },
        }),
      );
    },
    /** Fires every live interval `times` over, as the clock would have. */
    tick: (times = 1) => {
      for (let round = 0; round < times; round += 1) {
        for (const callback of [...intervals.values()]) callback();
      }
    },
    /** How many polls are still scheduled. */
    liveIntervals: () => intervals.size,
  };
}

/** `postMessage` is queued, so posted messages arrive a macrotask later. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** The same UTC-anchored day the view formats, for comparing against. */
function asWords(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

const RBC = {
  application_id: "11111111-1111-4111-8111-111111111111",
  company: "RBC",
  job_title: "Business Analyst",
  status: "Applied",
  work_term: "Summer 2027",
  location: "Toronto, ON",
  deadline: "2026-09-04",
  date_applied: "2026-08-22",
  archived: false,
};

const SHOPIFY = {
  application_id: "22222222-2222-4222-8222-222222222222",
  company: "Shopify",
  job_title: "Product Analyst",
  status: "Offer",
  work_term: null,
  location: null,
  deadline: null,
  date_applied: null,
  archived: false,
};

describe("Interndex application-list view: MCP Apps handshake", () => {
  it("initializes with the host over the Apps protocol", async () => {
    const view = mountView();

    await flush();
    const initialize = view.sent.find(
      (message) => message.method === "ui/initialize",
    );

    expect(initialize).toBeDefined();
    expect(initialize!.id).toBe(1);
    expect(initialize!.params).toMatchObject({
      protocolVersion: APP_VIEW_PROTOCOL_VERSION,
      appInfo: { name: "interndex-application-list", version: "0.1.0" },
    });
  });

  it("confirms initialization and takes the host's theme", async () => {
    const view = mountView();
    await flush();

    view.fromHost({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: APP_VIEW_PROTOCOL_VERSION,
        hostInfo: { name: "chatgpt", version: "1.0.0" },
        hostCapabilities: {},
        hostContext: { theme: "dark" },
      },
    });
    await flush();

    expect(view.window.document.documentElement.dataset.theme).toBe("dark");
    expect(
      view.sent.some(
        (message) => message.method === "ui/notifications/initialized",
      ),
    ).toBe(true);
  });

  it("follows a later host theme change", async () => {
    const view = mountView();

    view.fromHost({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "light" },
    });

    expect(view.window.document.documentElement.dataset.theme).toBe("light");
  });
});

describe("Interndex application-list view: rendering list_jobs results", () => {
  it("renders one row per application, with employer, role and status", () => {
    const view = mountView();

    view.toolResult({
      applications: [RBC, SHOPIFY],
      returned: 2,
      has_more: false,
    });

    const rows = view.root().querySelectorAll(".ix-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("RBC");
    expect(rows[0].textContent).toContain("Business Analyst");
    expect(rows[0].textContent).toContain("Applied");
    expect(view.text()).toContain("2 applications");
  });

  it("reads every optional field it is given", () => {
    const view = mountView();

    view.toolResult({ applications: [RBC], returned: 1, has_more: false });

    const row = view.root().querySelector(".ix-row")!;
    expect(row.textContent).toContain("Summer 2027");
    expect(row.textContent).toContain("Toronto, ON");
    // Dates are shown as words in the host's own locale, built at UTC so a
    // stored day never shifts by a timezone. Expected values are derived the
    // same way rather than hard-coded, so the assertion is about the day and
    // not about whichever locale the test runner happens to have.
    expect(row.textContent).toContain(`Applied ${asWords("2026-08-22")}`);
    expect(row.textContent).toContain(`Due ${asWords("2026-09-04")}`);
    expect(view.text()).toContain("1 application");
    expect(view.text()).not.toContain("1 applications");
  });

  it("renders an application whose optional fields are all missing", () => {
    const view = mountView();

    view.toolResult({ applications: [SHOPIFY], returned: 1, has_more: false });

    const row = view.root().querySelector(".ix-row")!;
    expect(row.textContent).toContain("Shopify");
    expect(row.textContent).toContain("Offer");
    // No work term, location or dates: the meta line is absent, not "null".
    expect(row.querySelector(".ix-meta")).toBeNull();
    expect(row.textContent).not.toContain("null");
  });

  it("survives a record missing fields the schema promises", () => {
    const view = mountView();

    // Not a shape `list_jobs` produces; the point is that a view rendering
    // somebody's tracker must degrade rather than blank the frame.
    view.toolResult({
      applications: [{ application_id: "x" }, null, "not an object"],
      returned: 3,
      has_more: false,
    });

    const rows = view.root().querySelectorAll(".ix-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Unnamed employer");
  });

  it("shows the empty state when nothing matched", () => {
    const view = mountView();

    view.toolResult({ applications: [], returned: 0, has_more: false });

    expect(view.text()).toContain("No applications match.");
    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(0);
    // The empty state says it once; a "0 applications" count beside it reads
    // like a failed load rather than an answer.
    expect(view.text()).not.toContain("0 applications");
  });

  it("shows the empty state before any result arrives", () => {
    const view = mountView();

    expect(view.text()).toContain("No applications match.");
  });

  it("survives a result with no structured content at all", () => {
    const view = mountView();

    view.toolResult(undefined);

    expect(view.text()).toContain("No applications match.");
  });

  it("says so when more applications matched than were returned", () => {
    const view = mountView();

    view.toolResult({ applications: [RBC], returned: 1, has_more: true });

    expect(view.text()).toContain("More match than are shown");
  });

  it("marks an archived application", () => {
    const view = mountView();

    view.toolResult({
      applications: [{ ...RBC, archived: true }],
      returned: 1,
      has_more: false,
    });

    expect(view.root().querySelector(".ix-archived")!.textContent).toBe(
      "Archived",
    );
  });

  it("colours only the statuses that carry a verdict", () => {
    const view = mountView();

    view.toolResult({
      applications: [
        RBC,
        SHOPIFY,
        { ...RBC, application_id: "c", status: "Rejected" },
      ],
      returned: 3,
      has_more: false,
    });

    const tones = [...view.root().querySelectorAll(".ix-status")].map((node) =>
      node.getAttribute("data-tone"),
    );

    expect(tones).toEqual(["neutral", "success", "danger"]);
  });

  it("treats an employer name as text, never as markup", () => {
    const view = mountView();

    view.toolResult({
      applications: [{ ...RBC, company: "<img src=x onerror=alert(1)>" }],
      returned: 1,
      has_more: false,
    });

    expect(view.root().querySelector("img")).toBeNull();
    expect(view.root().querySelector(".ix-company")!.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });

  it("replaces the previous list rather than appending to it", () => {
    const view = mountView();

    view.toolResult({ applications: [RBC, SHOPIFY], returned: 2, has_more: false });
    view.toolResult({ applications: [RBC], returned: 1, has_more: false });

    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(1);
  });
});

describe("Interndex application-list view: the ChatGPT globals path", () => {
  it("renders tool output the host injected before the script ran", () => {
    const view = mountView({
      toolOutput: { applications: [RBC], returned: 1, has_more: false },
      theme: "dark",
    });

    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(1);
    expect(view.text()).toContain("RBC");
    expect(view.window.document.documentElement.dataset.theme).toBe("dark");
  });

  it("renders when the host announces globals with its event", () => {
    const view = mountView({ toolOutput: null });

    expect(view.text()).toContain("No applications match.");

    view.setGlobals({
      toolOutput: { applications: [RBC, SHOPIFY], returned: 2, has_more: false },
    });

    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(2);
  });

  it("polls for globals that appear with no event to announce them", () => {
    // The host may inject window.openai around the time this script runs, and
    // which side wins is not ours to decide, so a first result is polled for.
    const view = mountView({ toolOutput: null });

    expect(view.text()).toContain("No applications match.");
    expect(view.liveIntervals()).toBe(1);

    view.window.openai.toolOutput = {
      applications: [RBC],
      returned: 1,
      has_more: false,
    };
    view.tick();

    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(1);
    expect(view.text()).toContain("RBC");
    // Found it, so it stops rather than polling for the rest of the session.
    expect(view.liveIntervals()).toBe(0);
  });

  it("does not poll at all when the result was already there", () => {
    const view = mountView({
      toolOutput: { applications: [RBC], returned: 1, has_more: false },
    });

    expect(view.liveIntervals()).toBe(0);
  });

  it("gives up polling rather than spinning forever", () => {
    const view = mountView({ toolOutput: null });

    // Forty rounds — ten seconds at the Apps SDK's own 250ms interval.
    view.tick(40);
    expect(view.liveIntervals()).toBe(0);

    view.window.openai.toolOutput = {
      applications: [RBC],
      returned: 1,
      has_more: false,
    };
    view.tick(10);
    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(0);

    // An event still works after the poll has stopped, which is the path a
    // real host uses for every update after the first.
    view.setGlobals({});
    expect(view.root().querySelectorAll(".ix-row")).toHaveLength(1);
  });
});

describe("Interndex application-list view: what it is not", () => {
  it("never fetches anything of its own", () => {
    // The whole reason this view cannot bypass row-level security: its only
    // input is the tool result the host hands it. No URL, no token, no client.
    expect(APPLICATION_LIST_VIEW_HTML).not.toContain("fetch(");
    expect(APPLICATION_LIST_VIEW_HTML).not.toContain("XMLHttpRequest");
    expect(APPLICATION_LIST_VIEW_HTML).not.toContain("/api/");
    expect(APPLICATION_LIST_VIEW_HTML).not.toContain("supabase");
  });

  it("loads nothing from the network", () => {
    // Self-contained: no script, style, image or font arrives over the wire,
    // so the view renders under a host CSP that allows no external origin.
    expect(APPLICATION_LIST_VIEW_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(APPLICATION_LIST_VIEW_HTML).not.toMatch(/<link[^>]+href=/i);
    expect(APPLICATION_LIST_VIEW_HTML).not.toContain("https://");
  });
});
