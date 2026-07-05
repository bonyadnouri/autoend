#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { chromium } from 'playwright';
import { loadDotEnv } from '../config.js';
import { analyzeVisualIntegrity } from './analyze.js';
import { buildStandaloneReport } from './standalone-report.js';
import { renderStandaloneViewerHtml } from './standalone-viewer.js';
import { listRulePacks, resolveRulePack } from './rules.js';
import type { VisualModelEffort } from './types.js';

/**
 * Standalone entry point (Visual Integrity plan: Standalone Mode >
 * Standalone CLI): `pnpm visual:demo --url ... --rule-pack cms-healthcare`.
 * Reuses the exact same `analyzeVisualIntegrity` orchestrator as the
 * integrated `autoend` Run — only the shell (Playwright startup, output
 * location, report shape) differs (Shared Core Requirement).
 */

const USAGE = `Usage:
  pnpm visual:demo --url <target-url> [options]

Options:
  --url <url>            target page to check (required)
  --rule-pack <id>        rule pack id (default: auto-detect from URL)
  --provider <none|nvidia>  optional model provider (default: none)
  --effort <off|fast|deep>  model effort (default: off; ignored when provider=none)
  --out <dir>             output root (default: .visual-integrity/demo-runs)
  --no-open               don't open the report in a browser
  -h, --help              show this help

Available rule packs: ${listRulePacks().map((p) => p.id).join(', ')}
`;

async function main(): Promise<void> {
  // cwd is apps/autoend when run via `pnpm visual:demo`; the worktree root
  // (two levels up) holds .env and the demo-run output root. Also accept an
  // app-local .env as fallback (loadDotEnv never overwrites existing vars).
  const repoRoot = join(process.cwd(), '..', '..');
  await loadDotEnv(repoRoot);
  await loadDotEnv(process.cwd());

  const { values } = parseArgs({
    options: {
      url: { type: 'string' },
      'rule-pack': { type: 'string' },
      provider: { type: 'string', default: 'none' },
      effort: { type: 'string', default: 'off' },
      out: { type: 'string', default: '.visual-integrity/demo-runs' },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help || !values.url) {
    process.stdout.write(USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }

  let target: URL;
  try {
    target = new URL(values.url);
  } catch {
    console.error(`error: "${values.url}" is not a valid URL`);
    process.exitCode = 2;
    return;
  }

  const providerId = values.provider === 'nvidia' ? 'nvidia' : 'none';
  const effort: VisualModelEffort = values.effort === 'fast' || values.effort === 'deep' ? values.effort : 'off';
  const mode = providerId === 'nvidia' && effort !== 'off' ? 'models' : 'rules';

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join(repoRoot, values.out, runId);
  await mkdir(outputDir, { recursive: true });

  const explicitRulePack = values['rule-pack'];
  const resolvedPack = resolveRulePack(target, explicitRulePack);
  const packLabel = explicitRulePack ?? resolvedPack?.id ?? 'auto';

  console.log(`${pc.cyan('Visual Integrity demo')} ${target.href} ${pc.dim(`· rule pack ${packLabel}`)}`);
  const startedMs = Date.now();

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    try {
      const result = await analyzeVisualIntegrity({
        page,
        browser,
        target,
        outputDir,
        repoRoot,
        rulePackId: explicitRulePack,
        mode,
        providerId,
        effort,
        idPrefix: 'visual-demo',
      });

      if (!result.applied) {
        console.log(
          pc.yellow(
            `No rule pack applies to ${target.hostname}. Available packs: ${listRulePacks().map((p) => p.id).join(', ')}`,
          ),
        );
        process.exitCode = 1;
        return;
      }
      if (!result.capture) {
        console.log(pc.red('Page capture failed — see above for details.'));
        process.exitCode = 1;
        return;
      }
      const report = buildStandaloneReport({
        runId,
        target: target.href,
        rulePackId: result.rulePackId ?? explicitRulePack ?? 'auto',
        rulePackTitle: listRulePacks().find((p) => p.id === result.rulePackId)?.title ?? result.rulePackId ?? 'Unknown',
        capture: result.capture,
        expected: result.expected,
        overlays: result.overlays,
        violations: result.violations,
        diffFile: result.diff?.diffFile,
        changedPixels: result.diff?.changedPixels,
        changedRatio: result.diff?.changedRatio,
        classifier: result.classifier,
        modelReviewError: result.modelReviewError,
        timings: result.timings,
      });

      await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
      await writeFile(join(outputDir, 'index.html'), renderStandaloneViewerHtml(report));

      const seconds = ((Date.now() - startedMs) / 1000).toFixed(1);
      if (result.violations.length === 0) {
        console.log(
          pc.green(`No violations found for rule pack "${result.rulePackId}". ${target.href} looks compliant.`) +
            pc.dim(` (${seconds}s)`),
        );
      } else {
        console.log(
          pc.red(`${result.violations.length} violation(s) found`) +
            ` in ${seconds}s: ${result.violations.map((v) => v.ruleId).join(', ')}`,
        );
      }
      if (result.modelReviewError && process.env.VISUAL_DEBUG) {
        console.log(pc.dim(`model review unavailable: ${result.modelReviewError}`));
      }
      const indexPath = join(outputDir, 'index.html');
      console.log(pc.dim(`Report: ${indexPath}`));
      if (!values['no-open']) openInBrowser(indexPath);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

function openInBrowser(path: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(command, [path], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
