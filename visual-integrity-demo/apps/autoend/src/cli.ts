#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { loadConfig, loadDotEnv } from './config.js';
import { runAutoendCloud } from './cloud/run.js';
import { isAutoendFlowSyncMode } from './cloud/env.js';
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
  autoend cloud <target-url> launch one Cursor Cloud Agent to run autoend against target-url

  (vendored in this workspace: pnpm --filter @hack-raise/autoend exec autoend <args>)

Options:
  -e, --effort <level>   ${EFFORT_LEVELS.join(' | ')} (default: from config, else mid)
      --no-open          don't open the Report in a browser
      --no-serve         write the Run artifact and exit (CI-style)
      --port <n>         viewer port (default: random)
  -h, --help             show this help

Run \`autoend cloud --help\` for cloud-specific options.
`;

const CLOUD_USAGE = `Usage:
  autoend cloud <target-url>   launch one Cursor Cloud Agent to run autoend against target-url

Options:
  -e, --effort <level>   ${EFFORT_LEVELS.join(' | ')} (default: low — cloud runs default lighter than local)
  -h, --help             show this help

Requires CURSOR_API_KEY plus either CURSOR_REPO_URL (cloud-repo) or
CURSOR_CLOUD_ENV_NAME (cloud-env) — never sent to the cloud VM itself.
target-url must be reachable from the cloud VM (not localhost/127.0.0.1).
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

  const repoRoot = process.cwd();
  const command = positionals[0];

  if (command === 'cloud') {
    await runCloudCommand(positionals.slice(1), values, repoRoot);
    return;
  }

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

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
    console.error(
      'error: no target configured — run `pnpm --filter @hack-raise/autoend exec autoend init` or pass a URL',
    );
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

  // A cloud run maps its Cloud Secret onto AUTOEND_CURSOR_API_KEY before
  // reaching this process (see run-autoend-cloud.sh); either name satisfies
  // exploration's requirement.
  if (!process.env.CURSOR_API_KEY && !process.env.AUTOEND_CURSOR_API_KEY) {
    console.warn(
      pc.yellow(
        'warning: CURSOR_API_KEY not set — exploration will be skipped (run `pnpm --filter @hack-raise/autoend exec autoend init`)',
      ),
    );
  }
  if (!(await handsAvailable())) {
    console.warn(pc.yellow('warning: agent-browser not found on PATH — exploration will be skipped'));
  }

  const runId = process.env.AUTOEND_RUN_ID;
  const artifactRoot = process.env.AUTOEND_ARTIFACT_DIR;
  const flowSyncModeEnv = process.env.AUTOEND_FLOW_SYNC_MODE;
  if (flowSyncModeEnv !== undefined && !isAutoendFlowSyncMode(flowSyncModeEnv)) {
    console.error(`error: unknown AUTOEND_FLOW_SYNC_MODE "${flowSyncModeEnv}" (expected "delta" or "none")`);
    process.exitCode = 2;
    return;
  }
  const explore = flowSyncModeEnv !== 'none';

  console.log(`${pc.cyan('Run starting')} ${target.href} ${pc.dim(`· effort ${effort}`)}`);
  const startedMs = Date.now();
  const { artifactDir, artifact } = await executeRun({ target, effort, repoRoot, runId, artifactRoot, explore });
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

async function runCloudCommand(
  args: string[],
  values: { effort?: string; help: boolean },
  repoRoot: string,
): Promise<void> {
  if (values.help || args.length === 0) {
    process.stdout.write(CLOUD_USAGE);
    process.exitCode = values.help ? 0 : 2;
    return;
  }

  const [targetArg, ...rest] = args;
  if (rest.length > 0) {
    console.error(`error: unexpected extra argument "${rest[0]}"`);
    process.exitCode = 2;
    return;
  }

  let target: URL;
  try {
    target = new URL(targetArg);
  } catch {
    console.error(`error: "${targetArg}" is not a valid URL`);
    process.exitCode = 2;
    return;
  }

  const effortInput = values.effort ?? 'low';
  if (!isEffort(effortInput)) {
    console.error(`error: unknown effort "${effortInput}" (expected ${EFFORT_LEVELS.join(', ')})`);
    process.exitCode = 2;
    return;
  }

  console.log(`${pc.cyan('Launching autoend cloud run')} ${target.href} ${pc.dim(`· effort ${effortInput}`)}`);
  const outcome = await runAutoendCloud({ repoRoot, target: target.href, effort: effortInput });

  console.log(`${pc.cyan('Cloud run finished')}: ${outcome.status} ${pc.dim(`(agent ${outcome.agentId})`)}`);
  console.log(pc.dim(`Transcript: ${outcome.transcriptPath}`));
  if (outcome.savedPaths.length > 0) {
    console.log(pc.dim(`Downloaded ${outcome.savedPaths.length} artifact(s) to ${outcome.cloudArtifactsDir}`));
  } else {
    console.log(pc.dim('No cloud artifacts downloaded — see the transcript for VM-side paths.'));
  }
  if (outcome.resultText) {
    console.log(outcome.resultText);
  }

  process.exitCode = outcome.status === 'finished' ? 0 : 1;
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
