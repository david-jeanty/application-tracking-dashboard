import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata } from "@/app/page";
import {
  HOMEPAGE_SOCIAL_DESCRIPTION,
  HOMEPAGE_SOCIAL_IMAGE,
  HOMEPAGE_SOCIAL_IMAGE_ALT,
  HOMEPAGE_SOCIAL_TITLE,
} from "@/lib/metadata/homepage-social";

describe("homepage social metadata", () => {
  it("keeps the existing SEO title and description", () => {
    expect(metadata.title).toBe(
      "Interndex: Keep your job search in one place",
    );
    expect(metadata.description).toBe(
      "Save internship and co-op opportunities from anywhere. The Interndex Chrome extension captures jobs across most career sites and is most accurate on LinkedIn, Indeed, and Workday. Track every application and deadline, and connect an MCP-compatible AI when you want help.",
    );
  });

  it("publishes the branded Open Graph image and copy for LinkedIn", () => {
    expect(metadata.openGraph).toMatchObject({
      title: HOMEPAGE_SOCIAL_TITLE,
      description: HOMEPAGE_SOCIAL_DESCRIPTION,
      url: "https://www.interndex.dev",
      siteName: "Interndex",
      images: [
        {
          url: HOMEPAGE_SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: HOMEPAGE_SOCIAL_IMAGE_ALT,
        },
      ],
    });
  });

  it("publishes matching large-image Twitter metadata", () => {
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: HOMEPAGE_SOCIAL_TITLE,
      description: HOMEPAGE_SOCIAL_DESCRIPTION,
      images: [
        {
          url: HOMEPAGE_SOCIAL_IMAGE,
          alt: HOMEPAGE_SOCIAL_IMAGE_ALT,
        },
      ],
    });
  });

  it("references a checked-in static social image", () => {
    expect(HOMEPAGE_SOCIAL_IMAGE).toBe(
      "https://www.interndex.dev/brand/social/interndex-job-tracker-og.png",
    );
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "public/brand/social/interndex-job-tracker-og.png",
        ),
      ),
    ).toBe(true);
  });
});
