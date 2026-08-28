import { describe, expect, it } from "vitest";
import { appearanceInlineScript } from "@/lib/appearance/inline-script";

/**
 * The blocking script runs before hydration, so it cannot import anything and
 * must never throw. These tests execute the generated source against a stand-in
 * document to prove both, rather than asserting on its text.
 */
function run(options: {
  stored?: string | null;
  prefersDark?: boolean;
  throwOnStorage?: boolean;
}) {
  const root = document.createElement("html");
  const scope = {
    document: { documentElement: root },
    localStorage: {
      getItem: () => {
        if (options.throwOnStorage) throw new Error("storage is blocked");
        return options.stored ?? null;
      },
    },
    matchMedia: (query: string) => ({
      matches: query.includes("dark") && Boolean(options.prefersDark),
    }),
  };

  new Function(
    "window",
    "document",
    "localStorage",
    `with (window) { ${appearanceInlineScript()} }`,
  )(scope, scope.document, scope.localStorage);

  return root;
}

describe("the pre-paint appearance script", () => {
  it("applies a stored dark preference before anything renders", () => {
    const root = run({ stored: '{"mode":"dark","accent":"violet"}' });

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.mode).toBe("dark");
    expect(root.dataset.accent).toBe("blue");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("resolves system mode against the operating system", () => {
    expect(run({ stored: null, prefersDark: true }).dataset.theme).toBe("dark");
    expect(run({ stored: null, prefersDark: false }).dataset.theme).toBe("light");
  });

  it("keeps system as the raw choice even once resolved", () => {
    const root = run({ stored: '{"mode":"system","accent":"rose"}', prefersDark: true });

    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.mode).toBe("system");
  });

  it("ignores an unrecognized stored value rather than breaking the page", () => {
    const root = run({ stored: '{"mode":"neon","accent":"chartreuse"}' });

    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.accent).toBe("blue");
  });

  it("still applies a default when storage is unavailable", () => {
    const root = run({ throwOnStorage: true });

    expect(root.dataset.theme).toBe("light");
    expect(root.dataset.accent).toBe("blue");
  });
});
