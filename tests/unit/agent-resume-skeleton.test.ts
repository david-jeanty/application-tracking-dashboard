import { describe, expect, it } from "vitest";
import {
  plainBulletText,
  renderTailoredResume,
  resumeNameFor,
  tailoredContentSchema,
  type TailoredContent,
  type TailoredContentInput,
} from "@/lib/agent/resume/content";
import { parseBaseResume, readNameVariable, type ResumeSkeleton } from "@/lib/agent/resume/skeleton";
import { JAKES_BASE, ZERO2SUDO_BASE } from "./fixtures/resume-bases";

function skeletonOf(markdown: string): ResumeSkeleton {
  const parsed = parseBaseResume(markdown);
  if (!parsed.ok) throw new Error(parsed.problems.join(" "));
  return parsed.skeleton;
}

const LONG =
  "Reduced the open ticket backlog by 35% and average resolution time by 25% by assessing ticketing platforms, recommending Azure DevOps over legacy tools, and redesigning service request triage.";

function content(overrides: Partial<TailoredContentInput> = {}): TailoredContent {
  return tailoredContentSchema.parse({
    entries: [
      { key: "incoming-consulting-intern", bullets: [] },
      { key: "information-management-analyst-intern", bullets: [LONG, "Cut weekly summaries."] },
      { key: "business-development-strategy-intern", bullets: ["Identified 16 pipelines."] },
      { key: "tracker-app", bullets: ["Grew the app to 100 sign-ups."] },
      { key: "vice-president-internal-affairs", bullets: ["Ran 10+ events a year."] },
    ],
    ...overrides,
  });
}

describe("parseBaseResume", () => {
  it("reads the Jake's layout into a header, sections and entries", () => {
    const skeleton = skeletonOf(JAKES_BASE);
    expect(skeleton.sections.map((section) => section.key)).toEqual([
      "education",
      "experience",
      "projects",
      "leadership-involvement",
      "skills",
    ]);
    const entries = skeleton.sections.flatMap((section) => section.entries);
    expect(entries.map((entry) => entry.key)).toEqual([
      "example-university",
      "incoming-consulting-intern",
      "information-management-analyst-intern",
      "business-development-strategy-intern",
      "tracker-app",
      "vice-president-internal-affairs",
    ]);
    const im = entries[2];
    expect(im.title).toBe("Information Management Analyst Intern");
    expect(im.org).toBe("Public Agency of Canada");
    expect(im.base_bullet_count).toBe(2);
    expect(entries[4].org).toBeNull();
    expect(skeleton.header).toContain("@NAME=Sam Example||S. E.");
    expect(skeleton.header.startsWith("@REDACTED=false\n")).toBe(true);
    expect(skeleton.skills?.style).toBe("html");
  });

  it("reads the zero2sudo layout, with its spacer between sections", () => {
    const skeleton = skeletonOf(ZERO2SUDO_BASE);
    expect(skeleton.separator).toBe('<div class="vertical-spacer"></div>');
    expect(skeleton.sections.map((section) => section.key)).toEqual([
      "education",
      "experience",
      "projects",
      "skills",
    ]);
    const entries = skeleton.sections.flatMap((section) => section.entries);
    expect(entries.map((entry) => [entry.key, entry.title, entry.org])).toEqual([
      ["example-university-school-of-management", "Example University, School of Management", "Bachelor of Commerce, Business Technology Management"],
      ["incoming-consulting-intern", "Incoming Consulting Intern", "Big Consultancy, Federal Practice"],
      ["information-management-analyst-intern", "Information Management Analyst Intern", "Public Agency of Canada"],
      ["tracker-app", "Tracker App", "example.dev"],
    ]);
    expect(skeleton.skills?.style).toBe("markdown");
    // The header keeps its own spacer; sections do not carry one.
    expect(skeleton.header.endsWith('<div class="vertical-spacer"></div>')).toBe(true);
  });

  it("forces @REDACTED=false so a tailored resume always shows real values", () => {
    const redacted = parseBaseResume(JAKES_BASE.replace("@REDACTED=false", "@REDACTED=true"));
    expect(redacted.ok && redacted.skeleton.header.split("\n")[0]).toBe("@REDACTED=false");
    const missing = parseBaseResume(JAKES_BASE.replace("@REDACTED=false\n", ""));
    expect(missing.ok && missing.skeleton.header.split("\n")[0]).toBe("@REDACTED=false");
  });

  it("refuses a base with no sections or no name heading", () => {
    expect(parseBaseResume("@NAME=A\n\n# {NAME}\n").ok).toBe(false);
    expect(parseBaseResume("## Experience\n\n### Role <span>Jan 2026</span>\n").ok).toBe(false);
  });

  it("reads the real name from the @NAME variable", () => {
    expect(readNameVariable(skeletonOf(JAKES_BASE).header)).toBe("Sam Example");
    expect(readNameVariable("# Someone")).toBeNull();
  });
});

