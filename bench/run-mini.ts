import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadDotEnv } from '../src/config.js';
import { addFlow } from '../src/map/flow-map.js';
import { handsAvailable } from '../src/explore/hands.js';
import { isEffort, type Effort } from '../src/run/effort.js';
import { executeRun } from '../src/run/run.js';
import { scoreDiscovery, scoreDispositions, type DiscoveryScore, type TruthEntry } from './score.js';
import { startMiniApp } from './mini-app/app.mjs';
import type { Finding } from '../src/report/types.js';

/**
 * The seeded mini-app benchmark runner (ADR-0009): the fast, deterministic
 * inner dev loop. It stands up a throwaway Gearloop Target repo, runs the real
 * fleet against it, and scores the artifact. It measures — it never gates:
 * a completed run always exits 0 (baseline before bars).
 */

const exec = promisify(execFile);

/** The autoend repo root, one level up from bench/ — where .env (CURSOR_API_KEY) lives. */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const HELP = `autoend seeded mini-app benchmark (ADR-0009 inner dev loop)

Usage:
  npx tsx bench/run-mini.ts --mode discovery|upgrade [options]

Modes:
  discovery   Seed a fresh Gearloop repo with bugs, run the fleet, score
              rediscovery rate and false-Defect count.
  upgrade     Build a Flow Map on v1, retarget the Run at v2 (the "Add to cart"
              button is renamed), score Disposition accuracy.

Options:
  --mode <discovery|upgrade>            Required.
  --effort <low|mid|high|xhigh|ultra>   Run Effort (default: high — the deep pipeline).
  --bugs <all|a,b,c>                    Discovery only: which seeded bugs to enable (default: all).
  --keep                                Keep the temp Target repo and print its path (default: clean up).
  --help                                Show this help.

Cost warning: discovery/upgrade at high+ spawn real Cursor agent fleets against
the mini-app and cost real tokens. Do not run in a loop.`;

const IDENTITY = ['-c', 'user.name=autoend-bench', '-c', 'user.email=bench@autoend.local'];

const DISCOVERY_README = `# Gearloop

Gearloop is a small demo storefront for premium gadgets. It is a server-rendered
web app with a product catalog, a cart, deals, a demo login, and a contact form.

Pages:
- "/" — landing page with navigation and a footer Docs link.
- "/products" — the catalog. "Sort by price" orders products numerically from the
  lowest price to the highest. A search box filters the catalog by name.
- "/search?q=..." — shows only the products whose name matches the query.
- "/cart" — the shopping cart. The header shows a "Cart (N)" badge that counts
  every item currently in the cart.
- "/deals" — loads current deals from "/api/deals" and renders them.
- "/login" — sign in with demo / demo123 to reach "/account".
- "/contact" — a contact form.
- "/docs" — product documentation; the footer Docs link points here.

Intended behavior:
- Sorting by price is numeric: $89.00 comes before $1,099.00.
- Search returns a filtered subset, never the whole catalog for a specific query.
- The cart badge reflects the true number of items in the cart.
- Every navigation and footer link resolves (no 404s); "/api/deals" returns 200.
`;

const DISCOVERY_CHANGELOG = `# Changelog

## 1.0.0
- Initial Gearloop storefront: catalog, cart, search, deals, login, contact, docs.
`;

const UPGRADE_README = `# Gearloop

Gearloop is a small demo storefront for premium gadgets.

Pages:
- "/products" — the catalog. Each product has an "Add to cart" button that adds
  it to the shopping cart.
- "/cart" — the shopping cart, listing the items you have added.
- Standard pages: "/", "/deals", "/login", "/contact", "/docs".

The Flow Map baseline covers two flows: adding a product to the cart, and viewing
the product catalog.
`;

const UPGRADE_CHANGELOG_V1 = `# Changelog

## 1.0.0
- Initial Gearloop storefront with an "Add to cart" button on every product.
`;

const UPGRADE_CHANGELOG_V2 = `# Changelog

## 1.1.0
- Renamed "Add to cart" to "Add to basket" for clarity.

## 1.0.0
- Initial Gearloop storefront with an "Add to cart" button on every product.
`;

