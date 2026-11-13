/**
 * What `get_playbook(phase)` returns: the phase's steps, the matching parts of
 * docs/STANDARDS.md, every saved rule, and the context the steps refer to (the
 * fit-read profile and which templates are calibrated).
 *
 * Saved rules come last and are labelled as overriding the defaults, because
 * STANDARDS.md says rules saved with `add_rule` override the defaults on every
 * later run.
 */

import {
  PHASE_DEFINITIONS,
  type PlaybookPhase,
} from "@/lib/agent/playbook/phases";
import { STANDARDS_PARTS } from "@/lib/agent/playbook/standards.generated";
import type { AgentProfile, AgentRule, AgentTemplate } from "@/lib/agent/types";

export type PlaybookContext = {
  rules: readonly AgentRule[];
  profile: AgentProfile | null;
  templates: readonly AgentTemplate[];
};

export function buildPlaybook(phase: PlaybookPhase, context: PlaybookContext) {
  const definition = PHASE_DEFINITIONS[phase];

  return {
    phase,
    title: definition.title,
    steps: definition.steps,
    profile: context.profile,
    templates: context.templates.map((template) => ({
      name: template.name,
      use_for: template.use_for,
      calibrated: template.calibrated_at !== null,
    })),
    standards: definition.standards
      .map((part) => STANDARDS_PARTS[part])
      .join("\n\n"),
    saved_rules: {
      note: "Saved rules override the standards and the steps above.",
      rules: context.rules.map((rule) => ({ scope: rule.scope, text: rule.text })),
    },
  };
}
