# Benchmark

The benchmark is how "the fleet can find real bugs" stops being a claim and
becomes a measurement (ADR-0009). It has two harnesses:

- **Grafana real-history** (separate scaffolding) — the primary bar. Real UI
  bugs from a real tracker; only these numbers back claims.
- **Seeded mini-app** (this directory) — the fast, deterministic *inner dev
  loop*. Artificial bugs in a tiny store called **Gearloop**. It boots in
  milliseconds, so it is the edit-test cycle a Grafana ultra run (the better
  part of an hour) can never be. **A treadmill, not a proof.**

## The mini-app: Gearloop

`mini-app/app.mjs` is a zero-dependency `node:http` server for a fictional
gadget store. With no bugs enabled, every page behaves correctly. Each seeded
bug is toggled by its flag:

| flag | kind | what breaks |
| --- | --- | --- |
| `sort-lexicographic` | Defect | `/products?sort=price` sorts price *strings*, so $1,099 floats above $89. The page renders fine — it is just wrong. |
| `cart-badge-stale` | Defect | The header "Cart (N)" badge freezes at 1 after the first add, though `/cart` lists every item. |
| `search-ignored` | Defect | `/search` returns the whole catalog regardless of `q`, while the heading still says `Results for "q"`. |
| `deals-500` | Hard Failure | `/api/deals` returns HTTP 500; the deals page logs a console error and shows "Failed to load deals". |
| `broken-docs-link` | Hard Failure | The footer Docs link points to `/documentation`, which 404s. |

`variant: 'v2'` renames every "Add to cart" button to "Add to basket" — the
intentional change the upgrade-triage mode dispositions.

Boot it standalone to poke at it:

```bash
node bench/mini-app/app.mjs --port 4173 --bugs sort-lexicographic,deals-500 --variant v1
# --bugs all enables every seeded bug; omit --bugs for a clean app
```

`mini-app/truth.json` is the ground-truth manifest: one entry per bug, with the
`expectKind` a rediscovery must have and a paraphrase-robust substring `match`
over a Finding's `title + detail`.

## Running the benchmark

Both modes stand up a throwaway Git Target repo, run the **real** fleet against
it, score the artifact, and clean up (`--keep` retains the repo).

```bash
# Discovery: seed bugs, measure rediscovery rate + false-Defect count
npx tsx bench/run-mini.ts --mode discovery --effort high            # all bugs
npx tsx bench/run-mini.ts --mode discovery --bugs sort-lexicographic,deals-500

# Upgrade-triage: Flow Map on v1, retarget at v2, measure Disposition accuracy
npx tsx bench/run-mini.ts --mode upgrade --effort high

npx tsx bench/run-mini.ts --help
```

**Preflight.** The runner loads the autoend repo's `.env`, so `CURSOR_API_KEY`
must be set there (or in the environment), and `agent-browser` must resolve
(`npm install`). Missing either fails fast with a clear message.

### Discovery mode

Seeds a fresh Gearloop repo (README describing the *intended* behaviors, so
Recon can tell a bug from a feature; a CHANGELOG; an initial commit), starts the
app with the chosen bugs, and runs `executeRun`. `scoreDiscovery` reports, per
bug, HIT or MISS, plus the false-Defect count (defect Findings that map to no
seeded bug) and the total Findings, wall-clock, and artifact path.

### Upgrade-triage mode

Seeds a v1 repo, hand-authors two baseline Flows — `add-to-cart` and
`view-products` — commits them, then commits the documented rename
(`redesign: rename Add to cart to Add to basket`) and starts the app as **v2**.
On replay, `add-to-cart` fails (the button it clicks is gone) and is filed as
`regression-add-to-cart`; `view-products` still passes. Triage should read the
git history and disposition the regression `intended-change`. The scoreboard
prints got vs. want; `unclear` is a warned near-miss, a missing Disposition
means Triage did not run at this Effort.

## What the scores mean, and the policy

`scoreDiscovery` and `scoreDispositions` (`bench/score.ts`) are pure and shared
with the future Grafana bench. Detection requires both a text match **and** an
expected Finding kind, so a real bug reported as the wrong tier does not count.

**Baseline before bars (ADR-0009).** The first runs *measure*; thresholds are
set from that data and then ratchet. So `run-mini.ts` always exits 0 on a
completed run — it is a measurement, never a gate. Inventing a pass bar before
a baseline would be theater.

**Cost.** Discovery and upgrade at `high` and above spawn real Cursor agent
fleets and cost real tokens; a discovery run at high can take minutes. Do not
loop it. The unit tests (`test/bench-mini-app.test.ts`,
`test/bench-score.test.ts`) exercise the app and the scoring with **no** LLM and
**no** browser — run those freely.
