#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { loadConfig, loadDotEnv } from './config.js';
import { handsAvailable } from './explore/hands.js';
import { runsDir } from './report/artifact.js';
import { EFFORT_LEVELS, isEffort, type Effort } from './run/effort.js';
import { executeRun } from './run/run.js';
import { runSetupWizard } from './setup/wizard.js';
import { serveReport } from './viewer/server.js';

const USAGE = `Usage:
  autoend init               guided setup (target, effort, API key)
  autoend [target-url]       start a Run (falls back to your configured target)
  autoend clean              delete all local Run artifacts

  (via npx, use the scoped name: npx @bonyadnouri/autoend <args>)

Options:
  -e, --effort <level>   ${EFFORT_LEVELS.join(' | ')} (default: from config, else mid)
      --no-open          don't open the Report in a browser
      --no-serve         write the Run artifact and exit (CI-style)
      --port <n>         viewer port (default: random)
  -h, --help             show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      effort: { type: 'string', short: 'e' },
      'no-open': { type: 'boolean', default: false },
      'no-serve': { type: 'boolean', default: false },
      port: { type: 'string', default: '0' },
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

  console.log(`${pc.cyan('Run starting')} ${target.href} ${pc.dim(`· effort ${effort}`)}`);
  const startedMs = Date.now();
  const { artifactDir, artifact } = await executeRun({ target, effort, repoRoot });
  const seconds = ((Date.now() - startedMs) / 1000).toFixed(1);

  const failures = artifact.findings.filter((f) => f.kind === 'hard-failure').length;
  const regressions = artifact.findings.filter((f) => f.kind === 'regression').length;
  const advisories = artifact.findings.filter((f) => f.kind === 'advisory').length;
  const verdict =
    failures + regressions > 0
      ? pc.red(`${failures} hard failures, ${regressions} regressions`)
      : pc.green('all clear');
  console.log(
    `${pc.cyan(`Run finished in ${seconds}s`)} · ${artifact.flowsReplayed} replayed · ${artifact.flowsDiscovered} discovered · ${verdict}` +
      (artifact.heals.length + advisories > 0 ? pc.dim(` · ${artifact.heals.length} heals, ${advisories} advisories`) : ''),
  );
  console.log(pc.dim(`Artifact: ${artifactDir}`));

  if (values['no-serve']) return;

  const viewer = await serveReport(artifactDir, Number(values.port), repoRoot);
  console.log(`Report: ${pc.underline(viewer.url)} ${pc.dim('(Ctrl+C to stop)')}`);
  if (!values['no-open']) openInBrowser(viewer.url);
}

function openInBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(command, [url], { detached: true, stdio: 'ignore', shell: process.platform === 'win32' }).unref();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
