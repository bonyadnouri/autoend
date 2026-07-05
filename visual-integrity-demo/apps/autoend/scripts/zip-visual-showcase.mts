#!/usr/bin/env node
/** Zip the gitignored showcase folder for teammate handoff (Slack, Drive, etc.). */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = join(process.cwd(), '..', '..');
const showcaseDir = join(repoRoot, 'showcase', 'visual-integrity');
const zipPath = join(repoRoot, 'showcase', 'visual-integrity-bundle.zip');

async function main(): Promise<void> {
  try {
    await access(join(showcaseDir, 'index.html'));
  } catch {
    console.error('Showcase not found. Run: pnpm visual:showcase');
    process.exitCode = 1;
    return;
  }

  const result = spawnSync('zip', ['-r', zipPath, 'visual-integrity'], {
    cwd: join(repoRoot, 'showcase'),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  console.log(`Wrote ${zipPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
