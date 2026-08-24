import { describe, expect, it } from "vitest";
import {
  isCompanyDomain,
  normalizeCompanyDomain,
} from "@/lib/branding/domain";

describe("company domain normalization", () => {
  it("keeps a bare valid domain as it is", () => {
    expect(normalizeCompanyDomain("shopify.com")).toBe("shopify.com");
    expect(normalizeCompanyDomain("rbc.com")).toBe("rbc.com");
    expect(normalizeCompanyDomain("kpmg.com")).toBe("kpmg.com");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCompanyDomain("  shopify.com  ")).toBe("shopify.com");
    expect(normalizeCompanyDomain("\n microsoft.com \t")).toBe("microsoft.com");
  });

  it("lowercases the hostname", () => {
    expect(normalizeCompanyDomain("Shopify.COM")).toBe("shopify.com");
    expect(normalizeCompanyDomain("DELOITTE.com")).toBe("deloitte.com");
  });

  it("drops a leading www", () => {
    expect(normalizeCompanyDomain("www.shopify.com")).toBe("shopify.com");
    expect(normalizeCompanyDomain("WWW.Shopify.com")).toBe("shopify.com");
  });

  it("keeps a meaningful subdomain, because it may be the intended one", () => {
    expect(normalizeCompanyDomain("careers.google.com")).toBe(
      "careers.google.com",
    );
    // Only `www` is treated as noise; nothing deeper is second-guessed.
    expect(normalizeCompanyDomain("www.careers.google.com")).toBe(
      "careers.google.com",
    );
  });

  it("accepts a pasted https URL and stores only the hostname", () => {
    expect(normalizeCompanyDomain("https://shopify.com")).toBe("shopify.com");
    expect(normalizeCompanyDomain("https://www.shopify.com/")).toBe(
      "shopify.com",
    );
    expect(normalizeCompanyDomain("http://www.shopify.com")).toBe(
      "shopify.com",
    );
  });

  it("strips the path, query, and fragment from a pasted URL", () => {
    expect(normalizeCompanyDomain("https://www.shopify.com/jobs")).toBe(
      "shopify.com",
    );
    expect(normalizeCompanyDomain("shopify.com/careers")).toBe("shopify.com");
    expect(
      normalizeCompanyDomain("https://shopify.com/careers?id=7#apply"),
    ).toBe("shopify.com");
  });

  it("treats blank input as absent rather than invalid", () => {
    expect(normalizeCompanyDomain("")).toBeUndefined();
    expect(normalizeCompanyDomain("   ")).toBeUndefined();
    expect(normalizeCompanyDomain("\n\t ")).toBeUndefined();
    expect(normalizeCompanyDomain(undefined)).toBeUndefined();
    expect(normalizeCompanyDomain(null)).toBeUndefined();
  });

  it.each([
    ["shopify", "a single word is not a domain"],
    ["shopify.", "nothing after the dot"],
    [".com", "nothing before the dot"],
    ["shopify..com", "an empty label"],
    ["-shopify.com", "a label may not start with a hyphen"],
    ["shopify-.com", "a label may not end with a hyphen"],
    ["shopify.c", "a one-character suffix"],
    ["shopify.123", "a numeric suffix"],
    ["192.168.1.1", "an IP address is not a brand domain"],
    ["localhost", "no suffix at all"],
    ["shopify .com", "a space inside the hostname"],
    ["shopify.com:8080", "a port belongs to a server, not a brand"],
    ["recruiter@shopify.com", "an email address, not a website"],
    ["mailto:jobs@shopify.com", "a mail link"],
    ["javascript://shopify.com", "a non-web scheme"],
    ["ftp://shopify.com", "a non-web scheme"],
    ["not a domain at all", "an unrelated sentence"],
    ["Royal Bank of Canada", "a company name is not a domain"],
    ["¯\\_(ツ)_/¯", "arbitrary punctuation"],
  ])("rejects %j — %s", (value) => {
    expect(normalizeCompanyDomain(value)).toBeUndefined();
  });

  it("rejects an input longer than any URL field allows", () => {
    expect(normalizeCompanyDomain(`${"a".repeat(3000)}.com`)).toBeUndefined();
  });

  it("rejects a hostname longer than DNS permits", () => {
    const tooLong = `${Array.from({ length: 7 }, () => "a".repeat(40)).join(".")}.com`;

    expect(tooLong.length).toBeGreaterThan(253);
    expect(normalizeCompanyDomain(tooLong)).toBeUndefined();
  });

  it("rejects a non-string value without throwing", () => {
    expect(normalizeCompanyDomain(42)).toBeUndefined();
    expect(normalizeCompanyDomain({ domain: "shopify.com" })).toBeUndefined();
    expect(normalizeCompanyDomain(["shopify.com"])).toBeUndefined();
  });

  it("is idempotent: normalizing a stored value changes nothing", () => {
    const once = normalizeCompanyDomain("HTTPS://WWW.Shopify.com/jobs?a=1");
    expect(once).toBe("shopify.com");
    expect(normalizeCompanyDomain(once)).toBe(once);
  });

  it("accepts an internationalized domain by its punycode form", () => {
    expect(normalizeCompanyDomain("münchen.de")).toBe("xn--mnchen-3ya.de");
  });
});

describe("company domain shape check", () => {
  it("accepts plain registrable domains", () => {
    expect(isCompanyDomain("shopify.com")).toBe(true);
    expect(isCompanyDomain("careers.google.com")).toBe(true);
    expect(isCompanyDomain("rbc.co.uk")).toBe(true);
  });

  it("rejects anything without a plausible suffix", () => {
    expect(isCompanyDomain("shopify")).toBe(false);
    expect(isCompanyDomain("10.0.0.1")).toBe(false);
    expect(isCompanyDomain("")).toBe(false);
  });
});
