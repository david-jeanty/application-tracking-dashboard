import { beforeEach, describe, expect, it, vi } from "vitest";
import { toPipelineMoveNotice } from "@/lib/pipeline/move-notice";

/** `redirect()` throws in Next.js; this mirrors that so flow can be asserted. */
class RedirectError extends Error {
  constructor(public readonly destination: string) {
    super(`redirect:${destination}`);
  }
}

const getUser = vi.fn();
const setApplicationStatus = vi.fn();
const setApplicationNextAction = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectError(destination);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/applications/repository", () => ({
  createApplication: vi.fn(),
  deleteArchivedApplication: vi.fn(),
  setApplicationArchiveState: vi.fn(),
  setApplicationNextAction: (...args: unknown[]) =>
    setApplicationNextAction(...args),
  setApplicationStatus: (...args: unknown[]) => setApplicationStatus(...args),
  updateApplication: vi.fn(),
}));

const {
  moveApplicationStatusAction,
  updateApplicationStatusAction,
  updateNextActionAction,
} = await import("@/lib/applications/actions");

const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const APPLICATION = "11111111-1111-4111-8111-111111111111";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** Runs an action that always redirects, and reports where to. */
async function redirectOf(
  action: (data: FormData) => Promise<void>,
  entries: Record<string, string>,
): Promise<string> {
  try {
    await action(form(entries));
  } catch (error) {
    if (error instanceof RedirectError) return error.destination;
    throw error;
  }
  throw new Error("expected a redirect, but the action returned normally");
}

/** The board's own move, which is what most of this suite is about. */
async function destinationOf(entries: Record<string, string>): Promise<string> {
  return redirectOf(moveApplicationStatusAction, entries);
}

beforeEach(() => {
  getUser.mockReset();
  setApplicationStatus.mockReset();
  setApplicationNextAction.mockReset();
  revalidatePath.mockReset();
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
  setApplicationStatus.mockResolvedValue({ outcome: "updated" });
  setApplicationNextAction.mockResolvedValue({ outcome: "updated" });
});

