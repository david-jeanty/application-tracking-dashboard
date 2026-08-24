import { describe, expect, it } from "vitest";
import {
  formatPercent,
  formatRatio,
  toPercentOrUndefined,
  toRatio,
} from "@/lib/analytics/definitions";
import {
  NARROWING_MINIMUM_SUBMITTED,
  summarizeFunnel,
  type FunnelMilestoneKey,
} from "@/lib/analytics/funnel";
import type { AnalyticsHistoryEvent } from "@/lib/analytics/calculate";
import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * Builds one application plus the history a database trigger would have
 * written for the status path it travelled.
 *
 * The first status in `path` is the creation event, which the trigger records
 * with a null previous status; the rest are transitions.
 */
function application(
  id: string,
  path: ApplicationStatus[],
): { application: { id: string }; history: AnalyticsHistoryEvent[] } {
  return {
    application: { id },
    history: path.map((status) => ({ application_id: id, new_status: status })),
  };
}

function funnelOf(entries: ReturnType<typeof application>[]) {
  return summarizeFunnel(
    entries.map((entry) => entry.application),
    entries.flatMap((entry) => entry.history),
  );
}

/** Many applications on one path, for reaching a threshold without noise. */
function repeat(
  prefix: string,
  count: number,
  path: ApplicationStatus[],
): ReturnType<typeof application>[] {
  return Array.from({ length: count }, (_, index) =>
    application(`${prefix}${index}`, path),
  );
}

function milestone(
  summary: ReturnType<typeof summarizeFunnel>,
  key: FunnelMilestoneKey,
) {
  return summary.milestones.find((entry) => entry.key === key)!;
}

function transition(
  summary: ReturnType<typeof summarizeFunnel>,
  from: FunnelMilestoneKey,
) {
  return summary.transitions.find((entry) => entry.from === from)!;
}

describe("the four headline milestones", () => {
  it("counts each one from status history, not current status", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Screening", "Interview", "Offer"]),
      application("b", ["Applied", "Rejected"]),
      application("c", ["Applied"]),
      application("d", ["Interested"]),
    ]);

    expect(milestone(summary, "submitted").count).toBe(3);
    expect(milestone(summary, "employerResponse").count).toBe(2);
    expect(milestone(summary, "interview").count).toBe(1);
    expect(milestone(summary, "offer").count).toBe(1);
  });

  it("keeps an interview that later became a rejection", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Interview", "Rejected"]),
    ]);

    expect(milestone(summary, "interview").count).toBe(1);
    expect(milestone(summary, "offer").count).toBe(0);
  });

  it("keeps an offer that was later accepted", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Interview", "Offer", "Accepted"]),
    ]);

    expect(milestone(summary, "offer").count).toBe(1);
    // Accepted is itself an offer status, so an application saved straight
    // into it is an offer too.
    expect(funnelOf([application("b", ["Accepted"])]).milestones.at(-1)?.count)
      .toBe(1);
  });

  it("includes an application that jumped straight to a later stage", () => {
    // Interested to Offer: no Interview event was ever written, but the
    // canonical status sets place Offer inside every milestone below it.
    const summary = funnelOf([application("a", ["Interested", "Offer"])]);

    expect(milestone(summary, "submitted").count).toBe(1);
    expect(milestone(summary, "employerResponse").count).toBe(1);
    expect(milestone(summary, "interview").count).toBe(1);
    expect(milestone(summary, "offer").count).toBe(1);
  });

  it("keeps an archived application, because it still happened", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Interview"]),
      application("b", ["Applied"]),
    ]);

    // The funnel reads only the identifier, so archiving cannot remove a row
    // from it — the page passes every application, archived included.
    expect(milestone(summary, "submitted").count).toBe(2);
  });

  it("draws bar length as a share of submitted, never as the step rate", () => {
    const summary = funnelOf([
      ...repeat("s", 3, ["Applied"]),
      application("r", ["Applied", "Screening"]),
    ]);

    // 1 response out of 4 submitted: the bar is 25% of the top bar even though
    // the step below reports the same 25% for a different reason.
    expect(milestone(summary, "employerResponse").widthPercent).toBe(25);
    expect(milestone(summary, "submitted").widthPercent).toBe(100);
  });
});

