#!/usr/bin/env node
/**
 * Grafana real-history benchmark runner — discovery mode (ADR-0009).
 *
 * A thin harness around `executeRun`: it preflights the fleet's prerequisites,
 * runs one Run against a Grafana Target, scores the Findings against a curated
 * ground-truth manifest, and prints the result. It measures — it never gates
 * (a low score exits 0); the only non-zero exits are failed preflight and a
 * crash. Upgrade-triage mode is scored by hand for now (see README.md).
 *
 *   npx tsx bench/grafana/run-grafana.ts --repo <grafana-checkout> [--effort ultra]
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { loadDotEnv } from '../../src/config.js';
import { handsAvailable } from '../../src/explore/hands.js';
import { EFFORT_LEVELS, isEffort, type Effort } from '../../src/run/effort.js';
import type { DiscoveryScore, TruthEntry } from '../score.js';

const USAGE = `Grafana real-history benchmark (ADR-0009) — discovery mode.

Usage:
  npx tsx bench/grafana/run-grafana.ts --repo <path-to-grafana-checkout> [options]

Options:
  --target <url>       Grafana Target URL (default: http://localhost:3000)
  --repo <path>        REQUIRED: a grafana/grafana git checkout at the pinned tag
  --manifest <path>    ground-truth manifest (default: bench/grafana/manifest.json)
  --effort <level>     ${EFFORT_LEVELS.join(' | ')} (default: ultra)
  -h, --help           show this help

Preflight (all must pass): CURSOR_API_KEY in the autoend repo .env, agent-browser
on PATH, --repo is a git checkout, and the Target answers /api/health.

This measures — it never gates: a low score still exits 0. See README.md.
`;

/** manifest.json: discovery-mode ground truth (ADR-0009). Mirrors manifest.example.json. */
interface Manifest {
  app: string;
  version: string;
  entries: (TruthEntry & { issue: string; fixedIn: string })[];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      target: { type: 'string', default: 'http://localhost:3000' },
      repo: { type: 'string' },
      manifest: { type: 'string', default: 'bench/grafana/manifest.json' },
      effort: { type: 'string', default: 'ultra' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  // Secrets (CURSOR_API_KEY) live in the AUTOEND repo's .env — never in the
  // Grafana checkout, which is only the Target's source for recon and triage.
  const autoendRoot = fileURLToPath(new URL('../../', import.meta.url));
  await loadDotEnv(autoendRoot);

  // --- Preflight: gather every blocker, then report them together. A Run at
  // ultra costs the better part of an hour, so refuse to start half-equipped.
  const problems: string[] = [];

  if (!values.repo) {
    problems.push('--repo is required: path to a grafana/grafana checkout at the pinned tag');
  } else if (!(await isGitCheckout(values.repo))) {
    problems.push(`--repo "${values.repo}" is not a git checkout (clone grafana/grafana at the pinned tag)`);
  }

  const effortInput = values.effort ?? 'ultra';
  if (!isEffort(effortInput)) {
    problems.push(`unknown effort "${effortInput}" (expected ${EFFORT_LEVELS.join(', ')})`);
  }

  if (!process.env.CURSOR_API_KEY) {
    problems.push('CURSOR_API_KEY not set — exploration cannot run (add it to the autoend repo .env)');
  }
  if (!(await handsAvailable())) {
    problems.push('agent-browser not found on PATH — the fleet has no hands to drive Grafana');
  }
  if (!(await targetHealthy(values.target))) {
    problems.push(`target ${values.target} did not answer /api/health — is \`docker compose up\` running?`);
  }

  let manifest: Manifest | undefined;
  try {
    manifest = await readManifest(values.manifest);
  } catch (error) {
    problems.push(`manifest "${values.manifest}": ${msg(error)} (curate one from manifest.example.json — see README.md)`);
  }

  if (problems.length > 0) {
    console.error(pc.red('Preflight failed:'));
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 2;
    return;
  }

  const effort = effortInput as Effort;
  console.log(pc.cyan('Grafana benchmark · discovery mode'));
  console.log(
    pc.dim(`target ${values.target} · repo ${values.repo} · effort ${effort} · ${manifest!.entries.length} truth entries`),
  );

  // Lazy: pulls in the whole Run pipeline; keep it out of --help/preflight.
  const { executeRun } = await import('../../src/run/run.js');
  const startedMs = Date.now();
  const { artifactDir, artifact } = await executeRun({
    target: new URL(values.target),
    effort,
    repoRoot: values.repo!,
  });
  const seconds = ((Date.now() - startedMs) / 1000).toFixed(0);
  console.log(pc.cyan(`\nRun finished in ${seconds}s`) + pc.dim(` · ${artifact.findings.length} findings`));

  // Reuse the shared scorer (ADR-0009); lazy import keeps preflight/--help light.
  const { scoreDiscovery } = (await import('../score.js')) as typeof import('../score.js');
  // Real-history discovery has no seeded flags — every mined bug is present in
  // this version, so seed the scorer with every entry's `bug` id (all in play).
  const score = scoreDiscovery(
    artifact.findings,
    manifest!.entries,
    new Set(manifest!.entries.map((e) => e.bug)),
  );

  console.log(pc.cyan('\nDiscovery score:'));
  printScore(score, manifest!.entries);
  console.log(pc.dim(`\nArtifact: ${artifactDir}`));
  // Measurement, not a gate (ADR-0009): the process exits 0 regardless of score.
}

function printScore(score: DiscoveryScore, entries: Manifest['entries']): void {
  const detected = new Set(score.detected);
  // Print in manifest order for stable output; detected/missed cover every entry.
  for (const e of entries) {
    const mark = detected.has(e.id) ? pc.green('HIT ') : pc.red('MISS');
    console.log(`  ${mark}  ${e.id}${e.description ? pc.dim(` — ${truncate(e.description)}`) : ''}`);
  }
  const total = score.detected.length + score.missed.length;
  console.log(
    `\n  Rediscovered ${score.detected.length}/${total} · false defects: ${score.falseDefects.length} · findings total: ${score.findingsTotal}`,
  );
}

/** True when `repo` looks like a git checkout (.git dir, or a file for worktrees). */
async function isGitCheckout(repo: string): Promise<boolean> {
  try {
    const s = await stat(join(repo, '.git'));
    return s.isDirectory() || s.isFile();
  } catch {
    return false;
  }
}

async function targetHealthy(target: string): Promise<boolean> {
  try {
    const res = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function readManifest(path: string): Promise<Manifest> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as Manifest;
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new Error('no entries');
  }
  return parsed;
}

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(s: string, n = 80): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

main().catch((error) => {
  console.error(msg(error));
  process.exitCode = 1;
});
