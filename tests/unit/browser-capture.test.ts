import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { toApplicationInsert } from "@/lib/applications/mapper";
import type {
  ApplicationUrlMatch,
} from "@/lib/applications/repository";
import {
  runBrowserCapture,
  type BrowserCaptureRepository,
} from "@/lib/browser-capture/capture";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPLICATION = "11111111-1111-4111-8111-111111111111";
const JOB_URL = "https://jobs.example.com/postings/123";

function repository(existing: ApplicationUrlMatch | null = null) {
  const findApplicationByExactUrl = vi.fn<
    BrowserCaptureRepository["findApplicationByExactUrl"]
  >(async () => ({ data: existing, error: null }));
  const createApplication = vi.fn<
    BrowserCaptureRepository["createApplication"]
  >(async () => ({ data: { id: APPLICATION }, error: null }));

  return {
    dependency: {
      findApplicationByExactUrl,
      createApplication,
    } satisfies BrowserCaptureRepository,
    findApplicationByExactUrl,
    createApplication,
  };
}

const minimal = {
  company: "Nokia",
  job_title: "Marketing Student",
};

describe("browser capture validation and creation", () => {
  it("uses the same truthful defaults as MCP save_job", async () => {
    const repo = repository();

    const result = await runBrowserCapture(minimal, USER, repo.dependency);

    expect(result.outcome).toBe("created");
    const input = repo.createApplication.mock.calls[0][0];
    expect(input.currentStatus).toBe("Interested");
    expect(input.normalizedJobCategory).toBe("Other");
    expect(input.workTermSeason).toBe("Not specified");

    const insert = toApplicationInsert(input);
    expect(insert.work_arrangement).toBe("Unknown");
    expect(insert.application_source).toBe("Not specified");
  });

  it("strips a supplied user_id before the repository write", async () => {
    const repo = repository();

    await runBrowserCapture(
      {
        ...minimal,
        user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
      USER,
      repo.dependency,
    );

    expect(repo.createApplication).toHaveBeenCalledOnce();
    expect(repo.createApplication.mock.calls[0][0]).not.toHaveProperty("user_id");
  });

  it("preserves the posting source and never substitutes capture provenance", async () => {
    const repo = repository();

    await runBrowserCapture(
      { ...minimal, source: "LinkedIn" },
      USER,
      repo.dependency,
    );

    const insert = toApplicationInsert(repo.createApplication.mock.calls[0][0]);
    expect(insert.application_source).toBe("LinkedIn");
    expect(insert.application_source).not.toBe("Browser extension");
  });

  it("does not infer an employer domain from an applicant-tracking URL", async () => {
    const repo = repository();

    await runBrowserCapture(
      { ...minimal, job_url: "https://example.wd5.myworkdayjobs.com/job/123" },
      USER,
      repo.dependency,
    );

    expect(repo.createApplication.mock.calls[0][0].companyDomain).toBeUndefined();
  });

  it("rejects malformed and oversized fields before any repository call", async () => {
    const repo = repository();

    const malformed = await runBrowserCapture(
      { ...minimal, deadline: "August 25", job_url: "javascript:alert(1)" },
      USER,
      repo.dependency,
    );
    const oversized = await runBrowserCapture(
      { ...minimal, job_description: "x".repeat(50_001) },
      USER,
      repo.dependency,
    );

    expect(malformed.outcome).toBe("invalid");
    expect(oversized.outcome).toBe("invalid");
    expect(repo.findApplicationByExactUrl).not.toHaveBeenCalled();
    expect(repo.createApplication).not.toHaveBeenCalled();
  });

  it("passes a valid record through final creation normalization", async () => {
    const repo = repository();

    await runBrowserCapture(
      {
        ...minimal,
        company: "  Nokia  ",
        job_url: `  ${JOB_URL}  `,
        company_domain: "https://www.nokia.com/careers",
      },
      USER,
      repo.dependency,
    );

    expect(repo.findApplicationByExactUrl).toHaveBeenCalledWith(USER, JOB_URL);
    expect(repo.createApplication.mock.calls[0][0]).toMatchObject({
      companyName: "Nokia",
      companyDomain: "nokia.com",
      applicationUrl: JOB_URL,
    });
  });
});

describe("browser capture exact-URL duplicate protection", () => {
  it("returns the existing record and performs no write for an exact URL", async () => {
    const repo = repository({
      id: APPLICATION,
      company_name: "Nokia",
      original_job_title: "Marketing Student",
      application_url: JOB_URL,
    });

    const result = await runBrowserCapture(
      { ...minimal, job_url: JOB_URL },
      USER,
      repo.dependency,
    );

    expect(result).toEqual({
      outcome: "already_tracked",
      application: {
        id: APPLICATION,
        company: "Nokia",
        job_title: "Marketing Student",
        job_url: JOB_URL,
        href: `/applications/${APPLICATION}`,
      },
    });
    expect(repo.createApplication).not.toHaveBeenCalled();
  });

  it("does not use fuzzy company or title matching", async () => {
    const repo = repository();

    await runBrowserCapture(
      { ...minimal, job_url: `${JOB_URL}?repost=1` },
      USER,
      repo.dependency,
    );

    expect(repo.findApplicationByExactUrl).toHaveBeenCalledWith(
      USER,
      `${JOB_URL}?repost=1`,
    );
    expect(repo.createApplication).toHaveBeenCalledOnce();
  });

  it("skips duplicate lookup when the posting URL is unknown", async () => {
    const repo = repository();

    await runBrowserCapture(minimal, USER, repo.dependency);

    expect(repo.findApplicationByExactUrl).not.toHaveBeenCalled();
    expect(repo.createApplication).toHaveBeenCalledOnce();
  });
});

describe("browser capture privilege boundary", () => {
  it("contains no service-role or JWT-secret path", () => {
    const files = [
      "app/api/browser-capture/route.ts",
      "lib/auth/bearer-identity.ts",
      "lib/browser-capture/capture.ts",
      "lib/supabase/bearer.ts",
    ];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).not.toContain("JWT_SECRET");
      expect(source).not.toContain("service_role");
    }
  });
});
