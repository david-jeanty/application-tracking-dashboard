/**
 * The Interndex application-list view, as one self-contained HTML document.
 *
 * This is the body of the MCP Apps UI resource that `list_jobs` points at. It
 * is a string rather than a file read at request time because the MCP route
 * runs in the Next.js server bundle: a template literal is bundled with the
 * route, while `fs.readFileSync` of a widget asset is a deployment detail that
 * can be absent in a serverless build.
 *
 * Three properties are deliberate:
 *
 * - **It fetches nothing.** Everything it renders arrives as the
 *   `structuredContent` of the `list_jobs` result the host hands it. There is
 *   no second query, no Supabase client, and no token inside this document, so
 *   the widget cannot become a data path that bypasses RLS.
 * - **It builds DOM, never HTML strings.** Company names, titles and locations
 *   are text a student pasted from a posting. `textContent` is the whole
 *   escaping story.
 * - **It carries its own palette.** The widget renders inside the host's
 *   iframe with no access to the app's Tailwind build, so the Interndex tokens
 *   it needs are restated here as plain custom properties. They are copied
 *   values, not a second design system: the list is short and the source of
 *   truth stays `app/globals.css`.
 */

/** The MCP Apps protocol revision this view speaks. */
export const APP_VIEW_PROTOCOL_VERSION = "2026-01-26";

