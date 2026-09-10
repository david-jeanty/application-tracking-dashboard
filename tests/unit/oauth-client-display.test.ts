import { describe, expect, it } from "vitest";
import {
  describeRedirectTarget,
  displayClientName,
  MAXIMUM_CLIENT_NAME_CHARACTERS,
} from "@/lib/oauth/client-display";

/**
 * The consent screen shows two strings chosen by whoever registered the
 * client. Registration is open, so these are attacker input, and every case
 * below is a way a name or a return address could be made to read as
 * something other than what it is.
 */

describe("displayClientName", () => {
  it("passes an ordinary product name through unchanged", () => {
    expect(displayClientName("Claude")).toBe("Claude");
    expect(displayClientName("Interndex Capture")).toBe("Interndex Capture");
  });

  it("shortens a name that would push the decision off the screen", () => {
    const name = "A".repeat(300);
    const shown = displayClientName(name);

    expect(shown).toHaveLength(MAXIMUM_CLIENT_NAME_CHARACTERS);
    expect(shown?.endsWith("…")).toBe(true);
  });

  it("keeps a name of exactly the limit whole, with no ellipsis", () => {
    const name = "B".repeat(MAXIMUM_CLIENT_NAME_CHARACTERS);

    expect(displayClientName(name)).toBe(name);
    expect(displayClientName(name)).not.toContain("…");
  });

  it("collapses a name that tries to draw itself as several lines of copy", () => {
    const name = "Claude\n\nVerified by Interndex\nOfficial";

    expect(displayClientName(name)).toBe(
      "Claude Verified by Interndex Official",
    );
  });

  it("removes bidirectional overrides and zero-width characters", () => {
    // A right-to-left override renders the text after it in reverse, which
    // lets a registration display a name it does not contain.
    const name = "Interndex‮ gnihsihp ​⁦Capture⁩";
    const shown = displayClientName(name) ?? "";

    expect(shown).not.toMatch(/[​-‏‪-‮⁦-⁩]/);
    expect(shown).toBe("Interndex gnihsihp Capture");
  });

  it("reports nothing rather than inventing a name", () => {
    expect(displayClientName("")).toBeNull();
    expect(displayClientName("   ")).toBeNull();
    expect(displayClientName("​​")).toBeNull();
    expect(displayClientName(undefined)).toBeNull();
    expect(displayClientName(null)).toBeNull();
    expect(displayClientName({ toString: () => "Claude" })).toBeNull();
  });
});

describe("describeRedirectTarget", () => {
  it("pulls out the host an authorization code would be sent to", () => {
    expect(
      describeRedirectTarget("https://claude.ai/api/mcp/auth_callback"),
    ).toEqual({
      host: "claude.ai",
      url: "https://claude.ai/api/mcp/auth_callback",
    });
  });

  it("keeps the extension's own callback recognizable", () => {
    const uri = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/";

    expect(describeRedirectTarget(uri).host).toBe(
      "abcdefghijklmnopabcdefghijklmnop.chromiumapp.org",
    );
  });

  it("keeps a non-default port, which is part of who the host is", () => {
    expect(describeRedirectTarget("http://localhost:3000/cb").host).toBe(
      "localhost:3000",
    );
  });

  it("does not let a userinfo prefix pass itself off as the host", () => {
    // `https://claude.ai@attacker.example/` is attacker.example, and the URL
    // parser is what settles that rather than any string handling here.
    expect(describeRedirectTarget("https://claude.ai@attacker.example/").host).toBe(
      "attacker.example",
    );
  });

  it("reports no host rather than guessing at one it cannot parse", () => {
    expect(describeRedirectTarget("not a url").host).toBeNull();
    expect(describeRedirectTarget("").host).toBeNull();
    expect(describeRedirectTarget(undefined)).toEqual({ host: null, url: "" });
  });

  it("shortens an address long enough to bury the buttons", () => {
    const uri = `https://attacker.example/${"a".repeat(2000)}`;
    const { host, url } = describeRedirectTarget(uri);

    expect(host).toBe("attacker.example");
    expect(url.length).toBeLessThanOrEqual(120);
    expect(url.endsWith("…")).toBe(true);
  });
});
