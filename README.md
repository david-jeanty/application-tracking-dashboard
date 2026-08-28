# Interndex

A job tracker your AI assistant can actually use.

## What is Interndex?

Interndex is an application tracker for students applying to internships and
co-ops. It holds everything about a job search in one place: the company, the
role, the deadline, where you are in the process, what you need to do next, and
the notes you made along the way.

What makes it different is that you don't have to fill it in yourself. Interndex
connects to an AI assistant like Claude, so you can say "save this job" or "I
applied to the RBC one today," and the tracker updates itself.

## Why I built it

Students already use AI for most of a job search. We paste postings into Claude
to understand what a role actually involves, research companies, tailor
applications, and prepare for interviews.

Then we close the chat, open a spreadsheet, and type the same information in
again by hand.

That copying is the part nobody keeps up with. A few weeks into a search the
tracker is out of date, half the applications were never added, and the details
that mattered are buried somewhere in a chat history you can't search properly.

Interndex removes that duplicate work. The assistant that just read the posting
with you is the one that files it.

## The philosophy

**AI does the reasoning. Interndex stores the truth.**

AI assistants are already good at reading a job description, judging whether a
role fits, and helping you prepare. Interndex doesn't try to rebuild any of that.
There is no chatbot in the app, no resume generator, and no posting parser.

Instead, Interndex does the part a conversation is bad at: keeping a reliable
record over time. A job search runs for months and needs deadlines that don't
move, statuses that stay accurate, and notes you can find again when you need
them.

So the work is split. The assistant handles the thinking and the conversation.
Interndex handles the organization, history, deadlines, statuses, notes, and
application data.

## What you can do

Once Interndex is connected, the whole thing is just conversation:

- "Save this job to Interndex."
- "What RBC jobs am I tracking?"
- "Show me the details for that Business Analyst role."
- "I applied to it today."
- "Set my next action to follow up next Friday."

You never have to look up an ID or remember exactly what you called something.
You describe the job the way you'd describe it to a friend, and the assistant
figures out which one you mean.

Today the assistant can save jobs, bring in a tracker you already keep
elsewhere, list your applications, pull up the full details of one, and update
its tracked information.

### Bringing an old tracker with you

If you already track applications in Google Sheets or Excel, you don't retype
them. Export that sheet as a CSV, upload it **to your assistant** — not to
Interndex — and ask:

> **You:** Import this old tracker into Interndex. *(CSV attached)*
>
> **Assistant:** I found 34 rows. Your "Stage" column has values I want to
> check: "OA" appears 5 times — should that be Assessment? And "Interviewing"
> — Interview?
>
> **You:** Yes to both.
>
> **Assistant:** Your dates look like 08/12/2026. Is that August 12th or
> December 8th?
>
> **You:** August 12th. Day is second.
>
> **Assistant:** One more thing: RBC — Business Analyst Intern is already in
> Interndex from last week. Skip that row?
>
> **You:** Skip it.
>
> **Assistant:** Importing 33 applications in two batches. Your "Recruiter" and
> "Resume version" columns have no Interndex field, so I'll keep them in each
> application's notes. *…* Imported 33 applications into Interndex.

The division of labour is deliberate:

- **Your assistant interprets.** It reads the spreadsheet, works out what the
  columns meant, and settles anything ambiguous with you first.
- **Interndex validates and stores.** It never sees the CSV, never parses one,
  and has no upload button.
- **Dates arrive unambiguous.** `03/04/2026` must become a real calendar date
  before it crosses over, because only you know which convention your sheet
  used.
- **Statuses arrive as Interndex's own.** "OA" and "Ghosted" are questions for
  you, not guesses for a tracker to make.
- **Nothing is invented.** An application imported at Interview is stored at
  Interview with the date you applied. Interndex does not manufacture the
  Applied → Screening → Interview trail it never saw.
- **Duplicates are yours to decide.** Your assistant checks what is already in
  Interndex and asks; nothing is merged or skipped behind your back.

## How it works

```text
Student → AI assistant → Interndex → application tracker
```

Interndex connects to AI assistants through MCP, an open standard that lets an
assistant use an outside tool. In practice you add Interndex to Claude once and
sign in to your own account; after that, Claude can work with your applications
whenever you ask.

Everything you need to set that up — the connection address, the steps, and a
list of what an assistant can and cannot do — is on the **Settings** page once
you sign in. The same page lists anything you have connected and lets you
disconnect it. Interndex never provides or charges for AI; you bring an
assistant you already have.

Each user can only access their own applications, and the AI connection uses the
same authenticated Interndex account.

## The web app

Conversation is the fastest way to put something in. A screen is still the best
way to look at everything at once.

The website is where you see your applications laid out, check what's due,
review the details of a role before an interview, and edit anything directly. It
covers your application list, the pipeline board, statuses, deadlines, next
actions, notes, your dashboard, and analytics.

Both sides work on the same data. Anything the assistant saves shows up on the
site, and anything you edit on the site is what the assistant sees next time.

## Try it without an account

`/demo` is a public, read-only Interndex workspace: a sample search of 56
internship and co-op applications across the dashboard, the applications list,
an application's details, the pipeline board and analytics.

