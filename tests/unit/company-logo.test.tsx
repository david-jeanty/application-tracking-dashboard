import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CompanyLogo } from "@/components/branding/company-logo";
import {
  LOGO_DEV_HOST,
  companyInitial,
  companyLogoUrl,
  logoDevToken,
} from "@/lib/branding/logo";

const TOKEN = "pk_test_publishable_key";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

describe("logo.dev url construction", () => {
  it("builds an img.logo.dev url from the domain and the publishable token", () => {
    const url = companyLogoUrl("shopify.com", { token: TOKEN, size: 32 });

    expect(url).not.toBeNull();
    const parsed = new URL(url as string);

    expect(parsed.protocol).toBe("https:");
    expect(parsed.host).toBe(LOGO_DEV_HOST);
    expect(parsed.pathname).toBe("/shopify.com");
    expect(parsed.searchParams.get("token")).toBe(TOKEN);
    expect(parsed.searchParams.get("format")).toBe("png");
  });

  it("requests twice the rendered size so the mark stays sharp", () => {
    const url = new URL(
      companyLogoUrl("shopify.com", { token: TOKEN, size: 32 }) as string,
    );

    expect(url.searchParams.get("size")).toBe("64");
  });

  it("never asks Logo.dev for more than it renders", () => {
    const url = new URL(
      companyLogoUrl("shopify.com", { token: TOKEN, size: 600 }) as string,
    );

    expect(Number(url.searchParams.get("size"))).toBeLessThanOrEqual(800);
  });

  it("normalizes before building, so the same brand yields one url", () => {
    const bare = companyLogoUrl("shopify.com", { token: TOKEN, size: 32 });

    expect(
      companyLogoUrl("https://WWW.Shopify.com/careers", {
        token: TOKEN,
        size: 32,
      }),
    ).toBe(bare);
  });

  it("returns null for a domain that does not validate", () => {
    for (const value of [
      "not a domain",
      "javascript://evil.example",
      "shopify",
      "   ",
    ]) {
      expect(companyLogoUrl(value, { token: TOKEN, size: 32 })).toBeNull();
    }
  });

  it("returns null when there is no domain at all", () => {
    expect(companyLogoUrl(null, { token: TOKEN, size: 32 })).toBeNull();
    expect(companyLogoUrl(undefined, { token: TOKEN, size: 32 })).toBeNull();
  });

  it("returns null when no publishable token is configured", () => {
    expect(
      companyLogoUrl("shopify.com", { token: undefined, size: 32 }),
    ).toBeNull();
  });

  it("cannot be talked into a different host or an extra path segment", () => {
    // Every one of these normalizes to nothing, so no URL is produced at all —
    // the domain can never become a general remote-image address.
    for (const value of [
      "evil.example/../../shopify.com",
      "shopify.com/../../evil.example",
      "//evil.example",
      "https://img.logo.dev.evil.example",
    ]) {
      const url = companyLogoUrl(value, { token: TOKEN, size: 32 });
      if (url !== null) expect(new URL(url).host).toBe(LOGO_DEV_HOST);
    }
  });

  it("percent-encodes the domain into the path", () => {
    const url = companyLogoUrl("careers.google.com", {
      token: TOKEN,
      size: 40,
    });

    expect(url).toContain(`https://${LOGO_DEV_HOST}/careers.google.com?`);
  });
});

describe("the configured publishable token", () => {
  const original = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
    else process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = original;
  });

  it("is read from the public environment variable", () => {
    process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = TOKEN;
    expect(logoDevToken()).toBe(TOKEN);
  });

  it("is absent when unset or blank, rather than an empty string", () => {
    delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
    expect(logoDevToken()).toBeUndefined();

    process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = "   ";
    expect(logoDevToken()).toBeUndefined();
  });
});

describe("the deterministic lettermark", () => {
  it.each([
    ["KPMG", "K"],
    ["shopify", "S"],
    ["  deloitte", "D"],
    ["3M", "3"],
    ["&Partners", "P"],
    ["Royal Bank of Canada", "R"],
  ])("uses the first letter or digit of %j", (companyName, expected) => {
    expect(companyInitial(companyName)).toBe(expected);
  });

  it("falls back to a neutral glyph rather than an empty mark", () => {
    expect(companyInitial("—")).toBe("?");
    expect(companyInitial("")).toBe("?");
  });

  it("is stable: the same company always gets the same letter", () => {
    expect(companyInitial("KPMG")).toBe(companyInitial("kpmg"));
  });
});

describe("the company logo component", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN = TOKEN;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  });

  it("renders the Logo.dev image when a domain and a token both exist", () => {
    const { container } = render(
      <CompanyLogo companyName="Shopify" domain="shopify.com" />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("src")).toContain(
      `https://${LOGO_DEV_HOST}/shopify.com?`,
    );
  });

  it("reserves the box so the arriving image shifts nothing", () => {
    const { container } = render(
      <CompanyLogo companyName="Shopify" domain="shopify.com" />,
    );
    const image = container.querySelector("img");

    expect(image?.getAttribute("width")).toBe("32");
    expect(image?.getAttribute("height")).toBe("32");
    // The logo's own proportions are preserved inside that box.
    expect(image?.className).toContain("object-contain");
  });

  it("makes no external request when the application has no domain", () => {
    const { container } = render(
      <CompanyLogo companyName="KPMG" domain={null} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("K");
  });

  it("falls back to the lettermark when no token is configured", () => {
    delete process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

    const { container } = render(
      <CompanyLogo companyName="Shopify" domain="shopify.com" />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("S");
  });

  it("falls back to the lettermark when the stored domain is unusable", () => {
    const { container } = render(
      <CompanyLogo companyName="Deloitte" domain="not a domain" />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("D");
  });

  it("keeps the lettermark underneath, so a failed image leaves a readable box", () => {
    const { container } = render(
      <CompanyLogo companyName="Shopify" domain="shopify.com" />,
    );

    // Both are present: the letter is the layer, not an error branch.
    expect(container.textContent).toBe("S");
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("is decorative, so the company name beside it is announced once", () => {
    render(
      <p>
        <CompanyLogo companyName="Shopify" domain="shopify.com" />
        Shopify
      </p>,
    );

    // The name is the accessible text; the mark repeats nothing.
    expect(screen.getByText("Shopify")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByAltText(/shopify/i)).toBeNull();
  });

  it("renders at a larger size where the layout asks for one", () => {
    const { container } = render(
      <CompanyLogo companyName="Shopify" domain="shopify.com" size="md" />,
    );
    const image = container.querySelector("img");

    expect(image?.getAttribute("width")).toBe("40");
    expect(image?.getAttribute("src")).toContain("size=80");
  });
});
