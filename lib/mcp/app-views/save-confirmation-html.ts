/**
 * The Interndex save-confirmation view, as one self-contained HTML document.
 *
 * This is the body of the MCP Apps UI resource that `save_job` points at. It
 * exists so a save has something visual of its own: before this view, `save_job`
 * returned only a plain-text sentence, and ChatGPT's own orchestration was
 * observed reaching for the widget-bearing `list_jobs` tool afterward — or
 * beforehand as an ad hoc duplicate check — purely to put something visual next
 * to the confirmation, which surfaced every other saved application in the
 * process. Giving `save_job` its own compact, single-record view removes that
 * incentive at the source instead of only asking the model not to act on it.
 *
 * It shares three properties with `application-list-html.ts`, deliberately:
 *
 * - **It fetches nothing.** Its only input is the `structuredContent` of the
 *   `save_job` result the host hands it — one job, not a list. There is no
 *   query, no Supabase client, and no token inside this document.
 * - **It builds DOM, never HTML strings.** Every value it renders is text a
 *   student pasted from a posting or a status Interndex itself defines.
 *   `textContent` is the whole escaping story.
 * - **It carries its own palette.**, copied from `app/globals.css` exactly as
 *   the list view's is, because the widget has no access to the app's
 *   Tailwind build inside the host's iframe.
 *
 * What it deliberately does not do: render a list, an id a student would need
 * to remember, or an empty state that could be mistaken for "nothing saved" —
 * this view only ever renders after a save that already succeeded.
 */

/** The MCP Apps protocol revision this view speaks. */
export const SAVE_CONFIRMATION_PROTOCOL_VERSION = "2026-01-26";

