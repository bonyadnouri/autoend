# Cloud environment snapshot setup

Use a **saved Cursor environment** for faster repeat cloud runs (~2–5 min warm vs ~10–15 min cold `cloud-repo`).

Based on [Cursor Cloud Environment Setup](https://cursor.com/docs/cloud-agent/setup).

## One-time dashboard setup

1. Open **Cursor → Cloud Agents → Environments**
2. Start **guided setup** for `https://github.com/m2moiz/hack-raise` on branch **`main`**
3. Let the agent complete setup (uses committed [`.cursor/environment.json`](../.cursor/environment.json) + [`.cursor/Dockerfile`](../.cursor/Dockerfile))
4. Verify on the VM:
   ```bash
   pnpm verify:e2e
   # or: pnpm agents:playwright -- --smoke
   ```
5. **Save snapshot** — name it e.g. `hack-raise-testbed`

## Local orchestrator config

In `.env` (local only):

```bash
CURSOR_API_KEY=...
CURSOR_CLOUD_ENV_NAME=hack-raise-testbed
# Unset or remove CURSOR_REPO_URL — mutually exclusive with cloud-env
```

Validate:

```bash
pnpm agents:env:check
```

Run a scenario:

```bash
pnpm agents:cloud user-dashboard-next
```

The wrapper detects `CURSOR_CLOUD_ENV_NAME` and uses **cloud-env** profile automatically.

## How caching works

- First run after env change may take ~10 min (builds snapshot)
- Repeat runs boot from checkpoint — `install` only does incremental work
- Keep `install` idempotent in `.cursor/environment.json`

## Troubleshooting

| Issue | Fix |
| --- | --- |
| Still slow every run | Snapshot not saved or env name mismatch — check dashboard |
| `Do not combine cloud-env with CURSOR_REPO_URL` | Remove `CURSOR_REPO_URL` from `.env` |
| Stale snapshot after dependency changes | Re-save environment from dashboard or delete and recreate |
| Agent reinstalls everything | Use thin prompt + `bash scripts/run-cloud-scenario.sh` (orchestrator updated) |

## Verification checklist

- [ ] `pnpm agents:env:check` shows `cloud-env options: OK`
- [ ] One scenario completes with `BUG_*` in manifest
- [ ] Wall time logged in [cloud-timing-baseline.md](./cloud-timing-baseline.md) or `docs/cloud-timing.log`
