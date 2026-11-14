# 0015: Two-line bullets, a one-line list, and Chrome decides line count

**Context.** STANDARDS.md allowed a bullet to be a full single line or a two-liner. David wants a denser, more even page: every bullet two lines. The character targets from calibration were also blocking builds even though the Chrome layout check measures the real lines, and their two-line ceiling (twice the shortest full line, 260 on zero2sudo) flagged two-liners that fit (David's base has 273-character two-liners).

**Decision.** Every bullet is exactly two lines with the last line at least 80% full. One-line bullets are allowed only under the experiences listed in `lib/agent/config/one-line-experiences.ts` (the incoming IBM role and BTA), and must fill at least 80% of their line. David edits that list by hand; matching ignores case and punctuation, and an entry can name the title to cover only one role at an organization.

The Chrome layout check decides line count (`one_line`, `widow`, `three_lines`, `short_line` failures in `evaluateLayout`). `check_bullets` reports character line fill as a warning only, so it never blocks a build. The character targets decide only on the fallback path, when Chrome could not render: `evaluateCharacterLines` estimates the same rules and the build reports them with `line_check: "characters"`. Calibration now sets the two-line ceiling to twice the median full line (never below twice the shortest), which stops flagging two-liners that fit. The playbook marks the allowed entries `one_line_ok`, and `check_bullets` takes their indexes.

**Alternatives.** Keep characters as the gate (blocks bullets Chrome would accept, and David's own two-liners). Store the one-line list in the database (no screen to edit it yet, and a code list is reviewed with every change).

**Why.** The rule is checked on the real page, where it matters. The character count stays a quick guide during tailoring and a safe estimate when Chrome is unavailable.

**Update (2026-11-14).** Once a template is calibrated, character line fill fails again before the build (decision 0017), so a run uses one build. Chrome still has the final word.