// Hand-authored v1 baseline Flows. add-to-cart breaks on v2 (button renamed) and
// must be dispositioned intended-change; view-products still passes on v2.
const ADD_TO_CART_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/products', target).href);
  await page.getByRole('button', { name: 'Add to cart' }).first().click({ timeout: 8000 });
  await page.getByText('Added to your cart').waitFor({ timeout: 8000 });
  await page.goto(new URL('/cart', target).href);
  const body = (await page.textContent('body')) ?? '';
  if (/your cart is empty/i.test(body)) throw new Error('cart is empty after adding a product');
}
`;

const VIEW_PRODUCTS_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/products', target).href);
  await page.locator('table').first().waitFor({ state: 'visible', timeout: 8000 });
  const rows = await page.locator('table tbody tr').count();
  if (rows < 1) throw new Error('products table rendered no rows');
}
`;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    out[key] = next === undefined || next.startsWith('--') ? 'true' : argv[++i];
  }
  return out;
}

async function git(repo: string, args: string[]): Promise<void> {
  await exec('git', ['-C', repo, ...args]);
}

async function commitAll(repo: string, message: string): Promise<void> {
  await git(repo, ['add', '-A']);
  await git(repo, [...IDENTITY, 'commit', '-m', message]);
}

async function loadTruth(): Promise<TruthEntry[]> {
  const raw = await readFile(new URL('./mini-app/truth.json', import.meta.url), 'utf8');
  return JSON.parse(raw) as TruthEntry[];
}

async function cleanup(repo: string, args: Record<string, string>): Promise<void> {
  if ('keep' in args) {
    console.log(`\n--keep: temp Target repo retained at ${repo}`);
    return;
  }
  await rm(repo, { recursive: true, force: true });
}

function printDiscoveryScore(
  score: DiscoveryScore,
  truth: TruthEntry[],
  seeded: Set<string>,
  ms: number,
  artifactDir: string,
): void {
  console.log('\n--- Discovery scoreboard --------------------------------');
  for (const entry of truth) {
    if (!seeded.has(entry.bug)) continue;
    const hit = score.detected.includes(entry.id);
    console.log(`  ${hit ? 'HIT ' : 'MISS'}  ${entry.id.padEnd(20)} ${entry.description}`);
  }
  const total = score.detected.length + score.missed.length;
  console.log('---------------------------------------------------------');
  console.log(`  Rediscovered:   ${score.detected.length}/${total}`);
  console.log(`  False Defects:  ${score.falseDefects.length}`);
  for (const f of score.falseDefects) console.log(`      - [${f.id}] ${f.title}`);
  console.log(`  Findings total: ${score.findingsTotal}`);
  console.log(`  Wall clock:     ${(ms / 1000).toFixed(1)}s`);
  console.log(`  Artifact:       ${artifactDir}`);
  console.log('---------------------------------------------------------');
  console.log('Baseline before bars (ADR-0009): a measurement, not a gate.');
}

function printUpgradeScore(findings: Finding[], ms: number, artifactDir: string): void {
  const disp = scoreDispositions(findings, { 'regression-add-to-cart': 'intended-change' });
  console.log('\n--- Upgrade-triage scoreboard ---------------------------');
  const regression = findings.find((f) => f.id === 'regression-add-to-cart');
  const want = 'intended-change';
  if (!regression) {
    console.log('  WARN  expected Regression "regression-add-to-cart" was not filed.');
    console.log('        The add-to-cart Flow should fail on v2 — did replay run?');
  } else {
    const got = regression.diagnosis?.disposition?.verdict;
    if (got === want) console.log(`  OK    regression-add-to-cart dispositioned "${got}" (want "${want}").`);
    else if (got === 'unclear') console.log(`  WARN  regression-add-to-cart dispositioned "unclear" — near miss (want "${want}").`);
    else if (got === undefined) console.log(`  MISS  regression-add-to-cart has no Disposition (want "${want}"). Triage may not run at this effort.`);
    else console.log(`  WRONG regression-add-to-cart dispositioned "${got}" (want "${want}").`);
  }
  const viewRegression = findings.find((f) => f.id === 'regression-view-products');
  console.log(`  view-products still green on v2: ${viewRegression ? 'NO (unexpected regression)' : 'yes'}`);
  console.log('---------------------------------------------------------');
  console.log(`  Disposition correct: ${disp.correct.length}/1`);
  console.log(`  Wall clock:          ${(ms / 1000).toFixed(1)}s`);
  console.log(`  Artifact:            ${artifactDir}`);
  console.log('---------------------------------------------------------');
  console.log('Baseline before bars (ADR-0009): a measurement, not a gate.');
}

