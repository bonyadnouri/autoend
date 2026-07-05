# Autoend Flow Map Sync — `flowDeltas.json` Design

Companion to [autoend-cloud-adapter-design.md](./autoend-cloud-adapter-design.md). This document
covers specifically how Flow Map mutations made during a **cloud** autoend Run get back to the
developer's machine — the hardest artifact-sync problem in the cloud adapter, and the reason the
cloud adapter design explicitly defers "sync `.autoend/flows/`" rather than just downloading it
like any other file.

## Why this needs its own design

Run artifacts (`report.json`, `evidence/`) are easy: they are new, run-scoped, and additive — just
download `.autoend/runs/<runId>/` (`downloadCloudArtifacts` from the sidearm handles this
generically already).

The Flow Map (`.autoend/flows/`) is different in kind:

- It is **long-lived, mutable, shared state** — "committed to the user's repo like a lockfile"
  (ADR-0001), not a per-run artifact.
- Autoend mutates it in place during a normal Run: `addFlow` (first successful execution of a
  newly-discovered flow), `saveFlowMeta` (bump `lastPassedAt` after a green replay), `healFlow`
  (overwrite `flow.mts` after a repair). `removeFlow` / `revertHeal` are viewer-only actions
  (Dismiss / Reject a Heal) and should not occur during a `--no-serve` batch run.
- The cloud VM's `.autoend/flows/` starts as whatever the checked-out git ref had. The developer's
  local `.autoend/flows/` may have **diverged** since that checkout — they may have run autoend
  locally in the meantime, pulled new commits, or hand-edited a `flow.mts`. Blindly copying the
  VM's post-run `.autoend/flows/` over local state would silently discard that local work.

So this is a merge problem, not a copy problem. The design below treats `flowDeltas.json` as a
**patch relative to a known base**, applied locally with the same "don't overwrite what changed
underneath you" discipline `git apply` / a 3-way merge uses — appropriate given autoend already
describes the Flow Map using lockfile language.

## When the delta is captured

On the cloud VM, immediately after checkout and *before* `executeRun()` touches anything, the thin
runner snapshots the Flow Map's current content hashes:

```ts
// autoend/src/cloud/flow-snapshot.ts (reference; not yet added to autoend)
import { createHash } from "node:crypto";
import { listFlows, readFlowScript } from "../map/flow-map.js";

export interface FlowSnapshotEntry {
  metaHash: string;
  scriptHash: string;
}

export async function snapshotFlowMap(repoRoot: string): Promise<Record<string, FlowSnapshotEntry>> {
  const snapshot: Record<string, FlowSnapshotEntry> = {};
  for (const meta of await listFlows(repoRoot)) {
    const script = await readFlowScript(repoRoot, meta.id).catch(() => "");
    snapshot[meta.id] = {
      metaHash: sha256(JSON.stringify(meta)),
      scriptHash: sha256(script),
    };
  }
  return snapshot;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
```

This snapshot is exactly "the Flow Map as of the git ref the cloud VM checked out" — the natural
merge base, since that ref is (or should be) an ancestor of whatever the developer's local branch
is at apply time.

## `flowDeltas.json` schema

Written after `executeRun()` finishes, by diffing the post-run Flow Map against the pre-run
snapshot above. Only flows that actually changed produce an entry.

```ts
// autoend/src/cloud/flow-deltas.ts (reference; not yet added to autoend)
export const FLOW_DELTA_SCHEMA_VERSION = 1;

export type FlowDeltaOp = "add" | "update-meta" | "heal" | "revert-heal" | "remove";

export interface FlowDeltaEntry {
  flowId: string;
  op: FlowDeltaOp;
  /** Hashes of the flow's state at the START of the cloud run — the merge base. Absent for "add" (flow didn't exist yet). */
  base?: { metaHash: string; scriptHash: string };
  /** Full flow.json content after the run. Present for every op except "remove". */
  meta?: unknown; // FlowMeta, kept as unknown here to avoid a hard dependency on autoend's internal type from this doc
  /** Full flow.mts content after the run. Present for "add" / "heal" / "revert-heal". */
  script?: string;
}

export interface FlowDeltaBundle {
  schemaVersion: typeof FLOW_DELTA_SCHEMA_VERSION;
  runId: string;
  generatedAt: string;
  /** Git ref the cloud VM checked out — provenance for the merge base, not used for hashing. */
  sourceRepoRef?: string;
  entries: FlowDeltaEntry[];
}
```

Design choices worth calling out:

- **Content hashes, not timestamps**, define the merge base. Timestamps drift across machines and
  don't tell you whether content actually changed; a hash mismatch is an unambiguous "local
  diverged from what the cloud VM started with" signal.
- **Full content, not diffs**, for `meta`/`script`. Flow files are small (a Playwright script plus
  a JSON metadata blob) — a textual diff format would add complexity for no real size win, and
  full content lets `apply` write the file directly on a clean fast-forward instead of patching.
