# Cloud timing baseline

Wall times for Cursor Cloud Agent Playwright runs. Updated during Phase 2.5 speed optimization.

Append new runs to `docs/cloud-timing.log` automatically via `pnpm agents:cloud`.

## Pre-optimization baseline (cloud-repo, commit ~6470455)

Measured during Phase 2 verification (2026-07-04). Profile: **cloud-repo** (fresh clone each run).

| Run | Scenario | Agent ID | Wall time | Notes |
| --- | --- | --- | --- | --- |
| Smoke | `cloud-smoke` | `bc-9b5f8c46…` | ~2 min | Node + env vars OK |
| Playwright | `user-dashboard-next` | `bc-7da61cc0…` | ~10 min | `BUG_NEXT_INERT` |
| Playwright | `user-admin-authz` | `bc-37c8c993…` | ~9 min | `BUG_ADMIN_AUTHZ` |
| Playwright | `user-task-create` | `bc-f00c94dd…` | ~21 min | Shutdown hang + retries; bug still found |
| Playwright | `user-broken-link` | `bc-5f006c80…` | ~1 min | Fast (warm VM or lucky cache) |

**Typical cold `cloud-repo` scenario:** 10–15 minutes (install + Playwright + testpad + scenario).

## Post-optimization targets

| Profile | First run (build snapshot) | Warm repeat runs |
| --- | --- | --- |
| `cloud-repo` + new environment.json | ~10 min once | ~5–8 min |
| `cloud-env` (saved snapshot) | ~10 min once (dashboard setup) | **~2–5 min** |

## Post-optimization measurements (commit `ecb8541`, 2026-07-04)

| Date | Profile | Run | Wall time | Agent ID | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-07-04 | `cloud-repo` | Smoke | **46s** | `bc-a22cfc6d…` | Post Phase 2.5 |
| 2026-07-04 | `cloud-repo` | `user-dashboard-next` | **98s (~1.6 min)** | (see `docs/cloud-timing.log`) | `BUG_NEXT_INERT`; thin script + cached VM |
| _pending_ | `cloud-env` | `user-dashboard-next` | target ~2–5 min | — | **Your action:** create snapshot per [cloud-env-setup.md](./cloud-env-setup.md), then `pnpm verify:cloud-env` |
