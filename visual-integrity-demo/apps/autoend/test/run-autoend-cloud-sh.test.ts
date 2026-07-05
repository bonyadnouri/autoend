import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('../scripts/run-autoend-cloud.sh', import.meta.url));

function run(overrides: Record<string, string | undefined>) {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return execFileAsync('bash', [SCRIPT], { env, timeout: 15_000 });
}

describe('run-autoend-cloud.sh', () => {
  it.each([
    'http://localhost:3100',
    'https://localhost:3100',
    'http://127.0.0.1:3100',
    'https://127.0.0.1:3100',
  ])('rejects the localhost target %s with exit code 2, before any build work', async (target) => {
    await expect(
      run({ AUTOEND_RUN_ID: 'test-run', AUTOEND_TARGET: target, AUTOEND_EFFORT: 'low' })
    ).rejects.toMatchObject({ code: 2 });
  });

  it('requires AUTOEND_RUN_ID', async () => {
    await expect(
      run({ AUTOEND_RUN_ID: undefined, AUTOEND_TARGET: 'https://example.com', AUTOEND_EFFORT: 'low' })
    ).rejects.toBeDefined();
  });

  it('requires AUTOEND_TARGET', async () => {
    await expect(
      run({ AUTOEND_RUN_ID: 'test-run', AUTOEND_TARGET: undefined, AUTOEND_EFFORT: 'low' })
    ).rejects.toBeDefined();
  });

  it('requires AUTOEND_EFFORT', async () => {
    await expect(
      run({ AUTOEND_RUN_ID: 'test-run', AUTOEND_TARGET: 'https://example.com', AUTOEND_EFFORT: undefined })
    ).rejects.toBeDefined();
  });
});
