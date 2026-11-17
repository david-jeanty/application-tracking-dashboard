/**
 * Pure helpers for the owner's Resumes page and the resume panel on an
 * application page. No I/O, so they are unit tested directly.
 */

import { estimatedTokens } from "@/lib/agent/caps";
import { resumeNameFor } from "@/lib/agent/resume/content";

export type UsageRow = { tool: string; response_bytes: number };

export type UsageSummary = {
  calls: number;
  estimated_tokens: number;
  by_tool: { tool: string; calls: number; estimated_tokens: number }[];
};

/**
 * What a run cost in David's Claude usage, estimated from the bytes every
 * agent tool returned (tokens are about bytes / 4). Tool results are most of
 * what a run reads, so this is the part Interndex controls.
 */
export function summarizeUsage(rows: readonly UsageRow[]): UsageSummary {
  const byTool = new Map<string, { calls: number; bytes: number }>();
  let bytes = 0;
  for (const row of rows) {
    bytes += row.response_bytes;
    const entry = byTool.get(row.tool) ?? { calls: 0, bytes: 0 };
    entry.calls += 1;
    entry.bytes += row.response_bytes;
    byTool.set(row.tool, entry);
  }
  return {
    calls: rows.length,
    estimated_tokens: estimatedTokens(bytes),
    by_tool: [...byTool.entries()]
      .map(([tool, entry]) => ({ tool, calls: entry.calls, estimated_tokens: estimatedTokens(entry.bytes) }))
      .sort((a, b) => b.estimated_tokens - a.estimated_tokens || a.tool.localeCompare(b.tool)),
  };
}

export type LayoutTone = "success" | "warning" | "neutral";

export function layoutStatus(check: string | null): { label: string; tone: LayoutTone } {
  switch (check) {
    case "passed":
      return { label: "One page, no widows", tone: "success" };
    case "failed":
      return { label: "Layout needs a fix", tone: "warning" };
    case "skipped":
      return { label: "Layout not checked", tone: "neutral" };
    default:
      return { label: "Not built yet", tone: "neutral" };
  }
}

export function pdfFileName(name: string | null, company: string, role: string): string {
  return `${resumeNameFor(name, company, role)}.pdf`;
}

export const TEMPLATE_LABELS: Readonly<Record<string, string>> = {
  jakes: "Jake's",
  zero2sudo: "zero2sudo",
};
