/**
 * Where the student found the opportunity, and who the employer is not.
 *
 * These two questions look alike and are not. `application_source` is a fact
 * about the student's search — it feeds JobTrack's source analytics, so writing
 * "Browser extension" into it would answer a question nobody asked and quietly
 * corrupt a chart. Company domain is a fact about the employer, and the host a
 * posting happens to be served from says nothing about it.
 *
 * The rule both share: when the page does not actually establish the answer,
 * leave the field empty and let the student fill it in.
 */

/** Hosts that host postings for other companies and are never the employer. */
const APPLICANT_TRACKING_HOSTS = [
  "greenhouse.io",
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "lever.co",
  "jobs.lever.co",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "workday.com",
  "workdayjobs.com",
  "icims.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "jobvite.com",
  "taleo.net",
  "successfactors.com",
  "bamboohr.com",
  "workable.com",
  "breezy.hr",
  "recruitee.com",
  "teamtailor.com",
  "eightfold.ai",
  "avature.net",
  "brassring.com",
];

/**
 * Job boards a student would name as where they found a role.
 *
 * Only boards whose host makes the answer unambiguous are listed. Everything
 * else stays unknown: guessing "Company website" because a posting is served
 * from a careers subdomain would be inventing an answer, and a Workday page is
 * not a company website merely because a company pays for it.
 */
const JOB_BOARD_SOURCES: { suffix: string; source: string }[] = [
  { suffix: "linkedin.com", source: "LinkedIn" },
  { suffix: "indeed.com", source: "Indeed" },
  { suffix: "glassdoor.com", source: "Glassdoor" },
  { suffix: "glassdoor.ca", source: "Glassdoor" },
  { suffix: "ziprecruiter.com", source: "ZipRecruiter" },
  { suffix: "monster.com", source: "Monster" },
  { suffix: "monster.ca", source: "Monster" },
  { suffix: "simplyhired.com", source: "SimplyHired" },
  { suffix: "wellfound.com", source: "Wellfound" },
  { suffix: "dice.com", source: "Dice" },
  { suffix: "jobbank.gc.ca", source: "Job Bank" },
];

/** Every host that must never become an employer domain. */
const NEVER_EMPLOYER_HOSTS = [
  ...APPLICANT_TRACKING_HOSTS,
  ...JOB_BOARD_SOURCES.map((entry) => entry.suffix),
];

function hostnameOf(value: string): string | undefined {
  try {
    const { hostname, protocol } = new URL(value);
    if (protocol !== "https:" && protocol !== "http:") return undefined;
    return hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function matchesHost(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/**
 * A job board name only when the host settles it, otherwise nothing.
 *
 * An unset source is stored by JobTrack as "Not specified", which is true. A
 * wrong source is not, and it is the kind of wrong a student never notices
 * because it looks plausible on a chart months later.
 */
export function sourceForUrl(url: string): string | undefined {
  const hostname = hostnameOf(url);
  if (!hostname) return undefined;

  return JOB_BOARD_SOURCES.find((entry) => matchesHost(hostname, entry.suffix))
    ?.source;
}

/** Whether this host serves other companies' postings. */
export function isThirdPartyPostingHost(url: string): boolean {
  const hostname = hostnameOf(url);
  if (!hostname) return true;

  return NEVER_EMPLOYER_HOSTS.some((suffix) => matchesHost(hostname, suffix));
}

/**
 * The employer's own domain, from a URL the posting explicitly attributes to
 * the employer.
 *
 * The only accepted input is `hiringOrganization.url` or `sameAs` in the
 * posting's structured data: a value the publisher stated is the employer's
 * site. Even then a job-board or applicant-tracking host is rejected, because
 * postings frequently point `hiringOrganization.url` back at the board.
 * Nothing here ever looks at the address bar.
 */
export function employerDomainFromUrl(url: string): string | undefined {
  const hostname = hostnameOf(url);
  if (!hostname) return undefined;
  if (!hostname.includes(".")) return undefined;
  if (NEVER_EMPLOYER_HOSTS.some((suffix) => matchesHost(hostname, suffix))) {
    return undefined;
  }

  return hostname;
}
