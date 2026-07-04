# Findings earn trust by reproduction and receipts

Two extensions to the Finding trust model, both continuations of verify-by-running (ADR-0002's principle, applied beyond Flows). They exist because the bug classes that matter in mature products are semantic — the page renders, no console error, HTTP 200, but the behavior is wrong — and under ADR-0001's taxonomy those could only be filed as Advisories, the tier that erodes trust.

**Defect — reproduce-to-file.** An explorer that suspects a semantic bug (wrong data, lost state, broken interaction) files a *candidate*: written repro steps plus the violated expectation, citing the expectation's source (product docs, the Product Brief, or common sense). An independent Verifier agent re-executes the repro in a fresh browser session. Only if the violation reproduces is a **Defect** filed — a new Finding kind ranking between Hard Failure and Advisory — with the Verifier's video as its Evidence. Candidates that don't reproduce drop to Advisory or are discarded.

**Disposition — annotate, never auto-act.** After filing, a Triage agent with git history and read-only GitHub access researches each Finding: does a commit or PR show the change was deliberate? does an open issue already describe it? Its verdict — `bug | intended-change | known-issue | unclear`, always with citations (commit SHA, PR, issue URL) — is written into the Diagnosis (extending ADR-0006). The annotation never acts: Dismiss remains a human action per CONTEXT.md, now a one-click confirmation with the receipts on screen. A wrong auto-dismiss would silently delete baseline — the worst possible failure mode — so it is structurally impossible.

## Considered Options

- **Panel vote instead of re-execution** — rejected: never tests reproducibility, models share blind spots so confident nonsense can win the vote, and it produces no independent Evidence video.
- **Expectation-only oracle (documented behavior only)** — rejected as the sole gate: most real UI bugs violate undocumented common sense. Retained as a field — every Defect cites its violated expectation and source.
- **Keep semantic observations as richer Advisories** — rejected: the trust problem stays unsolved and fails the benchmark's false-positive bar.
- **Auto-dismiss high-confidence intended-changes** — rejected: destructive when wrong; violates the documented Dismiss semantics.
- **A quarantine tier for intended-looking findings** — a presentation variant of annotation; the backend ships the Disposition either way, rendering is the viewer's call.

## Consequences

- New Finding kind `defect` and new Diagnosis field `disposition` in `src/report/types.ts`; the viewer's hand-kept mirror must be updated in step — coordinate with the viewer team before landing.
- Verification costs one fresh browser session per candidate. Flaky bugs won't reproduce and get dropped — a deliberate false-negative bias, measured by the benchmark (ADR-0009) rather than argued about.
- Defects and Dispositions only exist at Efforts whose pipeline includes the Verifier and Triage stages (ADR-0007); low/mid Reports are unchanged.
- Triage needs the GitHub remote reachable and `gh` authenticated read-only; offline Runs degrade to `unclear` dispositions rather than failing.
- Accepted boundary softening: Finding text originates from agents that browsed the Target, so Triage — which holds the repo and `gh` — ingests web-derived data. ADR-0007's hard rule ("no agent holds untrusted web content AND repo access") is relaxed here to *quoted data, never a browser*: the prompt fences the finding text as untrusted, Triage has no browser to fetch more, and its instructions permit no writes. A stronger isolation (sanitizer pass, unauthenticated `gh`) is future work if the benchmark shows injection attempts landing.
