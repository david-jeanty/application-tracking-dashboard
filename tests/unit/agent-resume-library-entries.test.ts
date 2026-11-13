import { describe, expect, it } from "vitest";
import { renderTailoredResume, tailoredContentSchema } from "@/lib/agent/resume/content";
import {
  detectDateStyle,
  formatDates,
  resolveSkeleton,
  sectionKindOf,
  type LibraryExperience,
  type ResumeSources,
} from "@/lib/agent/resume/library-entries";
import { summarizeLayout } from "@/lib/agent/resume/build";
import { allowsOneLine } from "@/lib/agent/resume/line-rules";
import { parseBaseResume, type ResumeSkeleton } from "@/lib/agent/resume/skeleton";
import type { AgentProfile } from "@/lib/agent/types";
import { JAKES_BASE, ZERO2SUDO_BASE } from "./fixtures/resume-bases";

function skeletonOf(markdown: string): ResumeSkeleton {
  const parsed = parseBaseResume(markdown);
  if (!parsed.ok) throw new Error(parsed.problems.join(" "));
  return parsed.skeleton;
}

/** The library's experiences, with the employers named in docs/STANDARDS.md. */
const LIBRARY: LibraryExperience[] = [
  { org: "IBM", official_title: "Incoming Business Transformation Consulting Intern", start: "2027-01-01", end: "2027-04-01", location: "Ottawa, Ontario", sort_order: 0, section: "experience" },
  { org: "Fidus Systems", official_title: "Marketing Analyst Intern", start: "2026-05-01", end: "2026-09-01", location: "Ottawa, Ontario", sort_order: 2, section: "experience" },
  { org: "Immigration and Refugee Board of Canada", official_title: "Information Management Analyst Intern", start: "2026-09-01", end: "2026-12-01", location: "Ottawa, Ontario", sort_order: 1, section: "experience" },
  { org: "StraNexus Inc.", official_title: "Business Development & Strategy Intern", start: "2026-01-01", end: "2026-04-01", location: "Canada (Remote)", sort_order: 3, section: "experience" },
  { org: "Interndex", official_title: "Founder & Product Lead", start: "2026-08-01", end: null, location: null, sort_order: 4, section: "projects" },
  { org: "IBM", official_title: "Pro-Bono Consultant", start: "2026-09-01", end: null, location: "Ottawa, Ontario", sort_order: 5, section: "leadership" },
  { org: "Business Technology Association, uOttawa", official_title: "Vice President, Internal Affairs", start: "2024-04-01", end: "2025-04-01", location: "Ottawa, Ontario", sort_order: 6, section: "leadership" },
];

const PROFILE: AgentProfile = {
  school: "University of Ottawa, Telfer School of Management",
  program: "Business Technology Management (French Immersion)",
  degree_level: "Honours Bachelor of Commerce",
  expected_graduation: "2028-04-01",
  year_of_study: 4,
  academic_standing: 3,
  study_start: "2023-09-01",
  school_location: "Ottawa, Ontario",
  notes: null,
};

const SOURCES: ResumeSources = { experiences: LIBRARY, profile: PROFILE };

function resolved(markdown: string, sources: ResumeSources = SOURCES) {
  const result = resolveSkeleton(skeletonOf(markdown), sources);
  if (!result.ok) throw new Error(result.problems.join(" "));
  return result;
}

function headingOf(skeleton: ResumeSkeleton, key: string): string {
  const entry = skeleton.sections.flatMap((section) => section.entries).find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`no entry ${key}`);
  return entry.heading;
}

describe("dates in the base resume's style", () => {
  it("reads the separator, the dot and the Expected form", () => {
    expect(detectDateStyle("Sep 2026 – Dec 2026")).toEqual({ separator: " – ", dot: false, expected: false });
    expect(detectDateStyle("Sep. 2026 - Dec. 2026")).toEqual({ separator: " - ", dot: true, expected: false });
    expect(detectDateStyle("Expected Apr 2028")).toMatchObject({ expected: true });
  });

  it("never writes an em dash, even when the base uses one", () => {
    expect(detectDateStyle("Sep 2026—Dec 2026").separator).not.toContain("—");
  });

  it("writes Present for a current role, and no dot after May", () => {
    const style = { separator: " – ", dot: true, expected: false };
    expect(formatDates("2026-05-01", null, style)).toBe("May 2026 – Present");
    expect(formatDates("2026-09-01", "2026-12-01", style)).toBe("Sep. 2026 – Dec. 2026");
    expect(formatDates(null, "2028-04-01", { ...style, expected: true, dot: false })).toBe("Expected Apr 2028");
  });

  it("knows the usual section titles", () => {
    expect(sectionKindOf("Leadership &amp; Involvement")).toBe("leadership");
    expect(sectionKindOf("Experience")).toBe("experience");
    expect(sectionKindOf("Projects")).toBe("projects");
    expect(sectionKindOf("Education")).toBe("education");
    expect(sectionKindOf("Skills")).toBeNull();
  });
});

