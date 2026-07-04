# A real-history benchmark validates the fleet

"The fleet can find real bugs in well-known projects" is a falsifiable claim, and the benchmark is its test. Ground truth comes from real project history, not invention, in two modes:

- **Discovery mode**: run the fleet against an OSS app pinned at version X. Ground truth = UI bugs from the project's own tracker that were fixed in X+1 (provably present in X, humanly reproducible). Metrics: rediscovery rate and false-Defect rate.
- **Upgrade-triage mode**: build a Flow Map against version N, then retarget the Run at N+1. Changelog-documented UI changes must be dispositioned `intended-change`; bugs introduced in N+1 (fixed later) must be dispositioned `bug`. Metric: Disposition accuracy.

Grafana OSS is the primary benchmark Target (docker, form login, rich UI, disciplined tracker — fits every v1 fence). A **seeded mini-app** with artificial bugs is the inner dev loop: deterministic and minutes-fast, because a Grafana ultra run costs the better part of an hour and cannot be the edit-test cycle. The mini-app is a treadmill, not a proof; only real-history numbers make claims.

**Baseline before bars.** The first benchmark runs measure; pass thresholds are set from that data and then ratchet. Inventing thresholds before a baseline would be theater.

**Model policy.** Every role runs a strong pinned model initially — not `auto`. Failures then attribute to architecture or prompts, never "maybe the router picked a weak model." Per-role downgrades are allowed only with benchmark evidence that the role doesn't need the strength.

**Harness trigger.** If the fleet fails the benchmark on the best models Cursor can route, that result — not intuition — is the documented trigger to revisit ADR-0003 (Claude Agent SDK was the runner-up).

## Considered Options

- **Open hunt on live Grafana as the success bar** — rejected as the loop: slow feedback, unrepeatable, a lucky/unlucky single sample. Retained as the graduation demo once the benchmark is green.
- **Qualitative richness bar** ("reports feel rich") — rejected: unfalsifiable; we would be tuning vibes.
- **Seeded mutations as the headline metric** — rejected: artificial bugs are systematically easier and different from real ones; passing proves less and invites overfitting to synthetic patterns. Retained only as the dev loop.
- **Tiered or `auto` model routing from day one** — rejected: muddles failure attribution; tiering may return later, justified by data.

## Consequences

- The harness is a real build artifact in the repo: docker pinning of Target versions, ground-truth bug manifests curated from trackers, and scoring. Curation is manual work; the corpus starts small.
- Benchmark runs at ultra with strong models cost real money; accepted knowingly — the alternative is shipping unproven claims.
- The benchmark doubles as the tuning instrument for every knob ADR-0007 left open (per-stage budgets, Wave sizes, staleness rules).
- CI is out of scope (v1 is local-first); the benchmark runs on demand.
