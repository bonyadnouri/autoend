# Visual Integrity — teammate showcase handoff

The interactive HTML reports (screenshots, galleries, forensic dashboards) live in a
**gitignored folder** so they never enter git history, but teammates can still use
them for demos and integration work.

## Where the files live

```
showcase/visual-integrity/          ← gitignored, stable path
  index.html                        ← gallery of all scanned sites
  manifest.json                     ← machine-readable index for integrations
  HANDOFF.md                        ← quick instructions (written on export)
  www-finder-healthcare-gov/        ← hero violation demo
    index.html
    report.json
    actual.png
    expected-header.png
    heatmap.png
    ...
  www-usa-gov/                      ← compliant pass example
  ...
```

Also gitignored: `showcase/visual-integrity-bundle.zip` (portable handoff archive).

## Generate or refresh the showcase

From `apps/autoend` on branch `visual-integrity-demo`:

```bash
pnpm visual:showcase
```

This wipes and rebuilds `showcase/visual-integrity/` with ~15 government and product
sites (White House, NASA, Plan Finder, French `.gouv.fr`, Google, etc.). Takes about
5–15 minutes depending on network.

## Share with a teammate (without git)

Pick one:

1. **Zip** — `pnpm visual:showcase:zip` then send `showcase/visual-integrity-bundle.zip` via Slack, Drive, or AirDrop.
2. **Shared folder** — copy `showcase/visual-integrity/` to a team drive; path stays the same inside the folder.
3. **Same machine** — teammate checks out the branch and runs `pnpm visual:showcase` locally (no zip needed).

## View locally

```bash
cd showcase/visual-integrity
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Or open `showcase/visual-integrity/index.html` directly (HTTP server is better for assets).

## Integrate into a showcase / deck

- **Gallery link:** `showcase/visual-integrity/index.html`
- **Hero violation:** `showcase/visual-integrity/finder-healthcare-gov/index.html`
- **Pass baseline:** `showcase/visual-integrity/www-usa-gov/index.html`
- **Programmatic:** read `manifest.json` — each entry has `slug`, `status`, `violations`, `url`, `rulePack`
- **Iframe embed:** serve over HTTP and iframe a report's `index.html`

Each report folder is self-contained — no backend, no API keys, no network required after generation.

## What is *not* in git

| Path | In git? |
| --- | --- |
| `showcase/` | No (gitignored) |
| `.visual-integrity/` | No (gitignored) |
| Batch scripts + module source | Yes |
| Tests | Yes |

See [visual-integrity.md](./visual-integrity.md) for architecture and tooling.