describe("resolveSkeleton: headings come from the library", () => {
  it("rebuilds the Jake's base with the library's employers, titles, dates and locations", () => {
    const { skeleton, source } = resolved(JAKES_BASE);
    expect(source).toBe("library");

    const experience = skeleton.sections.find((section) => section.key === "experience")!;
    // Reverse-chronological, whatever order the library was stored in.
    expect(experience.entries.map((entry) => entry.title)).toEqual([
      "Incoming Business Transformation Consulting Intern",
      "Information Management Analyst Intern",
      "Marketing Analyst Intern",
      "Business Development & Strategy Intern",
    ]);
    expect(headingOf(skeleton, "information-management-analyst-intern")).toBe(
      "### Information Management Analyst Intern <span>Sep 2026 – Dec 2026</span>\n\n#### Immigration and Refugee Board of Canada <span>Ottawa, Ontario</span>",
    );
    // An experience the base never had gets the format of its section.
    expect(headingOf(skeleton, "marketing-analyst-intern")).toBe(
      "### Marketing Analyst Intern <span>May 2026 – Sep 2026</span>\n\n#### Fidus Systems <span>Ottawa, Ontario</span>",
    );
    expect(headingOf(skeleton, "business-development-strategy-intern")).toContain("#### StraNexus Inc. <span>Canada (Remote)</span>");
  });

  it("leaves every base employer, title and date off the page", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const headings = skeleton.sections.flatMap((section) => section.entries.map((entry) => entry.heading)).join("\n");
    for (const base of ["Public Agency of Canada", "Big Consultancy", "Startup Inc.", "Student Association", "Incoming Consulting Intern", "Example University", "Tracker App", "Apr 2024 – Apr 2025".replace("2024", "2099")]) {
      expect(headings).not.toContain(base);
    }
  });

  it("writes the project heading with the library's name and role", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const heading = headingOf(skeleton, "interndex");
    expect(heading).toContain("<strong>Interndex</strong>");
    expect(heading).toContain("<em>Founder &amp; Product Lead");
    expect(heading).toContain("<span>Aug 2026 – Present</span>");
  });

  it("puts each experience in its library section", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const leadership = skeleton.sections.find((section) => section.key === "leadership-involvement")!;
    expect(leadership.entries.map((entry) => [entry.title, entry.org])).toEqual([
      ["Pro-Bono Consultant", "IBM"],
      ["Vice President, Internal Affairs", "Business Technology Association, uOttawa"],
    ]);
  });

  it("writes the school from the fit-read profile in each template's date style", () => {
    const jakes = resolved(JAKES_BASE).skeleton;
    expect(headingOf(jakes, "university-of-ottawa-telfer-school-of-management")).toBe(
      "### University of Ottawa, Telfer School of Management <span>Sep 2023 – Apr 2028</span>\n\n#### Honours Bachelor of Commerce, Business Technology Management (French Immersion) <span>Ottawa, Ontario</span>",
    );
    const zero2sudo = resolved(ZERO2SUDO_BASE).skeleton;
    expect(headingOf(zero2sudo, "university-of-ottawa-telfer-school-of-management")).toBe(
      "### University of Ottawa, Telfer School of Management <span class=\"spacer\"></span>Expected Apr 2028\n\n*Honours Bachelor of Commerce, Business Technology Management (French Immersion)* <span class=\"spacer\"></span> Ottawa, Ontario",
    );
  });

  it("keeps the zero2sudo format: italic employer line, plain hyphen dates", () => {
    const { skeleton } = resolved(ZERO2SUDO_BASE);
    expect(headingOf(skeleton, "incoming-business-transformation-consulting-intern")).toBe(
      "### Incoming Business Transformation Consulting Intern <span class=\"spacer\"></span>Jan 2027 - Apr 2027\n\n*IBM* <span class=\"spacer\"></span> Ottawa, Ontario",
    );
    expect(headingOf(skeleton, "interndex")).toBe(
      "### Interndex | Founder &amp; Product Lead <span class=\"spacer\"></span>Aug 2026 - Present",
    );
  });

  it("notes a library section the base has no place for, instead of inventing one", () => {
    const result = resolved(ZERO2SUDO_BASE);
    expect(result.notes).toContain("no_leadership_section_in_base");
    const titles = result.skeleton.sections.flatMap((section) => section.entries.map((entry) => entry.title));
    expect(titles).not.toContain("Pro-Bono Consultant");
  });

  it("requires every library entry to be listed in the content", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const rendered = renderTailoredResume(
      skeleton,
      tailoredContentSchema.parse({ entries: [{ key: "interndex", bullets: ["Grew Interndex to 100 student sign-ups."] }] }),
    );
    expect(rendered.ok).toBe(false);
    if (!rendered.ok) expect(rendered.problems.join(" ")).toContain("marketing-analyst-intern");
  });

  it("renders a full resume whose headings are the library's", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const keys = skeleton.sections.flatMap((section) => section.entries.filter((entry) => entry.base_bullet_count > 0).map((entry) => entry.key));
    const rendered = renderTailoredResume(
      skeleton,
      tailoredContentSchema.parse({ entries: keys.map((key) => ({ key, bullets: [] })) }),
    );
    expect(rendered.ok).toBe(true);
    if (rendered.ok) {
      expect(rendered.markdown).toContain("@NAME=Sam Example||S. E.");
      expect(rendered.markdown).toContain("Immigration and Refugee Board of Canada");
      expect(rendered.markdown).not.toContain("Public Agency of Canada");
    }
  });
});

