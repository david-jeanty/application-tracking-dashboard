import type { ArchiveOutcome } from "@/lib/applications/state";

export type ArchiveNotice = {
  tone: "success" | "error";
  message: string;
};

/**
 * The message the applications list shows after an archive or restore.
 *
 * The failure text is deliberately the same whether the application was
 * missing, owned by another student, or the write failed. Saying which would
 * confirm that somebody else's record exists.
 */
export function toArchiveNotice(value: unknown): ArchiveNotice | null {
  const outcome = value as ArchiveOutcome;

  if (outcome === "archived") {
    return {
      tone: "success",
      message: "Application archived. You can restore it from the archive.",
    };
  }
  if (outcome === "restored") {
    return {
      tone: "success",
      message: "Application restored to your list.",
    };
  }
  if (outcome === "error") {
    return {
      tone: "error",
      message: "That application could not be updated. Try again.",
    };
  }

  return null;
}
