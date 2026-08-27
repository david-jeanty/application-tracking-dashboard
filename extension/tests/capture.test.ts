import { describe, expect, it, vi } from "vitest";
import { buildCaptureRecord, postCapture } from "../src/capture.js";
import { EXTENSION_CONFIG } from "../src/config.js";
import type { CaptureConfirmation, ExtractedJob } from "../src/types.js";

/**
 * What actually leaves the extension, and what it makes of the answer.
 *
 * The record is asserted field by field because the interesting property is
 * what is *not* in it: no owner, no capture provenance dressed up as a job
 * source, and no application date invented to go with an `Applied` status.
 */

const extracted: ExtractedJob = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  location: "Ottawa, ON",
  companyDomain: "ibm.com",
  jobDescription: "Work with the analytics team.",
  jobUrl: "https://careers.example.com/jobs/1",
  source: "LinkedIn",
  deadline: "2026-11-30",
  salary: "CAD 22–25 per hour",
  workArrangement: "Hybrid",
  workTerm: "Summer 2027",
  duration: "4 months",
  warnings: [],
};

const confirmation: CaptureConfirmation = {
  company: "IBM",
  jobTitle: "Business Technology Analyst Intern",
  location: "Ottawa, ON",
  status: "Interested",
};

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the record sent to JobTrack", () => {
  it("carries the confirmed values and the extracted extras", () => {
    expect(buildCaptureRecord(extracted, confirmation)).toEqual({
      company: "IBM",
      job_title: "Business Technology Analyst Intern",
      location: "Ottawa, ON",
      status: "Interested",
      company_domain: "ibm.com",
      job_description: "Work with the analytics team.",
      job_url: "https://careers.example.com/jobs/1",
      source: "LinkedIn",
      deadline: "2026-11-30",
      salary: "CAD 22–25 per hour",
      work_arrangement: "Hybrid",
      work_term: "Summer 2027",
      duration: "4 months",
    });
  });

  /**
   * The three rich fields travel on the record contract's own wire names, and
   * only when the page established them.
   *
   * The server already turns a missing arrangement into `Unknown` and a missing
   * work term into `Not specified`. Sending either sentinel from here would be
   * a second implementation of a default only one side can own — and the one
   * that shipped in a browser is the one nobody could change.
   */
  it("omits the rich fields the page did not establish", () => {
    const record = buildCaptureRecord(
      { jobUrl: "https://careers.example.com/jobs/1", warnings: [] },
      { company: "Acme", jobTitle: "Intern", status: "Interested" },
    );

    expect(record).not.toHaveProperty("work_arrangement");
    expect(record).not.toHaveProperty("work_term");
    expect(record).not.toHaveProperty("duration");
    expect(record).not.toHaveProperty("salary");
  });

  it("includes an established company domain and omits an absent one", () => {
    expect(buildCaptureRecord(extracted, confirmation).company_domain).toBe("ibm.com");

    const record = buildCaptureRecord(
      { jobUrl: "https://careers.example.com/jobs/1", warnings: [] },
      confirmation,
    );

    expect(record).not.toHaveProperty("company_domain");
  });

  it("invents no Unknown arrangement and no Not specified work term", () => {
    const record = buildCaptureRecord(
      { warnings: [] },
      { company: "Acme", jobTitle: "Intern", status: "Interested" },
    );
    const serialized = JSON.stringify(record);

    expect(serialized).not.toContain("Unknown");
    expect(serialized).not.toContain("Not specified");
  });

  it("passes an established arrangement through without changing it", () => {
    for (const workArrangement of ["Remote", "Hybrid", "On-site"] as const) {
      const record = buildCaptureRecord(
        { workArrangement, warnings: [] },
        { company: "Acme", jobTitle: "Intern", status: "Interested" },
      );

      expect(record.work_arrangement).toBe(workArrangement);
    }
  });

  it("never sends an owner and never names itself as the job source", () => {
    const record = buildCaptureRecord(
      { warnings: [] },
      { company: "Acme", jobTitle: "Intern", status: "Interested" },
    );

    expect(record).not.toHaveProperty("user_id");
    expect(record.source).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain("Browser extension");
  });

  it("invents no application date when the student marks it applied", () => {
    const record = buildCaptureRecord(extracted, {
      ...confirmation,
      status: "Applied",
    });

    expect(record.status).toBe("Applied");
    expect(record).not.toHaveProperty("date_applied");
  });

  it("prefers what the student corrected over what was extracted", () => {
    const record = buildCaptureRecord(extracted, {
      company: "  International Business Machines  ",
      jobTitle: "  Analyst Intern  ",
      location: "   ",
      status: "Interested",
    });

    expect(record.company).toBe("International Business Machines");
    expect(record.job_title).toBe("Analyst Intern");
    expect(record.location).toBeUndefined();
  });
});

