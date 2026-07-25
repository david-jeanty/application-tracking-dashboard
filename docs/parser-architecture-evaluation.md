# Job description parser architecture evaluation

## Decision status

The parser must stop expanding through posting-specific regexes until it has
been measured on an untouched, human-labelled real-posting benchmark.

The current implementation remains useful as a deterministic extraction
baseline and as a high-precision engine for explicit structured fields. The
33-fixture suite remains a regression suite. It is not evidence that the parser
generalizes to arbitrary job postings.

The provisional architecture direction is a hybrid pipeline:

```text
Raw pasted posting
        |
        v
Source cleanup, language detection, and section segmentation
        |
        v
Deterministic extraction for explicit structured fields
        |
        +-------------------+
        |                   |
        v                   v
Semantic extraction    Existing rule candidates
        |                   |
        +---------+---------+
                  |
                  v
Cross-field reconciliation and conflict detection
                  |
                  v
Field-specific confidence, abstention, and user review
```

This is not yet a decision to ship a hosted model, a local model, or a trained
NLP model. That choice requires benchmark evidence for accuracy, latency, cost,
privacy, and operational complexity.

## Findings from the current repository

### Document representation

`normalizeDocument` produces a flat list of normalized lines. A line has its
position, text, and a heading-like flag, but there is no representation for:

- source template or page chrome;
- language;
- section type;
- section boundaries;
- legal or accommodation content;
- employer introduction versus role content;
- relationships among entities.

`classifyCategory` has a useful, narrow boilerplate-section exclusion, but that
logic is local to category classification and is not a shared document model.

### Extraction and reconciliation

`parseJobDescription` invokes field extractors independently. The deliberate
dependencies are limited to:

- category receiving the extracted title;
- work-term season and duration sharing one extractor.

There is no reconciliation pass that can reject combinations such as a
headquarters city paired with a virtual role, a benefit program selected as the
employer, or an arrangement inferred from company-wide boilerplate.

### Semantic fields

Company, title, and category depend on phrase patterns, capitalization, line
position, dictionaries, and additive weights. These are traceable and
deterministic, but they do not resolve employer versus brand versus division,
interpret responsibilities as a whole, or distinguish page-interface text from
role content consistently.

### Confidence

`score.ts` maps additive rule scores to `High`, `Medium`, and `Low` at fixed
thresholds of 90, 55, and 25. These labels are ranking-policy buckets, not
calibrated probabilities.

`map-to-form.ts` currently prefills both High and Medium results. A benchmark
must therefore measure prefill precision separately from extraction recall:
an abstention is inconvenient, while a confident wrong prefill silently
creates bad application data.

### Evaluation corpus

The committed corpus contains 33 fixtures and reports 100% exact outcomes. Its
own source states that all employers, dates, figures, and posting wording are
invented. Several fixtures reproduce the shape of observed real failures, but
the fixtures and rules live in the same development loop.

The suite provides valuable regression protection. It cannot measure
generalization, real source noise, multilingual performance, or calibrated
confidence on unseen postings.

## Scope freeze during evaluation

Until the benchmark and prototypes have been evaluated:

- do not add a parser rule solely because one new posting failed;
- fix only clear regressions, security problems, or fabricated explicit fields;
- do not lower fixture expectations to make a parser run pass;
- do not describe the 33-fixture result as real-world parser accuracy;
- keep all parsed values reviewable and editable;
- do not auto-save parser output;
- preserve the raw pasted text as the source of truth.

## Field routing hypothesis

The benchmark should test this routing rather than assuming every field needs
the same extraction method.

| Field | Initial extraction route | Why |
| --- | --- | --- |
| Application deadline | Deterministic first | Explicit labels and date grammar are bounded and auditable. |
| Salary | Deterministic first | Currency, ranges, and pay periods are structured when stated. |
| Work-term duration | Deterministic first | Month and week ranges are usually explicit. |
| Work-term season | Deterministic plus reconciliation | Often explicit, but may need inference from dates. |
| Location | Hybrid | Labels are structured; headquarters and multi-location prose require context. |
| Work arrangement | Hybrid | Explicit labels are safe; role-specific versus company-wide language is semantic. |
| Company | Semantic with deterministic evidence | Employer, brand, division, platform, and program names compete. |
| Original title | Semantic with deterministic evidence | Labels are safe; noisy headers and prose require document context. |
| Normalized category | Semantic classification | The dominant role function depends on title and responsibilities together. |

Deterministic results and semantic results should be candidates with provenance,
not two independent final answers.

## Real-posting benchmark

### Minimum corpus

Collect at least 50 untouched postings before comparing architectures.

The initial 50-posting pilot should be stratified approximately as follows:

| Dimension | Minimum representation |
| --- | --- |
| LinkedIn | 10 |
| Workday | 10 |
| Dayforce | 8 |
| Employer career sites | 12 |
| Campus or co-op portals | 10 |
| English | 35 |
| French | 10 |
| Bilingual | 5 |

The corpus must also cover different role families, missing fields, multiple
locations, divisions and brands, legal boilerplate, accommodation language,
benefits, remote-work boilerplate, salary formats, and date formats.

Fifty postings are sufficient for a pilot and architecture decision, not for a
strong statistical claim about production accuracy.

### Data handling

Raw real postings should not be committed to the public repository unless their
licence and provenance explicitly permit redistribution.

Keep the private benchmark outside the application repository or in an
access-controlled dataset. Each posting should have:

- an opaque ID;
- source family;
- language;
- capture date;
- a content hash;
- provenance and redistribution status;
- a private reference to the raw pasted text;
- labels for all nine fields;
- ambiguity and acceptable-alias notes;
- annotator identity and adjudication status.

Do not rewrite a real posting into a cleaner synthetic version for this
benchmark. Cleanup is part of the system being evaluated.

### Labels

Each field needs more than `string | null`. The annotation must distinguish:

- one stated value;
- genuinely not stated;
- ambiguous;
- multiple valid values;
- an acceptable alias or normalization.

At least 20% of the corpus should be labelled independently by two people.
Disagreements should be adjudicated before any parser output is viewed.

### Frozen split

Use a stratified split:

- 30 development postings;
- 10 validation and confidence-policy postings;
- 10 final held-out postings.

The final held-out text and labels must not influence rules, prompts, examples,
or thresholds before the go/no-go report. After the final report is opened, it
cannot be reused as an untouched final set for the next iteration.

## Metrics

Report metrics per field, source, and language:

- exact-match accuracy, with documented normalization and aliases;
- asserted-value precision;
- recall;
- abstention rate;
- prefill coverage;
- prefill precision;
- fabricated-value count;
- critical wrong-prefill count;
- fully correct, reviewable, and unusable posting counts;
- English/French performance gap;
- p50 and p95 latency;
- cost per posting and projected monthly cost;
- payload size and external data exposure.

Do not call High, Medium, or Low calibrated unless their observed error rates
have been measured on validation data. A semantic model's self-reported
confidence is not a calibrated probability by itself.

## Experimental arms

All arms must run against the same frozen inputs and labels.

### A. Current deterministic baseline

Use commit `750bbc208fcd025b9696d29f69fbc607b409a968` without tuning it on the
held-out split. This establishes honest field-level precision, recall,
abstention, and harmful-prefill rates.

### B. Hybrid with a hosted semantic model

Prototype offline behind a provider-neutral interface. Give the model the
cleaned document with section provenance and require a strict structured
response. Use it primarily for company, title, category, ambiguous location,
and ambiguous work arrangement.

The prototype must have:

- no database or application tools;
- no service-role credentials;
- schema validation;
- bounded input and output;
- timeouts and failure-to-abstain behaviour;
- evidence spans for every asserted value;
- deterministic reconciliation after model output;
- no runtime integration until evaluation is approved.

This is the fastest way to test whether semantic understanding materially
improves the product. Its privacy, variable cost, network dependency, and
latency must be measured rather than assumed.

### C. Hybrid with a local model

Run the same semantic contract using a local model where suitable hardware is
available. Measure model size, installation burden, memory use, cold start,
latency, platform support, and output quality.

Local inference removes per-request API charges and can improve privacy, but it
does not remove deployment and support costs.

### D. Trained entity and classification models

Evaluate only if the benchmark can grow substantially beyond 50 postings.
Named-entity recognition and supervised category classification may offer
predictable inference, but a 50-posting pilot is not enough training data for
the target variety of sources, languages, entities, and categories.

## Reconciliation contract

The final stage should receive candidates from all extractors and produce one
of three outcomes per field:

- `apply`: evidence is strong enough to prefill;
- `review`: one or more candidates are shown but not applied;
- `blank`: the posting does not state the field or evidence is insufficient.

Reconciliation should enforce at least these invariants:

- `Virtual` location implies Remote unless stronger role-specific evidence
  contradicts it;
- headquarters and employer-introduction locations are not automatically job
  locations;
- multiple locations remain multiple or require review;
- a company-wide flexibility statement does not override a role-specific
  arrangement;
- employer, brand, and division candidates retain their relationship rather
  than silently replacing one another;
- category uses the resolved title and responsibility sections, not legal or
  accommodation sections;
- season may be inferred from dates, while duration remains blank when it is
  not stated;
- conflicting high-quality evidence forces review instead of a tie-break.

## Pilot acceptance criteria

Set these criteria before opening the final held-out report:

- zero incorrect or fabricated prefills for company, title, or deadline in the
  final held-out split;
- at least 95% precision across all values that reach the form;
- a material increase in fully correct or safely reviewable postings over the
  deterministic baseline without increasing critical errors;
- no regression for explicit deterministic deadline, salary, and duration
  extraction;
- French and bilingual results reported separately, with any large gap treated
  as a product limitation rather than averaged away;
- ambiguous and multi-value cases abstain or request review;
- p95 latency and per-posting cost fit product budgets defined before runtime
  integration;
- raw postings are not retained or sent externally beyond the approved privacy
  policy.

Passing ten final postings does not prove production reliability. It is the
minimum signal for choosing the next architecture investment.

## Execution sequence

1. Freeze the current deterministic baseline at `750bbc2`.
2. Create the private 50-posting manifest and annotation guide.
3. Label the corpus without viewing parser output.
4. Freeze the 30/10/10 split.
5. Run the current parser and publish the honest baseline report.
6. Implement offline provider-neutral semantic prototypes.
7. Run every arm on identical inputs.
8. Calibrate apply/review/blank policy only on the validation split.
9. Open the final held-out report once.
10. Compare accuracy, coverage, latency, cost, privacy, and operational burden.
11. Record the architecture decision before changing the application runtime.

## Current blocker

The repository does not contain 50 untouched, human-labelled real postings.
The existing synthetic fixtures cannot be relabelled or renamed to satisfy that
requirement.

The next legitimate input is therefore the private benchmark corpus and its
human labels. Until those exist, the repository can define the experiment but
cannot honestly report real-parser accuracy or select a production semantic
backend.