describe("renderTailoredResume", () => {
  it("keeps the header, headings, dates and skills verbatim and swaps in the bullets", () => {
    const rendered = renderTailoredResume(skeletonOf(JAKES_BASE), content());
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const { markdown, bullets } = rendered;
    expect(markdown.startsWith(JAKES_BASE.slice(0, JAKES_BASE.indexOf("## Education")))).toBe(true);
    expect(markdown).toContain("### Information Management Analyst Intern <span>Sep 2026 – Dec 2026</span>\n\n#### Public Agency of Canada <span>Ottawa, Ontario</span>\n\n- Reduced the open ticket backlog");
    expect(markdown).not.toContain("Old story voice");
    // An entry with no bullets keeps its heading and loses the base bullet.
    expect(markdown).toContain("#### Big Consultancy <span>Ottawa, Ontario</span>\n\n### Information");
    expect(markdown).toContain('<p><strong>Data &amp; Analytics:</strong> Excel, SQL, Python</p>');
    expect(bullets).toEqual([
      LONG,
      "Cut weekly summaries.",
      "Identified 16 pipelines.",
      "Grew the app to 100 sign-ups.",
      "Ran 10+ events a year.",
    ]);
  });

  it("renders sections in the requested order and entries in base order", () => {
    const rendered = renderTailoredResume(
      skeletonOf(JAKES_BASE),
      content({ section_order: ["education", "projects", "experience", "leadership-involvement", "skills"] }),
    );
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const order = ["## Education", "## Projects", "## Experience", "## Leadership"].map((heading) =>
      rendered.markdown.indexOf(heading),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(rendered.bullets[0]).toBe("Grew the app to 100 sign-ups.");
  });

  it("puts the template's spacer between sections, whatever the order", () => {
    const skeleton = skeletonOf(ZERO2SUDO_BASE);
    const rendered = renderTailoredResume(
      skeleton,
      tailoredContentSchema.parse({
        section_order: ["education", "projects", "experience", "skills"],
        entries: [
          { key: "information-management-analyst-intern", bullets: ["Cut the **backlog** 35%."] },
          { key: "tracker-app", bullets: ["Grew to 100 users."] },
        ],
      }),
    );
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    const spacer = '<div class="vertical-spacer"></div>';
    expect(rendered.markdown.split(spacer).length - 1).toBe(4);
    expect(rendered.markdown.trimEnd().endsWith(spacer)).toBe(false);
    expect(rendered.markdown).toContain("- Cut the **backlog** 35%.");
    expect(rendered.bullets).toEqual(["Grew to 100 users.", "Cut the backlog 35%."]);
  });

  it("drops an omitted entry, and a section whose entries are all omitted", () => {
    const rendered = renderTailoredResume(
      skeletonOf(JAKES_BASE),
      content({
        entries: [
          { key: "incoming-consulting-intern", bullets: [] },
          { key: "information-management-analyst-intern", bullets: ["A."] },
          { key: "business-development-strategy-intern", bullets: [], omit: true },
          { key: "tracker-app", bullets: ["B."] },
          { key: "vice-president-internal-affairs", bullets: [], omit: true },
        ],
      }),
    );
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.markdown).not.toContain("Startup Inc.");
    expect(rendered.markdown).not.toContain("## Leadership");
  });

  it("refuses to silently drop an entry that had bullets in the base", () => {
    const rendered = renderTailoredResume(
      skeletonOf(JAKES_BASE),
      content({ entries: [{ key: "information-management-analyst-intern", bullets: ["A."], omit: false }] }),
    );
    expect(rendered.ok).toBe(false);
    if (rendered.ok) return;
    expect(rendered.problems.join(" ")).toContain("business-development-strategy-intern");
    expect(rendered.problems.join(" ")).toContain("tracker-app");
  });

  it("refuses unknown keys, repeats and a bad section order", () => {
    const skeleton = skeletonOf(JAKES_BASE);
    const unknown = renderTailoredResume(
      skeleton,
      content({ entries: [...content().entries, { key: "made-up-job", bullets: ["A."], omit: false }] }),
    );
    expect(unknown.ok).toBe(false);
    const repeated = renderTailoredResume(
      skeleton,
      content({ entries: [...content().entries, { key: "tracker-app", bullets: ["A."], omit: false }] }),
    );
    expect(repeated.ok).toBe(false);
    const order = renderTailoredResume(skeleton, content({ section_order: ["education", "skills"] }));
    expect(order.ok).toBe(false);
  });

  it("mirrors a role title in the heading and keeps the dates", () => {
    const entries = content().entries.map((entry) =>
      entry.key === "business-development-strategy-intern"
        ? { ...entry, mirrored_title: "Strategy & Operations Intern" }
        : entry,
    );
    const rendered = renderTailoredResume(skeletonOf(JAKES_BASE), content({ entries }));
    expect(rendered.ok).toBe(true);
    if (!rendered.ok) return;
    expect(rendered.markdown).toContain("### Strategy &amp; Operations Intern <span>Jan 2026 – Apr 2026</span>");
    expect(rendered.markdown).toContain("#### Startup Inc.");
  });

  it("replaces the skills lines in the template's own format", () => {
    const skills = [{ label: "Data", items: "SQL, Power BI & Python" }];
    const jakes = renderTailoredResume(skeletonOf(JAKES_BASE), content({ skills }));
    expect(jakes.ok && jakes.markdown).toContain(
      '<div class="skills">\n<p><strong>Data:</strong> SQL, Power BI &amp; Python</p>\n</div>',
    );
    const zero = renderTailoredResume(
      skeletonOf(ZERO2SUDO_BASE),
      tailoredContentSchema.parse({
        entries: [
          { key: "information-management-analyst-intern", bullets: ["A."] },
          { key: "tracker-app", bullets: ["B."] },
        ],
        skills: [
          { label: "Technical", items: "SQL" },
          { label: "AI", items: "Claude Code" },
        ],
      }),
    );
    expect(zero.ok && zero.markdown.trimEnd().endsWith("## Skills\n\n**Technical** | SQL\n\n**AI** | Claude Code")).toBe(true);
  });

  it("escapes angle brackets so a bullet cannot add HTML", () => {
    const entries = content().entries.map((entry) =>
      entry.key === "tracker-app" ? { ...entry, bullets: ["Kept errors <1% & fast."] } : entry,
    );
    const rendered = renderTailoredResume(skeletonOf(JAKES_BASE), content({ entries }));
    expect(rendered.ok && rendered.markdown).toContain("- Kept errors &lt;1% &amp; fast.");
    expect(rendered.ok && rendered.bullets).toContain("Kept errors <1% & fast.");
  });
});

