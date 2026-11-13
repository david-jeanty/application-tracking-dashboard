import { describe, expect, it } from "vitest";
import { layoutStatus, pdfFileName, summarizeUsage } from "@/lib/agent/web";

describe("summarizeUsage", () => {
  it("totals bytes as estimated tokens, per tool, biggest first", () => {
    const summary = summarizeUsage([
      { tool: "get_playbook", response_bytes: 18_000 },
      { tool: "check_bullets", response_bytes: 400 },
      { tool: "check_bullets", response_bytes: 401 },
      { tool: "complete_run", response_bytes: 1_200 },
    ]);
    expect(summary).toEqual({
      calls: 4,
      estimated_tokens: 5_001,
      by_tool: [
        { tool: "get_playbook", calls: 1, estimated_tokens: 4_500 },
        { tool: "complete_run", calls: 1, estimated_tokens: 300 },
        { tool: "check_bullets", calls: 2, estimated_tokens: 201 },
      ],
    });
  });

  it("is empty for no calls", () => {
    expect(summarizeUsage([])).toEqual({ calls: 0, estimated_tokens: 0, by_tool: [] });
  });
});

describe("layoutStatus", () => {
  it("names each layout result in plain words", () => {
    expect(layoutStatus("passed")).toEqual({ label: "One page, no widows", tone: "success" });
    expect(layoutStatus("failed").tone).toBe("warning");
    expect(layoutStatus("skipped").label).toBe("Layout not checked");
    expect(layoutStatus(null).label).toBe("Not built yet");
  });
});

describe("pdfFileName", () => {
  it("uses the resume name and a .pdf extension", () => {
    expect(pdfFileName("David Jeanty", "Ayar Labs", "TPM Intern")).toBe("David_Jeanty_AyarLabs_TPM_Intern.pdf");
  });
});
