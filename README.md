# JobTrack

A job tracker your AI assistant can actually use.

## What is JobTrack?

JobTrack is an application tracker for students applying to internships and
co-ops. It holds everything about a job search in one place: the company, the
role, the deadline, where you are in the process, what you need to do next, and
the notes you made along the way.

What makes it different is that you don't have to fill it in yourself. JobTrack
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

JobTrack removes that duplicate work. The assistant that just read the posting
with you is the one that files it.

## The philosophy

**AI does the reasoning. JobTrack stores the truth.**

AI assistants are already good at reading a job description, judging whether a
role fits, and helping you prepare. JobTrack doesn't try to rebuild any of that.
There is no chatbot in the app, no resume generator, and no posting parser.

Instead, JobTrack does the part a conversation is bad at: keeping a reliable
record over time. A job search runs for months and needs deadlines that don't
move, statuses that stay accurate, and notes you can find again when you need
them.

So the work is split. The assistant handles the thinking and the conversation.
JobTrack handles the organization, history, deadlines, statuses, notes, and
application data.

## What you can do

Once JobTrack is connected, the whole thing is just conversation:

- "Save this job to JobTrack."
- "What RBC jobs am I tracking?"
- "Show me the details for that Business Analyst role."
- "I applied to it today."
- "Set my next action to follow up next Friday."

You never have to look up an ID or remember exactly what you called something.
You describe the job the way you'd describe it to a friend, and the assistant
figures out which one you mean.

Today the assistant can save jobs, list your applications, pull up the full
details of one, and update its tracked information.

## How it works

```text
Student → AI assistant → JobTrack → application tracker
```

JobTrack connects to AI assistants through MCP, an open standard that lets an
assistant use an outside tool. In practice you add JobTrack to Claude once and
sign in to your own account; after that, Claude can work with your applications
whenever you ask.

Everything you need to set that up — the connection address, the steps, and a
list of what an assistant can and cannot do — is on the **Settings** page once
you sign in. The same page lists anything you have connected and lets you
disconnect it. JobTrack never provides or charges for AI; you bring an
assistant you already have.

Each user can only access their own applications, and the AI connection uses the
same authenticated JobTrack account.

## The web app

Conversation is the fastest way to put something in. A screen is still the best
way to look at everything at once.

The website is where you see your applications laid out, check what's due,
review the details of a role before an interview, and edit anything directly. It
covers your application list, statuses, deadlines, next actions, notes, your
dashboard, and analytics today, with a pipeline board coming.

Both sides work on the same data. Anything the assistant saves shows up on the
site, and anything you edit on the site is what the assistant sees next time.

## Current status

JobTrack is deployed and the Claude connection works today.

**Working now**

- Accounts: sign up, log in, password reset
- Adding, viewing, and editing applications
- Your application list, with search and filters for status, work term, and
  category
- The AI connection: saving jobs, listing applications, getting full details,
  and updating applications
- Status history recorded automatically as an application moves
- Quick status and next-action updates without opening the full edit form
- Archiving and restoring applications, and permanently deleting archived ones
- A dashboard that shows what needs your attention: follow-ups you noted that
  are due or overdue, and applications you haven't submitted yet that are about
  to close
- Analytics: where your applications stand, and how far they got
- Settings: connect an AI assistant, see what's connected, and disconnect it

**Not built yet** — the pipeline page exists but is a placeholder. It doesn't
show fake data or pretend to save anything.

## What's next

1. Testing the AI connection carefully with two separate accounts, to confirm
   nobody can reach anyone else's applications
2. Production email setup, so confirmation and password-reset messages send
   properly
3. Cleaning up the hosting setup
4. Testing saved jobs against messier, longer, and stranger postings
5. Richer analytics: response rates and which sources actually work
6. The pipeline board

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

JobTrack can show an employer's logo beside its name, using
[Logo.dev](https://www.logo.dev). It's an enhancement and nothing depends on
it: leave it unconfigured and every screen works exactly as it does now, with a
letter in a small rounded box standing in for each logo.

To turn it on, set `NEXT_PUBLIC_LOGO_DEV_TOKEN` to a Logo.dev **publishable**
key (it starts with `pk_`) in `.env.local`, and in the same variable on Vercel
for a deployment. That value is served to the browser, which is what a
publishable key is for. Never put a Logo.dev secret or Brand API key in this
application — JobTrack only ever uses the Logo API's plain image URLs, and
never calls the Search or Brand APIs.

A logo appears only where an application has a **company website** saved
(`shopify.com`, `rbc.com`). The field is optional on the add and edit forms, so
you can type it in yourself. When a job is saved through a connected AI
assistant, it fills the domain in for you as part of saving — ask it to save a
KPMG internship and it records `kpmg.com` without being asked again — and it
fills in a missing one when it next updates an older application.

JobTrack itself never works a domain out: it keeps no list of employers, calls
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