describe("stage-to-stage conversion uses the immediately previous stage", () => {
  /*
    Four submitted, two of which got a response, one of those interviewed, and
    none offered. Every denominator is visibly different from the submitted
    count, so a regression back to "share of submitted" fails loudly.
  */
  const MIXED = [
    application("a", ["Applied", "Screening", "Interview"]),
    application("b", ["Applied", "Rejected"]),
    application("c", ["Applied"]),
    application("d", ["Applied"]),
  ];

  it("divides employer response by submitted", () => {
    const step = transition(funnelOf(MIXED), "submitted");

    expect(step.denominator).toBe(4);
    expect(step.reached).toBe(2);
    expect(step.percent).toBe(50);
  });

  it("divides interview by employer response, not by submitted", () => {
    const step = transition(funnelOf(MIXED), "employerResponse");

    expect(step.denominator).toBe(2);
    expect(step.reached).toBe(1);
    // Share of submitted would have been 25%. This is the whole difference
    // between the old funnel and this one.
    expect(step.percent).toBe(50);
  });

  it("divides offer by interview", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Interview", "Offer"]),
      application("b", ["Applied", "Interview"]),
      ...repeat("s", 6, ["Applied"]),
    ]);
    const step = transition(summary, "interview");

    expect(step.denominator).toBe(2);
    expect(step.reached).toBe(1);
    expect(step.percent).toBe(50);
  });

  it("rounds with the shared integer policy", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Screening"]),
      ...repeat("s", 5, ["Applied"]),
    ]);

    // 1 of 6 is 16.66…, shown as 17 rather than 16.667.
    expect(transition(summary, "submitted").percent).toBe(17);
  });

  it("never reports a step above 100 percent", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Screening", "Interview", "Offer", "Accepted"]),
    ]);

    for (const step of summary.transitions) {
      expect(step.percent).toBeLessThanOrEqual(100);
      expect(step.reached).toBeLessThanOrEqual(step.denominator);
    }
  });
});

describe("a zero denominator has no answer", () => {
  it("leaves every step undefined when nothing was submitted", () => {
    const summary = funnelOf([application("a", ["Interested"])]);

    expect(summary.submitted).toBe(0);
    for (const step of summary.transitions) {
      expect(step.percent).toBeUndefined();
    }
  });

  it("reports a real 0% response but leaves the later steps undefined", () => {
    // Five submitted and nothing came back. The first step genuinely happened
    // and is a recorded 0%; the two below it were never entered at all.
    const summary = funnelOf(repeat("s", 5, ["Applied"]));

    expect(transition(summary, "submitted").percent).toBe(0);
    expect(transition(summary, "employerResponse").percent).toBeUndefined();
    expect(transition(summary, "interview").percent).toBeUndefined();
  });

  it("never produces NaN or Infinity anywhere in the summary", () => {
    const summary = funnelOf([]);

    for (const step of summary.transitions) {
      expect(step.percent === undefined || Number.isFinite(step.percent)).toBe(
        true,
      );
    }
    for (const stage of summary.milestones) {
      expect(Number.isFinite(stage.widthPercent)).toBe(true);
    }
    expect(summary.ratios.applicationsPerInterview).toBeUndefined();
    expect(summary.ratios.applicationsPerOffer).toBeUndefined();
  });

  it("keeps the helper itself undefined rather than zero at a zero base", () => {
    expect(toPercentOrUndefined(0, 0)).toBeUndefined();
    expect(toPercentOrUndefined(3, 0)).toBeUndefined();
    // Defined bases still round exactly as the shared policy does.
    expect(toPercentOrUndefined(1, 3)).toBe(33);
    expect(toPercentOrUndefined(0, 4)).toBe(0);
  });

  it("renders an undefined step as an em dash, never as a number", () => {
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(17)).toBe("17%");
  });
});

describe("search ratios", () => {
  it("uses submitted applications, not everything saved", () => {
    const summary = funnelOf([
      application("a", ["Applied", "Interview"]),
      application("b", ["Applied"]),
      application("c", ["Applied"]),
      // Saved and never sent: outside the ratio entirely.
      application("d", ["Interested"]),
      application("e", ["Interested", "Preparing"]),
    ]);

    // 3 submitted, 1 interview — not 5 saved.
    expect(summary.ratios.applicationsPerInterview).toBe(3);
  });

  it("stays an integer when the division is exact", () => {
    const summary = funnelOf([
      ...repeat("s", 53, ["Applied"]),
      application("o", ["Applied", "Interview", "Offer"]),
    ]);

    expect(summary.ratios.applicationsPerOffer).toBe(54);
    expect(formatRatio(summary.ratios.applicationsPerOffer)).toBe("54");
  });

  it("uses one decimal when the division is not exact", () => {
    const summary = funnelOf([
      ...repeat("s", 50, ["Applied"]),
      ...repeat("i", 4, ["Applied", "Interview"]),
    ]);

    // 54 submitted over 4 interviews.
    expect(summary.ratios.applicationsPerInterview).toBe(13.5);
    expect(formatRatio(summary.ratios.applicationsPerInterview)).toBe("13.5");
  });

  it("never shows fake precision beyond one decimal", () => {
    // 7 / 3 is 2.333…, which is 2.3 and not 2.3333333333333335.
    expect(toRatio(7, 3)).toBe(2.3);
    expect(formatRatio(toRatio(7, 3))).toBe("2.3");
  });

  it("is undefined at a zero denominator, not zero and not infinite", () => {
    const summary = funnelOf(repeat("s", 6, ["Applied"]));

    expect(summary.ratios.applicationsPerInterview).toBeUndefined();
    expect(summary.ratios.applicationsPerOffer).toBeUndefined();
    expect(formatRatio(undefined)).toBe("—");
    // The two answers this must never give.
    expect(formatRatio(summary.ratios.applicationsPerInterview)).not.toBe("0");
    expect(
      Number.isFinite(summary.ratios.applicationsPerInterview ?? 0),
    ).toBe(true);
  });
});

