#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { loadConfig, loadDotEnv } from './config.js';
import { handsAvailable } from './explore/hands.js';
import { publishRun } from './publish/publish.js';
import { runsDir } from './report/artifact.js';
import { EFFORT_LEVELS, isEffort, type Effort } from './run/effort.js';
import { executeRun } from './run/run.js';
import { runSetupWizard } from './setup/wizard.js';

const USAGE = `Usage:
  autoend init               guided setup (target, effort, API key)
  autoend [target-url]       start a Run (falls back to your configured target)
  autoend clean              delete all local Run artifacts

  (via npx, use the scoped name: npx @bonyadnouri/autoend <args>)

Options:
  -e, --effort <level>   ${EFFORT_LEVELS.join(' | ')} (default: from config, else mid)
      --model <id>       Cursor model id for all agents (default: strongest available)
  -h, --help             show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      effort: { type: 'string', short: 'e' },
      model: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  const repoRoot = process.cwd();
  const command = positionals[0];

  if (command === 'init') {
    await runSetupWizard(repoRoot);
    return;
  }
  if (command === 'clean') {
    await rm(runsDir(repoRoot), { recursive: true, force: true });
    console.log('Local Run artifacts deleted.');
    return;
  }
  if (positionals.length > 1) {
    process.stdout.write(USAGE);
    process.exitCode = 2;
    return;
  }

  await loadDotEnv(repoRoot);
  const config = await loadConfig(repoRoot);

  // First contact with no target and no config: hand over to the wizard.
  if (!command && !config) {
    if (process.stdout.isTTY) {
      await runSetupWizard(repoRoot);
      return;
    }
    console.error('error: no target configured — run `npx @bonyadnouri/autoend init` or pass a URL');
    process.exitCode = 2;
    return;
  }

  let target: URL;
  try {
    target = new URL(command ?? config!.target);
  } catch {
    console.error(`error: "${command}" is not a valid URL`);
    process.exitCode = 2;
    return;
  }

  const effortInput = values.effort ?? config?.effort ?? 'mid';
  if (!isEffort(effortInput)) {
    console.error(`error: unknown effort "${effortInput}" (expected ${EFFORT_LEVELS.join(', ')})`);
    process.exitCode = 2;
    return;
  }
  const effort: Effort = effortInput;

  if (!process.env.CURSOR_API_KEY) {
    console.warn(pc.yellow('warning: CURSOR_API_KEY not set — exploration will be skipped (run `npx @bonyadnouri/autoend init`)'));
  }
  if (!(await handsAvailable())) {
    console.warn(pc.yellow('warning: agent-browser not found on PATH — exploration will be skipped'));
  }

  const model = values.model ?? process.env.AUTOEND_MODEL ?? config?.model;

  console.log(`${pc.cyan('Run starting')} ${target.href} ${pc.dim(`· effort ${effort}`)}`);
  const startedMs = Date.now();
  const { artifactDir, artifact } = await executeRun({ target, effort, repoRoot, model });
  const seconds = ((Date.now() - startedMs) / 1000).toFixed(1);

  const failures = artifact.findings.filter((f) => f.kind === 'hard-failure').length;
  const defects = artifact.findings.filter((f) => f.kind === 'defect').length;
  const regressions = artifact.findings.filter((f) => f.kind === 'regression').length;
  const advisories = artifact.findings.filter((f) => f.kind === 'advisory').length;
  const verdict =
    failures + defects + regressions > 0
      ? pc.red(`${failures} hard failures, ${defects} defects, ${regressions} regressions`)
      : pc.green('all clear');
  console.log(
    `${pc.cyan(`Run finished in ${seconds}s`)} · ${artifact.flowsReplayed} replayed · ${artifact.flowsDiscovered} discovered · ${verdict}` +
      (artifact.heals.length + advisories > 0 ? pc.dim(` · ${artifact.heals.length} heals, ${advisories} advisories`) : ''),
  );
  console.log(pc.dim(`Artifact: ${artifactDir}`));

  try {
    const published = await publishRun(artifact, join(artifactDir, 'evidence'));
    if (published.skipped) {
      console.warn(
        pc.yellow(
          'warning: SUPABASE_URL / key not set — results not published (add them to .env to publish)',
        ),
      );
    } else {
      console.log(
        `${pc.cyan('Published to Supabase')} · ${published.tests} tests · ${published.issues} issues · ${published.investigations} investigations`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(pc.yellow(`warning: failed to publish results to Supabase: ${message}`));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