describe("the capture request", () => {
  it("posts to the capture endpoint with a bearer token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      response(201, {
        status: "created",
        application: {
          id: "a1",
          company: "IBM",
          job_title: "Analyst Intern",
          href: "/applications/a1",
        },
      }),
    );

    const outcome = await postCapture(
      buildCaptureRecord(extracted, confirmation),
      "access-1",
      fetchImpl,
    );

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(`${EXTENSION_CONFIG.jobtrackOrigin}/api/browser-capture`);
    expect(
      (init?.headers as Record<string, string>)["authorization"],
    ).toBe("Bearer access-1");
    expect(outcome).toEqual({
      kind: "created",
      application: {
        company: "IBM",
        jobTitle: "Analyst Intern",
        url: `${EXTENSION_CONFIG.jobtrackOrigin}/applications/a1`,
      },
    });
  });

  it("reports the existing record on an exact-URL duplicate", async () => {
    const outcome = await postCapture(
      buildCaptureRecord(extracted, confirmation),
      "access-1",
      vi.fn(async () =>
        response(409, {
          status: "already_tracked",
          application: {
            id: "a1",
            company: "IBM",
            job_title: "Analyst Intern",
            job_url: "https://careers.example.com/jobs/1",
            href: "/applications/a1",
          },
        }),
      ),
    );

    expect(outcome.kind).toBe("already_tracked");
  });

  it("refuses an application link that points off the configured origin", async () => {
    const outcome = await postCapture(
      buildCaptureRecord(extracted, confirmation),
      "access-1",
      vi.fn(async () =>
        response(201, {
          status: "created",
          application: {
            id: "a1",
            company: "IBM",
            job_title: "Analyst Intern",
            href: "https://attacker.example.net/phish",
          },
        }),
      ),
    );

    expect(outcome).toEqual({ kind: "server_error" });
  });

  it("passes validation messages through for the popup to show", async () => {
    const outcome = await postCapture(
      buildCaptureRecord(extracted, confirmation),
      "access-1",
      vi.fn(async () =>
        response(400, {
          status: "invalid",
          issues: [{ path: "company", message: "Company name is required." }],
        }),
      ),
    );

    expect(outcome).toEqual({
      kind: "invalid",
      issues: ["Company name is required."],
    });
  });

  it("reports an unauthenticated response without reading a body", async () => {
    const outcome = await postCapture(
      buildCaptureRecord(extracted, confirmation),
      "expired",
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    expect(outcome).toEqual({ kind: "unauthorized" });
  });

  it("reports a server failure and a network failure separately", async () => {
    expect(
      await postCapture(
        buildCaptureRecord(extracted, confirmation),
        "access-1",
        vi.fn(async () => response(500, { status: "error" })),
      ),
    ).toEqual({ kind: "server_error" });

    expect(
      await postCapture(
        buildCaptureRecord(extracted, confirmation),
        "access-1",
        vi.fn(async () => {
          throw new TypeError("Failed to fetch");
        }),
      ),
    ).toEqual({ kind: "network_error" });
  });
});