describe("moving a card writes one status for the signed-in student", () => {
  it("passes the authenticated user's own id, never one from the form", async () => {
    await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Interview",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(setApplicationStatus).toHaveBeenCalledTimes(1);
    expect(setApplicationStatus.mock.calls[0][1]).toBe(USER.id);
    expect(setApplicationStatus.mock.calls[0][2]).toBe(APPLICATION);
    expect(setApplicationStatus.mock.calls[0][3]).toBe("Interview");
  });

  it("reuses the status mutation the detail page already uses", async () => {
    // A move is a status change, not a board-specific concept: there is one
    // write, so there is one set of predicates protecting it.
    await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Offer",
    });

    expect(setApplicationStatus).toHaveBeenCalledTimes(1);
  });

  it("returns to the board, reporting the move", async () => {
    const destination = await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Screening",
    });

    expect(destination).toBe("/pipeline?move=moved");
    expect(toPipelineMoveNotice("moved")?.tone).toBe("success");
  });

  it("returns to the board the student was actually looking at", async () => {
    const destination = await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Screening",
      q: "analyst",
      work_term: "Winter 2027",
      category: "Marketing",
    });

    expect(destination).toBe(
      "/pipeline?q=analyst&work_term=Winter+2027&category=Marketing&move=moved",
    );
  });

  it("drops a role type that is not one of the categories", async () => {
    const destination = await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Screening",
      category: "Banana",
    });

    // The same treatment a hand-edited URL gets: unrecognised values are
    // dropped rather than rejected, and never reach the redirect.
    expect(destination).toBe("/pipeline?move=moved");
  });

  it("refreshes every surface the status shows on, analytics included", async () => {
    await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Screening",
    });

    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toContain("/pipeline");
    expect(paths).toContain("/applications");
    expect(paths).toContain("/dashboard");
    expect(paths).toContain(`/applications/${APPLICATION}`);
    expect(paths).toContain(`/applications/${APPLICATION}/edit`);
    // The move wrote a status-history event, and every analytics figure is
    // drawn from that history.
    expect(paths).toContain("/analytics");
  });

  it("refreshes nothing when the move was refused", async () => {
    setApplicationStatus.mockResolvedValue({ outcome: "not_found" });

    await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Screening",
    });

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("a move that cannot be trusted changes nothing", () => {
  it("rejects an identifier that is not an application id", async () => {
    const destination = await destinationOf({
      applicationId: "not-a-uuid",
      currentStatus: "Interview",
    });

    expect(setApplicationStatus).not.toHaveBeenCalled();
    expect(destination).toBe("/pipeline?move=error");
  });

  it("rejects a status outside the ten", async () => {
    const destination = await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Hired",
    });

    expect(setApplicationStatus).not.toHaveBeenCalled();
    expect(destination).toBe("/pipeline?move=error");
  });

  it("refuses to carry other fields into the write", async () => {
    // The schema cannot describe a company or a job description at all, so a
    // crafted post cannot smuggle one through what a student understands as a
    // status change.
    await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Applied",
      companyName: "Somebody Else",
      jobDescription: "x".repeat(100),
    });

    expect(setApplicationStatus.mock.calls[0].slice(1)).toEqual([
      USER.id,
      APPLICATION,
      "Applied",
    ]);
  });

  it("sends a signed-out student to sign in, and writes nothing", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const destination = await destinationOf({
      applicationId: APPLICATION,
      currentStatus: "Interview",
    });

    expect(setApplicationStatus).not.toHaveBeenCalled();
    expect(destination).toBe("/login?next=/pipeline");
  });

  it("says the same thing whoever the application belongs to", async () => {
    // Missing, somebody else's, and archived all arrive here as `not_found`,
    // and all three leave with the one message.
    for (const outcome of ["not_found", "error"]) {
      setApplicationStatus.mockResolvedValue({ outcome });

      expect(
        await destinationOf({
          applicationId: APPLICATION,
          currentStatus: "Interview",
        }),
      ).toBe("/pipeline?move=error");
    }

    expect(toPipelineMoveNotice("error")).toEqual({
      tone: "error",
      message: "That application couldn't be moved. Try again.",
    });
  });

  it("keeps the filters when it reports a failure", async () => {
    setApplicationStatus.mockResolvedValue({ outcome: "not_found" });

    expect(
      await destinationOf({
        applicationId: APPLICATION,
        currentStatus: "Interview",
        q: "analyst",
      }),
    ).toBe("/pipeline?q=analyst&move=error");
  });

  it("does not let a filter value become another parameter", async () => {
    expect(
      await destinationOf({
        applicationId: APPLICATION,
        currentStatus: "Interview",
        q: "a&move=moved",
      }),
    ).toBe("/pipeline?q=a%26move%3Dmoved&move=moved");
  });
});

describe("the notice a move leaves behind", () => {
  it("maps nothing else to a message", () => {
    for (const value of [undefined, null, "", "moved!", ["moved"], 1]) {
      expect(toPipelineMoveNotice(value)).toBeNull();
    }
  });
});

describe("analytics is refreshed when, and only when, a status moved", () => {
  const refreshedPaths = () =>
    revalidatePath.mock.calls.map((call) => call[0] as string);

  it("refreshes it after the detail page's quick status change", async () => {
    // The same trigger writes the same history event whichever surface the
    // status was changed from, so the same page goes stale.
    await redirectOf(updateApplicationStatusAction, {
      applicationId: APPLICATION,
      currentStatus: "Interview",
    });

    expect(refreshedPaths()).toContain("/analytics");
  });

  it("leaves it alone when only a next action was saved", async () => {
    await redirectOf(updateNextActionAction, {
      applicationId: APPLICATION,
      nextAction: "Follow up with recruiter",
      nextActionDueDate: "2026-09-01",
    });

    // Two columns no analytics read selects, and no history event: the page
    // cannot have changed, so refreshing it would be work for nothing.
    expect(refreshedPaths()).not.toContain("/analytics");
    expect(refreshedPaths()).toContain("/dashboard");
  });
});
