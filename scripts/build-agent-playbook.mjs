#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderSkill,
  renderStandardsModule,
  splitStandards,
} from "../lib/agent/playbook/generate.ts";
import {
  PHASE_DEFINITIONS,
  PLAYBOOK_PHASES,
} from "../lib/agent/playbook/phases.ts";

/**
 * Regenerates the files that come from the playbook sources:
 *
 *   docs/STANDARDS.md              -> lib/agent/playbook/standards.generated.ts
 *   lib/agent/playbook/phases.ts   -> skill/interndex-pipeline/SKILL.md
 *
 * Run `npm run agent:playbook` after editing either source. The unit test
 * `tests/unit/agent-playbook.test.ts` fails if the committed output is stale.
 *
 * Loads the TypeScript sources directly, which needs Node 22.18 or later
 * (type stripping on by default).
 */
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const standards = readFileSync(join(root, "docs", "STANDARDS.md"), "utf8");
const standardsModule = renderStandardsModule(splitStandards(standards));
const skill = renderSkill(PLAYBOOK_PHASES, PHASE_DEFINITIONS);

writeFileSync(
  join(root, "lib", "agent", "playbook", "standards.generated.ts"),
  standardsModule,
);

const skillDirectory = join(root, "skill", "interndex-pipeline");
mkdirSync(skillDirectory, { recursive: true });
writeFileSync(join(skillDirectory, "SKILL.md"), skill);

console.log("Wrote lib/agent/playbook/standards.generated.ts and skill/interndex-pipeline/SKILL.md");