describe("resolveSkeleton: what it refuses", () => {
  it("rejects a heading that would keep a base date it cannot read", () => {
    const base = JAKES_BASE.replace("### Information Management Analyst Intern <span>Sep 2026 – Dec 2026</span>", "### Information Management Analyst Intern <span>Summer 2026</span>");
    const result = resolveSkeleton(skeletonOf(base), {
      experiences: [LIBRARY[2]],
      profile: PROFILE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/Information Management Analyst Intern/);
  });

  it("refuses range-style education dates when the profile has no start month", () => {
    const result = resolveSkeleton(skeletonOf(JAKES_BASE), {
      experiences: LIBRARY,
      profile: { ...PROFILE, study_start: null },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.join(" ")).toMatch(/fit-read profile/);
  });

  it("drops a section of base entries the library cannot account for", () => {
    const base = JAKES_BASE.replace("## Skills", "## Certifications\n\n### Some Certificate <span>Jan 2025</span>\n\n#### Some Issuer <span>Online</span>\n\n- Old bullet.\n\n## Skills");
    const result = resolved(base);
    expect(result.notes).toContain("dropped_section:certifications");
    expect(result.skeleton.sections.map((section) => section.key)).not.toContain("certifications");
  });
});

describe("resolveSkeleton: an empty library", () => {
  it("falls back to the base resume's entries and says so", () => {
    const base = skeletonOf(JAKES_BASE);
    const result = resolveSkeleton(base, { experiences: [], profile: PROFILE });
    expect(result).toEqual({ ok: true, skeleton: base, source: "base", notes: ["library_empty"] });
  });
});

describe("the one-line list in the playbook's entry list", () => {
  it("marks only the incoming IBM role and BTA as allowed one-line bullets", () => {
    const { skeleton } = resolved(JAKES_BASE);
    const marked = summarizeLayout(skeleton)
      .flatMap((section) => section.entries)
      .filter((entry) => entry.one_line_ok)
      .map((entry) => entry.title);
    expect(marked).toEqual(["Incoming Business Transformation Consulting Intern", "Vice President, Internal Affairs"]);
  });

  it("does not extend the IBM allowance to the pro bono role", () => {
    expect(allowsOneLine({ title: "Pro-Bono Consultant", org: "IBM" })).toBe(false);
    expect(allowsOneLine({ title: "Incoming Business Transformation Consulting Intern", org: "IBM" })).toBe(true);
    expect(allowsOneLine({ title: "Anything", org: "Business Technology Association, uOttawa" })).toBe(true);
  });
});
