import { describe, expect, it } from "vitest";
import { RUN_GAP_MS, summarizeRunUsage, type UsageRow } from "@/lib/agent/usage";

const RAMP = "24bb97a1-7cb6-4547-bab2-754a2f4e1939";
const LEGRAND = "7a65331a-0000-4000-8000-000000000000";

function row(time: string, tool: string, applicationId: string | null, bytes: number, requestBytes = 0): UsageRow {
  return {
    created_at: `2026-11-14T${time}Z`,
    tool,
    application_id: applicationId,
    response_bytes: bytes,
    request_bytes: requestBytes,
  };
}

/** The preview usage log around the Ramp run on 2026-11-14 (UTC). */
const NIGHT: UsageRow[] = [
  row("06:32:08", "search_stories", null, 15490),
  row("06:32:08", "check_bullets", null, 305),
  row("06:35:25", "get_playbook", null, 25468),
  row("06:35:37", "create_application_from_jd", LEGRAND, 170),
  row("06:35:39", "get_application_brief", LEGRAND, 2407),
  row("06:36:41", "get_playbook", null, 25468),
  row("06:36:56", "create_application_from_jd", RAMP, 169),
  row("06:37:00", "search_stories", RAMP, 14808),
  row("06:37:20", "check_bullets", RAMP, 887),
  row("06:37:28", "check_bullets", RAMP, 714),
  row("06:38:00", "complete_run", RAMP, 933),
];

describe("summarizeRunUsage", () => {
  it("counts the Ramp run as logged: its calls and the playbook read that opened it", () => {
    expect(summarizeRunUsage(NIGHT, RAMP)).toEqual({
      tool_calls: 6,
      request_bytes: 0,
      response_bytes: 42979,
      est_tokens: 10745,
      by_tool: { get_playbook: 1, create_application_from_jd: 1, search_stories: 1, check_bullets: 2, complete_run: 1 },
    });
  });

  it("does not take the playbook read of a run that started before", () => {
    const legrand = summarizeRunUsage(NIGHT, LEGRAND);
    expect(legrand.by_tool).toEqual({ get_playbook: 1, create_application_from_jd: 1, get_application_brief: 1 });
  });

  it("does not grow when the posting is read again the next day", () => {
    const later: UsageRow[] = [
      ...NIGHT,
      row("09:00:00", "search_stories", null, 9000),
      { ...row("06:00:00", "get_run_state", RAMP, 400), created_at: "2026-11-15T06:00:00Z" },
    ];
    const usage = summarizeRunUsage(later, RAMP);
    expect(usage.by_tool.search_stories).toBe(1);
    expect(usage.by_tool.get_run_state).toBe(1);
    expect(usage.response_bytes).toBe(42979 + 400);
  });

  it("counts unattributed calls made between the run's own calls", () => {
    const rows = [
      row("10:00:00", "get_playbook", null, 100),
      row("10:00:10", "create_application_from_jd", RAMP, 10),
      row("10:00:20", "check_bullets", null, 50, 20),
      row("10:00:30", "complete_run", RAMP, 10, 30),
    ];
    const usage = summarizeRunUsage(rows, RAMP);
    expect(usage.tool_calls).toBe(4);
    expect(usage.request_bytes).toBe(50);
    expect(usage.est_tokens).toBe(Math.ceil((50 + 170) / 4));
  });

  it("ignores a playbook read too long before the run", () => {
    const early = new Date(Date.parse("2026-11-14T10:00:10Z") - RUN_GAP_MS - 1000).toISOString();
    const rows = [
      { ...row("00:00:00", "get_playbook", null, 100), created_at: early },
      row("10:00:10", "create_application_from_jd", RAMP, 10),
    ];
    expect(summarizeRunUsage(rows, RAMP).by_tool).toEqual({ create_application_from_jd: 1 });
  });

  it("reports nothing for an application with no logged calls", () => {
    expect(summarizeRunUsage(NIGHT, "00000000-0000-4000-8000-000000000000")).toEqual({
      tool_calls: 0,
      request_bytes: 0,
      response_bytes: 0,
      est_tokens: 0,
      by_tool: {},
    });
  });

  it("gives the same answer whatever order the rows arrive in", () => {
    expect(summarizeRunUsage([...NIGHT].reverse(), RAMP)).toEqual(summarizeRunUsage(NIGHT, RAMP));
  });
});
