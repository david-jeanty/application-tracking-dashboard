import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jobtrackUrl } from "../src/config.js";

const markup = readFileSync(join(import.meta.dirname, "../popup.html"), "utf8");

function install(): void {
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: {
      runtime: {
        sendMessage: async () => ({ connected: false }),
      },
      tabs: {
        query: async () => [],
      },
    },
  });
}

beforeEach(() => {
  document.documentElement.innerHTML = markup;
});

afterEach(() => {
  vi.resetModules();
});

describe("popup footer links", () => {
  it("points Privacy and Support at the configured Interndex origin", async () => {
    install();

    vi.resetModules();
    await import("../src/popup.js");

    const privacyLink = document.querySelector<HTMLAnchorElement>("#privacy-link");
    const supportLink = document.querySelector<HTMLAnchorElement>("#support-link");

    expect(privacyLink?.href).toBe(jobtrackUrl("/privacy"));
    expect(supportLink?.href).toBe(jobtrackUrl("/support"));
    expect(privacyLink?.target).toBe("_blank");
    expect(supportLink?.target).toBe("_blank");
  });
});