- **`remove` and `revert-heal` are modeled but should not appear** from a `--no-serve` cloud run
  today, since both are viewer-triggered (Dismiss / Reject a Heal) and the viewer never runs in
  cloud mode. Modeling them now (rather than adding them later) means the schema doesn't need a
  breaking version bump if a future cloud "apply resolution actions" feature needs them.

## Applying deltas locally

A new autoend subcommand, run by the developer on their own machine after downloading the run's
artifacts (via the sidearm's `downloadCloudArtifacts`, same as `report.json`):

```
autoend cloud apply-deltas .autoend/runs/<runId>/flowDeltas.json
```

Algorithm, per entry:

1. **`add`** — if `flowId` doesn't exist locally, write `meta`/`script` and mark **applied**. If it
   already exists locally (id collision — should be extremely rare since flow ids are
   content/timestamp-derived, but not provably impossible), mark **conflict**; never overwrite
   silently.
2. **`update-meta` / `heal` / `revert-heal` / `remove`** — hash the *current local* `flow.json` /
   `flow.mts` for that `flowId` and compare against `entry.base`:
   - **Match** → the local copy hasn't moved since the cloud VM's checkout. Fast-forward: apply
     the entry (write new meta/script, or delete the directory for `remove`). Mark **applied**.
   - **Mismatch** → local diverged (a local Run happened, a git pull landed new commits, or a
     hand-edit occurred). Mark **conflict** and do **not** touch the local file. This is the
     "never fail closed on the human-editable Flow Map" principle from `flow-map.ts` extended to
     the sync path: an unresolvable delta must be visible and skippable, not silently lossy.
   - **Local flow missing entirely** (e.g. it was locally Dismissed after the base snapshot) →
     mark **conflict** with a distinct reason (`"missing-locally"`) rather than silently
     re-creating a flow the developer intentionally removed.
3. Write an apply report next to the input file —
   `.autoend/runs/<runId>/flow-deltas-apply-report.json` — listing every entry's outcome
   (`applied` / `conflict` + reason / `skipped`). This keeps with ADR-0004's "the artifact is the
   state" philosophy: the report is inspectable evidence, not just a console message that
   scrolls away.
4. **Never write partial results for a single entry.** Each entry's meta+script write is one
   atomic step (write script, then write meta — matching `addFlow`'s existing order in
   `flow-map.ts`) so a crash mid-apply can't leave one flow's `flow.mts` and `flow.json` out of
   sync with each other.

Default behavior is **dry-run with a summary**, matching the "ask before mutating the user's
lockfile" instinct:

```
$ autoend cloud apply-deltas .autoend/runs/<runId>/flowDeltas.json
3 flows to add, 1 update, 1 conflict:
  + login-flow            (add)
  + checkout-flow         (add)
  + settings-toggle-flow  (add)
  ~ dashboard-nav-flow    (update-meta: lastPassedAt)
  ! admin-users-flow      (heal: CONFLICT — local flow.mts changed since the cloud run's base)

Re-run with --apply to write the 4 non-conflicting changes.
Conflicts are never auto-resolved — inspect admin-users-flow manually, or re-run the cloud Run
after pulling the latest local changes.
```

## Interaction with `AUTOEND_FLOW_SYNC_MODE`

From the cloud adapter design's env contract:

- `AUTOEND_FLOW_SYNC_MODE=delta` (default) — the thin runner writes `flowDeltas.json` as described
  above. Nothing is applied automatically; the developer runs `apply-deltas` locally.
- `AUTOEND_FLOW_SYNC_MODE=none` — the thin runner skips delta generation entirely. Useful for a
  strictly read-only smoke/regression check (replay-only) where the developer explicitly does not
  want the cloud run to produce any Flow Map changes to review, e.g. a CI-style check gate.

There is deliberately no `AUTOEND_FLOW_SYNC_MODE=auto-apply` in this design. Silently mutating a
file the product's own docs compare to a lockfile is exactly the failure mode this whole document
exists to avoid — if that mode is ever wanted, it should be a conscious later addition, not a
default path.

## Open questions for actual implementation (not blocking this design)

- Should `apply-deltas` offer a `--conflict-strategy=theirs|ours|manual` flag once there's real
  usage data on how often conflicts actually occur, or is manual-only sufficient long-term?
- Should the apply report be surfaced in autoend's existing Report viewer (a small "Flow Map sync"
  panel) instead of a separate JSON file the developer has to know to look for?
- Autoend's Flow Map lives directly in the developer's working tree, which typically maps 1:1 to a
  git branch. If the cloud VM ran on a different branch/ref than the developer's current checkout,
  `apply-deltas` should probably warn (using `sourceRepoRef`) even on a clean fast-forward, since
  "no hash conflict" doesn't guarantee "same logical branch."
