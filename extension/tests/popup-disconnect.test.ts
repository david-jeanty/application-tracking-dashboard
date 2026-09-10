import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const markup = readFileSync(join(import.meta.dirname, "../popup.html"), "utf8");

type Message = { type: string };

/**
 * A connection whose extraction never resolves, so the popup stays in a
 * `CONNECTED_VIEWS` state (with the "Sign out of this browser" button
 * visible) without this suite having to simulate a real page read.
 */
function install(): { sent: Message[] } {
  const sent: Message[] = [];

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: {
      runtime: {
        sendMessage: async (message: Message) => {
          sent.push(message);
          if (message.type === "connection-state") return { connected: true };
          if (message.type === "disconnect") return { status: "disconnected" };
          return undefined;
        },
      },
      tabs: {
        // Never resolves: the popup stays on the "extracting" panel, where
        // the disconnect control is shown.
        query: () => new Promise<never[]>(() => {}),
      },
    },
  });

  return { sent };
}

/** Lets every pending microtask and zero-delay timer settle. */
async function settle(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

beforeEach(() => {
  document.documentElement.innerHTML = markup;
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("signing out of this browser", () => {
  it("asks for confirmation, and says this does not revoke the extension's access", async () => {
    install();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    vi.resetModules();
    await import("../src/popup.js");
    await settle();

    document
      .getElementById("disconnect")
      ?.dispatchEvent(new Event("click", { bubbles: true }));
    await settle();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    const message = confirmSpy.mock.calls[0]?.[0];
    expect(message).toMatch(/does not remove/i);
    expect(message).toMatch(/Interndex Settings/);
  });

  it("does nothing when the confirmation is declined", async () => {
    const { sent } = install();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    vi.resetModules();
    await import("../src/popup.js");
    await settle();

    document
      .getElementById("disconnect")
      ?.dispatchEvent(new Event("click", { bubbles: true }));
    await settle();

    expect(sent.some((message) => message.type === "disconnect")).toBe(false);
    expect(document.getElementById("disconnect")?.hidden).toBe(false);
  });

  it("clears the local connection once confirmed", async () => {
    const { sent } = install();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    vi.resetModules();
    await import("../src/popup.js");
    await settle();

    document
      .getElementById("disconnect")
      ?.dispatchEvent(new Event("click", { bubbles: true }));
    await settle();

    expect(sent.some((message) => message.type === "disconnect")).toBe(true);
    expect(
      document
        .querySelector<HTMLElement>('[data-panel="disconnected"]')
        ?.hidden,
    ).toBe(false);
  });
});
