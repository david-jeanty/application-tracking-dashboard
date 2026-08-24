import { describe, expect, it } from "vitest";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  parseAppearance,
  resolveMode,
  serializeAppearance,
} from "@/lib/appearance/appearance";

describe("reading a stored preference", () => {
  it("uses the defaults when nothing has been stored", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("returns a stored mode and accent", () => {
    expect(parseAppearance('{"mode":"dark","accent":"violet"}')).toEqual({
      mode: "dark",
      accent: "violet",
    });
  });

  it("falls back per field, so one bad value does not discard the other", () => {
    expect(parseAppearance('{"mode":"neon","accent":"rose"}')).toEqual({
      mode: DEFAULT_APPEARANCE.mode,
      accent: "rose",
    });
  });

  it("survives a value that is not JSON at all", () => {
    expect(parseAppearance("not json")).toEqual(DEFAULT_APPEARANCE);
  });

  it("survives JSON that is not an object", () => {
    expect(parseAppearance('"dark"')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("null")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("[]")).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips what it writes", () => {
    const appearance = { mode: "light", accent: "emerald" } as const;

    expect(parseAppearance(serializeAppearance(appearance))).toEqual(appearance);
  });

  it("stores nothing beyond the preference itself", () => {
    expect(JSON.parse(serializeAppearance({ mode: "dark", accent: "blue" }))).toEqual(
      { mode: "dark", accent: "blue" },
    );
  });
});

describe("resolving system mode", () => {
  it("follows the operating system", () => {
    expect(resolveMode("system", true)).toBe("dark");
    expect(resolveMode("system", false)).toBe("light");
  });

  it("ignores the operating system once a mode is chosen", () => {
    expect(resolveMode("light", true)).toBe("light");
    expect(resolveMode("dark", false)).toBe("dark");
  });
});

describe("applying a preference to the document", () => {
  it("stamps the resolved theme, the raw choice and the accent", () => {
    const root = document.createElement("html");

    applyAppearance(root, { mode: "system", accent: "rose" }, true);

    // `data-theme` drives the palette; `data-mode` is what the Settings
    // controls key their selected state off.
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.mode).toBe("system");
    expect(root.dataset.accent).toBe("rose");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("keeps an explicit choice independent of the operating system", () => {
    const root = document.createElement("html");

    applyAppearance(root, { mode: "light", accent: "blue" }, true);

    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
  });
});

describe("the storage key", () => {
  it("is namespaced, so it cannot collide with other browser state", () => {
    expect(APPEARANCE_STORAGE_KEY).toBe("jobtrack.appearance");
  });
});
