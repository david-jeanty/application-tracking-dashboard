import { describe, expect, it, vi } from "vitest";
import {
  deleteOwnAccount,
  type DeleteAccountDependencies,
  type SessionUser,
} from "@/lib/account/delete-account";

const SESSION_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_EMAIL = "student@example.com";
const OTHER_USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function dependencies(sessionUser: SessionUser | null = {
  id: SESSION_USER_ID,
  email: SESSION_EMAIL,
}) {
  const getSessionUser = vi.fn<DeleteAccountDependencies["getSessionUser"]>(
    async () => sessionUser,
  );
  const verifyPassword = vi.fn<DeleteAccountDependencies["verifyPassword"]>(
    async () => true,
  );
  const deleteUser = vi.fn<DeleteAccountDependencies["deleteUser"]>(async () => ({
    error: null,
  }));
  const signOutSession = vi.fn<DeleteAccountDependencies["signOutSession"]>(
    async () => undefined,
  );

  return {
    deps: {
      getSessionUser,
      verifyPassword,
      deleteUser,
      signOutSession,
    } satisfies DeleteAccountDependencies,
    getSessionUser,
    verifyPassword,
    deleteUser,
    signOutSession,
  };
}

describe("deleteOwnAccount authorization boundary", () => {
  it(
    "refuses to delete a different user than the one authenticated in the " +
      "request, and never calls the admin API",
    async () => {
      const attacker = dependencies({ id: SESSION_USER_ID, email: SESSION_EMAIL });

      const result = await deleteOwnAccount(attacker.deps, {
        // A session for SESSION_USER_ID is asking to delete OTHER_USER_ID.
        userId: OTHER_USER_ID,
        password: "correct-horse-battery-staple",
      });

      expect(result).toEqual({ outcome: "forbidden" });
      expect(attacker.verifyPassword).not.toHaveBeenCalled();
      expect(attacker.deleteUser).not.toHaveBeenCalled();
      expect(attacker.signOutSession).not.toHaveBeenCalled();
    },
  );

  it("never trusts a client-supplied user id alone: it always re-derives identity from the session", async () => {
    const deps = dependencies({ id: SESSION_USER_ID, email: SESSION_EMAIL });

    await deleteOwnAccount(deps.deps, {
      userId: SESSION_USER_ID,
      password: "correct-horse-battery-staple",
    });

    expect(deps.getSessionUser).toHaveBeenCalledOnce();
    // The account actually deleted is the session's own id, not a value
    // taken from the request body.
    expect(deps.deleteUser).toHaveBeenCalledWith(SESSION_USER_ID);
  });

  it("rejects an unauthenticated request outright", async () => {
    const deps = dependencies(null);

    const result = await deleteOwnAccount(deps.deps, {
      userId: SESSION_USER_ID,
      password: "anything",
    });

    expect(result).toEqual({ outcome: "unauthenticated" });
    expect(deps.verifyPassword).not.toHaveBeenCalled();
    expect(deps.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects an incorrect password without touching the admin API", async () => {
    const deps = dependencies();
    deps.verifyPassword.mockResolvedValue(false);

    const result = await deleteOwnAccount(deps.deps, {
      userId: SESSION_USER_ID,
      password: "wrong-password",
    });

    expect(result).toEqual({ outcome: "invalid_password" });
    expect(deps.deleteUser).not.toHaveBeenCalled();
    expect(deps.signOutSession).not.toHaveBeenCalled();
  });

  it("surfaces an admin-API failure without signing the session out", async () => {
    const deps = dependencies();
    deps.deleteUser.mockResolvedValue({ error: { message: "boom" } });

    const result = await deleteOwnAccount(deps.deps, {
      userId: SESSION_USER_ID,
      password: "correct-horse-battery-staple",
    });

    expect(result).toEqual({ outcome: "error", message: "boom" });
    expect(deps.signOutSession).not.toHaveBeenCalled();
  });

  it("deletes and signs out on the happy path", async () => {
    const deps = dependencies();

    const result = await deleteOwnAccount(deps.deps, {
      userId: SESSION_USER_ID,
      password: "correct-horse-battery-staple",
    });

    expect(result).toEqual({ outcome: "deleted" });
    expect(deps.deleteUser).toHaveBeenCalledWith(SESSION_USER_ID);
    expect(deps.signOutSession).toHaveBeenCalledOnce();
  });
});

describe("deleteAccountRequestSchema", () => {
  it("rejects a non-uuid userId and an empty password", async () => {
    const { deleteAccountRequestSchema } = await import(
      "@/lib/account/delete-account"
    );

    expect(
      deleteAccountRequestSchema.safeParse({ userId: "not-a-uuid", password: "x" })
        .success,
    ).toBe(false);
    expect(
      deleteAccountRequestSchema.safeParse({
        userId: SESSION_USER_ID,
        password: "",
      }).success,
    ).toBe(false);
    expect(
      deleteAccountRequestSchema.safeParse({
        userId: SESSION_USER_ID,
        password: "x",
      }).success,
    ).toBe(true);
  });
});
