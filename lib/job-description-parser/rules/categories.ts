import type { JobCategory } from "@/lib/applications/constants";

export type CategoryRule = {
  category: JobCategory;
  /** Phrase to weight. Higher weights mean the phrase is more diagnostic. */
  phrases: Record<string, number>;
  /** Phrases that veto this category outright when present in the title. */
  exclusions?: string[];
};

/**
 * Ordered most-specific first. "Marketing Operations" must be able to beat
 * "Marketing" when both match, which the weights encode directly.
 */
export const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Marketing Operations",
    phrases: {
      "marketing operations": 120,
      "marketing automation": 100,
      "campaign operations": 95,
      "marketing technology": 90,
      martech: 90,
      "crm marketing": 80,
      "lifecycle marketing": 75,
      "marketing analytics": 70,
      eloqua: 70,
      marketo: 70,
      hubspot: 55,
    },
    exclusions: ["product marketing"],
  },
  {
    category: "Revenue Operations",
    phrases: {
      "revenue operations": 120,
      revops: 110,
      "sales operations": 95,
      "commercial operations": 80,
      "deal desk": 80,
      "pipeline management": 60,
      "quota planning": 60,
    },
  },
  {
    category: "Marketing",
    phrases: {
      marketing: 70,
      "digital marketing": 95,
      "brand marketing": 90,
      "product marketing": 95,
      "content marketing": 90,
      "social media": 75,
      seo: 70,
      "campaign management": 65,
      communications: 55,
      advertising: 60,
    },
  },
  {
    category: "Sales",
    phrases: {
      "account executive": 110,
      "business development": 95,
      "sales representative": 100,
      "inside sales": 95,
      "sales development": 95,
      sdr: 90,
      "quota carrying": 80,
      prospecting: 70,
      sales: 60,
    },
    exclusions: ["sales operations", "revenue operations"],
  },
  {
    category: "Business Analysis",
    phrases: {
      "business analyst": 120,
      "business analysis": 110,
      "requirements gathering": 85,
      "process mapping": 80,
      "user stories": 65,
      "stakeholder requirements": 75,
      "gap analysis": 75,
    },
  },
  {
    category: "Strategy and Operations",
    phrases: {
      "strategy and operations": 120,
      "business operations": 100,
      "strategic planning": 90,
      "operations analyst": 95,
      "corporate strategy": 100,
      "process improvement": 70,
      "operational excellence": 75,
    },
  },
  {
    category: "Project Management",
    phrases: {
      "project manager": 120,
      "project management": 110,
      "program manager": 110,
      pmp: 90,
      "project coordinator": 100,
      scrum: 70,
      "agile delivery": 75,
      "project delivery": 80,
    },
  },
  {
    category: "Product Management",
    phrases: {
      "product manager": 120,
      "product management": 110,
      "product owner": 105,
      roadmap: 70,
      "product strategy": 85,
      "user research": 60,
    },
  },
  {
    category: "Data and Analytics",
    phrases: {
      "data analyst": 120,
      "data analytics": 110,
      "business intelligence": 105,
      "data scientist": 115,
      "data engineer": 110,
      sql: 70,
      tableau: 80,
      "power bi": 80,
      dashboards: 60,
      "data visualization": 75,
    },
  },
  {
    category: "Finance",
    phrases: {
      "financial analyst": 120,
      finance: 80,
      "financial planning": 95,
      "fp&a": 100,
      treasury: 85,
      "investment banking": 100,
      valuation: 75,
      budgeting: 65,
    },
  },
  {
    category: "Accounting",
    phrases: {
      accounting: 110,
      accountant: 115,
      "accounts payable": 100,
      "accounts receivable": 100,
      bookkeeping: 95,
      cpa: 90,
      audit: 80,
      "general ledger": 90,
      reconciliation: 70,
    },
  },
  {
    category: "Human Resources",
    phrases: {
      "human resources": 120,
      recruitment: 100,
      recruiter: 105,
      "talent acquisition": 105,
      "people operations": 105,
      onboarding: 70,
      "employee relations": 90,
      hris: 85,
    },
  },
  {
    category: "Consulting",
    phrases: {
      consultant: 110,
      consulting: 105,
      advisory: 85,
      "management consulting": 120,
      "client engagements": 70,
    },
  },
  {
    category: "Information Technology",
    phrases: {
      "information technology": 110,
      "it support": 105,
      helpdesk: 100,
      "help desk": 100,
      "system administrator": 105,
      "network administrator": 105,
      infrastructure: 70,
      "technical support": 95,
    },
  },
  {
    category: "Software Engineering",
    phrases: {
      "software engineer": 120,
      "software developer": 120,
      "software development": 105,
      "full stack": 100,
      frontend: 90,
      "front-end": 90,
      backend: 90,
      "back-end": 90,
      devops: 95,
      "web developer": 100,
      programming: 70,
    },
  },
];

/** Weight applied to phrases found in the title versus the body. */
export const TITLE_WEIGHT = 1;
export const BODY_WEIGHT = 0.35;
