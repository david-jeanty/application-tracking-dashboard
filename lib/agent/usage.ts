/**
 * Per-run usage from the usage log. Deterministic: no clock, no database.
 *
 * A run is a burst of calls. It opens with get_playbook, before its
 * application exists, and some of its calls (search_stories, check_bullets)
 * name no application. So a run's usage is:
 * - its own calls, grouped into sessions with no gap over RUN_GAP_MS,
 * - the unattributed calls made inside each session,
 * - the latest unattributed get_playbook read up to RUN_GAP_MS before a session.
 * Reading the posting again days later adds that call, not the calls made
 * in between.
 */

export type RunUsage = {
  tool_calls: number;
  request_bytes: number;
  response_bytes: number;
  est_tokens: number;
  by_tool: Record<string, number>;
};

export type UsageRow = {
  created_at: string;
  tool: string;
  application_id: string | null;
  response_bytes: number;
  request_bytes: number | null;
};

/** Longest pause inside one run, and how early its opening playbook read can be. */
export const RUN_GAP_MS = 15 * 60 * 1000;

/** Rough tokens per byte of JSON tool traffic. */
const BYTES_PER_TOKEN = 4;

export function summarizeRunUsage(rows: readonly UsageRow[], applicationId: string): RunUsage {
  const sorted = [...rows]
    .map((row) => ({ row, at: Date.parse(row.created_at) }))
    .sort((a, b) => a.at - b.at || a.row.tool.localeCompare(b.row.tool));
  const own = sorted.filter((entry) => entry.row.application_id === applicationId);

  // Sessions of the run's own calls.
  const sessions: { start: number; end: number }[] = [];
  for (const { at } of own) {
    const current = sessions.at(-1);
    if (current && at - current.end <= RUN_GAP_MS) current.end = at;
    else sessions.push({ start: at, end: at });
  }

  const counted = new Set<number>();
  sorted.forEach((entry, index) => {
    if (entry.row.application_id === applicationId) counted.add(index);
  });
  for (const session of sessions) {
    let opening = -1;
    sorted.forEach((entry, index) => {
      if (entry.row.application_id !== null) return;
      if (entry.at >= session.start && entry.at <= session.end) counted.add(index);
      else if (entry.row.tool === "get_playbook" && entry.at < session.start && session.start - entry.at <= RUN_GAP_MS) {
        opening = index;
      }
    });
    if (opening >= 0) counted.add(opening);
  }

  const byTool: Record<string, number> = {};
  let requestBytes = 0;
  let responseBytes = 0;
  for (const index of counted) {
    const { row } = sorted[index];
    byTool[row.tool] = (byTool[row.tool] ?? 0) + 1;
    requestBytes += row.request_bytes ?? 0;
    responseBytes += row.response_bytes;
  }
  return {
    tool_calls: counted.size,
    request_bytes: requestBytes,
    response_bytes: responseBytes,
    est_tokens: Math.ceil((requestBytes + responseBytes) / BYTES_PER_TOKEN),
    by_tool: byTool,
  };
}