export const APPLICATION_LIST_VIEW_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Interndex applications</title>
    <style>
      :root {
        --ix-surface: #fcfbf8;
        --ix-surface-muted: #f3f0ea;
        --ix-foreground: #1f2328;
        --ix-foreground-secondary: #55524d;
        --ix-foreground-muted: #706c62;
        --ix-border: #ddd8d0;
        --ix-border-strong: #c9c2b7;
        --ix-accent: #2f4e9e;
        --ix-success: #2f6b4f;
        --ix-warning: #8a5a1c;
        --ix-danger: #a33a2e;
        color-scheme: light;
      }

      /*
        Interndex's own dark values, kept in step with app/globals.css. Defined
        for an explicit host theme and for a host that only reports the
        operating system's preference, so a widget in ChatGPT's dark mode is
        never a slab of ivory.
      */
      :root[data-theme="dark"] {
        --ix-surface: #1a1d22;
        --ix-surface-muted: #202429;
        --ix-foreground: #e8e6e1;
        --ix-foreground-secondary: #a8a49c;
        --ix-foreground-muted: #918c83;
        --ix-border: #2a2e34;
        --ix-border-strong: #3a3f46;
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
          --ix-border-strong: #3a3f46;
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

      /* Header: the wordmark, then what this list is, then how complete it is. */
      .ix-header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 10px;
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

      .ix-count {
        font-size: 13px;
        color: var(--ix-foreground-secondary);
      }

      .ix-more {
        margin-left: auto;
        font-size: 12px;
        color: var(--ix-foreground-muted);
      }

      .ix-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .ix-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 2px 12px;
        padding: 10px 14px;
        border-top: 1px solid var(--ix-border);
      }

      .ix-list > .ix-row:first-child {
        border-top: 0;
      }

      .ix-main {
        min-width: 0;
        flex: 1 1 220px;
      }

      /* Employer first, role second: a student scans this list by company. */
      .ix-company {
        font-weight: 600;
        font-size: 14px;
        color: var(--ix-foreground);
      }

      .ix-title {
        display: block;
        font-size: 13px;
        color: var(--ix-foreground-secondary);
      }

      .ix-meta {
        margin-top: 2px;
        font-size: 12px;
        color: var(--ix-foreground-muted);
      }

      .ix-meta-item + .ix-meta-item::before {
        content: "·";
        margin: 0 6px;
      }

      .ix-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        flex: 0 0 auto;
        font-size: 13px;
        white-space: nowrap;
        color: var(--ix-foreground-secondary);
      }

      /*
        Colour only where it carries a verdict, exactly as the dashboard does.
        Applied, Screening and Interview are progress, and colouring thirty
        rows of progress leaves nothing for an offer or a rejection to stand
        out against.
      */
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

      .ix-archived {
        margin-left: 8px;
        padding: 1px 6px;
        border: 1px solid var(--ix-border-strong);
        border-radius: 999px;
        font-size: 11px;
        color: var(--ix-foreground-muted);
      }

      .ix-empty {
        padding: 20px 14px;
        text-align: center;
        color: var(--ix-foreground-secondary);
      }

      .ix-empty-hint {
        margin-top: 4px;
        font-size: 12px;
        color: var(--ix-foreground-muted);
      }
    </style>
  </head>
  <body>
    <div class="ix-root" id="ix-root"></div>
    <script>
      (function () {
        "use strict";

        var PROTOCOL_VERSION = "${APP_VIEW_PROTOCOL_VERSION}";
        var APP_INFO = { name: "interndex-application-list", version: "0.1.0" };
        var INITIALIZE_ID = 1;

        var root = document.getElementById("ix-root");

        /*
          Which statuses get a colour, and which one. Anything not named here
          is progress and stays in the secondary neutral.
        */
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
          // textContent, never innerHTML: every string below is text a student
          // pasted out of a job posting.
          if (text !== undefined && text !== null) node.textContent = text;
          return node;
        }

        /** A trimmed, non-empty string, or null. Anything else is "missing". */
        function text(value) {
          if (typeof value !== "string") return null;
          var trimmed = value.trim();
          return trimmed ? trimmed : null;
        }

        /**
         * A YYYY-MM-DD day as words, or the raw value when it is not one.
         *
         * Built at UTC midnight so a stored day never shifts by a timezone,
         * which is the same rule lib/dates/date-only.ts follows.
         */
        function formatDay(value) {
          var raw = text(value);
          if (!raw) return null;

          var match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw);
          if (!match) return raw;

          var stamp = Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
          );
          var date = new Date(stamp);
          if (isNaN(stamp) || date.getUTCDate() !== Number(match[3])) return raw;

          try {
            return new Intl.DateTimeFormat(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC"
            }).format(date);
          } catch (error) {
            return raw;
          }
        }

        function metaLine(job) {
          var parts = [];
          var workTerm = text(job.work_term);
          var location = text(job.location);
          var applied = formatDay(job.date_applied);
          var deadline = formatDay(job.deadline);

          if (workTerm) parts.push(workTerm);
          if (location) parts.push(location);
          if (applied) parts.push("Applied " + applied);
          if (deadline) parts.push("Due " + deadline);
          if (!parts.length) return null;

          var line = element("div", "ix-meta");
          for (var index = 0; index < parts.length; index += 1) {
            line.appendChild(element("span", "ix-meta-item", parts[index]));
          }
          return line;
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

        function rowNode(job) {
          var row = element("li", "ix-row");
          var main = element("div", "ix-main");

          // An application with neither a company nor a title is not a row a
          // student can act on, but it must still not break the list.
          var company = text(job.company) || "Unnamed employer";
          var heading = element("div");
          heading.appendChild(element("span", "ix-company", company));

          if (job.archived === true) {
            heading.appendChild(element("span", "ix-archived", "Archived"));
          }
          main.appendChild(heading);

          var title = text(job.job_title);
          if (title) main.appendChild(element("span", "ix-title", title));

          var meta = metaLine(job);
          if (meta) main.appendChild(meta);

          row.appendChild(main);
          var status = statusNode(job);
          if (status) row.appendChild(status);
          return row;
        }

        function emptyNode() {
          var empty = element("div", "ix-empty");
          empty.appendChild(element("div", null, "No applications match."));
          empty.appendChild(
            element(
              "div",
              "ix-empty-hint",
              "Ask to widen the filters, or save a job to start tracking one."
            )
          );
          return empty;
        }

        /**
         * Renders one list_jobs result.
         *
         * Everything optional is treated as optional: a result with no
         * applications array, a row missing a location, a null deadline and an
         * absent status all render rather than throw.
         */
        function render(structured) {
          var payload = structured && typeof structured === "object" ? structured : {};
          var jobs = Array.isArray(payload.applications) ? payload.applications : [];

          root.textContent = "";

          var header = element("div", "ix-header");
          header.appendChild(element("span", "ix-wordmark", "Interndex"));
          // No count beside an empty list: the empty state below already says
          // it, and "0 applications" said twice reads like an error.
          if (jobs.length) {
            header.appendChild(
              element(
                "span",
                "ix-count",
                jobs.length === 1
                  ? "1 application"
                  : jobs.length + " applications"
              )
            );
          }
          if (payload.has_more === true) {
            header.appendChild(
              element("span", "ix-more", "More match than are shown")
            );
          }
          root.appendChild(header);

          if (!jobs.length) {
            root.appendChild(emptyNode());
            reportSize();
            return;
          }

          var list = element("ul", "ix-list");
          list.setAttribute("aria-label", "Job applications");
          for (var index = 0; index < jobs.length; index += 1) {
            var job = jobs[index];
            if (!job || typeof job !== "object") continue;
            list.appendChild(rowNode(job));
          }
          root.appendChild(list);
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

        /*
          Height changes with the number of applications, so the host is told
          what to size the frame to. Skipped when this document is not framed,
          which is every context that is not a host — opening the file
          directly, or the JSDOM tests, where window.parent is window.
        */
        function reportSize() {
          if (!host || host === window.self) return;
          // The rendered list, not the document: the host already sized this
          // frame, so documentElement.scrollHeight would report the height the
          // host chose back to it and the frame could never shrink.
          notify("ui/notifications/size-changed", {
            height: Math.ceil(root.getBoundingClientRect().height)
          });
        }

        function onHostMessage(event) {
          if (event.source !== host) return;
          var message = event.data;
          if (!message || message.jsonrpc !== "2.0") return;

          // The host answers ui/initialize with its own context; the theme is
          // the only part this view acts on today.
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

        // Render something immediately rather than an empty frame: either the
        // globals a host already injected, or the empty state.
        var gotGlobals = readOpenAiGlobals();
        if (!gotGlobals) render(null);

        /*
          The globals can also appear with no event to announce them — the host
          injects them around the time this script runs, and which side wins is
          not ours to decide. So poll briefly for a first result, and stop the
          moment one arrives. Ten seconds at the same 250ms interval the Apps
          SDK's own useOpenAiGlobal hook uses, then give up rather than spin
          for the life of the conversation.
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
