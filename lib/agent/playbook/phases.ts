/**
 * The recruiting agent's playbook: the steps for each phase of work.
 *
 * This is the one source for those steps. `get_playbook` serves it from the
 * server, and `scripts/build-agent-playbook.mjs` renders the same steps into
 * the Claude skill (`skill/interndex-pipeline/SKILL.md`), so the two can never
 * disagree. A unit test fails if the committed skill is out of date.
 *
 * This file must stay plain data with no imports: the build script loads it
 * directly with Node, outside the Next.js toolchain.
 *
 * Spec 2 (people and outreach) adds its own steps and the `debrief` phase.
 *
 * Writing rules for every line here (docs/STANDARDS.md and CLAUDE.md): no em
 * dashes, never the adverb formed from "genuine" + "ly", plain specific
 * English.
 */

export const PLAYBOOK_PHASES = ["run", "library_session", "import"] as const;

export type PlaybookPhase = (typeof PLAYBOOK_PHASES)[number];

/** Which parts of docs/STANDARDS.md each phase needs. */
export type StandardsPart = "working" | "bullets" | "outreach";

export type PhaseDefinition = {
  title: string;
  /** One line on when this phase applies. */
  when: string;
  steps: readonly string[];
  standards: readonly StandardsPart[];
};

export const PHASE_DEFINITIONS: Readonly<Record<PlaybookPhase, PhaseDefinition>> = {
  run: {
    title: "Run: job description to built resume",
    when: "David pastes a job description, or asks to run on a posting.",
    standards: ["working", "bullets"],
    steps: [
      "Work through every step without stopping for approval. Ask David nothing mid-run unless a step below says to.",
      "If the posting is already in Interndex, call get_application_brief and get_run_state for it and continue from the first step not marked done. Never redo a done step unless David asks (then pass force: true). Never call get_job during a run; the brief has what you need.",
      "Read the posting once and extract: company, exact posting title, location, the employer's job id, the posting link, partner functions the role works with, and the requirements (mark each must_have or nice_to_have). Call create_application_from_jd once with all of it. If it reports an existing application, use that id.",
      "Fit read. Open it with the profile's year of study and academic standing as plain info, one short line each (for example: Year of study: 4th year. Academic standing: 3rd year.). They are facts, not warnings. Then check only the posting's own stated eligibility (graduation window, degree level, year of study or standing) against the profile in this playbook; a year requirement is met if either value meets it. If they rule David out, stop and say why in one line. Otherwise decide: verdict (strong fit, stretch, long shot), each requirement matched to a story, true gaps, words to mirror, and the template (zero2sudo for PM, TPM, data, AI and solutions roles; jakes for consulting and business roles).",
      "Never mention work authorization, school semesters or terms, IBM, or other applications anywhere in the run.",
      "Tailor with the Positioning playbook in the standards below. Call search_stories once with the requirements, the angles the role calls for, and the template.",
      "The library is a source of facts, not fixed text. For each bullet, either reuse a variant as is, or write a new bullet from the story's facts (its summary, variants and explain notes), mirroring the posting's language and following the house style and the stretch rules in the standards. Every claim must trace to the story's facts. Employers, titles and dates always come from the library unchanged. At most 2 drafts per new bullet, and give every new number an explain note David could say in two sentences.",
      "Call check_bullets on the whole page with the template. Fix every failure and check again. Warnings are for your judgment; fix the ones that are real. Never show David a page that has failures.",
      "If the template shows calibrated false in this playbook, call calibrate_template for it once. If no base resume is saved for it yet, ask David for the resume.lol id of its base resume.",
      "Write the resume content with the entry keys listed under the template in this playbook. Give bullets for every entry marked needs_bullets, or set omit: true. Set section_order only to move a section (projects can go above experience). Employers, titles, dates and schools come from the library and the base resume and are never changed; set mirrored_title only when David asks.",
      "Save and build with one complete_run call: the fit read, the resume content, new variants with their explain notes, and any cover letter or answers. Do not wait for approval before building. If it reports failures, nothing was saved: fix them and call it again.",
      "Read the build result. layout_check passed: done. failed: fix only the bullets it names (a widow needs words added or cut to one line) and call rebuild_with_edits once. skipped: the server could not print the PDF; say so in one line and give David the resume.lol link to print from. If build_resume is needed again after a failed build, call it with the tailored_resume_id.",
      "Finish with one short summary: the fit read, the PDF link, the posting link, and new explain notes next to the bullets that use them. If the posting asks for a cover letter or questions, draft them from the library and search_answers and include them. No explanations unless David asks.",
      "If David changes anything while applying, use rebuild_with_edits with his exact edits (it saves each one as an example). If an edit breaks a rule, tell him in one line and pass keep_failing_edits: true only if he keeps it. At most 2 builds per resume in total. Save any general instruction he gives with add_rule.",
    ],
  },
  library_session: {
    title: "Library session: write and polish story variants",
    when: "David asks to work on the story library, add a new story, or fill angle gaps.",
    standards: ["working", "bullets"],
    steps: [
      "Load the library with search_stories for the angles or requirements David names.",
      "Convert story_voice variants to house style, add new stories David describes, and write consulting, PM and data versions of stories that lack them.",
      "Run check_bullets on every new variant and fix every failure before saving.",
      "Give every variant an explain note: one line David could say in an interview, drafted from the story's context.",
      "Save each variant with save_variant (source library_session). Show David one compact list at the end, not one message per variant.",
    ],
  },
  import: {
    title: "Import: seed the library from David's resumes",
    when: "David shares his recent resumes to set up the story library. Run once; running again changes nothing.",
    standards: ["working", "bullets"],
    steps: [
      "Read every resume David shares. Group the bullets into stories (about 25 in total): one story per piece of work, with all its wordings as variants. Write each story's summary as its fact sheet: every fact, number and tool behind the story, since runs write new bullets from these facts.",
      "For each experience record the organization, official title, start and end month, and location exactly as the most recent resume states them.",
      "Tag each variant house or story_voice using the standards below. Mark the gold set bullets in the standards is_gold.",
      "Draft a one-line explain note for every variant that has a number. Show the notes as one compact list per experience; David approves all or fixes lines.",
      "Ask David once for the fit-read profile if this playbook shows none: graduation month and year, degree and program, year of study, and academic standing if it differs from year of study.",
      "Call import_library with the experiences, stories, variants and profile. It is safe to call again: anything already saved is skipped. Save every general instruction David gave during the import with add_rule.",
    ],
  },
};