describe("content helpers", () => {
  it("plain text drops bold markers only", () => {
    expect(plainBulletText("Cut the **backlog** by **35%**.")).toBe("Cut the backlog by 35%.");
  });

  it("refuses multi-line bullets in the schema", () => {
    expect(
      tailoredContentSchema.safeParse({ entries: [{ key: "a", bullets: ["one\n- two"] }] }).success,
    ).toBe(false);
  });

  it("names a resume Name_Company_Role", () => {
    expect(resumeNameFor("David Jeanty", "Ayar Labs", "Technical Program Management Intern")).toBe(
      "David_Jeanty_AyarLabs_Technical_Program_Management_Intern",
    );
    expect(resumeNameFor("David Jeanty", "T-Mobile", "Strategy & Operations Intern (Summer 2027)")).toBe(
      "David_Jeanty_TMobile_Strategy_Operations_Intern_Summer_2027",
    );
    expect(resumeNameFor(null, "Café Société", "PM")).toBe("Resume_CafeSociete_PM");
  });
});

describe("the interests line (off by default)", () => {
  const withInterests = ZERO2SUDO_BASE.replace(
    "**Languages** | English (native), French (B2)",
    "**Languages** | English (native), French (B2)\n\n**Interests and Hobbies** | Old base interests",
  );
  const entries = [
    { key: "information-management-analyst-intern", bullets: ["Cut weekly summaries."] },
    { key: "tracker-app", bullets: ["Grew the app to 100 sign-ups."] },
  ];

  it("drops the base resume's interests line unless the run asks for it", () => {
    const rendered = renderTailoredResume(skeletonOf(withInterests), tailoredContentSchema.parse({ entries }), { interests: "Guitar, rock climbing" });
    expect(rendered.ok && rendered.markdown).not.toMatch(/Interests/);
    expect(rendered.ok && rendered.markdown).toContain("**Technical** | Python, SQL, Power BI");
  });

  it("adds the interests line from the profile with include_interests", () => {
    const rendered = renderTailoredResume(
      skeletonOf(withInterests),
      tailoredContentSchema.parse({ entries, include_interests: true }),
      { interests: "Guitar, rock climbing" },
    );
    expect(rendered.ok && rendered.markdown).toContain("**Interests** | Guitar, rock climbing");
    expect(rendered.ok && rendered.markdown).not.toContain("Old base interests");
  });

  it("drops an interests line the run wrote into skills unless asked", () => {
    const rendered = renderTailoredResume(
      skeletonOf(withInterests),
      tailoredContentSchema.parse({ entries, skills: [{ label: "Technical", items: "SQL" }, { label: "Interests", items: "Chess" }] }),
      { interests: "Guitar" },
    );
    expect(rendered.ok && rendered.markdown).not.toContain("Chess");
  });
});