export const SAVE_CONFIRMATION_VIEW_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Interndex save confirmation</title>
    <style>
      :root {
        --ix-surface: #fcfbf8;
        --ix-surface-muted: #f3f0ea;
        --ix-foreground: #1f2328;
        --ix-foreground-secondary: #55524d;
        --ix-foreground-muted: #706c62;
        --ix-border: #ddd8d0;
        --ix-accent: #2f4e9e;
        --ix-success: #2f6b4f;
        --ix-warning: #8a5a1c;
        --ix-danger: #a33a2e;
        color-scheme: light;
      }

      /* Interndex's own dark values, kept in step with app/globals.css. */
      :root[data-theme="dark"] {
        --ix-surface: #1a1d22;
        --ix-surface-muted: #202429;
        --ix-foreground: #e8e6e1;
        --ix-foreground-secondary: #a8a49c;
        --ix-foreground-muted: #918c83;
        --ix-border: #2a2e34;
        --ix-accent: #88ace0;
        --ix-success: #5cb98a;
        --ix-warning: #d9a24f;
        --ix-danger: #e8837a;
        color-scheme: dark;
      }

      @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
          --ix-surface: #1a1d22;
          --ix-surface-muted: #202429;
          --ix-foreground: #e8e6e1;
          --ix-foreground-secondary: #a8a49c;
          --ix-foreground-muted: #918c83;
          --ix-border: #2a2e34;
          --ix-accent: #88ace0;
          --ix-success: #5cb98a;
          --ix-warning: #d9a24f;
          --ix-danger: #e8837a;
          color-scheme: dark;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--ix-surface);
        color: var(--ix-foreground);
        font-family:
          ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
          "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        line-height: 1.45;
        -webkit-font-smoothing: antialiased;
      }

      .ix-root {
        border: 1px solid var(--ix-border);
        border-radius: 12px;
        overflow: hidden;
      }

      .ix-header {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--ix-border);
        background: var(--ix-surface-muted);
      }

      .ix-wordmark {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--ix-accent);
      }

      .ix-saved {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--ix-success);
      }

      .ix-saved-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        flex: 0 0 auto;
      }

      .ix-body {
        padding: 14px;
      }

      .ix-company {
        font-weight: 600;
        font-size: 16px;
        color: var(--ix-foreground);
      }

      .ix-title {
        margin-top: 2px;
        font-size: 14px;
        color: var(--ix-foreground-secondary);
      }

      .ix-meta {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px 10px;
        font-size: 12px;
        color: var(--ix-foreground-muted);
      }

      .ix-meta-item + .ix-meta-item::before {
        content: "·";
        margin-right: 10px;
      }

      .ix-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 10px;
        font-size: 13px;
        color: var(--ix-foreground-secondary);
      }

      /* Colour only where it carries a verdict, exactly as the dashboard and
         the application-list view both do. */
      .ix-status[data-tone="warning"] {
        color: var(--ix-warning);
      }
      .ix-status[data-tone="success"] {
        color: var(--ix-success);
      }
      .ix-status[data-tone="danger"] {
        color: var(--ix-danger);
      }
      .ix-status[data-tone="muted"] {
        color: var(--ix-foreground-muted);
      }

      .ix-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
        flex: 0 0 auto;
      }

      .ix-empty {
        padding: 20px 14px;
        text-align: center;
        color: var(--ix-foreground-secondary);
      }
    </style>
  </head>
  <body>
    <div class="ix-root" id="ix-root"></div>
    <script>
      (function () {
        "use strict";

        var PROTOCOL_VERSION = "${SAVE_CONFIRMATION_PROTOCOL_VERSION}";
        var APP_INFO = { name: "interndex-save-confirmation", version: "0.1.0" };
        var INITIALIZE_ID = 1;

        var root = document.getElementById("ix-root");

        var STATUS_TONES = {
          Preparing: "warning",
          Offer: "success",
          Accepted: "success",
          Rejected: "danger",
          Withdrawn: "muted"
        };

        function element(tag, className, text) {
          var node = document.createElement(tag);
          if (className) node.className = className;
          if (text !== undefined && text !== null) node.textContent = text;
          return node;
        }

        /** A trimmed, non-empty string, or null. Anything else is "missing". */
        function text(value) {
          if (typeof value !== "string") return null;
          var trimmed = value.trim();
          return trimmed ? trimmed : null;
        }

        function statusNode(job) {
          var status = text(job.status);
          if (!status) return null;

          var node = element("span", "ix-status");
          node.setAttribute("data-tone", STATUS_TONES[status] || "neutral");
          var dot = element("span", "ix-dot");
          dot.setAttribute("aria-hidden", "true");
          node.appendChild(dot);
          node.appendChild(element("span", null, status));
          return node;
        }

        function metaLine(job) {
          var parts = [];
          var workTerm = text(job.work_term);
          var location = text(job.location);

          if (workTerm) parts.push(workTerm);
          if (location) parts.push(location);
          if (!parts.length) return null;

          var line = element("div", "ix-meta");
          for (var index = 0; index < parts.length; index += 1) {
            line.appendChild(element("span", "ix-meta-item", parts[index]));
          }
          return line;
        }

        function emptyNode() {
          var empty = element("div", "ix-empty");
          empty.appendChild(element("div", null, "Nothing saved yet."));
          return empty;
        }

        /**
         * Renders one save_job result: a single job, never a list.
         *
         * Everything optional is treated as optional, exactly as the
         * application-list view does: a missing work term or location omits
         * that line rather than rendering "null".
         */
        function render(structured) {
          var job = structured && typeof structured === "object" ? structured : null;

          root.textContent = "";

          var header = element("div", "ix-header");
          header.appendChild(element("span", "ix-wordmark", "Interndex"));
          var saved = element("span", "ix-saved");
          var dot = element("span", "ix-saved-dot");
          dot.setAttribute("aria-hidden", "true");
          saved.appendChild(dot);
          saved.appendChild(element("span", null, "Saved"));
          header.appendChild(saved);
          root.appendChild(header);

          var company = job ? text(job.company) : null;
          if (!company) {
            root.appendChild(emptyNode());
            reportSize();
            return;
          }

          var body = element("div", "ix-body");
          body.appendChild(element("div", "ix-company", company));

          var title = text(job.job_title);
          if (title) body.appendChild(element("div", "ix-title", title));

          var meta = metaLine(job);
          if (meta) body.appendChild(meta);

          var status = statusNode(job);
          if (status) body.appendChild(status);

          root.appendChild(body);
          reportSize();
        }

        function applyTheme(theme) {
          if (theme === "dark" || theme === "light") {
            document.documentElement.setAttribute("data-theme", theme);
          }
        }

        /* ---------------------------------------------- MCP Apps transport */

        var host = window.parent;

        function post(message) {
          if (!host) return;
          host.postMessage(message, "*");
        }

        function notify(method, params) {
          post({ jsonrpc: "2.0", method: method, params: params || {} });
        }

        function reportSize() {
          if (!host || host === window.self) return;
          notify("ui/notifications/size-changed", {
            height: Math.ceil(root.getBoundingClientRect().height)
          });
        }

        function onHostMessage(event) {
          if (event.source !== host) return;
          var message = event.data;
          if (!message || message.jsonrpc !== "2.0") return;

          if (message.id === INITIALIZE_ID && message.result) {
            var context = message.result.hostContext;
            if (context) applyTheme(context.theme);
            notify("ui/notifications/initialized");
            return;
          }

          if (message.method === "ping" && message.id !== undefined) {
            post({ jsonrpc: "2.0", id: message.id, result: {} });
            return;
          }

          if (message.method === "ui/notifications/tool-result") {
            var params = message.params || {};
            render(params.structuredContent);
            return;
          }

          if (message.method === "ui/notifications/host-context-changed") {
            var changed = message.params || {};
            if ("theme" in changed) applyTheme(changed.theme);
          }
        }

        window.addEventListener("message", onHostMessage);

        if (host) {
          post({
            jsonrpc: "2.0",
            id: INITIALIZE_ID,
            method: "ui/initialize",
            params: {
              appInfo: APP_INFO,
              appCapabilities: {},
              protocolVersion: PROTOCOL_VERSION
            }
          });
        }

        /*
          The contract ChatGPT uses: the tool result arrives as
          window.openai.toolOutput rather than over postMessage, refreshed
          through an "openai:set_globals" event.
        */
        function readOpenAiGlobals() {
          var globals = window.openai;
          if (!globals) return false;
          applyTheme(globals.theme);
          if (globals.toolOutput) {
            render(globals.toolOutput);
            return true;
          }
          return false;
        }

        window.addEventListener("openai:set_globals", function () {
          readOpenAiGlobals();
        });

        var gotGlobals = readOpenAiGlobals();
        if (!gotGlobals) render(null);

        /*
          The globals can also appear with no event to announce them, so poll
          briefly for a first result and stop the moment one arrives — the
          same interval and bound the application-list view and the Apps SDK's
          own useOpenAiGlobal hook use.
        */
        if (!gotGlobals && typeof window.setInterval === "function") {
          var remainingChecks = 40;
          var pollId = window.setInterval(function () {
            remainingChecks -= 1;
            if (readOpenAiGlobals() || remainingChecks <= 0) {
              window.clearInterval(pollId);
            }
          }, 250);
        }
      })();
    </script>
  </body>
</html>
`;
