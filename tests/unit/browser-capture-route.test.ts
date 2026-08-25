import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateBearerRequest = vi.fn();
const runBrowserCapture = vi.fn();

vi.mock("@/lib/auth/bearer-identity", () => ({ authenticateBearerRequest }));
vi.mock("@/lib/browser-capture/capture", () => ({ runBrowserCapture }));
vi.mock("@/lib/applications/repository", () => ({
  createApplication: vi.fn(),
  findApplicationByExactUrl: vi.fn(),
}));

const { POST } = await import("@/app/api/browser-capture/route");

function request(body = "{}", authorization?: string) {
  return new Request("https://tracker.example.com/api/browser-capture", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body,
  });
}

beforeEach(() => {
  authenticateBearerRequest.mockReset();
  runBrowserCapture.mockReset();
});

describe("POST /api/browser-capture authentication", () => {
  it("fails closed when no bearer credential is present", async () => {
    authenticateBearerRequest.mockResolvedValue(undefined);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ status: "unauthorized" });
    expect(runBrowserCapture).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase rejects an invalid bearer token", async () => {
    authenticateBearerRequest.mockResolvedValue(undefined);

    const response = await POST(request("{}", "Bearer invalid-token"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "unauthorized" });
    expect(runBrowserCapture).not.toHaveBeenCalled();
  });
});

describe("POST /api/browser-capture responses", () => {
  it("rejects malformed JSON without reaching capture", async () => {
    authenticateBearerRequest.mockResolvedValue({
      userId: "user-1",
      supabase: {},
    });

    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe("invalid");
    expect(runBrowserCapture).not.toHaveBeenCalled();
  });

  it("returns a structured created result with an application link", async () => {
    authenticateBearerRequest.mockResolvedValue({
      userId: "user-1",
      supabase: {},
    });
    runBrowserCapture.mockResolvedValue({
      outcome: "created",
      application: {
        id: "application-1",
        company: "Nokia",
        job_title: "Marketing Student",
        status: "Interested",
        href: "/applications/application-1",
      },
    });

    const response = await POST(
      request(JSON.stringify({ company: "Nokia", job_title: "Marketing Student" })),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      status: "created",
      application: expect.objectContaining({
        id: "application-1",
        href: "/applications/application-1",
      }),
    });
  });

  it("returns an explicit conflict instead of silently skipping a duplicate", async () => {
    authenticateBearerRequest.mockResolvedValue({
      userId: "user-1",
      supabase: {},
    });
    runBrowserCapture.mockResolvedValue({
      outcome: "already_tracked",
      application: {
        id: "application-1",
        company: "Nokia",
        job_title: "Marketing Student",
        job_url: "https://jobs.example.com/1",
        href: "/applications/application-1",
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).status).toBe("already_tracked");
  });
});
