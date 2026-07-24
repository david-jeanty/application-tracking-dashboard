import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  EvaluationFixture,
  FixtureExpectations,
} from "@/lib/job-description-parser/evaluation";

/**
 * Ground truth for the parser evaluation corpus.
 *
 * Every expectation here was written by reading the posting as a person would,
 * before running the parser against it. `null` is a positive assertion that the
 * posting does not state the field, so the only correct behaviour is a blank.
 * Nothing in this file may be relaxed to make a parser run pass — a changed
 * expectation must be justified by the posting text itself.
 *
 * All employers, dates, and figures are invented. No real posting text is
 * reproduced here.
 */

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/job-descriptions");

const TODAY_ISO = "2026-06-01";

/** Fixed anchor so year inference and every metric stay reproducible. */
export const EVALUATION_TODAY = new Date(`${TODAY_ISO}T00:00:00Z`);

export function loadFixtureText(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), "utf8");
}

type FixtureDefinition = {
  name: string;
  tags: string[];
  expected: FixtureExpectations;
};

const DEFINITIONS: FixtureDefinition[] = [
  {
    name: "linkedin-style-posting",
    tags: ["format:linkedin", "role:revenue-operations", "term:4-month", "salary:hourly"],
    expected: {
      companyName: "Fernwood Software",
      originalJobTitle: "Revenue Operations Analyst (Co-op)",
      normalizedJobCategory: "Revenue Operations",
      location: "Kitchener, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-02-28",
      workTermSeason: "Summer 2027",
      workTermDuration: "4 months",
      salary: "$27.00 per hour",
    },
  },
  {
    name: "linkedin-technology-posting",
    tags: [
      "format:linkedin",
      "role:technology",
      "term:8-month",
      "hazard:composite-header-line",
    ],
    expected: {
      companyName: "Northwind Cloud Services",
      originalJobTitle: "Cloud Infrastructure Intern",
      normalizedJobCategory: "Information Technology",
      location: "Edmonton, AB",
      workArrangement: "On-site",
      applicationDeadline: "2027-06-18",
      workTermSeason: "Fall 2027",
      workTermDuration: "8 months",
      salary: "$28.50 per hour",
    },
  },
  {
    name: "workday-style-posting",
    tags: [
      "format:workday",
      "role:finance",
      "term:8-month",
      "hazard:ambiguous-date-order",
      "hazard:non-salary-dollar-figure",
    ],
    expected: {
      companyName: "Cavendish Grove Holdings Inc.",
      originalJobTitle: "Financial Analyst Intern",
      normalizedJobCategory: "Finance",
      location: "Montreal, QC",
      workArrangement: "On-site",
      applicationDeadline: "2027-03-15",
      workTermSeason: "Winter 2027",
      workTermDuration: "8 months",
      salary: "$23.75 per hour",
    },
  },
  {
    name: "dayforce-style-posting",
    tags: [
      "format:dayforce",
      "role:sales",
      "term:4-month",
      "salary:range",
      "hazard:distractor-dates",
    ],
    expected: {
      companyName: "Halcyon Freight Systems",
      originalJobTitle: "Sales Development Representative (Co-op)",
      normalizedJobCategory: "Sales",
      location: "Mississauga, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2026-10-31",
      workTermSeason: "Winter 2027",
      workTermDuration: "4 months",
      salary: "$24.00 - $26.50 per hour",
    },
  },
  {
    name: "coop-portal-posting",
    tags: ["format:coop-portal", "role:hr", "term:4-month"],
    expected: {
      companyName: "Cedarline Outdoor Co.",
      originalJobTitle: "Human Resources Assistant",
      normalizedJobCategory: "Human Resources",
      location: "Victoria, BC",
      workArrangement: "On-site",
      applicationDeadline: "2027-03-06",
      workTermSeason: "Spring 2027",
      workTermDuration: "4 months",
      salary: "$22.00 per hour",
    },
  },
  {
    name: "careers-page-posting",
    tags: [
      "format:careers-page",
      "role:software-engineering",
      "term:8-month",
      "hazard:company-in-header",
    ],
    expected: {
      companyName: "Ironwood Labs",
      originalJobTitle: "Backend Software Developer, Co-op",
      normalizedJobCategory: "Software Engineering",
      location: "Halifax, NS",
      workArrangement: "Remote",
      applicationDeadline: "2027-04-15",
      workTermSeason: "Fall 2027",
      workTermDuration: "8 months",
      salary: "$32.00 per hour",
    },
  },
  {
    name: "bilingual-posting",
    tags: ["format:bilingual", "role:project-management", "term:4-month"],
    expected: {
      companyName: "Groupe Rivière-Nord",
      originalJobTitle: "Coordonnateur de projet / Project Coordinator",
      normalizedJobCategory: "Project Management",
      location: "Gatineau, QC",
      workArrangement: "Hybrid",
      applicationDeadline: "2026-11-30",
      workTermSeason: "Winter 2027",
      workTermDuration: "4 months",
      salary: "$26.00 per hour",
    },
  },
  {
    name: "bilingual-french-dominant",
    tags: [
      "format:bilingual",
      "role:data-analytics",
      "term:4-month",
      "hazard:french-duration",
    ],
    expected: {
      companyName: "Groupe Beauchemin",
      originalJobTitle: "Analyste de données junior / Junior Data Analyst",
      normalizedJobCategory: "Data and Analytics",
      location: "Quebec City, QC",
      workArrangement: "Hybrid",
      applicationDeadline: "2028-02-12",
      workTermSeason: "Winter 2028",
      workTermDuration: "4 months",
      salary: "$24.00 per hour",
    },
  },
  {
    name: "labelled-marketing-student",
    tags: ["format:labelled", "role:marketing", "term:4-month", "salary:range"],
    expected: {
      companyName: "Northline Technologies",
      originalJobTitle: "Digital Campaign Marketing Student",
      normalizedJobCategory: "Marketing",
      location: "Ottawa, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2026-07-17",
      workTermSeason: "Fall 2026",
      workTermDuration: "4 months",
      salary: "$24.50 - $28.00 per hour",
    },
  },
  {
    name: "bank-business-analyst",
    tags: [
      "format:labelled",
      "role:business-analysis",
      "term:8-month",
      "hazard:distractor-dates",
    ],
    expected: {
      companyName: "Meridian Trust Bank",
      originalJobTitle: "Business Analyst Co-op",
      normalizedJobCategory: "Business Analysis",
      location: "Toronto, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2026-12-05",
      workTermSeason: "Winter 2027",
      workTermDuration: "8 months",
      salary: "$25.00/hour",
    },
  },
  {
    name: "eight-month-term",
    tags: ["role:business-analysis", "term:8-month", "hazard:month-range-duration"],
    expected: {
      companyName: "Pemberton Health Systems",
      originalJobTitle: "Business Analyst Intern",
      normalizedJobCategory: "Business Analysis",
      location: "London, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-06-11",
      workTermSeason: "Fall 2027",
      workTermDuration: "8 months",
      salary: "$26.50 per hour",
    },
  },
  {
    name: "four-month-term",
    tags: ["role:consulting", "term:4-month"],
    expected: {
      companyName: "Westbrook Advisory Group",
      originalJobTitle: "Management Consulting Analyst (Co-op)",
      normalizedJobCategory: "Consulting",
      location: "Toronto, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-06-25",
      workTermSeason: "Fall 2027",
      workTermDuration: "4 months",
      salary: "$29.00 per hour",
    },
  },
  {
    name: "four-or-eight-month-term",
    tags: ["role:technology", "term:4-or-8-month"],
    expected: {
      companyName: "Kestrel Municipal Services",
      originalJobTitle: "IT Support Analyst (Co-op)",
      normalizedJobCategory: "Information Technology",
      location: "Saskatoon, SK",
      workArrangement: "On-site",
      applicationDeadline: "2027-09-30",
      workTermSeason: "Winter 2028",
      workTermDuration: "4 or 8 months",
      salary: "$23.50 per hour",
    },
  },
  {
    name: "weeks-duration-posting",
    tags: ["role:marketing", "term:weeks"],
    expected: {
      companyName: "Pinegrove Wellness Co.",
      originalJobTitle: "Content Marketing Assistant (Summer Student)",
      normalizedJobCategory: "Marketing",
      location: "Burnaby, BC",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-02-26",
      workTermSeason: "Summer 2027",
      workTermDuration: "16 weeks",
      salary: "$23.00 per hour",
    },
  },
  {
    name: "salary-range-annual",
    tags: ["role:finance", "term:4-month", "salary:range", "salary:annual"],
    expected: {
      companyName: "Aldergrove Capital Partners",
      originalJobTitle: "Financial Planning Analyst, Internship",
      normalizedJobCategory: "Finance",
      location: "Winnipeg, MB",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-03-19",
      workTermSeason: "Summer 2027",
      workTermDuration: "4 months",
      salary: "$62,000 - $68,000 per year",
    },
  },
  {
    name: "no-salary-posting",
    tags: ["role:accounting", "term:4-month", "hazard:no-salary"],
    expected: {
      companyName: "Thornbury Mills",
      originalJobTitle: "Accounting Assistant, Co-op",
      normalizedJobCategory: "Accounting",
      location: "Hamilton, ON",
      workArrangement: "On-site",
      applicationDeadline: "2027-10-09",
      workTermSeason: "Winter 2028",
      workTermDuration: "4 months",
      salary: null,
    },
  },
  {
    name: "numeric-date-ambiguous",
    tags: ["role:finance", "term:4-month", "hazard:ambiguous-date-order"],
    expected: {
      companyName: "Beacon Harbour Credit Union",
      originalJobTitle: "Treasury Analyst Intern",
      normalizedJobCategory: "Finance",
      location: "Moncton, NB",
      workArrangement: "On-site",
      // Day-first reading of 05/04/2028, matching the parser's stated en-CA
      // convention. The genuine ambiguity must surface as a warning.
      applicationDeadline: "2028-04-05",
      workTermSeason: "Summer 2028",
      workTermDuration: "4 months",
      salary: "$24.75 per hour",
    },
  },
  {
    name: "deadline-without-year",
    tags: ["role:marketing", "term:4-month", "hazard:deadline-without-year"],
    expected: {
      companyName: "Rosewood Grocers",
      originalJobTitle: "Digital Marketing Assistant",
      normalizedJobCategory: "Marketing",
      location: "Fredericton, NB",
      workArrangement: "On-site",
      // "Apply by November 20" omits the year. Anchored to 2026-06-01, the next
      // occurrence is later the same year, and the inference must be warned
      // about rather than presented as stated fact.
      applicationDeadline: "2026-11-20",
      workTermSeason: "Fall 2026",
      workTermDuration: "4 months",
      salary: "$22.50 per hour",
    },
  },
  {
    name: "multiple-locations-posting",
    tags: [
      "role:project-management",
      "term:4-month",
      "hazard:multiple-locations",
    ],
    expected: {
      companyName: "Sundial Civil Group",
      originalJobTitle: "Project Coordinator, Infrastructure Delivery",
      normalizedJobCategory: "Project Management",
      // Three offices are listed; the first is the reasonable default and the
      // user is expected to narrow it. Any of the three would be defensible,
      // so this field is the corpus's designed near-miss.
      location: "Calgary, AB",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-01-22",
      workTermSeason: "Summer 2027",
      workTermDuration: "4 months",
      salary: "$28.00 per hour",
    },
  },
  {
    name: "remote-with-office-address",
    tags: [
      "role:data-analytics",
      "term:8-month",
      "hazard:remote-with-office-address",
    ],
    expected: {
      companyName: "Quillfeather Data Works",
      originalJobTitle: "Business Intelligence Analyst (Intern)",
      normalizedJobCategory: "Data and Analytics",
      // The Toronto street address is the registered office, not the work
      // location. Reporting "Toronto, ON" here would be wrong.
      location: "Remote (Canada)",
      workArrangement: "Remote",
      applicationDeadline: "2027-05-30",
      workTermSeason: "Fall 2027",
      workTermDuration: "8 months",
      salary: "$30.00 per hour",
    },
  },
  {
    name: "missing-deadline",
    tags: [
      "role:software-engineering",
      "term:4-month",
      "hazard:no-deadline",
      "hazard:no-salary",
    ],
    expected: {
      companyName: "Brightpath Systems",
      originalJobTitle: "Software Developer Intern",
      normalizedJobCategory: "Software Engineering",
      location: "Calgary, AB",
      workArrangement: "On-site",
      applicationDeadline: null,
      workTermSeason: "Summer 2027",
      workTermDuration: "4 months",
      salary: null,
    },
  },
  {
    name: "no-deadline-with-distractor-dates",
    tags: [
      "role:marketing",
      "term:4-month",
      "hazard:no-deadline",
      "hazard:distractor-dates",
      "hazard:no-salary",
    ],
    expected: {
      companyName: "Glassmere Interiors",
      originalJobTitle: "Marketing Coordinator Co-op",
      normalizedJobCategory: "Marketing",
      location: "Halifax, NS",
      workArrangement: "Hybrid",
      // Four dates appear; every one of them is an interview, start, founding,
      // or orientation date. Producing any deadline here is a fabrication.
      applicationDeadline: null,
      workTermSeason: "Winter 2028",
      workTermDuration: "4 months",
      salary: null,
    },
  },
  {
    name: "multiple-dates",
    tags: [
      "role:data-analytics",
      "term:4-month",
      "hazard:distractor-dates",
      "hazard:no-salary",
      "hazard:month-range-duration",
    ],
    expected: {
      companyName: "Harbourstone Analytics",
      originalJobTitle: "Data Analyst Intern",
      normalizedJobCategory: "Data and Analytics",
      location: "Vancouver, BC",
      workArrangement: "Remote",
      applicationDeadline: "2026-06-30",
      workTermSeason: "Fall 2026",
      workTermDuration: "4 months",
      salary: null,
    },
  },
  {
    name: "misleading-headings",
    tags: [
      "role:strategy-operations",
      "term:4-month",
      "hazard:misleading-headings",
      "hazard:title-in-prose",
    ],
    expected: {
      companyName: "Silverbrook Grain Cooperative",
      // Stated only inside a prose sentence, never on its own line.
      originalJobTitle: "Business Operations Analyst",
      normalizedJobCategory: "Strategy and Operations",
      location: "Regina, SK",
      workArrangement: "On-site",
      applicationDeadline: "2028-02-15",
      workTermSeason: "Summer 2028",
      workTermDuration: "4 months",
      salary: "$25.00 per hour",
    },
  },
  {
    name: "company-in-prose-only",
    tags: [
      "role:product-management",
      "term:4-month",
      "hazard:company-in-prose",
    ],
    expected: {
      companyName: "Marblehead Software",
      originalJobTitle: "Product Management Intern",
      normalizedJobCategory: "Product Management",
      location: "Waterloo, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-01-30",
      workTermSeason: "Summer 2027",
      workTermDuration: "4 months",
      salary: "$27.50 per hour",
    },
  },
  {
    name: "title-after-boilerplate",
    tags: [
      "role:marketing-operations",
      "term:4-month",
      "hazard:title-after-boilerplate",
    ],
    expected: {
      companyName: "Hollowell Retail Group",
      originalJobTitle: "Marketing Operations Coordinator (Co-op)",
      normalizedJobCategory: "Marketing Operations",
      location: "Mississauga, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-05-14",
      workTermSeason: "Fall 2027",
      workTermDuration: "4 months",
      salary: "$25.50 per hour",
    },
  },
  {
    name: "ambiguous-company",
    tags: [
      "role:revenue-operations",
      "term:4-month",
      "hazard:ambiguous-company",
    ],
    expected: {
      // Two employers are named in one sentence; only Larkspur is hiring.
      companyName: "Larkspur Industries",
      originalJobTitle: "Revenue Operations Co-op Student",
      normalizedJobCategory: "Revenue Operations",
      location: "Ottawa, ON",
      workArrangement: "Hybrid",
      applicationDeadline: "2027-10-15",
      workTermSeason: "Winter 2028",
      workTermDuration: "4 months",
      salary: "$26.00 per hour",
    },
  },
  {
    name: "ambiguous-title",
    tags: [
      "hazard:ambiguous-title",
      "hazard:no-deadline",
      "hazard:no-salary",
      "hazard:no-category",
    ],
    expected: {
      companyName: "Lakeview Provisions",
      // The posting never names the position anywhere.
      originalJobTitle: null,
      // Generic administrative duties match no category in the taxonomy.
      normalizedJobCategory: null,
      location: "Kingston, ON",
      workArrangement: null,
      applicationDeadline: null,
      workTermSeason: null,
      workTermDuration: null,
      salary: null,
    },
  },
  {
    name: "minimal-posting",
    tags: [
      "format:minimal",
      "hazard:no-deadline",
      "hazard:no-salary",
      "hazard:no-category",
      "hazard:bare-company-line",
    ],
    expected: {
      companyName: "Redcliff Bindery",
      originalJobTitle: "Operations Intern",
      normalizedJobCategory: null,
      location: null,
      workArrangement: null,
      applicationDeadline: null,
      workTermSeason: null,
      workTermDuration: null,
      salary: null,
    },
  },
];

export const EVALUATION_FIXTURES: EvaluationFixture[] = DEFINITIONS.map(
  (definition) => ({
    name: definition.name,
    tags: definition.tags,
    text: loadFixtureText(definition.name),
    expected: definition.expected,
  }),
);

/** Every distinct tag in the corpus, for coverage reporting. */
export const CORPUS_TAGS = [
  ...new Set(EVALUATION_FIXTURES.flatMap((fixture) => fixture.tags)),
].sort();