describe("where the funnel narrows", () => {
  it("names the lowest defined step", () => {
    const summary = funnelOf([
      ...repeat("s", 45, ["Applied"]),
      ...repeat("r", 5, ["Applied", "Rejected"]),
      ...repeat("i", 3, ["Applied", "Interview"]),
      application("o", ["Applied", "Interview", "Offer"]),
    ]);

    // 54 submitted, 9 responses (17%), 4 interviews of 9 (44%), 1 offer of 4
    // (25%). The narrowest is the first step.
    expect(summary.narrowing?.transition.from).toBe("submitted");
    expect(summary.narrowing?.percent).toBe(17);
    expect(summary.narrowing?.transition.reached).toBe(9);
    expect(summary.narrowing?.transition.denominator).toBe(54);
  });

  it("can name a later step when that one is narrower", () => {
    const summary = funnelOf([
      ...repeat("r", 10, ["Applied", "Rejected"]),
      application("i", ["Applied", "Interview"]),
    ]);

    // 11 submitted, 11 responses (100%), 1 interview of 11 (9%), 0 offers of 1
    // (0%). The offer step is the narrowest.
    expect(summary.narrowing?.transition.from).toBe("interview");
    expect(summary.narrowing?.percent).toBe(0);
  });

  it("ignores undefined steps rather than treating them as zero", () => {
    // Five submitted, no responses: the first step is a real 0% and the two
    // below have no denominator. An undefined step must not win by being
    // read as zero.
    const summary = funnelOf(repeat("s", 5, ["Applied"]));

    expect(summary.narrowing?.transition.from).toBe("submitted");
    expect(summary.narrowing?.percent).toBe(0);
  });

  it("is absent below the submitted threshold", () => {
    const summary = funnelOf(repeat("s", NARROWING_MINIMUM_SUBMITTED - 1, ["Applied"]));

    expect(summary.submitted).toBe(4);
    expect(summary.narrowing).toBeNull();
    // The funnel's own counts are still there — only the conclusion is held back.
    expect(milestone(summary, "submitted").count).toBe(4);
  });

  it("appears exactly at the threshold", () => {
    const summary = funnelOf(repeat("s", NARROWING_MINIMUM_SUBMITTED, ["Applied"]));

    expect(summary.submitted).toBe(5);
    expect(summary.narrowing).not.toBeNull();
  });

  it("is null when no step has a denominator at all", () => {
    // Impossible for real data — a submitted count of five means the first step
    // is always defined — but the shape is guarded rather than assumed.
    const summary = funnelOf([]);

    expect(summary.narrowing).toBeNull();
  });

  it("breaks an exact tie on funnel order, taking the earlier step", () => {
    const summary = funnelOf([
      ...repeat("s", 4, ["Applied"]),
      ...repeat("r", 2, ["Applied", "Rejected"]),
      ...repeat("o", 2, ["Applied", "Interview", "Offer"]),
    ]);

    // 8 submitted, 4 responses, 2 interviews, 2 offers.
    //   Submitted → response  4/8 = exactly one half
    //   Response  → interview 2/4 = exactly one half
    //   Interview → offer     2/2 = one
    // The first two are genuinely equal, so the answer must be stable rather
    // than whichever the iteration happened to see last.
    expect(summary.transitions[0].percent).toBe(50);
    expect(summary.transitions[1].percent).toBe(50);
    expect(summary.narrowing?.transition.from).toBe("submitted");
  });

  it("separates two steps that round to the same percentage", () => {
    const summary = funnelOf([
      ...repeat("s", 11, ["Applied"]),
      ...repeat("r", 1, ["Applied", "Rejected"]),
      ...repeat("i", 1, ["Applied", "Interview"]),
    ]);

    // 13 submitted, 2 responses, 1 interview, 0 offers.
    //   Submitted → response  2/13 = 15.38% → 15%
    //   Response  → interview 1/2  = 50%
    //   Interview → offer     0/1  = 0%
    // The offer step is narrowest on the exact value, and comparison happens
    // on that value rather than on the rounded label.
    expect(summary.narrowing?.transition.from).toBe("interview");
    expect(summary.narrowing?.percent).toBe(0);
  });
});