async function runDiscovery(effort: Effort, args: Record<string, string>): Promise<void> {
  const truth = await loadTruth();
  const allBugs = truth.map((t) => t.bug);
  const requested =
    args.bugs === undefined || args.bugs === 'all'
      ? allBugs
      : args.bugs.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((b) => !allBugs.includes(b));
  if (unknown.length) {
    console.error(`Error: unknown bug id(s): ${unknown.join(', ')}. Known: ${allBugs.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  const seeded = new Set(requested);

  const repo = await mkdtemp(join(tmpdir(), 'autoend-bench-discovery-'));
  const app = await startMiniApp({ bugs: seeded, variant: 'v1' });
  const startedAt = Date.now();
  let artifactDir = '(run did not complete)';
  try {
    await writeFile(join(repo, 'README.md'), DISCOVERY_README);
    await writeFile(join(repo, 'CHANGELOG.md'), DISCOVERY_CHANGELOG);
    await git(repo, ['init', '-b', 'main']);
    await commitAll(repo, 'chore: seed Gearloop demo store');

    console.log(`Discovery mode - effort=${effort} - bugs=[${[...seeded].join(', ')}]`);
    console.log(`Target: ${app.url}`);
    console.log('Running the fleet (spawns real agents and costs tokens)...\n');

    const { artifactDir: dir, artifact } = await executeRun({
      target: new URL(app.url),
      effort,
      repoRoot: repo,
    });
    artifactDir = dir;
    const score = scoreDiscovery(artifact.findings, truth, seeded);
    printDiscoveryScore(score, truth, seeded, Date.now() - startedAt, artifactDir);
  } finally {
    await app.close();
    await cleanup(repo, args);
  }
}

async function runUpgrade(effort: Effort, args: Record<string, string>): Promise<void> {
  const repo = await mkdtemp(join(tmpdir(), 'autoend-bench-upgrade-'));
  const app = await startMiniApp({ variant: 'v2', bugs: new Set() });
  const startedAt = Date.now();
  let artifactDir = '(run did not complete)';
  try {
    // v1 baseline: README + CHANGELOG + a Flow Map hand-authored against v1.
    await writeFile(join(repo, 'README.md'), UPGRADE_README);
    await writeFile(join(repo, 'CHANGELOG.md'), UPGRADE_CHANGELOG_V1);
    const discoveredAt = new Date().toISOString();
    await addFlow(repo, { id: 'add-to-cart', title: 'Shopper adds a product to the cart', discoveredAt }, ADD_TO_CART_FLOW);
    await addFlow(repo, { id: 'view-products', title: 'Shopper views the product catalog', discoveredAt }, VIEW_PRODUCTS_FLOW);
    await git(repo, ['init', '-b', 'main']);
    await commitAll(repo, 'chore: Gearloop v1 with add-to-cart and view-products flows');

    // v2: the documented, intentional rename. Triage reads this history to disposition.
    await writeFile(join(repo, 'CHANGELOG.md'), UPGRADE_CHANGELOG_V2);
    await commitAll(repo, 'redesign: rename Add to cart to Add to basket');

    console.log(`Upgrade-triage mode - effort=${effort}`);
    console.log(`Target (v2, button renamed): ${app.url}`);
    console.log('Running the fleet (replay v1 flows against v2, then Triage)...\n');

    const { artifactDir: dir, artifact } = await executeRun({
      target: new URL(app.url),
      effort,
      repoRoot: repo,
    });
    artifactDir = dir;
    printUpgradeScore(artifact.findings, Date.now() - startedAt, artifactDir);
  } finally {
    await app.close();
    await cleanup(repo, args);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if ('help' in args) {
    console.log(HELP);
    return;
  }
  const mode = args.mode;
  if (mode !== 'discovery' && mode !== 'upgrade') {
    console.error('Error: --mode must be "discovery" or "upgrade".\n');
    console.log(HELP);
    process.exitCode = 1;
    return;
  }
  const effort = args.effort ?? 'high';
  if (!isEffort(effort)) {
    console.error(`Error: --effort "${effort}" is not one of low|mid|high|xhigh|ultra.`);
    process.exitCode = 1;
    return;
  }

  await loadDotEnv(REPO_ROOT);
  if (!process.env.CURSOR_API_KEY) {
    console.error('Preflight failed: CURSOR_API_KEY is not set.');
    console.error('Add it to the autoend repo .env (or the environment) — the fleet needs it to spawn Cursor agents (ADR-0003).');
    process.exitCode = 1;
    return;
  }
  if (!(await handsAvailable())) {
    console.error("Preflight failed: agent-browser is not available (the explorers' hands, ADR-0002).");
    console.error('Run `npm install` in the autoend repo so its binary resolves.');
    process.exitCode = 1;
    return;
  }

  if (mode === 'discovery') await runDiscovery(effort, args);
  else await runUpgrade(effort, args);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error('bench run-mini crashed:', err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
