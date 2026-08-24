import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance/appearance";

/**
 * jsdom's `matchMedia` never emits a change, so the operating system is stood
 * in for here. What matters is that a `system` preference follows it after the
 * page has loaded, and that an explicit Light or Dark choice does not.
 */
let listeners: Array<(event: MediaQueryListEvent) => void>;
let prefersDark: boolean;
const realMatchMedia = window.matchMedia;

function switchOperatingSystemTo(scheme: "dark" | "light") {
  prefersDark = scheme === "dark";
  for (const listener of listeners) {
    listener({ matches: prefersDark } as MediaQueryListEvent);
  }
}

/**
 * Puts the document in the state the blocking `<head>` script leaves it in,
 * then starts watching — which is the order these happen in a real page.
 */
async function loadedWith(options: {
  mode: string;
  accent?: string;
  operatingSystem: "dark" | "light";
}) {
  window.localStorage.setItem(
    APPEARANCE_STORAGE_KEY,
    JSON.stringify({ mode: options.mode, accent: options.accent ?? "blue" }),
  );
  prefersDark = options.operatingSystem === "dark";

  const resolved =
    options.mode === "system" ? options.operatingSystem : options.mode;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.mode = options.mode;
  document.documentElement.dataset.accent = options.accent ?? "blue";

  // The store caches the preference in module scope, so each test needs its
  // own copy of the module rather than one shared across the file.
  vi.resetModules();
  const { watchAppearance } = await import(
    "@/components/appearance/use-appearance"
  );

  return watchAppearance();
}

beforeEach(() => {
  listeners = [];
  prefersDark = false;
  window.localStorage.clear();

  window.matchMedia = ((query: string) => ({
    matches: query.includes("dark") && prefersDark,
    addEventListener: (
      _: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => listeners.push(listener),
    removeEventListener: (
      _: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners = listeners.filter((existing) => existing !== listener);
    },
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe("system mode, after the page has already loaded", () => {
  it("follows the desktop switching to dark", async () => {
    const stop = await loadedWith({ mode: "system", operatingSystem: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");

    switchOperatingSystemTo("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    stop();
  });

  it("follows the desktop switching back to light", async () => {
    const stop = await loadedWith({ mode: "system", operatingSystem: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");

    switchOperatingSystemTo("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    stop();
  });

  it("keeps `system` recorded as the choice, and leaves the accent alone", async () => {
    const stop = await loadedWith({
      mode: "system",
      accent: "rose",
      operatingSystem: "light",
    });

    switchOperatingSystemTo("dark");

    expect(document.documentElement.dataset.mode).toBe("system");
    expect(document.documentElement.dataset.accent).toBe("rose");
    stop();
  });
});

describe("an explicit choice outranks the desktop", () => {
  it("stays light when the desktop switches to dark", async () => {
    const stop = await loadedWith({ mode: "light", operatingSystem: "light" });

    switchOperatingSystemTo("dark");

    expect(document.documentElement.dataset.theme).toBe("light");
    stop();
  });

  it("stays dark when the desktop switches to light", async () => {
    const stop = await loadedWith({ mode: "dark", operatingSystem: "dark" });

    switchOperatingSystemTo("light");

    expect(document.documentElement.dataset.theme).toBe("dark");
    stop();
  });
});

describe("tearing the watcher down", () => {
  it("stops following the desktop", async () => {
    const stop = await loadedWith({ mode: "system", operatingSystem: "light" });

    stop();
    switchOperatingSystemTo("dark");

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
