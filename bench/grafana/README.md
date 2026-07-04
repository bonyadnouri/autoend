# Grafana real-history benchmark

The primary Target for autoend's benchmark (ADR-0009). Grafana OSS fits every v1
fence: docker-shippable, form login (`admin`/`admin`) inside the Test Account
scope, a rich UI, and a disciplined issue tracker whose closed bugs give us
**real** ground truth instead of invented mutations.

Two modes, per ADR-0009:

- **Discovery** — run the fleet against Grafana pinned at version X; ground truth
  is UI bugs the project itself fixed in X+1. Scored automatically by
  `run-grafana.ts`. Metrics: rediscovery rate and false-Defect rate.
- **Upgrade-triage** — build a Flow Map against version N, retarget the Run at
  N+1; the CHANGELOG is the ground truth. Scored **by hand** in v1.

> Read `docs/adr/0009-real-history-benchmark-validates-the-fleet.md` and
> `CONTEXT.md` first — this playbook uses their language (Run, Flow Map,
> Finding, Defect, Disposition, Effort, Test Account) exactly.

## Prerequisites

- Docker (for the Target) and a clone of `grafana/grafana`.
- `CURSOR_API_KEY` in the **autoend repo's** `.env` (not the Grafana checkout).
- `agent-browser` on `PATH` (ships as an autoend dependency).
- Time and money: an **ultra** Run costs roughly **30–60 minutes** on the strong
  pinned models (ADR-0009 model policy runs every role strong, never `auto`).
  Budget accordingly — this is not the edit-test loop. The seeded mini-app is the
  minutes-fast inner loop; only these real-history numbers back claims.

The Grafana checkout is the Target's **source**, passed as `--repo`. autoend
treats it as the Target's codebase: Recon reads its files to build the Product
Brief, and Triage reads its git history to disposition Findings. It must sit at
the **same tag** as the running Docker image, or recon and triage describe a
different Grafana than the one under test.

## Discovery mode

### 1. Mine ground truth

On the tracker, find UI bugs present in X and fixed in X+1:

```
repo:grafana/grafana is:issue is:closed label:type/bug milestone:<X+1>
```

Narrow to the UI with area labels (`area/dashboard`, `area/panel`,
`area/frontend`, `area/explore`, …) and keep only issues a person could
**reproduce in the browser** with no exotic datasource — panel rendering, table
sorting, variable interpolation, time-range handling, and the like. Confirm the
bug is actually present in X (the linked fix PR merged for X+1) before trusting
it as ground truth.

### 2. Write a manifest entry per bug

Copy `manifest.example.json` to `manifest.json` and replace the placeholders.
Each entry is a `TruthEntry` plus provenance:

| field        | meaning |
| ------------ | ------- |
| `id`         | stable slug for the entry (shown as HIT/MISS in the score) |
| `bug`        | stable id for the underlying bug — set it to the mined issue number. In discovery mode every entry is "in play", so the runner seeds the scorer with all of them |
| `expectKind` | Finding kinds that count as a rediscovery, e.g. `["defect"]` |
| `match`      | `{ all: string[], any?: string[] }` — substrings a matching Finding's `title + detail` must contain: **every** `all` term, and (if given) **at least one** `any`. Matching is case-insensitive |
| `description`| human summary of the bug and its repro |
| `issue`      | the GitHub issue URL (provenance) |
| `fixedIn`    | the version that fixed it (= X+1) |

Write `match` strings against the vocabulary a Finding would use (feature names,
symptoms) — not the issue's internal jargon; pick terms that survive paraphrase.
Scoring is delegated to `bench/score.ts` (`scoreDiscovery`); this runner only
seeds it with every entry's `bug` and formats the result.

### 3. Pin the Target and checkout to X

- Set `image: grafana/grafana-oss:<X>` in `docker-compose.yml` and
  `version` in `manifest.json` to the same X.
- `git checkout v<X>` in your Grafana clone.

### 4. Run at ultra

```bash
docker compose -f bench/grafana/docker-compose.yml up -d   # wait for healthy
npx tsx bench/grafana/run-grafana.ts \
  --repo /path/to/grafana \
  --manifest bench/grafana/manifest.json \
  --effort ultra
docker compose -f bench/grafana/docker-compose.yml down -v  # dispose of the Target
```

The runner preflights (API key, hands, git checkout, `/api/health`, manifest),
executes one Run, scores the Findings, and prints per-entry HIT/MISS, the
rediscovery count, the false-Defect count, and the artifact dir. It always exits
0 on a completed Run — it measures, it never gates. Open the artifact dir's
Report to watch the Evidence behind each Finding.

## Upgrade-triage mode

No manifest — the CHANGELOG is the ground truth, and scoring is manual in v1.

1. **Baseline at N.** Pin `docker-compose.yml` to version N and check the Grafana
   clone out at `v<N>`. Run autoend normally (not this script) against the
   compose Target with `repoRoot` = that checkout, so a Flow Map accumulates in
   the checkout's `.autoend/`:
   ```bash
   cd /path/to/grafana && npx @bonyadnouri/autoend http://localhost:3000 --effort ultra
   ```
2. **Retarget at N+1.** Re-pin `docker-compose.yml` to N+1, `git checkout v<N+1>`
   in the clone, `docker compose up` again, and rerun autoend against it with the
   **same** checkout as `repoRoot`. Replay re-verifies the N Flow Map against the
   N+1 Target.
3. **Judge the dispositions by hand** against `CHANGELOG.md` for N+1:
   - a Flow that changed because of a **documented** UI change should carry
     Disposition `intended-change`;
   - a Flow that broke due to a bug **later fixed** should carry `bug`.
   The metric is Disposition accuracy. Automated scoring for this mode is a v1
   limitation — track it separately.

## v1 constraints

- **Login.** Grafana's built-in form login (`admin`/`admin`, seeded by the
  compose env) is exactly the Test Account scope. OAuth/SSO/MFA Grafana setups
  are out of scope and would fail early.
- **Baseline before bars (ADR-0009).** The first Runs only measure. Do not invent
  pass thresholds; set them from this data, then ratchet.
- **The image tag is a placeholder.** `11.2.0` in `docker-compose.yml` and
  `manifest.example.json` exists to make the files parse and pull today. Curation
  re-pins both to the real X (discovery) or N / N+1 (upgrade-triage).