- **No account required, and nothing to sign in to.** Every demo route renders
  signed out, and works even where Supabase is not configured at all.
- **The applications are fictional.** Familiar employers appear so the dataset
  reads like a real recruiting spreadsheet, but no application, title,
  description, date or outcome describes anything that happened, and none of
  those organisations has any connection to Interndex.
- **Static, in-memory data.** The sample search is generated in the app from a
  fixture, deterministically, with dates expressed as offsets from the current
  day so it stays current instead of aging. There is no demo database, no
  shared demo account, and no credentials of any kind.
- **No Supabase reads and no writes.** Not a single demo module imports the
  database client or a server action.
- **Read-only.** You can navigate, search, filter, switch the analytics lens and
  open every disclosure. There is nothing to add, edit, move, archive or delete
  — those controls are absent rather than disabled.
- **The same code as the real thing.** The demo feeds its fixture through the
  production dashboard, analytics, funnel and pipeline calculations and renders
  it with the production components, so what a visitor sees is the product
  rather than a mock-up of it.

## Current status

Interndex is deployed and the Claude connection works today.

**Working now**

- Accounts: sign up, log in, password reset
- Adding, viewing, and editing applications
- Your application list, with search and filters for status, work term, and
  category
- The AI connection: saving jobs, importing an existing tracker, listing
  applications, getting full details, and updating applications
- Status history recorded automatically as an application moves
- Quick status and next-action updates without opening the full edit form
- Archiving and restoring applications, and permanently deleting archived ones
- A dashboard that shows what needs your attention: follow-ups you noted that
  are due or overdue, and applications you haven't submitted yet that are about
  to close
- Analytics: where your applications stand, how far they got, and what came of
  the applications from each place you found a posting
- A pipeline board: every application you haven't archived, grouped under the
  status it's at, and a control on each card that moves it to another status
  without leaving the board
- Settings: connect an AI assistant, see what's connected, and disconnect it
- A public read-only demo workspace at `/demo`, with a sample search of 56
  fictional applications

## What's next

1. Testing the AI connection carefully with two separate accounts, to confirm
   nobody can reach anyone else's applications
2. Production email setup, so confirmation and password-reset messages send
   properly
3. Cleaning up the hosting setup
4. Testing saved jobs against messier, longer, and stranger postings

## Tech stack

- **Next.js** — the web application
- **TypeScript** — throughout, in strict mode
- **Supabase** — accounts and authentication
- **PostgreSQL** — where the applications live
- **Vercel** — hosting
- **MCP** — how AI assistants connect

## Running locally

You'll need Node.js 22+, npm 11+, and a Supabase project. Docker is only needed
if you want to run the database tests.

```bash
npm ci
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`.env.example` explains each variable. Set `NEXT_PUBLIC_SITE_URL` to
`http://localhost:3000`, and add `http://localhost:3000/auth/callback` as an
allowed redirect URL in your Supabase project's auth settings.

### Company logos (optional)

Interndex can show an employer's logo beside its name, using
[Logo.dev](https://www.logo.dev). It's an enhancement and nothing depends on
it: leave it unconfigured and every screen works exactly as it does now, with a
letter in a small rounded box standing in for each logo.

To turn it on, set `NEXT_PUBLIC_LOGO_DEV_TOKEN` to a Logo.dev **publishable**
key (it starts with `pk_`) in `.env.local`, and in the same variable on Vercel
for a deployment. That value is served to the browser, which is what a
publishable key is for. Never put a Logo.dev secret or Brand API key in this
application — Interndex only ever uses the Logo API's plain image URLs, and
never calls the Search or Brand APIs.

A logo appears only where an application has a **company website** saved
(`shopify.com`, `rbc.com`). The field is optional on the add and edit forms, so
you can type it in yourself. When a job is saved through a connected AI
assistant, it fills the domain in for you as part of saving — ask it to save a
KPMG internship and it records `kpmg.com` without being asked again — and it
fills in a missing one when it next updates an older application.

Interndex itself never works a domain out: it keeps no list of employers, calls
no AI of its own, and stores only what it was given. If an employer can't be
identified confidently the application still saves, and keeps the lettermark
until you or your assistant add a domain.

Logo.dev's Community plan covers a project this size. On the free tier,
commercial use asks for an attribution link back to Logo.dev; a personal
project like this one doesn't.

Useful commands:

```bash
npm run dev        # development server
npm run test       # unit tests
npm run check      # lint, types, tests, and a production build
npm run test:e2e   # browser tests
npm run test:db    # database tests (needs Docker)
```

Connecting an AI assistant needs a public HTTPS address, since Claude can't
reach `localhost`. [docs/mcp.md](docs/mcp.md) covers that setup.

Never add a service-role key to this application, and never run a database reset
against production.

## Documentation

The `/docs` folder has the detail behind all of this:

- [How the AI integration works](docs/mcp.md)
- [Architecture](docs/architecture-plan.md)
- [Database and security](docs/database.md)
- [Authentication](docs/authentication.md)
- [Testing](docs/testing.md)
- [Implementation log](docs/implementation-log.md)
- [Backlog](docs/backlog.md)

[PROJECT_SPEC.md](PROJECT_SPEC.md) has the full product scope.
