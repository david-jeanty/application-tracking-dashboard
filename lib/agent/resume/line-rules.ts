/**
 * Which bullets may be one line (decision record 0015).
 *
 * Every bullet runs exactly two lines unless its experience is on the list
 * in `lib/agent/config/one-line-experiences.ts`. The Chrome layout check and
 * the character fallback both ask this module.
 */

import {
  ONE_LINE_EXPERIENCES,
  type OneLineExperience,
} from "@/lib/agent/config/one-line-experiences";
import { asciiFold, decodeEntities } from "@/lib/agent/resume/skeleton";

function normalize(text: string | null | undefined): string {
  return asciiFold(decodeEntities(text ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The experience a bullet sits under. For a project, title is its name and org is null. */
export type BulletOwner = { key: string; title: string; org: string | null };

export function allowsOneLine(
  owner: Pick<BulletOwner, "title" | "org">,
  list: readonly OneLineExperience[] = ONE_LINE_EXPERIENCES,
): boolean {
  const org = normalize(owner.org ?? owner.title);
  const title = normalize(owner.title);
  return list.some(
    (allowed) => normalize(allowed.org) === org && (!allowed.title || normalize(allowed.title) === title),
  );
}
