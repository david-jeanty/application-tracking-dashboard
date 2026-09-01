/**
 * Where the student found the opportunity, and who the employer is not.
 *
 * These two questions look alike and are not. `application_source` is a fact
 * about the student's search — it feeds Interndex's source analytics, so writing
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
  "myworkdaycdn.com",
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
  // Rippling is also an employer website, so only its ATS surface belongs
  // here. Do not add the parent `rippling.com`.
  "ats.rippling.com",
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

/**
 * Social platforms a posting's "About Us" copy commonly links to alongside —
 * or instead of — the employer's own site. A share icon or a company's
 * social profile is not the employer's domain, and none of these hosts is
 * ever registrable to one particular employer.
 */
const SOCIAL_MEDIA_HOSTS = [
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
];

/** Redirect services observed inside posting prose, never employer websites. */
const REDIRECTOR_HOSTS = [
  "safelinks.protection.outlook.com",
  "lnkd.in",
  "bit.ly",
  "t.co",
];

/** Every host that must never become an employer domain. */
const NEVER_EMPLOYER_HOSTS = [
  ...APPLICANT_TRACKING_HOSTS,
  ...JOB_BOARD_SOURCES.map((entry) => entry.suffix),
  ...SOCIAL_MEDIA_HOSTS,
  ...REDIRECTOR_HOSTS,
];

/**
 * Recruitment labels are deployment details, not employer identity.
 *
 * This intentionally removes only a small, explicit first label. A generic
 * subdomain such as `ca.example.com` can be an employer's real canonical web
 * host and must survive. This is not a Public Suffix List implementation.
 */
const RECRUITMENT_SUBDOMAINS = new Set([
  "careers",
  "career",
  "jobs",
  "job",
  "recruiting",
  "recruitment",
]);

const MAXIMUM_URL_LENGTH = 2_048;

/**
 * The one external-link wrapper LinkedIn uses in selected posting content.
 *
 * This is deliberately not redirect handling in general: only LinkedIn's
 * exact `/safety/go/` route with one `url` parameter is interpreted, once.
 * The returned destination still has to earn employer identity through the
 * usual hostname normalization and ATS/job-board rejection below.
 */
export function unwrapLinkedInSafetyGoDestination(
  value: string,
): string | undefined {
  if (value.length > MAXIMUM_URL_LENGTH) return undefined;

  let wrapper: URL;
  try {
    wrapper = new URL(value);
  } catch {
    return undefined;
  }

  if (
    (wrapper.protocol !== "https:" && wrapper.protocol !== "http:") ||
    wrapper.hostname.toLowerCase().replace(/^www\./, "") !== "linkedin.com" ||
    wrapper.pathname !== "/safety/go/"
  ) {
    return undefined;
  }

  const destinations = wrapper.searchParams.getAll("url");
  if (destinations.length !== 1) return undefined;

  const [destination] = destinations;
  if (!destination || destination.length > MAXIMUM_URL_LENGTH) return undefined;

  try {
    const parsed = new URL(destination);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    const normalized = parsed.toString();
    return normalized.length <= MAXIMUM_URL_LENGTH ? normalized : undefined;
  } catch {
    return undefined;
  }
}

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
 * An unset source is stored by Interndex as "Not specified", which is true. A
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
  const hostname = hostnameOf(unwrapLinkedInSafetyGoDestination(url) ?? url);
  if (!hostname) return undefined;
  if (!hostname.includes(".")) return undefined;
  if (NEVER_EMPLOYER_HOSTS.some((suffix) => matchesHost(hostname, suffix))) {
    return undefined;
  }

  const labels = hostname.split(".");
  if (labels.length > 2 && RECRUITMENT_SUBDOMAINS.has(labels[0] ?? "")) {
    return labels.slice(1).join(".");
  }

  return hostname;
}
