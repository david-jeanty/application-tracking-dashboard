/**
 * Text rules shared by every checker the agent runs.
 *
 * `docs/STANDARDS.md` applies a few rules to everything Interndex writes for
 * David: no em dashes, never the adverb formed from "genuine" + "ly", and
 * phrase blocklists. The bullet checker (`bullets.ts`) uses these today, and
 * Spec 2's message checker will use the same functions, so a rule is written
 * once and cannot drift between the two.
 *
 * Pure functions only: no I/O, no randomness, no dependence on the clock.
 */

/** U+2014. Built from its code point so this file itself contains none. */
export const EM_DASH = String.fromCharCode(0x2014);

/** The banned adverb, assembled so the source never spells it out. */
export const BANNED_ADVERB = `genuine${"ly"}`;

export function containsEmDash(text: string): boolean {
  return text.includes(EM_DASH);
}

export function containsBannedAdverb(text: string): boolean {
  return new RegExp(`\\b${BANNED_ADVERB}\\b`, "i").test(text);
}

/**
 * A phrase on a blocklist, matched as whole words, case-insensitively.
 *
 * `pattern` lets one entry cover a word's inflections ("utilize", "utilized",
 * "utilizing") while `label` is what a failure message names.
 */
export type BlockedPhrase = { label: string; pattern: RegExp };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, case-insensitive matcher for one literal phrase. */
export function literalPhrase(phrase: string): BlockedPhrase {
  const words = phrase.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return {
    label: phrase.trim(),
    // Lookarounds instead of \b so phrases that start or end with a
    // non-word character (such as "cutting-edge") still match whole.
    pattern: new RegExp(`(?<![\\w-])${words}(?![\\w-])`, "i"),
  };
}

/** Every blocked phrase found in the text, by label, in list order. */
export function findBlockedPhrases(
  text: string,
  phrases: readonly BlockedPhrase[],
): string[] {
  const found: string[] = [];
  for (const phrase of phrases) {
    if (phrase.pattern.test(text) && !found.includes(phrase.label)) {
      found.push(phrase.label);
    }
  }
  return found;
}

/**
 * Phrases a saved rule asks to block.
 *
 * STANDARDS.md says saved rules (from `add_rule`) can extend the blocklists.
 * Rules are plain instructions, so only the ones that clearly name a phrase
 * to avoid become blocklist entries, for example:
 *
 *   Never use "spearheaded"
 *   Don't use 'world-class'.
 *   Avoid "deep dive"
 *   Block: synergize
 *
 * Anything else ("always lead with the IRB story") stays an instruction for
 * the assistant and is served by `get_playbook`, not enforced here.
 */
const RULE_PHRASE_PATTERN =
  /^\s*(?:never\s+use|never\s+say|don['’]?t\s+use|do\s+not\s+use|don['’]?t\s+say|do\s+not\s+say|avoid|block:?)\s+["'“‘]?(.+?)["'”’]?\s*[.!]?\s*$/i;

export function phrasesFromRules(ruleTexts: readonly string[]): BlockedPhrase[] {
  const phrases: BlockedPhrase[] = [];
  for (const ruleText of ruleTexts) {
    const match = RULE_PHRASE_PATTERN.exec(ruleText);
    const phrase = match?.[1]?.trim();
    // A long "phrase" is a sentence of advice, not something to block.
    if (phrase && phrase.split(/\s+/).length <= 4) {
      phrases.push(literalPhrase(phrase));
    }
  }
  return phrases;
}
