import { describe, expect, it } from "vitest";
import { assessFit, verdictAllowed } from "@/lib/agent/fit";

/** The Legrand Product Management Intern posting, as the first real run saved it. */
const LEGRAND = [
  { text: "Bachelor's degree in Engineering, Marketing, Business Analytics or business-related field", must_have: true },
  { text: "Close attention to detail and strong organizational skills", must_have: true },
  { text: "Strong verbal and written communication skills", must_have: true },
  { text: "Strong computer skills, proficient with Microsoft Excel and Word", must_have: true },
  { text: "Ability to use internet and web-based resources efficiently", must_have: true },
  { text: "Translate customer and user needs into a product roadmap", must_have: true },
  { text: "Support new product development, forecasting, production planning, pricing and packaging", must_have: true },
  { text: "Develop catalogs, sell sheets, product bulletins and promotional campaigns", must_have: true },
  { text: "Attend monthly SO&P meetings and act on inventory levels and production costs", must_have: true },
  { text: "Develop success metrics and implement process improvements", must_have: true },
];

describe("assessFit", () => {
  it("rates the Legrand run Moderate: SO&P, forecasting, pricing and Excel are core gaps", () => {
    const fit = assessFit(LEGRAND, [3, 6, 8]);
    expect(fit).toEqual({ allowed: "moderate_fit", core_gaps: [3, 6, 8], core: 10 });
    expect(verdictAllowed("strong_fit", fit)).toBe(false);
    expect(verdictAllowed("moderate_fit", fit)).toBe(true);
    expect(verdictAllowed("long_shot", fit)).toBe(true);
  });

  it("allows Strong fit only with no must-have gaps; nice-to-have gaps do not count", () => {
    const mixed = [
      { text: "SQL", must_have: true },
      { text: "Tableau", must_have: false },
    ];
    expect(assessFit(mixed, [1]).allowed).toBe("strong_fit");
    expect(assessFit(mixed, [0]).allowed).toBe("long_shot");
  });

  it("calls more than half the must-haves missing a Long shot", () => {
    expect(assessFit(LEGRAND, [0, 1, 2, 3, 4, 5]).allowed).toBe("long_shot");
    expect(assessFit(LEGRAND, [0, 1, 2, 3, 4]).allowed).toBe("moderate_fit");
  });

  it("counts every requirement as core when none is marked must-have", () => {
    const unmarked = LEGRAND.map((requirement) => ({ ...requirement, must_have: false }));
    expect(assessFit(unmarked, [6]).allowed).toBe("moderate_fit");
  });
});
