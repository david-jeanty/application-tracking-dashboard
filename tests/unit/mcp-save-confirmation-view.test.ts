import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import {
  SAVE_CONFIRMATION_PROTOCOL_VERSION,
  SAVE_CONFIRMATION_VIEW_HTML,
} from "@/lib/mcp/app-views/save-confirmation-html";

/**
 * The save-confirmation view, driven the way a host drives it — the same
 * approach `tests/unit/mcp-app-view.test.ts` uses for the application-list
 * view. The document is loaded and its script actually executed, then the MCP
 * Apps messages a host sends are dispatched at it.
 */

type Message = Record<string, unknown>;

let dom: JSDOM | null = null;

type OpenAiGlobals = { toolOutput: unknown; theme?: string };

function mountView(openai?: OpenAiGlobals) {
  const intervals = new Map<number, () => void>();
  let nextIntervalId = 0;

  dom = new JSDOM(SAVE_CONFIRMATION_VIEW_HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
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
    /** One `save_job` result, as the host forwards it. */
    toolResult: (structuredContent: unknown) =>
      fromHost({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: { content: [], structuredContent },
      }),
    root: () => window.document.getElementById("ix-root")!,
    text: () => window.document.getElementById("ix-root")!.textContent ?? "",
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
    tick: (times = 1) => {
      for (let round = 0; round < times; round += 1) {
        for (const callback of [...intervals.values()]) callback();
      }
    },
    liveIntervals: () => intervals.size,
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  dom?.window.close();
  dom = null;
});

const SAVED_JOB = {
  application_id: "11111111-1111-4111-8111-111111111111",
  company: "RBC",
  job_title: "Business Analyst Intern",
  status: "Applied",
  work_term: "Summer 2027",
  location: "Toronto, ON",
};

const MINIMAL_JOB = {
  application_id: "22222222-2222-4222-8222-222222222222",
  company: "Shopify",
  job_title: "Product Analyst",
  status: "Interested",
  work_term: null,
  location: null,
};

describe("Interndex save-confirmation view: MCP Apps handshake", () => {
  it("initializes with the host over the Apps protocol", async () => {
    const view = mountView();

    await flush();
    const initialize = view.sent.find(
      (message) => message.method === "ui/initialize",
    );

    expect(initialize).toBeDefined();
    expect(initialize!.params).toMatchObject({
      protocolVersion: SAVE_CONFIRMATION_PROTOCOL_VERSION,
      appInfo: { name: "interndex-save-confirmation", version: "0.1.0" },
    });
  });

  it("confirms initialization and takes the host's theme", async () => {
    const view = mountView();
    await flush();

    view.fromHost({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: SAVE_CONFIRMATION_PROTOCOL_VERSION,
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
});

describe("Interndex save-confirmation view: rendering a save_job result", () => {
  it("renders the saved job's employer, title, status, term and location", () => {
    const view = mountView();

    view.toolResult(SAVED_JOB);

    expect(view.text()).toContain("RBC");
    expect(view.text()).toContain("Business Analyst Intern");
    expect(view.text()).toContain("Applied");
    expect(view.text()).toContain("Summer 2027");
    expect(view.text()).toContain("Toronto, ON");
  });

  it("renders a save with no work term or location, without saying null", () => {
    const view = mountView();

    view.toolResult(MINIMAL_JOB);

    expect(view.text()).toContain("Shopify");
    expect(view.text()).not.toContain("null");
  });

  it("renders exactly one saved job, never a list of them", () => {
    const view = mountView();

    view.toolResult(SAVED_JOB);

    // No list markup exists in this document at all, so there is nothing to
    // assert an absence of beyond the single rendered card.
    expect(view.root().querySelectorAll(".ix-company")).toHaveLength(1);
  });

  it("replaces the previous confirmation rather than appending to it", () => {
    const view = mountView();

    view.toolResult(SAVED_JOB);
    view.toolResult(MINIMAL_JOB);

    expect(view.root().querySelectorAll(".ix-company")).toHaveLength(1);
    expect(view.text()).toContain("Shopify");
    expect(view.text()).not.toContain("RBC");
  });

  it("shows a neutral state before any result arrives", () => {
    const view = mountView();

    expect(view.text()).toContain("Nothing saved yet.");
  });

  it("survives a result with no structured content at all", () => {
    const view = mountView();

    view.toolResult(undefined);

    expect(view.text()).toContain("Nothing saved yet.");
  });

  it("treats an employer name as text, never as markup", () => {
    const view = mountView();

    view.toolResult({ ...SAVED_JOB, company: "<img src=x onerror=alert(1)>" });

    expect(view.root().querySelector("img")).toBeNull();
    expect(view.root().querySelector(".ix-company")!.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });
});

describe("Interndex save-confirmation view: the ChatGPT globals path", () => {
  it("renders tool output the host injected before the script ran", () => {
    const view = mountView({ toolOutput: SAVED_JOB, theme: "dark" });

    expect(view.text()).toContain("RBC");
    expect(view.window.document.documentElement.dataset.theme).toBe("dark");
  });

  it("renders when the host announces globals with its event", () => {
    const view = mountView({ toolOutput: null });

    expect(view.text()).toContain("Nothing saved yet.");

    view.setGlobals({ toolOutput: SAVED_JOB });

    expect(view.text()).toContain("RBC");
  });

  it("polls for globals that appear with no event to announce them", () => {
    const view = mountView({ toolOutput: null });

    expect(view.liveIntervals()).toBe(1);

    view.window.openai.toolOutput = SAVED_JOB;
    view.tick();

    expect(view.text()).toContain("RBC");
    expect(view.liveIntervals()).toBe(0);
  });
});

describe("Interndex save-confirmation view: what it is not", () => {
  it("never fetches anything of its own", () => {
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("fetch(");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("XMLHttpRequest");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("/api/");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("supabase");
  });

  it("loads nothing from the network", () => {
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toMatch(/<link[^>]+href=/i);
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("https://");
  });

  it("carries no list markup at all", () => {
    // The structural guarantee behind "never a list": the class names and
    // copy the application-list view uses for a list simply do not exist
    // here, so there is no code path that could render one.
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("ix-list");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("ix-row");
    expect(SAVE_CONFIRMATION_VIEW_HTML).not.toContain("applications");
  });
});
