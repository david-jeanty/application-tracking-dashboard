/**
 * Base resume fixtures for the resume builder tests.
 *
 * These copy the exact structure of David's two resume.lol base resumes (the
 * Jake's and zero2sudo layouts: variable header, headings, spans, spacer
 * divs, skills formats) with placeholder people, numbers and contact details.
 * No real personal data belongs in the repository.
 */

export const JAKES_BASE = `@REDACTED=false
@NAME=Sam Example||S. E.
@EMAIL=sam@example.com||contact@example.com
@PHONE=(555) 010-0000||(000) 000-0000
@LINKEDIN=linkedin.com/in/sam-example/||linkedin.com/in/redacted
@SITE=example.dev||example.com

# {NAME}

<div class="contact">{PHONE} <span class="sep">|</span> <a href="mailto:{EMAIL}">{EMAIL}</a> <span class="sep">|</span> <a href="https://{LINKEDIN}">{LINKEDIN}</a> <span class="sep">|</span> <a href="https://{SITE}">{SITE}</a></div>

## Education

### Example University <span>Sep 2023 – Apr 2028</span>

#### Bachelor of Commerce, Business Technology Management <span>Ottawa, Ontario</span>

## Experience

### Incoming Consulting Intern <span>Jan 2027 – Apr 2027</span>

#### Big Consultancy <span>Ottawa, Ontario</span>

- Selected for the federal practice, working on business transformation for public sector clients.

### Information Management Analyst Intern <span>Sep 2026 – Dec 2026</span>

#### Public Agency of Canada <span>Ottawa, Ontario</span>

- Old story voice bullet one. It has two sentences.
- Old story voice bullet two.

### Business Development &amp; Strategy Intern <span>Jan 2026 – Apr 2026</span>

#### Startup Inc. <span>Canada (Remote)</span>

- Old bullet three.

## Projects

<h3 class="project"><span class="ptitle"><strong>Tracker App</strong> | <em>Founder &amp; Product Lead | Web App, Chrome Extension</em></span> <span>Aug 2026 – Present</span></h3>

- Old project bullet.

## Leadership &amp; Involvement

### Vice President, Internal Affairs <span>Apr 2024 – Apr 2025</span>

#### Student Association <span>Ottawa, Ontario</span>

- Old leadership bullet.

## Skills

<div class="skills">
<p><strong>Operations:</strong> Requirements gathering, process mapping</p>
<p><strong>Data &amp; Analytics:</strong> Excel, SQL, Python</p>
<p><strong>Languages:</strong> English (Native), French (B2)</p>
</div>
`;

export const ZERO2SUDO_BASE = `@REDACTED=false
@NAME=Sam Example||Hidden Name
@EMAIL=sam@example.com||fake@email.com
@PHONE=(555) 010-0000||123-456-fake
@LINKEDIN=sam-example||fake
@PORTFOLIO=example.dev||fake-portfolio.com

# {NAME}

Ottawa, ON | {PHONE} | [{EMAIL}](mailto:{EMAIL})

[linkedin.com/in/{LINKEDIN}](https://linkedin.com/in/{LINKEDIN}) | [{PORTFOLIO}](https://{PORTFOLIO})

<div class="vertical-spacer"></div>

## Education

### Example University, School of Management <span class="spacer"></span>Expected Apr 2028

*Bachelor of Commerce, Business Technology Management* <span class="spacer"></span> Ottawa, ON

<div class="vertical-spacer"></div>

## Experience

### Incoming Consulting Intern <span class="spacer"></span>Jan 2027 - Apr 2027

*Big Consultancy, Federal Practice* <span class="spacer"></span> Ottawa, ON

### Information Management Analyst Intern <span class="spacer"></span>Sep 2026 - Dec 2026

*Public Agency of Canada* <span class="spacer"></span> Ottawa, ON

- Old **bold** bullet one.
- Old bullet two.

<div class="vertical-spacer"></div>

## Projects

### Tracker App | Founder <span class="spacer"></span>Aug 2026 - Present

*[example.dev](https://example.dev)*

- Old project bullet.

<div class="vertical-spacer"></div>

## Skills

**Technical** | Python, SQL, Power BI

**Languages** | English (native), French (B2)
`;
