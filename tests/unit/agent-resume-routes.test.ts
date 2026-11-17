import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RESUME_ID = "f0000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  userId: null as string | null,
  resume: null as Record<string, unknown> | null,
  storageCalls: [] as string[],
}));

function query(result: () => unknown) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "order", "limit"]) chain[name] = () => chain;
  chain.maybeSingle = async () => ({ data: result(), error: null });
  chain.single = async () => ({ data: result(), error: null });
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    from: (table: string) =>
      query(() =>
        table === "tailored_resumes"
          ? state.resume
          : table === "applications"
            ? { company_name: "Ayar Labs", original_job_title: "TPM Intern" }
            : { header_config: {} },
      ),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, seconds: number, options?: { download?: string }) => {
          state.storageCalls.push(`sign:${path}:${seconds}:${options?.download ?? ""}`);
          return { data: { signedUrl: `https://storage.example/${path}?token=t` }, error: null };
        },
        download: async (path: string) => {
          state.storageCalls.push(`download:${path}`);
          return { data: new Blob(["<html>printable</html>"]), error: null };
        },
      }),
    },
  }),
}));

const pdfRoute = await import("@/app/(app)/resumes/[id]/pdf/route");
const printRoute = await import("@/app/(app)/resumes/[id]/print/route");

const originalOwner = process.env.OWNER_USER_ID;
beforeEach(() => {
  process.env.OWNER_USER_ID = OWNER;
  state.userId = OWNER;
  state.storageCalls = [];
  state.resume = {
    id: RESUME_ID,
    pdf_path: `${OWNER}/${RESUME_ID}.pdf`,
    html_path: `${OWNER}/${RESUME_ID}.html`,
    application_id: "a1",
    template_id: "t1",
  };
});
afterEach(() => {
  if (originalOwner === undefined) delete process.env.OWNER_USER_ID;
  else process.env.OWNER_USER_ID = originalOwner;
});

const params = (id = RESUME_ID) => ({ params: Promise.resolve({ id }) });
const get = (path: string) => new Request(`http://localhost:3000${path}`);

describe("the PDF route", () => {
  it("sends the owner to a short-lived signed link", async () => {
    const response = await pdfRoute.GET(get(`/resumes/${RESUME_ID}/pdf`), params());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`https://storage.example/${OWNER}/${RESUME_ID}.pdf?token=t`);
    expect(state.storageCalls).toEqual([`sign:${OWNER}/${RESUME_ID}.pdf:60:`]);
  });

  it("asks the browser to download with the resume's file name", async () => {
    await pdfRoute.GET(get(`/resumes/${RESUME_ID}/pdf?download=1`), params());
    expect(state.storageCalls[0]).toBe(`sign:${OWNER}/${RESUME_ID}.pdf:60:Resume_AyarLabs_TPM_Intern.pdf`);
  });

  it("is a 404 for every other user, with no storage call", async () => {
    state.userId = STUDENT;
    expect((await pdfRoute.GET(get(`/resumes/${RESUME_ID}/pdf`), params())).status).toBe(404);
    state.userId = null;
    expect((await pdfRoute.GET(get(`/resumes/${RESUME_ID}/pdf`), params())).status).toBe(404);
    expect(state.storageCalls).toHaveLength(0);
  });

  it("is a 404 for a bad id or a resume with no PDF", async () => {
    expect((await pdfRoute.GET(get("/resumes/nope/pdf"), params("nope"))).status).toBe(404);
    state.resume = { ...state.resume, pdf_path: null };
    expect((await pdfRoute.GET(get(`/resumes/${RESUME_ID}/pdf`), params())).status).toBe(404);
  });
});

describe("the printable HTML route", () => {
  it("serves the stored HTML sandboxed, never cached", async () => {
    const response = await printRoute.GET(get(`/resumes/${RESUME_ID}/print`), params());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<html>printable</html>");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("sandbox allow-scripts allow-modals");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("is a 404 for every other user", async () => {
    state.userId = STUDENT;
    expect((await printRoute.GET(get(`/resumes/${RESUME_ID}/print`), params())).status).toBe(404);
    expect(state.storageCalls).toHaveLength(0);
  });
});
