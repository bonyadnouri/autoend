# Sharing the testpad with colleagues

Deploy the buggy Next.js testpad so teammates can browse it, practice fixes, or point Playwright / Cloud Agents at a shared URL.

## Deploy (Vercel)

Prerequisites: [Vercel CLI](https://vercel.com/docs/cli) logged in (`vercel whoami`).

From the repo root (monorepo — do **not** use `--cwd apps/testpad`):

```bash
pnpm deploy:testpad          # production
pnpm deploy:testpad:preview  # preview URL
```

The Vercel project **testpad** uses Root Directory `apps/testpad` with workspace packages included from the repo root.

**Production URL:** https://testpad-seven.vercel.app

## Restrict access (recommended)

The app has **demo credentials only** — treat the URL as internal.

| Option | How |
| --- | --- |
| **Vercel team + Deployment Protection** | Dashboard → Project → Settings → Deployment Protection → restrict to team / password |
| **Unlisted URL** | Share the `*.vercel.app` link only in Slack/email (no public listing) |

## Demo logins (seeded bugs intact)

| Role | Email | Password |
| --- | --- | --- |
| User | `user@example.com` | `password123` |
| Admin | `admin@example.com` | `admin123` |

Contract endpoint: `GET /__testbed/contract.json`

## Seeded bugs to evaluate

| Bug ID | What to try |
| --- | --- |
| `BUG_NEXT_INERT` | Dashboard → Continue does nothing |
| `BUG_ADMIN_AUTHZ` | Log in as user → open `/admin/users` |
| `BUG_TASK_CREATE_500` | Projects → Alpha → New task → submit |
| `BUG_BROKEN_PROJECT_LINK` | Projects → Beta link |

## Run Playwright against the deployed site

```bash
export HACK_RAISE_TESTPAD_BASE_URL=https://testpad-seven.vercel.app
pnpm test:e2e -- --scenario user-dashboard-next
```

The runner skips starting a local dev server when `HACK_RAISE_TESTPAD_BASE_URL` is set.

## Cloud Agents against deployed testpad

Set in `.env` or per-run env:

```bash
HACK_RAISE_TESTPAD_BASE_URL=https://your-testpad.vercel.app
```

Use prompts that tell the agent to hit that base URL instead of `127.0.0.1:3100` (or extend orchestrator with a `TESTPAD_URL` profile — see `packages/cursor-orchestrator`).
