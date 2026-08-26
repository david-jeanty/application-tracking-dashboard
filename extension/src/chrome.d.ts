/**
 * The Chrome extension surface JobTrack Capture actually uses.
 *
 * Hand-written rather than pulled from `@types/chrome` on purpose: this file is
 * short enough to read in one sitting, so a reviewer can see the complete list
 * of browser capabilities the code is even able to name. Adding an API here is
 * a deliberate act, and anything absent is a compile error rather than a silent
 * new capability. It also keeps the extension free of a dependency whose only
 * job would be to describe APIs we never call.
 *
 * Every declaration below corresponds to a permission requested in
 * `manifest.json`: `storage`, `identity`, `scripting`, and `activeTab`.
 */

declare namespace chrome {
  namespace runtime {
    const id: string;

    function getURL(path: string): string;

    function sendMessage(message: unknown): Promise<unknown>;

    type MessageSender = {
      id?: string;
      /** The document that sent the message, when the browser knows it. */
      url?: string;
      /** Present when the sender is running inside a tab, page scripts included. */
      tab?: { id?: number };
    };

    const onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: MessageSender,
          sendResponse: (response: unknown) => void,
        ) => boolean | undefined | void,
      ): void;
    };
  }

  namespace storage {
    type StorageValues = Record<string, unknown>;

    type StorageArea = {
      get(keys: string | string[] | null): Promise<StorageValues>;
      set(items: StorageValues): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    };

    const session: StorageArea;
    const local: StorageArea;
  }

  namespace identity {
    function getRedirectURL(path?: string): string;

    function launchWebAuthFlow(details: {
      url: string;
      interactive: boolean;
    }): Promise<string | undefined>;
  }

  namespace scripting {
    type InjectionResult<T> = { frameId: number; result?: T };

    /**
     * `args` are structured-cloned into the page, which is why the injected
     * function takes its site selectors as a parameter rather than closing
     * over them: Chrome serializes the function body alone.
     *
     * `allFrames` and `frameIds` are the two ways to say "not just the main
     * frame", and LinkedIn is why either is here: a split-pane tab can render
     * the posting the student is reading inside a same-origin iframe. Neither
     * widens what the extension may touch — `activeTab` still grants one tab,
     * once, and a cross-origin frame stays unreadable. They only say which of
     * that tab's own documents the single injected read visits.
     */
    function executeScript<Result>(injection: {
      target: { tabId: number; allFrames?: boolean; frameIds?: number[] };
      func: (...args: never[]) => Result;
      args?: unknown[];
      world?: "ISOLATED" | "MAIN";
    }): Promise<InjectionResult<Result>[]>;
  }

  namespace tabs {
    type Tab = { id?: number; url?: string; title?: string };

    /**
     * Only ever called as `{ active: true, currentWindow: true }` from the
     * popup, which is how an extension learns which tab the student invoked it
     * on. This does not need the `tabs` permission: without it the returned tab
     * simply omits `url` and `title`, and the extension reads the posting URL
     * from the page `activeTab` already granted it access to.
     */
    function query(queryInfo: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<Tab[]>;
  }
}
