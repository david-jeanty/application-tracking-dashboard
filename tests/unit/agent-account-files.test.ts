import { describe, expect, it, vi } from "vitest";
import { deleteOwnAccount, type DeleteAccountDependencies } from "@/lib/account/delete-account";
import { removeAgentFiles, type ResumeFileStorage } from "@/lib/agent/storage";

const OWNER = "0aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "0bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fakeStorage(names: string[]) {
  const removed: string[][] = [];
  const storage: ResumeFileStorage = {
    list: vi.fn(async (folder: string) => ({
      data: folder === OWNER ? names.map((name) => ({ name })) : [],
      error: null,
    })),
    remove: vi.fn(async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    }),
  };
  return { storage, removed };
}

describe("removeAgentFiles", () => {
  it("removes every file in the owner's folder", async () => {
    const { storage, removed } = fakeStorage(["r1.pdf", "r1.html"]);
    expect(await removeAgentFiles(storage, OWNER, { OWNER_USER_ID: OWNER })).toEqual({ error: null });
    expect(removed).toEqual([[`${OWNER}/r1.pdf`, `${OWNER}/r1.html`]]);
  });

  it("makes no storage call at all for anyone but the owner", async () => {
    const { storage } = fakeStorage(["r1.pdf"]);
    expect(await removeAgentFiles(storage, STUDENT, { OWNER_USER_ID: OWNER })).toEqual({ error: null });
    expect(await removeAgentFiles(storage, OWNER, {})).toEqual({ error: null });
    expect(storage.list).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("reports a storage failure", async () => {
    const storage: ResumeFileStorage = {
      list: async () => ({ data: null, error: { message: "down" } }),
      remove: async () => ({ error: null }),
    };
    expect((await removeAgentFiles(storage, OWNER, { OWNER_USER_ID: OWNER })).error).not.toBeNull();
  });
});

describe("deleteOwnAccount with stored files", () => {
  function deps(removeStoredFiles: DeleteAccountDependencies["removeStoredFiles"]) {
    const calls: string[] = [];
    const value: DeleteAccountDependencies = {
      getSessionUser: async () => ({ id: OWNER, email: "owner@example.com" }),
      verifyPassword: async () => true,
      removeStoredFiles: removeStoredFiles
        ? async (userId) => {
            calls.push("removeStoredFiles");
            return removeStoredFiles(userId);
          }
        : undefined,
      deleteUser: async () => {
        calls.push("deleteUser");
        return { error: null };
      },
      signOutSession: async () => undefined,
    };
    return { value, calls };
  }

  it("removes stored files before deleting the account", async () => {
    const { value, calls } = deps(async () => ({ error: null }));
    expect(await deleteOwnAccount(value, { userId: OWNER, password: "pw" })).toEqual({ outcome: "deleted" });
    expect(calls).toEqual(["removeStoredFiles", "deleteUser"]);
  });

  it("keeps the account when the files could not be removed, so nothing is orphaned", async () => {
    const { value, calls } = deps(async () => ({ error: { message: "storage down" } }));
    expect(await deleteOwnAccount(value, { userId: OWNER, password: "pw" })).toMatchObject({ outcome: "error" });
    expect(calls).toEqual(["removeStoredFiles"]);
  });
});
